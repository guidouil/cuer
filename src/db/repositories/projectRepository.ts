import type BetterSqlite3 from "better-sqlite3";

import type { Project } from "../../domain/index.js";

interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

export class ProjectRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  listAll(): Project[] {
    const rows = this.db
      .prepare<[], ProjectRow>(
        `
          SELECT id, name, root_path, created_at, updated_at
          FROM projects
          ORDER BY created_at ASC
        `,
      )
      .all();

    return rows.map(mapProject);
  }

  findByRootPath(rootPath: string): Project | null {
    const row = this.db
      .prepare<[string], ProjectRow>(
        "SELECT id, name, root_path, created_at, updated_at FROM projects WHERE root_path = ?",
      )
      .get(rootPath);

    return row ? mapProject(row) : null;
  }

  create(project: Project): Project {
    this.db
      .prepare(
        `
          INSERT INTO projects (id, name, root_path, created_at, updated_at)
          VALUES (@id, @name, @rootPath, @createdAt, @updatedAt)
        `,
      )
      .run({
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });

    return project;
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
