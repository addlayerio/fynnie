import * as cron from 'node-cron';
import { FYN } from '../types/fyn';
import { FYNLoader } from './fyn-loader';
import { JobQueue } from './job-queue';
import { logger } from '../utils/logger';

export class Scheduler {
  private fynLoader: FYNLoader;
  private jobQueue: JobQueue;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(fynLoader: FYNLoader, jobQueue: JobQueue) {
    this.fynLoader = fynLoader;
    this.jobQueue = jobQueue;
  }

  async start(): Promise<void> {
    logger.info('Starting scheduler...');

    // Load all FYNs
    await this.fynLoader.loadAllFYNs();

    // Schedule all FYNs
    this.scheduleAllFYNs();

    logger.info('Scheduler started successfully');
  }

  private scheduleAllFYNs(): void {
    const fyns = this.fynLoader.getAllFYNs();

    for (const fyn of fyns) {
      this.scheduleFYN(fyn);
    }
  }

  scheduleFYN(fyn: FYN): void {
    if (!fyn.config.schedule) {
      logger.info(`FYN ${fyn.config.fynId} has no schedule, skipping`);
      return;
    }

    if (this.scheduledJobs.has(fyn.config.fynId)) {
      this.unscheduleFYN(fyn.config.fynId);
    }

    try {
      const task = cron.schedule(fyn.config.schedule, async () => {
        try {
          await this.triggerFYN(fyn.config.fynId);
        } catch (error) {
          logger.error(`Error triggering FYN ${fyn.config.fynId}:`, error);
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.scheduledJobs.set(fyn.config.fynId, task);
      logger.info(`Scheduled FYN ${fyn.config.fynId} with cron: ${fyn.config.schedule}`);
    } catch (error) {
      logger.error(`Error scheduling FYN ${fyn.config.fynId}:`, error);
    }
  }

  unscheduleFYN(fynId: string): void {
    const task = this.scheduledJobs.get(fynId);
    if (task) {
      task.stop();
      this.scheduledJobs.delete(fynId);
      logger.info(`Unscheduled FYN ${fynId}`);
    }
  }

  async triggerFYN(fynId: string, params?: Record<string, any>): Promise<string> {
    const fyn = this.fynLoader.getFYN(fynId);
    if (!fyn) {
      throw new Error(`FYN ${fynId} not found`);
    }

    // Check if FYN should run (date constraints, max active runs, etc.)
    if (!this.shouldRunFYN(fyn)) {
      logger.info(`FYN ${fynId} skipped due to constraints`);
      throw new Error(`FYN ${fynId} cannot run due to constraints`);
    }

    const executionId = await this.jobQueue.addFYNExecution(fynId, params);
    logger.info(`Triggered FYN ${fynId} with execution ID: ${executionId}`);

    return executionId;
  }

  private shouldRunFYN(fyn: FYN): boolean {
    const now = new Date();
    
    // Check start date
    if (fyn.config.startDate && now < fyn.config.startDate) {
      return false;
    }
    
    // Check end date
    if (fyn.config.endDate && now > fyn.config.endDate) {
      return false;
    }
    
    // TODO: Check max active runs
    // TODO: Check catchup logic
    
    return true;
  }

  async stop(): Promise<void> {
    logger.info('Stopping scheduler...');

    for (const [fynId, task] of this.scheduledJobs) {
      task.stop();
      logger.info(`Stopped scheduled task for FYN ${fynId}`);
    }
    
    this.scheduledJobs.clear();
    logger.info('Scheduler stopped');
  }

  getScheduledJobs(): string[] {
    return Array.from(this.scheduledJobs.keys());
  }
}