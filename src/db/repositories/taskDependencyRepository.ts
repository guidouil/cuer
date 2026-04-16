import type BetterSqlite3 from "better-sqlite3";

import type { TaskDependency } from "../../domain/index.js";

interface TaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

export class TaskDependencyRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  createMany(dependencies: TaskDependency[]): void {
    const insert = this.db.prepare(
      `
        INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
        VALUES (@id, @taskId, @dependsOnTaskId, @createdAt)
      `,
    );

    const transaction = this.db.transaction((items: TaskDependency[]) => {
      for (const dependency of items) {
        insert.run({
          id: dependency.id,
          taskId: dependency.taskId,
          dependsOnTaskId: dependency.dependsOnTaskId,
          createdAt: dependency.createdAt,
        });
      }
    });

    transaction(dependencies);
  }

  listByPlanId(planId: string): TaskDependency[] {
    const rows = this.db
      .prepare<[string], TaskDependencyRow>(
        `
          SELECT td.id, td.task_id, td.depends_on_task_id, td.created_at
          FROM task_dependencies td
          INNER JOIN tasks t ON t.id = td.task_id
          WHERE t.plan_id = ?
          ORDER BY td.created_at ASC
        `,
      )
      .all(planId);

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      createdAt: row.created_at,
    }));
  }
}
