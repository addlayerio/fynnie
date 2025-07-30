import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../utils/logger';

export class GitSync {
  private git: SimpleGit;
  private repoUrl: string;
  private branch: string;
  private localPath: string;
  private syncInterval: number;
  private syncTimer?: NodeJS.Timeout;

  constructor(repoUrl: string, localPath: string, branch: string = 'main', syncInterval: number = 60,
    private username?: string,
    private passwordOrToken?: string
  ) {
    this.repoUrl = repoUrl;
    this.localPath = localPath;
    this.branch = branch;
    this.syncInterval = syncInterval * 1000; // Convert to milliseconds

    if (username && passwordOrToken) {
      const url = new URL(repoUrl);
      url.username = username;
      url.password = passwordOrToken;
      this.repoUrl = url.toString();
    } else {
      this.repoUrl = repoUrl;
    }

    this.git = simpleGit();
  }

  async start(): Promise<void> {
    if (!this.repoUrl) {
      logger.info('Git sync disabled: no repository URL provided');
      return;
    }

    logger.info(`Starting Git sync from ${this.repoUrl} to ${this.localPath}`);

    try {
      await this.initialSync();
      this.startPeriodicSync();
      logger.info(`Git sync started with ${this.syncInterval / 1000}s interval`);
    } catch (error) {
      logger.error('Failed to start Git sync:', error);
      throw error;
    }
  }

  private async initialSync(): Promise<void> {
    await fs.ensureDir(this.localPath);

    // Check if it's already a git repository
    const isRepo = await fs.pathExists(path.join(this.localPath, '.git'));

    if (!isRepo) {
      // Clone the repository
      logger.info(`Cloning repository ${this.repoUrl}`);
      await this.git.clone(this.repoUrl, this.localPath, ['--branch', this.branch]);
    } else {
      // Update existing repository
      logger.info('Updating existing repository');
      const repoGit = simpleGit(this.localPath);
      await repoGit.fetch();
      await repoGit.checkout(this.branch);
      await repoGit.pull('origin', this.branch);
    }
  }

  private startPeriodicSync(): void {
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncRepository();
      } catch (error) {
        logger.error('Periodic sync failed:', error);
      }
    }, this.syncInterval);
  }

  async syncRepository(): Promise<boolean> {
    try {
      const repoGit = simpleGit(this.localPath);

      // Fetch latest changes
      await repoGit.fetch();

      // Check if there are any changes
      const status = await repoGit.status();
      const log = await repoGit.log(['HEAD..origin/' + this.branch]);

      if (log.total > 0) {
        logger.info(`Syncing ${log.total} new commits from repository`);

        // Reset any local changes and pull
        await repoGit.reset(['--hard', 'HEAD']);
        await repoGit.pull('origin', this.branch);

        logger.info('Repository synchronized successfully');
        return true;
      } else {
        logger.debug('Repository is up to date');
        return false;
      }
    } catch (error) {
      logger.error('Failed to sync repository:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      logger.info('Git sync stopped');
    }
  }

  async getLastCommit(): Promise<any> {
    try {
      const repoGit = simpleGit(this.localPath);
      const log = await repoGit.log(['-1']);
      return log.latest;
    } catch (error) {
      logger.error('Failed to get last commit:', error);
      return null;
    }
  }

  getStatus(): { enabled: boolean; repoUrl: string; branch: string; syncInterval: number } {
    return {
      enabled: !!this.repoUrl,
      repoUrl: this.repoUrl,
      branch: this.branch,
      syncInterval: this.syncInterval / 1000
    };
  }
}