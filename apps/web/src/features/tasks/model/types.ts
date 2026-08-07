/**
 * Task / roadmap view types for the tasks feature slice (Tasks 3.2–3.3).
 */

export type TaskStatus =
  'PENDING' | 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'DONE' | 'FAILED' | 'CANCELLED';

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** One roadmap row for the UI (deps as prerequisite titles). */
export type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number;
  specificationId: string | null;
  dependencyTitles: string[];
  createdAt: string;
};

export type EnqueuePlanResult = {
  jobId: string;
  specificationId: string;
  specificationVersion: number;
};

export type EnqueueCodeResult = {
  jobId: string;
  taskId: string;
  dryRun: boolean;
};

export type TaskLogEntry = {
  id: string;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  createdAt: string;
};

export type TaskDetail = TaskSummary & {
  description: string;
  acceptance: string;
  logs: TaskLogEntry[];
};

/** No approved SPEC for plan enqueue. */
export class PlanSpecRequiredError extends Error {
  constructor() {
    super('Нужна утверждённая спецификация');
    this.name = 'PlanSpecRequiredError';
  }
}

export class CodeTaskNotFoundError extends Error {
  constructor() {
    super('Задача не найдена');
    this.name = 'CodeTaskNotFoundError';
  }
}

export class CodeGiteaMissingError extends Error {
  constructor() {
    super('Репозиторий Gitea ещё не создан — откройте редактор');
    this.name = 'CodeGiteaMissingError';
  }
}

export class CodeConflictError extends Error {
  constructor() {
    super('Задача уже выполняется');
    this.name = 'CodeConflictError';
  }
}

export class CodeWrongStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeWrongStatusError';
  }
}
