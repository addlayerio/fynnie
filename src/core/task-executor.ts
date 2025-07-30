import { TaskConfig } from '../types/fyn';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';

export class TaskExecutor {
  async executeTask(task: TaskConfig, params: Record<string, any>): Promise<any> {
    logger.info(`Executing task: ${task.taskId} (type: ${task.type})`);

    try {
      let result: any;

      switch (task.type) {
        case 'javascript':
          result = await this.executeJavaScript(task, params);
          break;
        case 'shell':
          result = await this.executeShell(task, params);
          break;
        case 'http':
          result = await this.executeHttp(task, params);
          break;
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      logger.info(`Task ${task.taskId} completed successfully`);
      return result;
    } catch (error) {
      logger.error(`Task ${task.taskId} failed:`, error);
      throw error;
    }
  }

  private async executeJavaScript(task: TaskConfig, params: Record<string, any>): Promise<any> {
    // Si la tarea tiene una función execute (decoradores), la usamos
    if ((task as any).execute && typeof (task as any).execute === 'function') {
      return await (task as any).execute({ ...params, ...(task.params || {}) });
    }
    
    if (!task.script) {
      throw new Error('JavaScript task must have a script');
    }

    return new Promise((resolve, reject) => {
      const timeout = task.timeout || 300000; // 5 minutes default
      
      // Create a temporary script file
      const tempScript = path.join('/tmp', `task_${task.taskId}_${Date.now()}.js`);
      
      const scriptContent = `
        const params = ${JSON.stringify(params)};
        const taskParams = ${JSON.stringify(task.params || {})};
        
        ${task.script}
      `;

      fs.writeFileSync(tempScript, scriptContent);

      const child = spawn('node', [tempScript], {
        stdio: 'pipe',
        timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        // Clean up temp file
        fs.removeSync(tempScript);

        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Script exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        fs.removeSync(tempScript);
        reject(error);
      });
    });
  }

  private async executeShell(task: TaskConfig, params: Record<string, any>): Promise<any> {
    if (!task.command) {
      throw new Error('Shell task must have a command');
    }

    return new Promise((resolve, reject) => {
      const timeout = task.timeout || 300000; // 5 minutes default
      
      const child = spawn('sh', ['-c', task.command], {
        stdio: 'pipe',
        timeout,
        env: { ...process.env, ...params, ...(task.params || {}) }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Command exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private async executeHttp(task: TaskConfig, params: Record<string, any>): Promise<any> {
    if (!task.url) {
      throw new Error('HTTP task must have a URL');
    }

    const timeout = task.timeout || 30000; // 30 seconds default
    const method = task.method || 'GET';
    
    try {
      const response = await axios({
        method,
        url: task.url,
        headers: { ...task.headers, ...params.headers },
        data: task.body || params.body,
        timeout,
        params: { ...task.params, ...params }
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP request failed: ${error.message}`);
      }
      throw error;
    }
  }
}