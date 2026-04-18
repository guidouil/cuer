import type BetterSqlite3 from "better-sqlite3";

import type { JsonObject, UsageEvent } from "../../domain/index.js";

interface UsageEventRow {
  id: string;
  account_id: string;
  provider_type: UsageEvent["providerType"];
  model: string | null;
  operation: string;
  request_id: string | null;
  usage_json: string | null;
  recorded_at: string;
  created_at: string;
}

export class UsageEventRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  countAll(): number {
    const row = this.db
      .prepare<[], { count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM usage_events
        `,
      )
      .get();

    return row?.count ?? 0;
  }

  create(event: UsageEvent): UsageEvent {
    this.db
      .prepare(
        `
          INSERT INTO usage_events (
            id,
            account_id,
            provider_type,
            model,
            operation,
            request_id,
            usage_json,
            recorded_at,
            created_at
          )
          VALUES (
            @id,
            @accountId,
            @providerType,
            @model,
            @operation,
            @requestId,
            @usageJson,
            @recordedAt,
            @createdAt
          )
        `,
      )
      .run({
        id: event.id,
        accountId: event.accountId,
        providerType: event.providerType,
        model: event.model,
        operation: event.operation,
        requestId: event.requestId,
        usageJson: event.usage ? JSON.stringify(event.usage) : null,
        recordedAt: event.recordedAt,
        createdAt: event.createdAt,
      });

    return event;
  }

  listRecent(limit = 20): UsageEvent[] {
    const rows = this.db
      .prepare<[number], UsageEventRow>(
        `
          SELECT
            id,
            account_id,
            provider_type,
            model,
            operation,
            request_id,
            usage_json,
            recorded_at,
            created_at
          FROM usage_events
          ORDER BY recorded_at DESC, created_at DESC
          LIMIT ?
        `,
      )
      .all(limit);

    return rows.map(mapUsageEvent);
  }
}

function mapUsageEvent(row: UsageEventRow): UsageEvent {
  return {
    id: row.id,
    accountId: row.account_id,
    providerType: row.provider_type,
    model: row.model,
    operation: row.operation,
    requestId: row.request_id,
    usage: row.usage_json ? (JSON.parse(row.usage_json) as JsonObject) : null,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}
