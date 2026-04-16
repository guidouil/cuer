import type BetterSqlite3 from "better-sqlite3";

import type { Event, JsonValue } from "../../domain/index.js";

interface EventRow {
  id: string;
  project_id: string;
  plan_id: string | null;
  task_id: string | null;
  type: string;
  payload: string;
  created_at: string;
}

export class EventRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(event: Event): Event {
    this.db
      .prepare(
        `
          INSERT INTO events (id, project_id, plan_id, task_id, type, payload, created_at)
          VALUES (@id, @projectId, @planId, @taskId, @type, @payload, @createdAt)
        `,
      )
      .run({
        id: event.id,
        projectId: event.projectId,
        planId: event.planId,
        taskId: event.taskId,
        type: event.type,
        payload: JSON.stringify(event.payload),
        createdAt: event.createdAt,
      });

    return event;
  }

  listRecentByProjectId(projectId: string, limit = 10): Event[] {
    const rows = this.db
      .prepare<[string, number], EventRow>(
        `
          SELECT id, project_id, plan_id, task_id, type, payload, created_at
          FROM events
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .all(projectId, limit);

    return rows.map(mapEvent);
  }

  listTaskExecutionReportsByProjectId(projectId: string, limit = 10, taskId?: string): Event[] {
    const rows = taskId
      ? this.db
          .prepare<[string, string, number], EventRow>(
            `
              SELECT id, project_id, plan_id, task_id, type, payload, created_at
              FROM events
              WHERE project_id = ?
                AND type = 'task.execution.reported'
                AND task_id = ?
              ORDER BY created_at DESC
              LIMIT ?
            `,
          )
          .all(projectId, taskId, limit)
      : this.db
          .prepare<[string, number], EventRow>(
            `
              SELECT id, project_id, plan_id, task_id, type, payload, created_at
              FROM events
              WHERE project_id = ?
                AND type = 'task.execution.reported'
              ORDER BY created_at DESC
              LIMIT ?
            `,
          )
          .all(projectId, limit);

    return rows.map(mapEvent);
  }
}

function mapEvent(row: EventRow): Event {
  return {
    id: row.id,
    projectId: row.project_id,
    planId: row.plan_id,
    taskId: row.task_id,
    type: row.type,
    payload: JSON.parse(row.payload) as JsonValue,
    createdAt: row.created_at,
  };
}
