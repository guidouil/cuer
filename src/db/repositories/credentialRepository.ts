import type BetterSqlite3 from "better-sqlite3";

import type { Credential, JsonObject } from "../../domain/index.js";

interface CredentialRow {
  id: string;
  account_id: string;
  auth_method_id: string;
  secret_ref: string | null;
  secret_hint: string | null;
  status: Credential["status"];
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export class CredentialRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(credential: Credential): Credential {
    this.db
      .prepare(
        `
          INSERT INTO credentials (
            id,
            account_id,
            auth_method_id,
            secret_ref,
            secret_hint,
            status,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @accountId,
            @authMethodId,
            @secretRef,
            @secretHint,
            @status,
            @metadataJson,
            @createdAt,
            @updatedAt
          )
        `,
      )
      .run({
        id: credential.id,
        accountId: credential.accountId,
        authMethodId: credential.authMethodId,
        secretRef: credential.secretRef,
        secretHint: credential.secretHint,
        status: credential.status,
        metadataJson: credential.metadata ? JSON.stringify(credential.metadata) : null,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      });

    return credential;
  }

  findByAccountId(accountId: string): Credential | null {
    const row = this.db
      .prepare<[string], CredentialRow>(
        `
          SELECT
            id,
            account_id,
            auth_method_id,
            secret_ref,
            secret_hint,
            status,
            metadata_json,
            created_at,
            updated_at
          FROM credentials
          WHERE account_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get(accountId);

    return row ? mapCredential(row) : null;
  }
}

function mapCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    accountId: row.account_id,
    authMethodId: row.auth_method_id,
    secretRef: row.secret_ref,
    secretHint: row.secret_hint,
    status: row.status,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as JsonObject) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
