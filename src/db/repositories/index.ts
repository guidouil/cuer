import type BetterSqlite3 from "better-sqlite3";

import { AccessPolicyRepository } from "./accessPolicyRepository.js";
import { AccountRepository } from "./accountRepository.js";
import { AuthMethodRepository } from "./authMethodRepository.js";
import { CostRecordRepository } from "./costRecordRepository.js";
import { CredentialRepository } from "./credentialRepository.js";
import { EventRepository } from "./eventRepository.js";
import { PlanRepository } from "./planRepository.js";
import { ProjectRepository } from "./projectRepository.js";
import { TaskDependencyRepository } from "./taskDependencyRepository.js";
import { TaskRepository } from "./taskRepository.js";
import { UsageEventRepository } from "./usageEventRepository.js";

export interface RepositorySet {
  accessPolicies: AccessPolicyRepository;
  accounts: AccountRepository;
  authMethods: AuthMethodRepository;
  costRecords: CostRecordRepository;
  credentials: CredentialRepository;
  events: EventRepository;
  plans: PlanRepository;
  projects: ProjectRepository;
  taskDependencies: TaskDependencyRepository;
  tasks: TaskRepository;
  usageEvents: UsageEventRepository;
}

export function createRepositories(db: BetterSqlite3.Database): RepositorySet {
  return {
    accessPolicies: new AccessPolicyRepository(db),
    accounts: new AccountRepository(db),
    authMethods: new AuthMethodRepository(db),
    costRecords: new CostRecordRepository(db),
    credentials: new CredentialRepository(db),
    events: new EventRepository(db),
    plans: new PlanRepository(db),
    projects: new ProjectRepository(db),
    taskDependencies: new TaskDependencyRepository(db),
    tasks: new TaskRepository(db),
    usageEvents: new UsageEventRepository(db),
  };
}
