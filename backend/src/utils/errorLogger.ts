import { logger, StepLogger, createOperationId } from '../logger.js';
import { 
  CustomError, 
  AppError,
  ErrorType, 
  ErrorSeverity, 
  createDatabaseError, 
  createExternalAPIError, 
  createWhatsAppError, 
  createAIServiceError 
} from '../middleware/errorHandler.js';

/**
 * Enhanced error logging utility for services
 */
export class ServiceErrorLogger {
  private operationId: string;
  private stepLogger: StepLogger;
  private serviceName: string;

  constructor(serviceName: string, operation: string, context?: Record<string, any>) {
    this.serviceName = serviceName;
    this.operationId = createOperationId(serviceName.toLowerCase());
    this.stepLogger = new StepLogger(this.operationId, `${serviceName} - ${operation}`, context);
  }

  /**
   * Log database errors with enhanced context
   */
  logDatabaseError(error: any, operation: string, table?: string, query?: any): AppError {
    const enhancedError = createDatabaseError(
      `Database error in ${this.serviceName}: ${error.message}`,
      operation,
      table
    );
    
    this.stepLogger.error(enhancedError, {
      originalError: error.name,
      operation,
      table,
      query: query ? JSON.stringify(query) : undefined,
      errorCode: error.code,
      errorMeta: error.meta,
      stack: error.stack
    });

    return enhancedError;
  }

  /**
   * Log external API errors
   */
  logExternalAPIError(error: any, service: string, endpoint?: string, requestData?: any): AppError {
    const enhancedError = createExternalAPIError(
      `External API error in ${this.serviceName}: ${error.message}`,
      service,
      endpoint
    );

    this.stepLogger.error(enhancedError, {
      originalError: error.name,
      service,
      endpoint,
      requestData: requestData ? JSON.stringify(requestData) : undefined,
      statusCode: error.status || error.statusCode,
      responseData: error.response?.data,
      stack: error.stack
    });

    return enhancedError;
  }

  /**
   * Log WhatsApp service errors
   */
  logWhatsAppError(error: any, phoneNumberId?: string, customerPhone?: string, messageData?: any): AppError {
    const enhancedError = createWhatsAppError(
      `WhatsApp error in ${this.serviceName}: ${error.message}`,
      phoneNumberId,
      customerPhone
    );

    this.stepLogger.error(enhancedError, {
      originalError: error.name,
      phoneNumberId,
      customerPhone,
      messageData: messageData ? JSON.stringify(messageData) : undefined,
      errorCode: error.code,
      stack: error.stack
    });

    return enhancedError;
  }

  /**
   * Log AI service errors
   */
  logAIServiceError(error: any, intent?: string, tokensUsed?: number, requestData?: any): AppError {
    const enhancedError = createAIServiceError(
      `AI service error in ${this.serviceName}: ${error.message}`,
      intent,
      tokensUsed
    );

    this.stepLogger.error(enhancedError, {
      originalError: error.name,
      intent,
      tokensUsed,
      requestData: requestData ? JSON.stringify(requestData) : undefined,
      errorCode: error.code,
      stack: error.stack
    });

    return enhancedError;
  }

  /**
   * Log business logic errors
   */
  logBusinessError(message: string, context?: Record<string, any>): CustomError {
    const error = new CustomError(
      `Business logic error in ${this.serviceName}: ${message}`,
      400,
      ErrorType.BUSINESS_LOGIC,
      ErrorSeverity.MEDIUM,
      true,
      context
    );

    this.stepLogger.error(error, context);
    return error;
  }

  /**
   * Log validation errors
   */
  logValidationError(message: string, field?: string, value?: any): CustomError {
    const error = new CustomError(
      `Validation error in ${this.serviceName}: ${message}`,
      400,
      ErrorType.VALIDATION,
      ErrorSeverity.LOW,
      true,
      { field, value }
    );

    this.stepLogger.error(error, { field, value });
    return error;
  }

  /**
   * Log general errors with context
   */
  logError(error: any, context?: Record<string, any>): CustomError {
    const enhancedError = new CustomError(
      `Error in ${this.serviceName}: ${error.message || error}`,
      error.statusCode || 500,
      ErrorType.SYSTEM,
      ErrorSeverity.MEDIUM,
      true,
      context
    );

    this.stepLogger.error(enhancedError, {
      originalError: error.name,
      ...context,
      stack: error.stack
    });

    return enhancedError;
  }

  /**
   * Log warnings
   */
  logWarning(message: string, context?: Record<string, any>): void {
    this.stepLogger.warn(message, context);
  }

  /**
   * Log info messages
   */
  logInfo(message: string, context?: Record<string, any>): void {
    this.stepLogger.step(message, context);
  }

  /**
   * Log success
   */
  logSuccess(result?: Record<string, any>): void {
    this.stepLogger.success(result);
  }

  /**
   * Get operation ID for correlation
   */
  getOperationId(): string {
    return this.operationId;
  }
}

/**
 * Create a service error logger instance
 */
export function createServiceErrorLogger(serviceName: string, operation: string, context?: Record<string, any>): ServiceErrorLogger {
  return new ServiceErrorLogger(serviceName, operation, context);
}

/**
 * Enhanced error logging for database operations
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  data?: any,
  error?: any
): void {
  const operationId = createOperationId('db');
  const stepLogger = new StepLogger(operationId, `Database ${operation}`, {
    table,
    operation,
    data: data ? JSON.stringify(data) : undefined
  });

  if (error) {
    stepLogger.error(error, {
      operation,
      table,
      data: data ? JSON.stringify(data) : undefined,
      errorCode: error.code,
      errorMeta: error.meta
    });
  } else {
    stepLogger.success({ operation, table });
  }
}

/**
 * Enhanced error logging for external API calls
 */
export function logExternalAPICall(
  service: string,
  endpoint: string,
  method: string,
  requestData?: any,
  responseData?: any,
  error?: any
): void {
  const operationId = createOperationId('api');
  const stepLogger = new StepLogger(operationId, `External API Call`, {
    service,
    endpoint,
    method
  });

  stepLogger.step('Making API request', {
    service,
    endpoint,
    method,
    requestData: requestData ? JSON.stringify(requestData) : undefined
  });

  if (error) {
    stepLogger.error(error, {
      service,
      endpoint,
      method,
      requestData: requestData ? JSON.stringify(requestData) : undefined,
      statusCode: error.status || error.statusCode,
      responseData: error.response?.data
    });
  } else {
    stepLogger.success({
      service,
      endpoint,
      method,
      responseData: responseData ? JSON.stringify(responseData) : undefined
    });
  }
}

/**
 * Enhanced error logging for WhatsApp operations
 */
export function logWhatsAppOperation(
  operation: string,
  phoneNumberId?: string,
  customerPhone?: string,
  data?: any,
  error?: any
): void {
  const operationId = createOperationId('wa');
  const stepLogger = new StepLogger(operationId, `WhatsApp ${operation}`, {
    phoneNumberId,
    customerPhone,
    operation
  });

  stepLogger.step('Processing WhatsApp operation', {
    operation,
    phoneNumberId,
    customerPhone,
    data: data ? JSON.stringify(data) : undefined
  });

  if (error) {
    stepLogger.error(error, {
      operation,
      phoneNumberId,
      customerPhone,
      data: data ? JSON.stringify(data) : undefined,
      errorCode: error.code
    });
  } else {
    stepLogger.success({
      operation,
      phoneNumberId,
      customerPhone
    });
  }
}

/**
 * Enhanced error logging for AI operations
 */
export function logAIOperation(
  operation: string,
  intent?: string,
  tokensUsed?: number,
  data?: any,
  error?: any
): void {
  const operationId = createOperationId('ai');
  const stepLogger = new StepLogger(operationId, `AI ${operation}`, {
    intent,
    tokensUsed,
    operation
  });

  stepLogger.step('Processing AI operation', {
    operation,
    intent,
    tokensUsed,
    data: data ? JSON.stringify(data) : undefined
  });

  if (error) {
    stepLogger.error(error, {
      operation,
      intent,
      tokensUsed,
      data: data ? JSON.stringify(data) : undefined,
      errorCode: error.code
    });
  } else {
    stepLogger.success({
      operation,
      intent,
      tokensUsed
    });
  }
}
