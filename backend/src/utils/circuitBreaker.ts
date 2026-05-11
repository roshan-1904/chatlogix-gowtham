/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by temporarily blocking calls to failing services
 * Reference: Phase 6: Error Handling & Fallbacks (Implementation Plan)
 */

import { logger } from '../logger.js';

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  halfOpenAttempts: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,              // Open circuit after 3 failures
  resetTimeout: 5 * 60 * 1000,      // 5 minutes before attempting recovery
  halfOpenMaxAttempts: 1             // Only 1 attempt in half-open state
};

/**
 * Get circuit breaker state for a service
 */
function getCircuitBreakerState(service: string): CircuitBreakerState {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      halfOpenAttempts: 0
    });
  }
  return circuitBreakers.get(service)!;
}

/**
 * Record successful operation
 */
export function recordSuccess(service: string): void {
  const state = getCircuitBreakerState(service);
  state.failures = 0;
  state.state = 'closed';
  state.halfOpenAttempts = 0;
  
  logger.debug({ service }, 'Circuit breaker: Success recorded');
}

/**
 * Record failed operation
 */
export function recordFailure(service: string): void {
  const state = getCircuitBreakerState(service);
  state.failures++;
  state.lastFailureTime = Date.now();
  
  if (state.state === 'half-open') {
    // Failed in half-open state, go back to open
    state.state = 'open';
    state.halfOpenAttempts = 0;
    logger.warn({ service, failures: state.failures }, '🔴 Circuit breaker: Half-open failed, reopening');
  } else if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    state.state = 'open';
    logger.warn({ service, failures: state.failures }, '🔴 Circuit breaker opened');
  }
}

/**
 * Check if circuit is open (blocking calls)
 */
export function isCircuitOpen(service: string): boolean {
  const state = getCircuitBreakerState(service);
  
  if (state.state === 'closed') {
    return false; // Circuit is healthy
  }
  
  if (state.state === 'open') {
    const timeSinceLastFailure = Date.now() - state.lastFailureTime;
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      // Timeout expired, try half-open
      state.state = 'half-open';
      state.halfOpenAttempts = 0;
      logger.info({ service }, '🟡 Circuit breaker: Moving to half-open state');
      return false; // Allow one attempt
    }
    return true; // Still open, block calls
  }
  
  // half-open state
  if (state.halfOpenAttempts >= CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts) {
    // Already attempted, go back to open
    state.state = 'open';
    return true;
  }
  
  return false; // Allow attempt in half-open
}

/**
 * Execute operation with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  service: string,
  operation: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  if (isCircuitOpen(service)) {
    logger.warn({ service }, 'Circuit breaker open, using fallback');
    return await fallback();
  }
  
  const state = getCircuitBreakerState(service);
  if (state.state === 'half-open') {
    state.halfOpenAttempts++;
  }
  
  try {
    const result = await operation();
    recordSuccess(service);
    return result;
  } catch (error) {
    recordFailure(service);
    logger.error({ err: error, service }, 'Operation failed, using fallback');
    return await fallback();
  }
}

/**
 * Get circuit breaker status (for monitoring)
 */
export function getCircuitBreakerStatus(service: string): {
  state: string;
  failures: number;
  lastFailureTime: number;
} {
  const state = getCircuitBreakerState(service);
  return {
    state: state.state,
    failures: state.failures,
    lastFailureTime: state.lastFailureTime
  };
}

/**
 * Reset circuit breaker (for manual recovery)
 */
export function resetCircuitBreaker(service: string): void {
  const state = getCircuitBreakerState(service);
  state.failures = 0;
  state.state = 'closed';
  state.halfOpenAttempts = 0;
  state.lastFailureTime = 0;
  logger.info({ service }, 'Circuit breaker manually reset');
}

