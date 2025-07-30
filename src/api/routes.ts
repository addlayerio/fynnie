import { FastifyInstance } from 'fastify';
import { FYNLoader } from '../core/fyn-loader';
import { Scheduler } from '../core/scheduler';
import { JobQueue } from '../core/job-queue';
import { GitSync } from '../core/git-sync';
import { logger } from '../utils/logger';

export async function createRoutes(
  fastify: FastifyInstance,
  fynLoader: FYNLoader,
  scheduler: Scheduler,
  jobQueue: JobQueue,
  gitSync: GitSync
): Promise<void> {
  
  // Health check
  fastify.get('/health', async (request, reply) => {
    reply.send({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Get all FYNs
  fastify.get('/fyns', async (request, reply) => {
    try {
      const fyns = fynLoader.getAllFYNs().map(fyn => ({
        fynId: fyn.config.fynId,
        description: fyn.config.description,
        schedule: fyn.config.schedule,
        startDate: fyn.config.startDate,
        endDate: fyn.config.endDate,
        owner: fyn.config.owner,
        tags: fyn.config.tags,
        taskCount: fyn.tasks.length
      }));
      reply.send(fyns);
    } catch (error) {
      logger.error('Error getting FYNs:', error);
      reply.status(500).send({ error: 'Failed to get FYNs' });
    }
  });

  // Get specific FYN
  fastify.get('/fyns/:fynId', async (request, reply) => {
    const { fynId } = request.params as { fynId: string };
    try {
      const fyn = fynLoader.getFYN(fynId);
      if (!fyn) {
        return reply.status(404).send({ error: 'FYN not found' });
      }
      reply.send(fyn);
    } catch (error) {
      logger.error('Error getting FYN:', error);
      reply.status(500).send({ error: 'Failed to get FYN' });
    }
  });

  // Trigger FYN execution
  fastify.post('/fyns/:fynId/trigger', async (request, reply) => {
    const { fynId } = request.params as { fynId: string };
    const params = request.body as Record<string, any>;
    try {
      const executionId = await scheduler.triggerFYN(fynId, params);
      reply.send({ executionId, fynId, status: 'triggered' });
    } catch (error) {
      logger.error('Error triggering FYN:', error);
      reply.status(500).send({ error: error instanceof Error ? error.message : 'Failed to trigger FYN' });
    }
  });

  // Get all executions
  fastify.get('/executions', async (request, reply) => {
    try {
      const executions = jobQueue.getAllExecutions();
      reply.send(executions);
    } catch (error) {
      logger.error('Error getting executions:', error);
      reply.status(500).send({ error: 'Failed to get executions' });
    }
  });

  // Get specific execution
  fastify.get('/executions/:executionId', async (request, reply) => {
    const { executionId } = request.params as { executionId: string };
    try {
      const execution = jobQueue.getExecution(executionId);
      if (!execution) {
        return reply.status(404).send({ error: 'Execution not found' });
      }
      reply.send(execution);
    } catch (error) {
      logger.error('Error getting execution:', error);
      reply.status(500).send({ error: 'Failed to get execution' });
    }
  });

  // Get scheduler status
  fastify.get('/scheduler/status', async (request, reply) => {
    try {
      const scheduledJobs = scheduler.getScheduledJobs();
      reply.send({
        running: true,
        scheduledFYNs: scheduledJobs.length,
        fyns: scheduledJobs
      });
    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      reply.status(500).send({ error: 'Failed to get scheduler status' });
    }
  });

  // Get Git sync status
  fastify.get('/git/status', async (request, reply) => {
    try {
      const status = gitSync.getStatus();
      reply.send(status);
    } catch (error) {
      logger.error('Error getting Git status:', error);
      reply.status(500).send({ error: 'Failed to get Git status' });
    }
  });

  // Trigger Git sync
  fastify.post('/git/sync', async (request, reply) => {
    try {
      const hasChanges = await gitSync.syncRepository();
      reply.send({ synced: true, hasChanges });
    } catch (error) {
      logger.error('Error syncing Git:', error);
      reply.status(500).send({ error: 'Failed to sync repository' });
    }
  });

  // Reload FYNs
  fastify.post('/fyns/reload', async (request, reply) => {
    try {
      await fynLoader.loadAllFYNs();
      reply.send({ reloaded: true, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Error reloading FYNs:', error);
      reply.status(500).send({ error: 'Failed to reload FYNs' });
    }
  });
}
