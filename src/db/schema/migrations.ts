export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        planner TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        type TEXT NOT NULL,
        acceptance_criteria TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE (task_id, depends_on_task_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        plan_id TEXT,
        task_id TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_plans_project_id ON plans(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id);
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
      CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
      CREATE INDEX IF NOT EXISTS idx_events_plan_id ON events(plan_id);
    `,
  },
  {
    id: "002_planner_details",
    sql: `
      ALTER TABLE plans ADD COLUMN details_json TEXT;
      ALTER TABLE tasks ADD COLUMN details_json TEXT;
    `,
  },
  {
    id: "003_account_manager",
    sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        base_url TEXT,
        status TEXT NOT NULL,
        default_model TEXT,
        config_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_methods (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        config_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        auth_method_id TEXT NOT NULL UNIQUE,
        secret_ref TEXT,
        secret_hint TEXT,
        status TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (auth_method_id) REFERENCES auth_methods(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        model TEXT,
        operation TEXT NOT NULL,
        request_id TEXT,
        usage_json TEXT,
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cost_records (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        usage_event_id TEXT,
        provider_type TEXT NOT NULL,
        model TEXT,
        currency TEXT,
        amount REAL,
        pricing_unit TEXT,
        metadata_json TEXT,
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (usage_event_id) REFERENCES usage_events(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS access_policies (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        effect TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_provider_type ON accounts(provider_type);
      CREATE INDEX IF NOT EXISTS idx_auth_methods_account_id ON auth_methods(account_id);
      CREATE INDEX IF NOT EXISTS idx_credentials_account_id ON credentials(account_id);
      CREATE INDEX IF NOT EXISTS idx_usage_events_account_id ON usage_events(account_id);
      CREATE INDEX IF NOT EXISTS idx_usage_events_recorded_at ON usage_events(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_cost_records_account_id ON cost_records(account_id);
      CREATE INDEX IF NOT EXISTS idx_cost_records_recorded_at ON cost_records(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_access_policies_account_id ON access_policies(account_id);
    `,
  },
];
