import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createOpenAiOauthSession,
  exchangeOpenAiOauthCode,
} from "../src/integrations/openai/openAiOauth.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("OpenAI OAuth session generation builds a PKCE authorization URL", () => {
  const session = createOpenAiOauthSession("http://localhost:1455/auth/callback");
  const authorizeUrl = new URL(session.authorizeUrl);

  assert.equal(authorizeUrl.origin, "https://auth.openai.com");
  assert.equal(authorizeUrl.pathname, "/oauth/authorize");
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizeUrl.searchParams.get("redirect_uri"), "http://localhost:1455/auth/callback");
  assert.equal(authorizeUrl.searchParams.get("scope"), "openid profile email offline_access");
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizeUrl.searchParams.get("state"), session.state);
  assert.ok(session.codeVerifier.length >= 43);
});

test("OpenAI OAuth token exchange normalizes the returned token set", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    Object.assign(globalThis, { fetch: originalFetch });
  });

  Object.assign(globalThis, {
    fetch: async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      assert.equal(String(input), "https://auth.openai.com/oauth/token");
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body ?? ""), /grant_type=authorization_code/);
      assert.match(String(init?.body ?? ""), /code_verifier=verifier-123/);

      return new Response(
        JSON.stringify({
          access_token: "access-token-123",
          expires_in: 120,
          id_token: "id-token-123",
          refresh_token: "refresh-token-123",
          scope: "openid profile email offline_access",
          token_type: "Bearer",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
  });

  const tokenSet = await exchangeOpenAiOauthCode({
    authorizationCode: "auth-code-123",
    codeVerifier: "verifier-123",
    redirectUri: "http://localhost:1455/auth/callback",
  });

  assert.equal(tokenSet.accessToken, "access-token-123");
  assert.equal(tokenSet.refreshToken, "refresh-token-123");
  assert.equal(tokenSet.idToken, "id-token-123");
  assert.equal(tokenSet.scope, "openid profile email offline_access");
  assert.equal(tokenSet.tokenType, "Bearer");
  assert.ok(tokenSet.expiresAt);
});

test("desktop frontend exposes the browser OAuth entrypoint for OpenAI", async () => {
  const desktopSource = await readFile(repoPath("desktop/main.ts"), "utf8");

  assert.match(desktopSource, /Connect in browser/);
  assert.match(desktopSource, /connect_openai_oauth/);
  assert.match(desktopSource, /returns to Cuer/);
});

function repoPath(relativePath: string): string {
  return join(REPO_ROOT, relativePath);
}
