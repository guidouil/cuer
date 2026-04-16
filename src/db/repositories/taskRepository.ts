import type BetterSqlite3 from "better-sqlite3";

import type { Task } from "../../domain/index.js";

interface TaskRow {
  id: string;
  project_id: string;
  plan_id: string;
  title: string;
  description: string;
  status: Task["status"];
  priority: number;
  type: Task["type"];
  acceptance_criteria: string;
  created_at: string;
  updated_at: string;
}

export class TaskRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  createMany(tasks: Task[]): void {
    const insert = this.db.prepare(
      `
        INSERT INTO tasks (
          id,
          project_id,
          plan_id,
          title,
          description,
          status,
          priority,
          type,
          acceptance_criteria,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @projectId,
          @planId,
          @title,
          @description,
          @status,
          @priority,
          @type,
          @acceptanceCriteria,
          @createdAt,
          @updatedAt
        )
      `,
    );

    const transaction = this.db.transaction((items: Task[]) => {
      for (const task of items) {
        insert.run({
          id: task.id,
          projectId: task.projectId,
          planId: task.planId,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          acceptanceCriteria: JSON.stringify(task.acceptanceCriteria),
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        });
      }
    });

    transaction(tasks);
  }

  listByPlanId(planId: string): Task[] {
    const rows = this.db
      .prepare<[string], TaskRow>(
        `
          SELECT
            id,
            project_id,
            plan_id,
            title,
            description,
            status,
            priority,
            type,
            acceptance_criteria,
            created_at,
            updated_at
          FROM tasks
          WHERE plan_id = ?
          ORDER BY priority ASC, created_at ASC
        `,
      )
      .all(planId);

    return rows.map(mapTask);
  }

  listByProjectId(projectId: string): Task[] {
    const rows = this.db
      .prepare<[string], TaskRow>(
        `
          SELECT
            id,
            project_id,
            plan_id,
            title,
            description,
            status,
            priority,
            type,
            acceptance_criteria,
            created_at,
            updated_at
          FROM tasks
          WHERE project_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(projectId);

    return rows.map(mapTask);
  }

  findById(taskId: string): Task | null {
    const row = this.db
      .prepare<[string], TaskRow>(
        `
          SELECT
            id,
            project_id,
            plan_id,
            title,
            description,
            status,
            priority,
            type,
            acceptance_criteria,
            created_at,
            updated_at
          FROM tasks
          WHERE id = ?
        `,
      )
      .get(taskId);

    return row ? mapTask(row) : null;
  }

  updateStatus(taskId: string, status: Task["status"], updatedAt: string): void {
    this.db
      .prepare(
        `
          UPDATE tasks
          SET status = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(status, updatedAt, taskId);
  }

  updateStatuses(updates: Array<{ taskId: string; status: Task["status"]; updatedAt: string }>): void {
    const update = this.db.prepare(
      `
        UPDATE tasks
        SET status = ?, updated_at = ?
        WHERE id = ?
      `,
    );

    const transaction = this.db.transaction((items: Array<{ taskId: string; status: Task["status"]; updatedAt: string }>) => {
      for (const item of items) {
        update.run(item.status, item.updatedAt, item.taskId);
      }
    });

    transaction(updates);
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    planId: row.plan_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    type: row.type,
    acceptanceCriteria: JSON.parse(row.acceptance_criteria) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
