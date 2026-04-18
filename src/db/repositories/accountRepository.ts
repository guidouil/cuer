import type BetterSqlite3 from "better-sqlite3";

import type { Account, JsonObject } from "../../domain/index.js";

interface AccountRow {
  id: string;
  name: string;
  provider_type: Account["providerType"];
  base_url: string | null;
  status: Account["status"];
  default_model: string | null;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

export class AccountRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(account: Account): Account {
    this.db
      .prepare(
        `
          INSERT INTO accounts (
            id,
            name,
            provider_type,
            base_url,
            status,
            default_model,
            config_json,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @name,
            @providerType,
            @baseUrl,
            @status,
            @defaultModel,
            @configJson,
            @createdAt,
            @updatedAt
          )
        `,
      )
      .run({
        id: account.id,
        name: account.name,
        providerType: account.providerType,
        baseUrl: account.baseUrl,
        status: account.status,
        defaultModel: account.defaultModel,
        configJson: account.config ? JSON.stringify(account.config) : null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      });

    return account;
  }

  findById(accountId: string): Account | null {
    const row = this.db
      .prepare<[string], AccountRow>(
        `
          SELECT
            id,
            name,
            provider_type,
            base_url,
            status,
            default_model,
            config_json,
            created_at,
            updated_at
          FROM accounts
          WHERE id = ?
        `,
      )
      .get(accountId);

    return row ? mapAccount(row) : null;
  }

  listAll(): Account[] {
    const rows = this.db
      .prepare<[], AccountRow>(
        `
          SELECT
            id,
            name,
            provider_type,
            base_url,
            status,
            default_model,
            config_json,
            created_at,
            updated_at
          FROM accounts
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all();

    return rows.map(mapAccount);
  }
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type,
    baseUrl: row.base_url,
    status: row.status,
    defaultModel: row.default_model,
    config: row.config_json ? (JSON.parse(row.config_json) as JsonObject) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
