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
      const files = await fs.readdir(this.fynPath);
      for (const file of files) {
        if (file.endsWith('.fyn.js')) {
          await this.loadFYN(path.join(this.fynPath, file));
        }
      }

      logger.info(`Loaded ${this.loadedFYNs.size} FYNs`);
      return this.loadedFYNs;
    } catch (error) {
      logger.error('Error loading FYNs:', error);
      throw error;
    }
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
      
      // Detectar si es una clase con decoradores o un objeto tradicional
      let fyn: FYN;

      if (typeof (fynModule.default || fynModule) === 'function') {
        // Es una clase con decoradores
        const FynClass = fynModule.default || fynModule;
        fyn = createFYNInstance(FynClass);
      } else {
        // Es un objeto tradicional
        fyn = fynModule.default || fynModule;
      }

      if (!fyn.config || !fyn.config.fynId) {
        throw new Error(`Invalid FYN configuration in ${filePath}`);
      }

      // Validate FYN configuration
      this.validateFYN(fyn);

      this.loadedFYNs.set(fyn.config.fynId, fyn);
      logger.info(`Loaded FYN: ${fyn.config.fynId} from ${filePath}`);

      return fyn;
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
    const cronRegex = /^(\*|[0-5]?\d|\*\/[0-5]?\d) (\*|1?\d|2[0-3]|\*\/1?\d|\*\/2[0-3]) (\*|[12]?\d|3[01]|\*\/[12]?\d|\*\/3[01]) (\*|[1-9]|1[0-2]|\*\/[1-9]|\*\/1[0-2]) (\*|[0-6]|\*\/[0-6])$/;
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