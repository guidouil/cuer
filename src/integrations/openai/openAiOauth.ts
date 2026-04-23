import { createHash, randomBytes } from "node:crypto";

const OPENAI_OAUTH_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_PUBLIC_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_OAUTH_SCOPE = "openid profile email offline_access";

export interface OpenAiOauthSession {
  authorizeUrl: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
}

export interface OpenAiOauthTokenSet {
  accessToken: string;
  expiresAt: string | null;
  idToken: string | null;
  refreshToken: string | null;
  scope: string | null;
  tokenType: string;
}

interface OpenAiOauthTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

export function createOpenAiOauthSession(redirectUri: string): OpenAiOauthSession {
  const normalizedRedirectUri = redirectUri.trim();
  if (normalizedRedirectUri.length === 0) {
    throw new Error("OpenAI OAuth redirect URI is required.");
  }

  const codeVerifier = toBase64Url(randomBytes(64));
  const state = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  const params = new URLSearchParams({
    client_id: OPENAI_CODEX_PUBLIC_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    codex_cli_simplified_flow: "true",
    id_token_add_organizations: "true",
    redirect_uri: normalizedRedirectUri,
    response_type: "code",
    scope: OPENAI_OAUTH_SCOPE,
    state,
  });

  return {
    authorizeUrl: `${OPENAI_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    codeVerifier,
    redirectUri: normalizedRedirectUri,
    state,
  };
}

export async function exchangeOpenAiOauthCode(input: {
  authorizationCode: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OpenAiOauthTokenSet> {
  const authorizationCode = input.authorizationCode.trim();
  const codeVerifier = input.codeVerifier.trim();
  const redirectUri = input.redirectUri.trim();

  if (!authorizationCode || !codeVerifier || !redirectUri) {
    throw new Error("OpenAI OAuth exchange requires the authorization code, PKCE verifier, and redirect URI.");
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: OPENAI_CODEX_PUBLIC_CLIENT_ID,
        code: authorizationCode,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach OpenAI OAuth token endpoint: ${toErrorMessage(error)}`);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(buildExchangeError(response.status, rawBody));
  }

  let parsed: OpenAiOauthTokenResponse;
  try {
    parsed = JSON.parse(rawBody) as OpenAiOauthTokenResponse;
  } catch (error) {
    throw new Error(`OpenAI OAuth token response was not valid JSON: ${toErrorMessage(error)}`);
  }

  const accessToken = readStringField(parsed.access_token, "access_token");
  const tokenType = readStringField(parsed.token_type, "token_type");
  const refreshToken = optionalStringField(parsed.refresh_token);
  const idToken = optionalStringField(parsed.id_token);
  const scope = optionalStringField(parsed.scope);
  const expiresIn = typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in) ? parsed.expires_in : null;

  return {
    accessToken,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1_000).toISOString(),
    idToken,
    refreshToken,
    scope,
    tokenType,
  };
}

export const OPENAI_OAUTH_ENDPOINTS = {
  authorizationUrl: OPENAI_OAUTH_AUTHORIZE_URL,
  clientId: OPENAI_CODEX_PUBLIC_CLIENT_ID,
  scope: OPENAI_OAUTH_SCOPE,
  tokenUrl: OPENAI_OAUTH_TOKEN_URL,
} as const;

function buildExchangeError(statusCode: number, rawBody: string): string {
  const body = rawBody.trim();
  if (body.length === 0) {
    return `OpenAI OAuth token exchange failed with status ${statusCode}.`;
  }

  try {
    const parsed = JSON.parse(body) as { error?: unknown; error_description?: unknown; message?: unknown };
    const message = [parsed.error_description, parsed.message, parsed.error].find((value) => typeof value === "string");
    if (typeof message === "string" && message.trim().length > 0) {
      return `OpenAI OAuth token exchange failed with status ${statusCode}: ${message.trim()}`;
    }
  } catch {
    // Ignore parse failures and fall back to the raw body.
  }

  return `OpenAI OAuth token exchange failed with status ${statusCode}: ${body}`;
}

function optionalStringField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStringField(value: unknown, fieldName: string): string {
  const normalized = optionalStringField(value);
  if (!normalized) {
    throw new Error(`OpenAI OAuth token response is missing "${fieldName}".`);
  }

  return normalized;
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
