/**
 * Centralized Error Handler
 * Provides consistent error handling, classification, and user-friendly messages
 */

export class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.retryAttempts = new Map();
    }

    /**
     * Handle and classify errors with appropriate user messages
     * @param {Error} error - The error to handle
     * @param {string} context - Context where error occurred
     * @param {Object} options - Additional options
     * @returns {Object} Handled error with user message and retry info
     */
    handleError(error, context = 'Unknown', options = {}) {
        const errorType = this.classifyError(error);
        const userMessage = this.getUserMessage(errorType, error);
        const shouldRetry = this.shouldRetry(errorType, context, options);
        
        // Track error occurrences
        this.trackError(errorType, context);
        
        // Log technical details for debugging
        this.logError(error, context, errorType);
        
        return {
            type: errorType,
            userMessage,
            technicalMessage: error.message,
            shouldRetry,
            context,
            timestamp: new Date().toISOString(),
            originalError: error
        };
    }

    /**
     * Classify error into standard types
     * @param {Error} error - Error to classify
     * @returns {string} Error type
     */
    classifyError(error) {
        // Network-related errors
        if (this.isNetworkError(error)) {
            return 'NETWORK_ERROR';
        }
        
        // Authentication/Authorization errors
        if (this.isAuthError(error)) {
            return 'AUTH_ERROR';
        }
        
        // Permission errors
        if (this.isPermissionError(error)) {
            return 'PERMISSION_ERROR';
        }
        
        // Storage quota errors
        if (this.isQuotaError(error)) {
            return 'QUOTA_ERROR';
        }
        
        // Database/Supabase errors
        if (this.isDatabaseError(error)) {
            return 'DATABASE_ERROR';
        }
        
        // Validation errors
        if (this.isValidationError(error)) {
            return 'VALIDATION_ERROR';
        }
        
        // Rate limiting errors
        if (this.isRateLimitError(error)) {
            return 'RATE_LIMIT_ERROR';
        }
        
        // Timeout errors
        if (this.isTimeoutError(error)) {
            return 'TIMEOUT_ERROR';
        }
        
        // FSRS-specific errors
        if (this.isFSRSError(error)) {
            return 'FSRS_ERROR';
        }
        
        // Deck-related errors
        if (this.isDeckError(error)) {
            return 'DECK_ERROR';
        }
        
        // Composite key errors
        if (this.isCompositeKeyError(error)) {
            return 'COMPOSITE_KEY_ERROR';
        }
        
        // Enum violation errors
        if (this.isEnumError(error)) {
            return 'ENUM_ERROR';
        }
        
        // Generic errors
        return 'UNKNOWN_ERROR';
    }

    /**
     * Check if error is network-related
     */
    isNetworkError(error) {
        return /network|fetch|connection|offline|dns|resolve/i.test(error.message) ||
               error.name === 'NetworkError' ||
               error.code === 'NETWORK_ERROR';
    }

    /**
     * Check if error is authentication-related
     */
    isAuthError(error) {
        return /not logged in|not authenticated|invalid.*token|expired.*token|sign.*in|login/i.test(error.message) ||
               error.code === 'PGRST301' || // JWT expired
               error.code === 'PGRST302';   // JWT invalid
    }

    /**
     * Check if error is permission-related
     */
    isPermissionError(error) {
        return error.code === '42501' ||
               /permission denied|unauthorized|access denied|forbidden/i.test(error.message) ||
               error.status === 403;
    }

    /**
     * Check if error is storage quota-related
     */
    isQuotaError(error) {
        return error.name === 'QuotaExceededError' ||
               error.code === 22 ||
               /quota.*exceeded|storage.*full|disk.*full/i.test(error.message);
    }

    /**
     * Check if error is database-related
     */
    isDatabaseError(error) {
        return error.code && (
            error.code.startsWith('PGRST') || // PostgREST errors
            error.code.startsWith('P') ||     // Postgres errors
            error.code.startsWith('23') ||    // SQL constraint violations
            error.code.startsWith('22')       // Data exception errors
        );
    }

    /**
     * Check if error is validation-related
     */
    isValidationError(error) {
        return /validation|invalid.*input|malformed|schema.*error/i.test(error.message) ||
               error.name === 'ValidationError';
    }

    /**
     * Check if error is rate limiting
     */
    isRateLimitError(error) {
        return /rate.*limit|too.*many.*requests|throttle/i.test(error.message) ||
               error.status === 429;
    }

    /**
     * Check if error is timeout-related
     */
    isTimeoutError(error) {
        return /timeout|timed.*out/i.test(error.message) ||
               error.name === 'TimeoutError';
    }

    /**
     * Check if error is FSRS-related
     */
    isFSRSError(error) {
        return /fsrs|stability|difficulty|weight|retention/i.test(error.message) ||
               /invalid.*rating|rating.*out.*of.*range/i.test(error.message) ||
               /invalid.*state.*transition/i.test(error.message);
    }

    /**
     * Check if error is deck-related
     */
    isDeckError(error) {
        return /deck.*not.*found|deck.*required|deck.*id.*missing|invalid.*deck/i.test(error.message) ||
               /deck.*not.*active|deck.*deleted/i.test(error.message) ||
               /no.*accessible.*decks|contact.*administrator.*to.*assign/i.test(error.message);
    }

    /**
     * Check if error is composite primary key related
     */
    isCompositeKeyError(error) {
        return /duplicate.*key.*value|violates.*unique.*constraint/i.test(error.message) ||
               /user_cards_pkey|primary.*key.*violation/i.test(error.message) ||
               /missing.*deck_id|deck_id.*required/i.test(error.message);
    }

    /**
     * Check if error is enum violation
     */
    isEnumError(error) {
        return /invalid.*input.*value.*for.*enum/i.test(error.message) ||
               /user_tier|card_state|flag_reason/i.test(error.message) ||
               error.code === '22P02'; // Invalid text representation
    }

    /**
     * Get user-friendly error message
     * @param {string} errorType - Classified error type
     * @param {Error} error - Original error
     * @returns {string} User-friendly message
     */
    getUserMessage(errorType, error) {
        switch (errorType) {
            case 'NETWORK_ERROR':
                return 'Connection problem. Please check your internet connection and try again.';
            
            case 'AUTH_ERROR':
                return 'You need to sign in again. Please log in to continue.';
            
            case 'PERMISSION_ERROR':
                return 'You don\'t have permission to access this data.';
            
            case 'QUOTA_ERROR':
                return 'Storage limit reached. Try clearing your browser data or freeing up space.';
            
            case 'DATABASE_ERROR':
                return 'Database error occurred. Please try again in a moment.';
            
            case 'VALIDATION_ERROR':
                return 'Invalid data provided. Please check your input and try again.';
            
            case 'RATE_LIMIT_ERROR':
                return 'Too many requests. Please wait a moment before trying again.';
            
            case 'TIMEOUT_ERROR':
                return 'Request took too long. Please try again.';
            
            case 'FSRS_ERROR':
                return 'Invalid study data or rating. Please check your input and try again.';
            
            case 'DECK_ERROR':
                // Check if it's the new admin-assignment error
                if (/no.*accessible.*decks|contact.*administrator.*to.*assign/i.test(error.message)) {
                    return 'No study decks available. Please contact an administrator to assign you a deck for studying.';
                }
                return 'Deck not found or unavailable. Please contact an administrator if you need access to study materials.';
            
            case 'COMPOSITE_KEY_ERROR':
                return 'Card already exists in this deck or missing required deck information.';
            
            case 'ENUM_ERROR':
                return 'Invalid data format. Please refresh the page and try again.';
            
            default:
                return 'An unexpected error occurred. Please try again.';
        }
    }

    /**
     * Determine if error should trigger a retry
     * @param {string} errorType - Error type
     * @param {string} context - Error context
     * @param {Object} options - Options including maxRetries
     * @returns {boolean} Whether to retry
     */
    shouldRetry(errorType, context, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const retryKey = `${errorType}_${context}`;
        const currentRetries = this.retryAttempts.get(retryKey) || 0;
        
        // Don't retry if we've exceeded max attempts
        if (currentRetries >= maxRetries) {
            return false;
        }
        
        // Determine retry eligibility by error type
        const retryableErrors = [
            'NETWORK_ERROR',
            'TIMEOUT_ERROR',
            'RATE_LIMIT_ERROR',
            'DATABASE_ERROR'
            // Note: FSRS_ERROR, DECK_ERROR, COMPOSITE_KEY_ERROR, ENUM_ERROR are typically not retryable
            // as they indicate data/logic issues that won't resolve with retry
        ];
        
        const shouldRetry = retryableErrors.includes(errorType);
        
        if (shouldRetry) {
            this.retryAttempts.set(retryKey, currentRetries + 1);
        }
        
        return shouldRetry;
    }

    /**
     * Track error occurrences for monitoring
     * @param {string} errorType - Error type
     * @param {string} context - Error context
     */
    trackError(errorType, context) {
        const key = `${errorType}_${context}`;
        const current = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, current + 1);
    }

    /**
     * Log error with appropriate level
     * @param {Error} error - Original error
     * @param {string} context - Error context
     * @param {string} errorType - Classified error type
     */
    logError(error, context, errorType) {
        const logData = {
            type: errorType,
            context,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };
        
        // Use appropriate log level based on error type
        if (['AUTH_ERROR', 'PERMISSION_ERROR', 'VALIDATION_ERROR', 'FSRS_ERROR', 'DECK_ERROR', 'ENUM_ERROR'].includes(errorType)) {
            console.warn('Error handled:', logData);
        } else if (['QUOTA_ERROR', 'RATE_LIMIT_ERROR', 'COMPOSITE_KEY_ERROR'].includes(errorType)) {
            console.info('Error handled:', logData);
        } else {
            console.error('Error handled:', logData);
        }
    }

    /**
     * Reset retry attempts for a specific context
     * @param {string} context - Context to reset
     */
    resetRetries(context) {
        for (const [key] of this.retryAttempts) {
            if (key.endsWith(`_${context}`)) {
                this.retryAttempts.delete(key);
            }
        }
    }

    /**
     * Get error statistics for monitoring
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        const stats = {};
        for (const [key, count] of this.errorCounts) {
            stats[key] = count;
        }
        return {
            errorCounts: stats,
            totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            activeRetries: this.retryAttempts.size
        };
    }

    /**
     * Clear error tracking data
     */
    clearStats() {
        this.errorCounts.clear();
        this.retryAttempts.clear();
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

/**
 * Convenience function for handling errors
 * @param {Error} error - Error to handle
 * @param {string} context - Context where error occurred
 * @param {Object} options - Additional options
 * @returns {Object} Handled error result
 */
export function handleError(error, context, options) {
    return errorHandler.handleError(error, context, options);
}

/**
 * Async wrapper that handles errors in async functions
 * @param {Function} asyncFn - Async function to wrap
 * @param {string} context - Context for error handling
 * @param {Object} options - Error handling options
 * @returns {Function} Wrapped async function
 */
export function withErrorHandling(asyncFn, context, options = {}) {
    return async function(...args) {
        try {
            return await asyncFn.apply(this, args);
        } catch (error) {
            const handledError = errorHandler.handleError(error, context, options);
            
            if (handledError.shouldRetry && options.onRetry) {
                return options.onRetry(handledError);
            }
            
            if (options.onError) {
                options.onError(handledError);
            }
            
            throw new Error(handledError.userMessage);
        }
    };
}

export default errorHandler;