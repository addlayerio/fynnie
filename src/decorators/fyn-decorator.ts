import 'reflect-metadata';

// Metadata keys
const FYN_CONFIG_KEY = Symbol('fyn:config');
const TASK_METADATA_KEY = Symbol('task:metadata');
const TASK_DEPENDENCIES_KEY = Symbol('task:dependencies');

// Interfaces para los decoradores
export interface FYNConfigOptions {
  fynId: string;
  description?: string;
  schedule?: string;
  startDate?: Date;
  endDate?: Date;
  catchup?: boolean;
  maxActiveRuns?: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  tags?: string[];
  owner?: string;
  params?: Record<string, any>;
}

export interface TaskOptions {
  taskId?: string;
  type?: 'javascript' | 'shell' | 'http';
  timeout?: number;
  retries?: number;
  params?: Record<string, any>;
  // Para tareas HTTP
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  // Para tareas shell
  command?: string;
}

// Decorador para configurar el FYN
export function FYN(config: FYNConfigOptions) {
  return function (target: any) {
    Reflect.defineMetadata(FYN_CONFIG_KEY, config, target);
    return target;
  };
}

// Decorador para marcar métodos como tareas
export function Task(options: TaskOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const taskId = options.taskId || propertyKey;
    const taskType = options.type || 'javascript';
    
    const taskMetadata = {
      taskId,
      type: taskType,
      methodName: propertyKey,
      timeout: options.timeout,
      retries: options.retries,
      params: options.params,
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      command: options.command
    };

    // Obtener tareas existentes o crear array vacío
    const existingTasks = Reflect.getMetadata(TASK_METADATA_KEY, target) || [];
    existingTasks.push(taskMetadata);
    
    Reflect.defineMetadata(TASK_METADATA_KEY, existingTasks, target);
  };
}

// Decorador para definir dependencias entre tareas
export function DependsOn(...taskIds: string[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const existingDeps = Reflect.getMetadata(TASK_DEPENDENCIES_KEY, target.constructor) || {};
    existingDeps[propertyKey] = taskIds;
    
    Reflect.defineMetadata(TASK_DEPENDENCIES_KEY, existingDeps, target.constructor);
  };
}

// Función helper para extraer metadata de una clase FYN
export function extractFYNMetadata(fynClass: any) {
  const config = Reflect.getMetadata(FYN_CONFIG_KEY, fynClass);
  const tasks = Reflect.getMetadata(TASK_METADATA_KEY, fynClass.prototype) || [];
  const dependencies = Reflect.getMetadata(TASK_DEPENDENCIES_KEY, fynClass.prototype) || {};

  if (!config) {
    throw new Error(`Class ${fynClass.name} is not decorated with @FYN`);
  }

  // Agregar dependencias a las tareas
  const tasksWithDeps = tasks.map((task: any) => ({
    ...task,
    dependsOn: dependencies[task.methodName] || []
  }));

  return {
    config,
    tasks: tasksWithDeps
  };
}

export function createFYNInstance(fynClass: any) {
  const metadata = extractFYNMetadata(fynClass);
  const instance = new fynClass();

  return {
    config: metadata.config,
    tasks: metadata.tasks.map((taskMeta: any) => {
      const {
        taskId,
        type,
        timeout,
        retries,
        dependsOn,
        params,
        url,
        method,
        headers,
        body,
        command,
        methodName, // 👈 asegurate de incluirlo
      } = taskMeta;

      const task: any = {
        taskId,
        type,
        timeout,
        retries,
        dependsOn,
        params,
        url,
        method,
        headers,
        body,
        command,
      };

      if (type === 'javascript' && methodName) {
        task.execute = async (params: any) => await instance[methodName](params);
      }

      return task;
    }),
    execute: async () => {
      console.log(`Executing FYN: ${metadata.config.fynId}`);
    }
  };
}
