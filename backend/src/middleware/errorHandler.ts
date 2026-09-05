import { Request, Response, NextFunction } from 'express';
import { logger, StepLogger, createOperationId } from '../logger.js';

// Extend Express Request interface to include operationId and other properties
declare global {
  namespace Express {
    interface Request {
      operationId?: string;
      startTime?: number;
      user?: {
        id: string;
        [key: string]: any;
      };
    }
  }
}

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  errorCode?: string;
  context?: Record<string, any>;
  timestamp?: string;
  userId?: string;
  vendorId?: string;
  requestId?: string;
}

export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE = 'DATABASE',
  EXTERNAL_API = 'EXTERNAL_API',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  PAYMENT = 'PAYMENT',
  WHATSAPP = 'WHATSAPP',
  AI_SERVICE = 'AI_SERVICE',
  QUEUE = 'QUEUE'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;
  public errorCode: string;
  public context: Record<string, any>;
  public timestamp: string;
  public userId?: string;
  public vendorId?: string;
  public requestId?: string;
  public errorType: ErrorType;
  public severity: ErrorSeverity;

  constructor(
    message: string, 
    statusCode: number = 500, 
    errorType: ErrorType = ErrorType.SYSTEM,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    isOperational: boolean = true,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = `${errorType}_${statusCode}`;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.errorType = errorType;
    this.severity = severity;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export function createError(
  message: string, 
  statusCode: number = 500, 
  errorType: ErrorType = ErrorType.SYSTEM,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context: Record<string, any> = {}
): AppError {
  return new CustomError(message, statusCode, errorType, severity, true, context);
}

// Specific error creators for common scenarios
export function createValidationError(message: string, field?: string, value?: any): AppError {
  return new CustomError(
    message, 
    400, 
    ErrorType.VALIDATION, 
    ErrorSeverity.LOW,
    true,
    { field, value }
  );
}

export function createDatabaseError(message: string, operation?: string, table?: string): AppError {
  return new CustomError(
    message, 
    500, 
    ErrorType.DATABASE, 
    ErrorSeverity.HIGH,
    true,
    { operation, table }
  );
}

export function createExternalAPIError(message: string, service?: string, endpoint?: string): AppError {
  return new CustomError(
    message, 
    502, 
    ErrorType.EXTERNAL_API, 
    ErrorSeverity.HIGH,
    true,
    { service, endpoint }
  );
}

export function createRateLimitError(
  message: string,
  retryAfterSeconds: number,
  context: Record<string, unknown> = {}
): AppError {
  return new CustomError(
    message,
    429,
    ErrorType.RATE_LIMIT,
    ErrorSeverity.MEDIUM,
    true,
    { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)), ...context }
  );
}

export function createWhatsAppError(message: string, phoneNumberId?: string, customerPhone?: string): AppError {
  return new CustomError(
    message, 
    500, 
    ErrorType.WHATSAPP, 
    ErrorSeverity.HIGH,
    true,
    { phoneNumberId, customerPhone }
  );
}

export function createAIServiceError(message: string, intent?: string, tokensUsed?: number): AppError {
  return new CustomError(
    message, 
    500, 
    ErrorType.AI_SERVICE, 
    ErrorSeverity.HIGH,
    true,
    { intent, tokensUsed }
  );
}

export function globalErrorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const operationId = req.operationId || createOperationId('error');
  const stepLogger = new StepLogger(operationId, 'Global Error Handler', {
    method: req.method,
    url: req.url,
    errorMessage: error.message,
    statusCode: error.statusCode || 500
  });

  // Enhanced error context
  const errorContext = {
    // Request context
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
    
    // Error details
    errorMessage: error.message,
    errorName: error.name,
    errorCode: error.errorCode || 'UNKNOWN_ERROR',
    errorType: (error as CustomError).errorType || ErrorType.SYSTEM,
    severity: (error as CustomError).severity || ErrorSeverity.MEDIUM,
    statusCode: error.statusCode || 500,
    isOperational: error.isOperational !== false,
    
    // Stack and technical details
    stack: error.stack,
    timestamp: error.timestamp || new Date().toISOString(),
    
    // Business context
    userId: error.userId,
    vendorId: error.vendorId,
    requestId: error.requestId,
    
    // Additional context from error
    context: error.context || {},
    
    // Request body (sanitized for sensitive data)
    requestBody: sanitizeRequestBody(req.body),
    queryParams: req.query,
    pathParams: req.params,
    
    // Environment info
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    
    // Timing
    requestStartTime: req.startTime || Date.now(),
    errorTime: Date.now()
  };

  // Log the error with comprehensive context
  stepLogger.error(error, errorContext);

  // Additional structured logging for monitoring
  logger.error({
    operationId,
    errorType: (error as CustomError).errorType || ErrorType.SYSTEM,
    severity: (error as CustomError).severity || ErrorSeverity.MEDIUM,
    errorCode: error.errorCode || 'UNKNOWN_ERROR',
    statusCode: error.statusCode || 500,
    isOperational: error.isOperational !== false,
    vendorId: error.vendorId,
    userId: error.userId,
    endpoint: `${req.method} ${req.url}`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    context: error.context || {},
    stack: error.stack,
    timestamp: new Date().toISOString()
  }, `🚨 API Error: ${error.message}`);

  // Determine status code
  const statusCode = error.statusCode || 500;
  const retryAfterSeconds = error.context?.retryAfterSeconds;
  
  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production' && statusCode >= 500 
    ? 'Internal Server Error' 
    : error.message;

  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(Math.ceil(retryAfterSeconds)));
  }

  // Enhanced error response
  const errorResponse = {
    error: {
      message,
      statusCode,
      operationId,
      timestamp: new Date().toISOString(),
      errorCode: error.errorCode || 'UNKNOWN_ERROR',
      ...(typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0
        ? { retryAfter: Math.ceil(retryAfterSeconds) }
        : {}),
      ...(process.env.NODE_ENV !== 'production' && { 
        stack: error.stack,
        context: error.context,
        errorType: (error as CustomError).errorType,
        severity: (error as CustomError).severity
      })
    }
  };

  res.status(statusCode).json(errorResponse);
}

// Helper function to sanitize request body for logging
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'authorization'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Enhance error with request context
      if (error && typeof error === 'object') {
        error.vendorId = req.params.vendorId || req.query.vendorId;
        error.userId = req.user?.id; // If you have user authentication
        error.requestId = req.operationId;
        error.endpoint = `${req.method} ${req.url}`;
      }
      next(error);
    });
  };
}

// Enhanced async handler with error categorization
export function asyncHandlerWithContext(
  fn: Function, 
  errorType: ErrorType = ErrorType.SYSTEM,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Create enhanced error with context
      const enhancedError = new CustomError(
        error.message || 'An unexpected error occurred',
        error.statusCode || 500,
        errorType,
        severity,
        true,
        {
          ...error.context,
          vendorId: req.params.vendorId || req.query.vendorId,
          userId: req.user?.id,
          requestId: req.operationId,
          endpoint: `${req.method} ${req.url}`,
          originalError: error.name
        }
      );
      
      next(enhancedError);
    });
  };
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const operationId = req.operationId || createOperationId('not_found');
  const stepLogger = new StepLogger(operationId, 'Not Found Handler', {
    method: req.method,
    url: req.url
  });

  stepLogger.warn('Route not found', { method: req.method, url: req.url });
  
  res.status(404).json({
    error: {
      message: 'Route not found',
      statusCode: 404,
      operationId,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method
    }
  });
}

// Unhandled promise rejection handler
export function setupUnhandledRejectionHandler(): void {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const operationId = createOperationId('unhandled_rejection');
    const stepLogger = new StepLogger(operationId, 'Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      promise: promise.toString()
    });

    stepLogger.error(new Error(`Unhandled Promise Rejection: ${reason?.message || reason}`), {
      reason,
      promise: promise.toString(),
      stack: reason?.stack
    });

    // Exit process in production to prevent undefined behavior
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
}

// Uncaught exception handler
export function setupUncaughtExceptionHandler(): void {
  process.on('uncaughtException', (error: Error) => {
    const operationId = createOperationId('uncaught_exception');
    const stepLogger = new StepLogger(operationId, 'Uncaught Exception', {
      errorMessage: error.message,
      stack: error.stack
    });

    // Log critical error with enhanced context
    logger.error({
      operationId,
      errorType: ErrorType.SYSTEM,
      severity: ErrorSeverity.CRITICAL,
      errorCode: 'UNCAUGHT_EXCEPTION',
      statusCode: 500,
      isOperational: false,
      endpoint: 'PROCESS',
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }, `💥 CRITICAL: Uncaught Exception - ${error.message}`);

    stepLogger.error(error, {
      stack: error.stack,
      name: error.name,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    });

    // Exit process as this is a critical error
    process.exit(1);
  });
}

// Error monitoring and metrics
export class ErrorMonitor {
  private static errorCounts: Map<string, number> = new Map();
  private static errorTypes: Map<ErrorType, number> = new Map();
  private static severityCounts: Map<ErrorSeverity, number> = new Map();
  private static vendorErrorCounts: Map<string, number> = new Map();

  static recordError(error: AppError): void {
    const errorCode = error.errorCode || 'UNKNOWN_ERROR';
    const errorType = (error as CustomError).errorType || ErrorType.SYSTEM;
    const severity = (error as CustomError).severity || ErrorSeverity.MEDIUM;
    const vendorId = error.vendorId || 'unknown';

    // Increment counters
    this.errorCounts.set(errorCode, (this.errorCounts.get(errorCode) || 0) + 1);
    this.errorTypes.set(errorType, (this.errorTypes.get(errorType) || 0) + 1);
    this.severityCounts.set(severity, (this.severityCounts.get(severity) || 0) + 1);
    this.vendorErrorCounts.set(vendorId, (this.vendorErrorCounts.get(vendorId) || 0) + 1);

    // Log metrics for monitoring
    logger.info({
      errorCode,
      errorType,
      severity,
      vendorId,
      totalErrors: this.getTotalErrorCount(),
      errorCounts: Object.fromEntries(this.errorCounts),
      errorTypes: Object.fromEntries(this.errorTypes),
      severityCounts: Object.fromEntries(this.severityCounts),
      vendorErrorCounts: Object.fromEntries(this.vendorErrorCounts),
      timestamp: new Date().toISOString()
    }, '📊 Error Metrics Updated');
  }

  static getTotalErrorCount(): number {
    return Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
  }

  static getErrorStats(): {
    totalErrors: number;
    errorCounts: Record<string, number>;
    errorTypes: Record<string, number>;
    severityCounts: Record<string, number>;
    vendorErrorCounts: Record<string, number>;
  } {
    return {
      totalErrors: this.getTotalErrorCount(),
      errorCounts: Object.fromEntries(this.errorCounts),
      errorTypes: Object.fromEntries(this.errorTypes),
      severityCounts: Object.fromEntries(this.severityCounts),
      vendorErrorCounts: Object.fromEntries(this.vendorErrorCounts)
    };
  }

  static resetStats(): void {
    this.errorCounts.clear();
    this.errorTypes.clear();
    this.severityCounts.clear();
    this.vendorErrorCounts.clear();
  }
}

// Enhanced error handler that includes monitoring
export function enhancedGlobalErrorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Record error for monitoring
  ErrorMonitor.recordError(error);
  
  // Call the original global error handler
  globalErrorHandler(error, req, res, next);
}

// Error rate monitoring
export class ErrorRateMonitor {
  private static errorTimestamps: number[] = [];
  private static readonly WINDOW_SIZE = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_ERRORS_PER_WINDOW = 100;

  static recordError(): boolean {
    const now = Date.now();
    this.errorTimestamps.push(now);
    
    // Remove old timestamps outside the window
    this.errorTimestamps = this.errorTimestamps.filter(
      timestamp => now - timestamp <= this.WINDOW_SIZE
    );
    
    const errorRate = this.errorTimestamps.length;
    const isHighErrorRate = errorRate > this.MAX_ERRORS_PER_WINDOW;
    
    if (isHighErrorRate) {
      logger.warn({
        errorRate,
        maxAllowed: this.MAX_ERRORS_PER_WINDOW,
        windowSize: this.WINDOW_SIZE,
        timestamp: new Date().toISOString()
      }, '⚠️ High error rate detected');
    }
    
    return isHighErrorRate;
  }

  static getCurrentErrorRate(): number {
    const now = Date.now();
    this.errorTimestamps = this.errorTimestamps.filter(
      timestamp => now - timestamp <= this.WINDOW_SIZE
    );
    return this.errorTimestamps.length;
  }
}
