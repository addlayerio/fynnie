export interface FYNConfig {
  fynId: string;
  description?: string;
  schedule?: string; // cron expression
  startDate?: Date;
  endDate?: Date;
  catchup?: boolean;
  maxActiveRuns?: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  tags?: string[];
  owner?: string;
  dependencies?: string[];
  params?: Record<string, any>;
}

export interface TaskConfig {
  taskId: string;
  type: 'javascript' | 'shell' | 'http';
  script?: string;
  command?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  dependsOn?: string[];
  params?: Record<string, any>;
}

export interface FYN {
  config: FYNConfig;
  tasks: TaskConfig[];
  execute: () => Promise<void>;
}

export interface FYNExecution {
  executionId: string;
  fynId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  logs?: string[];
}

export interface TaskExecution {
  taskId: string;
  executionId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  output?: any;
}