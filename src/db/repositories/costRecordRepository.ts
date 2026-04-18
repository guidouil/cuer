import type BetterSqlite3 from "better-sqlite3";

import type { CostRecord, JsonObject } from "../../domain/index.js";

interface CostRecordRow {
  id: string;
  account_id: string;
  usage_event_id: string | null;
  provider_type: CostRecord["providerType"];
  model: string | null;
  currency: string | null;
  amount: number | null;
  pricing_unit: string | null;
  metadata_json: string | null;
  recorded_at: string;
  created_at: string;
}

export class CostRecordRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(record: CostRecord): CostRecord {
    this.db
      .prepare(
        `
          INSERT INTO cost_records (
            id,
            account_id,
            usage_event_id,
            provider_type,
            model,
            currency,
            amount,
            pricing_unit,
            metadata_json,
            recorded_at,
            created_at
          )
          VALUES (
            @id,
            @accountId,
            @usageEventId,
            @providerType,
            @model,
            @currency,
            @amount,
            @pricingUnit,
            @metadataJson,
            @recordedAt,
            @createdAt
          )
        `,
      )
      .run({
        id: record.id,
        accountId: record.accountId,
        usageEventId: record.usageEventId,
        providerType: record.providerType,
        model: record.model,
        currency: record.currency,
        amount: record.amount,
        pricingUnit: record.pricingUnit,
        metadataJson: record.metadata ? JSON.stringify(record.metadata) : null,
        recordedAt: record.recordedAt,
        createdAt: record.createdAt,
      });

    return record;
  }

  listAll(): CostRecord[] {
    const rows = this.db
      .prepare<[], CostRecordRow>(
        `
          SELECT
            id,
            account_id,
            usage_event_id,
            provider_type,
            model,
            currency,
            amount,
            pricing_unit,
            metadata_json,
            recorded_at,
            created_at
          FROM cost_records
          ORDER BY recorded_at DESC, created_at DESC
        `,
      )
      .all();

    return rows.map(mapCostRecord);
  }
}

function mapCostRecord(row: CostRecordRow): CostRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    usageEventId: row.usage_event_id,
    providerType: row.provider_type,
    model: row.model,
    currency: row.currency,
    amount: row.amount,
    pricingUnit: row.pricing_unit,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as JsonObject) : null,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}
