import type BetterSqlite3 from "better-sqlite3";

import type { AccessCapability, AccessPolicy } from "../../domain/index.js";

interface AccessPolicyRow {
  id: string;
  account_id: string;
  name: string;
  effect: AccessPolicy["effect"];
  capabilities_json: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export class AccessPolicyRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(policy: AccessPolicy): AccessPolicy {
    this.db
      .prepare(
        `
          INSERT INTO access_policies (
            id,
            account_id,
            name,
            effect,
            capabilities_json,
            active,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @accountId,
            @name,
            @effect,
            @capabilitiesJson,
            @active,
            @createdAt,
            @updatedAt
          )
        `,
      )
      .run({
        id: policy.id,
        accountId: policy.accountId,
        name: policy.name,
        effect: policy.effect,
        capabilitiesJson: JSON.stringify(policy.capabilities),
        active: policy.active ? 1 : 0,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      });

    return policy;
  }

  listByAccountId(accountId: string): AccessPolicy[] {
    const rows = this.db
      .prepare<[string], AccessPolicyRow>(
        `
          SELECT
            id,
            account_id,
            name,
            effect,
            capabilities_json,
            active,
            created_at,
            updated_at
          FROM access_policies
          WHERE account_id = ?
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all(accountId);

    return rows.map(mapAccessPolicy);
  }
}

function mapAccessPolicy(row: AccessPolicyRow): AccessPolicy {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    effect: row.effect,
    capabilities: JSON.parse(row.capabilities_json) as AccessCapability[],
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
