import type BetterSqlite3 from "better-sqlite3";

import { EventRepository } from "./eventRepository.js";
import { PlanRepository } from "./planRepository.js";
import { ProjectRepository } from "./projectRepository.js";
import { TaskDependencyRepository } from "./taskDependencyRepository.js";
import { TaskRepository } from "./taskRepository.js";

export interface RepositorySet {
  events: EventRepository;
  plans: PlanRepository;
  projects: ProjectRepository;
  taskDependencies: TaskDependencyRepository;
  tasks: TaskRepository;
}

export function createRepositories(db: BetterSqlite3.Database): RepositorySet {
  return {
    events: new EventRepository(db),
    plans: new PlanRepository(db),
    projects: new ProjectRepository(db),
    taskDependencies: new TaskDependencyRepository(db),
    tasks: new TaskRepository(db),
  };
}
