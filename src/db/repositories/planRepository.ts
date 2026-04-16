import type BetterSqlite3 from "better-sqlite3";

import type { Plan } from "../../domain/index.js";

interface PlanRow {
  id: string;
  project_id: string;
  goal: string;
  summary: string;
  status: Plan["status"];
  planner: string;
  created_at: string;
  updated_at: string;
}

export class PlanRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(plan: Plan): Plan {
    this.db
      .prepare(
        `
          INSERT INTO plans (id, project_id, goal, summary, status, planner, created_at, updated_at)
          VALUES (@id, @projectId, @goal, @summary, @status, @planner, @createdAt, @updatedAt)
        `,
      )
      .run({
        id: plan.id,
        projectId: plan.projectId,
        goal: plan.goal,
        summary: plan.summary,
        status: plan.status,
        planner: plan.planner,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      });

    return plan;
  }

  findLatestByProjectId(projectId: string): Plan | null {
    const row = this.db
      .prepare<[string], PlanRow>(
        `
          SELECT id, project_id, goal, summary, status, planner, created_at, updated_at
          FROM plans
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(projectId);

    return row ? mapPlan(row) : null;
  }

  updateStatus(planId: string, status: Plan["status"], updatedAt: string): void {
    this.db
      .prepare(
        `
          UPDATE plans
          SET status = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(status, updatedAt, planId);
  }
}

function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    projectId: row.project_id,
    goal: row.goal,
    summary: row.summary,
    status: row.status,
    planner: row.planner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
