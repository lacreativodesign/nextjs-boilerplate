export type DailyJobOutcome = 'succeeded' | 'blocked';

export type DailyJobRunResult = {
  outcome: DailyJobOutcome;
  code?: string;
  metrics?: Record<string, number | boolean>;
};

export type DailyJobContext = {
  runId: string;
  runDate: string;
  startedAt: Date;
  deadlineAt: Date;
};

export type DailyJobDefinition = {
  id: string;
  description: string;
  estimatedMaxRuntimeMs: number;
  leaseDurationMs: number;
  maxAttempts: 1 | 2;
  retrySafe: boolean;
  due?: (now: Date) => boolean;
  run: (context: DailyJobContext) => Promise<DailyJobRunResult>;
};

export type LeaseAcquisition =
  | { state: 'acquired'; attempt: number }
  | { state: 'already_terminal'; outcome: DailyJobOutcome }
  | { state: 'leased' }
  | { state: 'attempts_exhausted' };

export type OrchestrationJobStatus =
  | 'succeeded'
  | 'blocked'
  | 'already_terminal'
  | 'not_due'
  | 'leased'
  | 'failed'
  | 'budget_skipped'
  | 'attempts_exhausted';

export type OrchestrationJobResult = {
  id: string;
  status: OrchestrationJobStatus;
  attempts: number;
  durationMs: number;
  code?: string;
  metrics?: Record<string, number | boolean>;
};

export type DailyJobStore = {
  beginRun(input: {
    runId: string;
    runDate: string;
    startedAt: Date;
    deadlineAt: Date;
    jobCount: number;
  }): Promise<void>;
  acquireLease(input: {
    runId: string;
    runDate: string;
    job: DailyJobDefinition;
    now: Date;
  }): Promise<LeaseAcquisition>;
  finishAttempt(input: {
    runId: string;
    runDate: string;
    jobId: string;
    attempt: number;
    outcome: DailyJobOutcome;
    code?: string;
    durationMs: number;
    metrics?: Record<string, number | boolean>;
    completedAt: Date;
  }): Promise<void>;
  failAttempt(input: {
    runId: string;
    runDate: string;
    jobId: string;
    attempt: number;
    errorCode: string;
    durationMs: number;
    failedAt: Date;
  }): Promise<void>;
  recordSkipped(input: {
    runId: string;
    runDate: string;
    jobId: string;
    status: Extract<OrchestrationJobStatus, 'not_due' | 'budget_skipped' | 'leased'>;
    recordedAt: Date;
  }): Promise<void>;
  finishRun(input: {
    runId: string;
    status: 'completed' | 'completed_with_blocks' | 'incomplete' | 'failed';
    completedAt: Date;
    durationMs: number;
    counts: Record<string, number>;
  }): Promise<void>;
};
