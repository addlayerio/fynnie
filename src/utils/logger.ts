import winston from 'winston';
import * as path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || './logs/scheduler.log';

// Ensure logs directory exists
import * as fs from 'fs-extra';
fs.ensureDirSync(path.dirname(logFile));

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // File transport
    new winston.transports.File({ 
      filename: logFile,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // Console transport (only in development)
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(path.dirname(logFile), 'exceptions.log') })
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});