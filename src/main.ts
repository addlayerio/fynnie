require('@babel/register')({
  extensions: ['.js'],
  only: [/(fyn)/],
  ignore: [/node_modules/],
  babelrc: true,
  cache: false,
});

import 'reflect-metadata';
import './decorators';
import fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import path from 'path';
import dotenv from 'dotenv';
import Redis from 'ioredis';

import { FYNLoader } from './core/fyn-loader';
import { Scheduler } from './core/scheduler';
import { JobQueue } from './core/job-queue';
import { GitSync } from './core/git-sync';
import { FileWatcher } from './core/file-watcher';
import { createRoutes } from './api/routes';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3030;
const FYNS_FOLDER = process.env.FYN_FOLDER || '/home/mpanichella/TeamProjects/addlayer/fynnie/fyns';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const GIT_ENABLED = process.env.GIT_ENABLED === 'true';
const GIT_REPO_URL = process.env.GIT_REPO_URL;
const GIT_BRANCH = process.env.GIT_BRANCH || 'main';
const GIT_SYNC_INTERVAL = parseInt(process.env.GIT_SYNC_INTERVAL || '60');
const GIT_SYNC_USERNAME = process.env.GIT_SYNC_USERNAME;
const GIT_SYNC_PASSWORD = process.env.GIT_SYNC_PASSWORD;

class FYNSchedulerApp {
  private app: FastifyInstance;
  private fynLoader: FYNLoader;
  private scheduler: Scheduler;
  private jobQueue: JobQueue;
  private gitSync: GitSync;
  private fileWatcher: FileWatcher;
  private redisConnection: Redis;

  constructor() {
    this.app = fastify({ logger: false });
    this.setupFastify();
    this.setupRedis();
    this.setupComponents();
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting FYN Scheduler...');

      if (this.gitSync.start) {
        await this.gitSync.start();
      }

      await this.scheduler.start();
      await this.fileWatcher.start();

      await this.app.listen({ port: Number(PORT), host: '0.0.0.0' });
      logger.info(`FYN Scheduler started on port ${PORT}`);
      logger.info(`Dashboard available at http://localhost:${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api`);
    } catch (error) {
      logger.error('Failed to start FYN Scheduler:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Stopping FYN Scheduler...');
    try {
      this.fileWatcher.stop();
      await this.scheduler.stop();
      if (this.gitSync.stop) {
        await this.gitSync.stop();
      }
      await this.jobQueue.close();
      await this.redisConnection.disconnect();
      await this.app.close();
      logger.info('FYN Scheduler stopped');
    } catch (error) {
      logger.error('Error stopping FYN Scheduler:', error);
    }
  }

  private async setupFastify(): Promise<void> {
    await this.app.register(fastifyCors);
    await this.app.register(import('@fastify/helmet'), {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Permite scripts inline (ojo en prod)
            "'unsafe-eval'", // Permite eval (ojo en prod)
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    });
    await this.app.register(fastifyStatic, {
      root: path.join(__dirname, '../public'),
      prefix: '/', // Public files available at /
    });

    // Log each request
    this.app.addHook('onRequest', async (request, reply) => {
      logger.info(`${request.method} ${request.url}`, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    });
  }

  private setupRedis(): void {
    this.redisConnection = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.redisConnection.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.redisConnection.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });
  }

  private setupComponents(): void {
    this.fynLoader = new FYNLoader(FYNS_FOLDER);
    this.jobQueue = new JobQueue(this.fynLoader, this.redisConnection);
    this.scheduler = new Scheduler(this.fynLoader, this.jobQueue);
    this.gitSync = GIT_ENABLED && GIT_REPO_URL
      ? new GitSync(GIT_REPO_URL, FYNS_FOLDER, GIT_BRANCH, GIT_SYNC_INTERVAL, GIT_SYNC_USERNAME, GIT_SYNC_PASSWORD)
      : this.createDummyGitSync();

    this.fileWatcher = new FileWatcher(this.fynLoader, this.scheduler, FYNS_FOLDER);

    // Las rutas deben ser registradas como plugin
    this.app.register(async (instance) => {
      createRoutes(instance, this.fynLoader, this.scheduler, this.jobQueue, this.gitSync);
    }, { prefix: '/api' });

    // fallback a index.html
    this.app.setNotFoundHandler((request, reply) => {
      reply.type('text/html').sendFile('index.html');
    });
  }

  private createDummyGitSync(): GitSync {
    return {
      start: async () => { },
      stop: async () => { },
      syncRepository: async () => false,
      getLastCommit: async () => null,
      getStatus: () => ({
        enabled: false,
        repoUrl: '',
        branch: '',
        syncInterval: 0
      })
    } as GitSync;
  }
}

// ------------------------------
// App Entrypoint
// ------------------------------

const app = new FYNSchedulerApp();

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

process.on('exit', (code) => {
  logger.info(`Process exiting with code: ${code}`);
});

app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});
