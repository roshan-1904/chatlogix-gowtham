export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Transform API errors to user-friendly messages
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Network errors
    if (message.includes('fetch') || message.includes('network')) {
      return 'Network error. Please check your internet connection and try again.';
    }

    // HTTP status codes
    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'Your session has expired. Please log in again.';
    }

    if (message.includes('403') || message.includes('Forbidden')) {
      return 'You do not have permission to perform this action.';
    }

    if (message.includes('404') || message.includes('not found')) {
      return 'The requested resource was not found.';
    }

    if (message.includes('500') || message.includes('Internal Server Error')) {
      return 'Server error. Please try again later.';
    }

    // Return original message if no specific handling
    return message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503')
    );
  }
  return false;
}

