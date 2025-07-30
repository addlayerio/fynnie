import { Queue, Worker, Job } from 'bullmq';
import { FYNLoader } from './fyn-loader';
import { TaskExecutor } from './task-executor';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { FYNExecution } from '../types/fyn';
import Redis from 'ioredis';

export class JobQueue {
  private fynQueue: Queue;
  private taskQueue: Queue;
  private fynWorker: Worker;
  private taskWorker: Worker;
  private fynLoader: FYNLoader;
  private taskExecutor: TaskExecutor;
  private executions = new Map<string, FYNExecution>();

  constructor(fynLoader: FYNLoader, redisConnection: Redis) {
    this.fynLoader = fynLoader;
    this.taskExecutor = new TaskExecutor();

    this.fynQueue = new Queue('fyn-execution', { connection: redisConnection });
    this.taskQueue = new Queue('task-execution', { connection: redisConnection });

    this.fynWorker = new Worker('fyn-execution', this.processFYNJob.bind(this), {
      connection: redisConnection,
      concurrency: parseInt(process.env.CONCURRENCY || '10'),
    });

    this.taskWorker = new Worker('task-execution', this.processTaskJob.bind(this), {
      connection: redisConnection,
      concurrency: parseInt(process.env.MAX_WORKERS || '5'),
    });

    this.setupEventHandlers();
  }

  async addFYNExecution(fynId: string, params: Record<string, any> = {}): Promise<string> {
    const executionId = uuidv4();
    const execution: FYNExecution = {
      executionId,
      fynId,
      status: 'pending',
      startTime: new Date(),
      logs: [],
    };

    this.executions.set(executionId, execution);

    await this.fynQueue.add('execute-fyn', { executionId, fynId, params });
    return executionId;
  }

  getExecution(executionId: string): FYNExecution | undefined {
    return this.executions.get(executionId);
  }

  getAllExecutions(): FYNExecution[] {
    return Array.from(this.executions.values());
  }

  async close(): Promise<void> {
    await this.fynWorker.close();
    await this.taskWorker.close();
    await this.fynQueue.close();
    await this.taskQueue.close();
  }

  // --- Métodos Privados ---

  private setupEventHandlers(): void {
    this.fynWorker.on('completed', job => {
      logger.info(`FYN execution completed: ${job.id}`);
    });

    this.fynWorker.on('failed', (job, err) => {
      logger.error(`FYN execution failed: ${job?.id}`, err);
    });

    this.taskWorker.on('completed', job => {
      logger.info(`Task execution completed: ${job.id}`);
    });

    this.taskWorker.on('failed', (job, err) => {
      logger.error(`Task execution failed: ${job?.id}`, err);
    });
  }

  private async processFYNJob(job: Job): Promise<void> {
    const { executionId, fynId, params } = job.data;

    try {
      const execution = this.executions.get(executionId);
      if (!execution) throw new Error(`Execution ${executionId} not found`);

      execution.status = 'running';
      this.executions.set(executionId, execution);

      const fyn = this.fynLoader.getFYN(fynId);
      if (!fyn) throw new Error(`FYN ${fynId} not found`);

      logger.info(`Starting FYN execution: ${fynId} (${executionId})`);
      await this.executeTasks(fyn.tasks, fynId, executionId, params);

      execution.status = 'success';
      execution.endTime = new Date();
      this.executions.set(executionId, execution);

      logger.info(`FYN execution completed: ${fynId} (${executionId})`);
    } catch (error) {
      const execution = this.executions.get(executionId);
      if (execution) {
        execution.status = 'failed';
        execution.endTime = new Date();
        execution.error = error instanceof Error ? error.message : String(error);
        this.executions.set(executionId, execution);
      }

      logger.error(`FYN execution failed: ${fynId} (${executionId})`, error);
      throw error;
    }
  }

  private async processTaskJob(job: Job): Promise<void> {
    const { taskId, executionId, params } = job.data;

    const fyn = this.fynLoader.getFYN(job.data.fynId);

    const task = fyn.tasks.find(t => t.taskId === job.data.taskId);

    try {
      logger.info(`Executing task: ${taskId} (${executionId})`);
      await this.taskExecutor.executeTask(task, job.data.params);
      // await this.taskExecutor.executeTask(task, params);
      logger.info(`Task completed: ${taskId} (${executionId})`);
    } catch (error) {
      logger.error(`Task failed: ${taskId} (${executionId})`, error);
      throw error;
    }
  }

  private async executeTasks(tasks: any[], fynId: string, executionId: string, params: Record<string, any>): Promise<void> {
    const taskStatus = new Map<string, 'pending' | 'running' | 'success' | 'failed'>();
    const taskPromises = new Map<string, Promise<void>>();

    for (const task of tasks) taskStatus.set(task.taskId, 'pending');

    const executeTask = async (task: any): Promise<void> => {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          const depPromise = taskPromises.get(dep);
          if (depPromise) await depPromise;
        }
      }

      taskStatus.set(task.taskId, 'running');

      try {
        await this.taskQueue.add('execute-task', {
          fynId,
          taskId: task.taskId,
          executionId,
          task,
          params,
        });

        await new Promise(resolve => setTimeout(resolve, 100)); // Simulación

        taskStatus.set(task.taskId, 'success');
      } catch (error) {
        taskStatus.set(task.taskId, 'failed');
        throw error;
      }
    };

    for (const task of tasks) {
      taskPromises.set(task.taskId, executeTask(task));
    }

    await Promise.all(taskPromises.values());
  }
}