import chokidar from 'chokidar';
import { FYNLoader } from './fyn-loader';
import { Scheduler } from './scheduler';
import { logger } from '../utils/logger';
import * as path from 'path';

export class FileWatcher {
  private watcher?: chokidar.FSWatcher;
  private fynLoader: FYNLoader;
  private scheduler: Scheduler;
  private watchPath: string;

  constructor(fynLoader: FYNLoader, scheduler: Scheduler, watchPath: string) {
    this.fynLoader = fynLoader;
    this.scheduler = scheduler;
    this.watchPath = watchPath;
  }

  start(): void {
    logger.info(`Starting file watcher for ${this.watchPath}`);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: /node_modules|\.git/,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', (filePath) => this.handleFileChange('add', filePath))
      .on('change', (filePath) => this.handleFileChange('change', filePath))
      .on('unlink', (filePath) => this.handleFileChange('unlink', filePath))
      .on('error', (error) => logger.error('File watcher error:', error));

    logger.info('File watcher started');
  }

  private async handleFileChange(event: string, filePath: string): Promise<void> {
    // Only watch .fyn.js files
    if (!filePath.endsWith('.fyn.js')) {
      return;
    }

    logger.info(`File ${event}: ${filePath}`);

    try {
      switch (event) {
        case 'add':
        case 'change':
          const fyn = await this.fynLoader.loadFYN(filePath);
          if (fyn) {
            // Reschedule the FYN
            this.scheduler.scheduleFYN(fyn);
          }
          break;
          
        case 'unlink':
          // Extract FYN ID from file path (simplified)
          const filename = path.basename(filePath, '.js');
          const fynId = filename.replace('.fyn', '');

          this.scheduler.unscheduleFYN(fynId);
          this.fynLoader.removeFYN(fynId);
          logger.info(`Removed FYN: ${fynId}`);
          break;
      }
    } catch (error) {
      logger.error(`Error handling file change for ${filePath}:`, error);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
      logger.info('File watcher stopped');
    }
  }
}