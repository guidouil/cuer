import BetterSqlite3 from "better-sqlite3";

import { MIGRATIONS } from "./schema/migrations.js";

export class CuerDatabase {
  readonly connection: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.connection = new BetterSqlite3(dbPath);
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("foreign_keys = ON");
    this.applyMigrations();
  }

  close(): void {
    this.connection.close();
  }

  private applyMigrations(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const getMigration = this.connection.prepare<[string], { id: string }>(
      "SELECT id FROM schema_migrations WHERE id = ?",
    );
    const insertMigration = this.connection.prepare<[string, string]>(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    );

    for (const migration of MIGRATIONS) {
      const alreadyApplied = getMigration.get(migration.id);
      if (alreadyApplied) {
        continue;
      }

      this.connection.exec(migration.sql);
      insertMigration.run(migration.id, new Date().toISOString());
    }
  }
}
