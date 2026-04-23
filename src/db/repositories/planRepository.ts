import type BetterSqlite3 from "better-sqlite3";

import type { Plan, PlanDetails } from "../../domain/index.js";

interface PlanRow {
  id: string;
  project_id: string;
  goal: string;
  summary: string;
  status: Plan["status"];
  planner: string;
  details_json: string | null;
  created_at: string;
  updated_at: string;
}

export class PlanRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(plan: Plan): Plan {
    this.db
      .prepare(
        `
          INSERT INTO plans (id, project_id, goal, summary, status, planner, details_json, created_at, updated_at)
          VALUES (@id, @projectId, @goal, @summary, @status, @planner, @detailsJson, @createdAt, @updatedAt)
        `,
      )
      .run({
        id: plan.id,
        projectId: plan.projectId,
        goal: plan.goal,
        summary: plan.summary,
        status: plan.status,
        planner: plan.planner,
        detailsJson: plan.details ? JSON.stringify(plan.details) : null,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      });

    return plan;
  }

  countByProjectId(projectId: string): number {
    const row = this.db
      .prepare<[string], { count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM plans
          WHERE project_id = ?
        `,
      )
      .get(projectId);

    return row?.count ?? 0;
  }

  findLatestByProjectId(projectId: string): Plan | null {
    const row = this.db
      .prepare<[string], PlanRow>(
        `
          SELECT id, project_id, goal, summary, status, planner, details_json, created_at, updated_at
          FROM plans
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(projectId);

    return row ? mapPlan(row) : null;
  }

  deleteByProjectId(projectId: string): number {
    const result = this.db
      .prepare(
        `
          DELETE FROM plans
          WHERE project_id = ?
        `,
      )
      .run(projectId);

    return result.changes;
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
    details: parsePlanDetails(row.details_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePlanDetails(value: string | null): PlanDetails | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as PlanDetails;
}
