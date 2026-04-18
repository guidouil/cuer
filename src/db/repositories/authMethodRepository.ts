import type BetterSqlite3 from "better-sqlite3";

import type { AuthMethod, JsonObject } from "../../domain/index.js";

interface AuthMethodRow {
  id: string;
  account_id: string;
  type: AuthMethod["type"];
  label: string;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

export class AuthMethodRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(authMethod: AuthMethod): AuthMethod {
    this.db
      .prepare(
        `
          INSERT INTO auth_methods (id, account_id, type, label, config_json, created_at, updated_at)
          VALUES (@id, @accountId, @type, @label, @configJson, @createdAt, @updatedAt)
        `,
      )
      .run({
        id: authMethod.id,
        accountId: authMethod.accountId,
        type: authMethod.type,
        label: authMethod.label,
        configJson: authMethod.config ? JSON.stringify(authMethod.config) : null,
        createdAt: authMethod.createdAt,
        updatedAt: authMethod.updatedAt,
      });

    return authMethod;
  }

  findByAccountId(accountId: string): AuthMethod | null {
    const row = this.db
      .prepare<[string], AuthMethodRow>(
        `
          SELECT id, account_id, type, label, config_json, created_at, updated_at
          FROM auth_methods
          WHERE account_id = ?
        `,
      )
      .get(accountId);

    return row ? mapAuthMethod(row) : null;
  }
}

function mapAuthMethod(row: AuthMethodRow): AuthMethod {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    label: row.label,
    config: row.config_json ? (JSON.parse(row.config_json) as JsonObject) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
