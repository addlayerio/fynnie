import * as fs from 'fs-extra';
import * as path from 'path';
import { FYN, FYNConfig } from '../types/fyn';
import { logger } from '../utils/logger';
import { spawn } from 'child_process';
import { createFYNInstance } from '../decorators/fyn-decorator';

export class FYNLoader {
  private fynPath: string;
  private loadedFYNs: Map<string, FYN> = new Map();

  constructor(fynPath: string) {
    this.fynPath = fynPath;
  }

  async loadAllFYNs(): Promise<Map<string, FYN>> {
    try {
      await fs.ensureDir(this.fynPath);
      const files = await this.findAllFynFilesRecursively(this.fynPath);

      for (const file of files) {
        await this.loadFYN(file);
      }

      logger.info(`Loaded ${this.loadedFYNs.size} FYNs`);
      return this.loadedFYNs;
    } catch (error) {
      logger.error('Error loading FYNs:', error);
      throw error;
    }
  }

  private async findAllFynFilesRecursively(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return this.findAllFynFilesRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.fyn.js')) {
          return fullPath;
        }
        return [];
      })
    );
    return files.flat();
  }

  async loadFYN(filePath: string): Promise<FYN | null> {
    try {
      const fynDir = path.dirname(filePath);
      const packageJsonPath = path.join(fynDir, 'package.json');

      // Install dependencies if package.json exists
      if (await fs.pathExists(packageJsonPath)) {
        await this.installDependencies(fynDir);
      }

      // Clear module cache to reload FYN
      delete require.cache[require.resolve(path.resolve(filePath))];
      const fynModule = require(path.resolve(filePath));

      const candidates = Object.values(fynModule);
      let foundAny = false;

      for (const exported of candidates) {
        if (typeof exported === 'function') {
          let fynInstance: FYN | null;
          try {
            fynInstance = createFYNInstance(exported);
          } catch (err) {
            logger.warn(`Failed to create FYN instance in ${filePath}: ${err.message}`);
            continue;
          }

          if (fynInstance?.config?.fynId) {
            try {
              this.validateFYN(fynInstance);
              this.loadedFYNs.set(fynInstance.config.fynId, fynInstance);
              logger.info(`Loaded FYN: ${fynInstance.config.fynId} from ${filePath}`);
              foundAny = true;
            } catch (validationError) {
              logger.error(`Invalid FYN in ${filePath}:`, validationError);
            }
          }
        }
      }

      if (!foundAny) {
        logger.warn(`No valid FYN found in ${filePath}`);
      }

      return null;
    } catch (error) {
      logger.error(`Error loading FYN from ${filePath}:`, error);
      return null;
    }
  }


  private async installDependencies(fynDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: fynDir,
        stdio: 'pipe'
      });

      npm.on('close', (code) => {
        if (code === 0) {
          logger.info(`Dependencies installed for FYN in ${fynDir}`);
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  private validateFYN(fyn: FYN): void {
    if (!fyn.config.fynId) {
      throw new Error('FYN must have a fynId');
    }

    if (fyn.config.schedule && !this.isValidCron(fyn.config.schedule)) {
      throw new Error(`Invalid cron expression: ${fyn.config.schedule}`);
    }

    if (!fyn.tasks || fyn.tasks.length === 0) {
      throw new Error('FYN must have at least one task');
    }

    // Validate task dependencies
    const taskIds = new Set(fyn.tasks.map(t => t.taskId));
    for (const task of fyn.tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          if (!taskIds.has(dep)) {
            throw new Error(`Task ${task.taskId} depends on non-existent task: ${dep}`);
          }
        }
      }
    }
  }

private isValidCron(cron: string): boolean {
  const cronField = '(\\*|\\d+|\\*/\\d+|\\d+-\\d+|\\d+(,\\d+)+)';
  const cronRegex = new RegExp(`^${cronField}\\s+${cronField}\\s+${cronField}\\s+${cronField}\\s+${cronField}$`);
  return cronRegex.test(cron);
}

  getFYN(fynId: string): FYN | undefined {
    return this.loadedFYNs.get(fynId);
  }

  getAllFYNs(): FYN[] {
    return Array.from(this.loadedFYNs.values());
  }

  removeFYN(fynId: string): boolean {
    return this.loadedFYNs.delete(fynId);
  }
}