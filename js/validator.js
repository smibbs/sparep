/**
 * Centralized Validation Utilities
 * Provides consistent validation patterns and error messages
 */

export class Validator {
    /**
     * Validate user ID
     * @param {any} userId - User ID to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateUserId(userId, context = 'operation') {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            throw new Error(`User not authenticated or missing user ID for ${context}.`);
        }
        return true;
    }

    /**
     * Validate card ID
     * @param {any} cardId - Card ID to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateCardId(cardId, context = 'operation') {
        if (!cardId || typeof cardId !== 'string' || cardId === 'undefined' || cardId.trim() === '') {
            throw new Error(`Missing or invalid card ID for ${context}.`);
        }
        return true;
    }

    /**
     * Validate rating value (updated for 0-3 scale - standard FSRS)
     * @param {any} rating - Rating to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateRating(rating, context = 'review') {
        if (typeof rating !== 'number' || !Number.isInteger(rating)) {
            throw new Error(`Invalid rating type for ${context}. Must be a number.`);
        }
        if (rating < 0 || rating > 3) {
            throw new Error(`Rating must be between 0 and 3 for ${context}. Got: ${rating}`);
        }
        return true;
    }

    /**
     * Validate response time
     * @param {any} responseTime - Response time to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateResponseTime(responseTime, context = 'review') {
        if (typeof responseTime !== 'number' || responseTime < 0) {
            throw new Error(`Invalid response time for ${context}. Must be a non-negative number.`);
        }
        if (responseTime > 3600000) { // 1 hour in milliseconds
            throw new Error(`Response time for ${context} seems unusually long (${responseTime}ms).`);
        }
        return true;
    }

    /**
     * Validate email format
     * @param {any} email - Email to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateEmail(email, context = 'registration') {
        if (!email || typeof email !== 'string') {
            throw new Error(`Email is required for ${context}.`);
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            throw new Error(`Invalid email format for ${context}.`);
        }
        
        if (email.length > 254) {
            throw new Error(`Email too long for ${context}. Maximum 254 characters.`);
        }
        
        return true;
    }

    /**
     * Validate password strength
     * @param {any} password - Password to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validatePassword(password, context = 'authentication') {
        if (!password || typeof password !== 'string') {
            throw new Error(`Password is required for ${context}.`);
        }
        
        if (password.length < 6) {
            throw new Error(`Password must be at least 6 characters for ${context}.`);
        }
        
        if (password.length > 128) {
            throw new Error(`Password too long for ${context}. Maximum 128 characters.`);
        }
        
        return true;
    }

    /**
     * Validate session data structure
     * @param {any} sessionData - Session data to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateSessionData(sessionData, context = 'session management') {
        if (!sessionData || typeof sessionData !== 'object') {
            throw new Error(`Invalid session data for ${context}.`);
        }
        
        if (!sessionData.sessionId || typeof sessionData.sessionId !== 'string') {
            throw new Error(`Missing or invalid session ID for ${context}.`);
        }
        
        if (!sessionData.userId || typeof sessionData.userId !== 'string') {
            throw new Error(`Missing or invalid user ID in session for ${context}.`);
        }
        
        if (!Array.isArray(sessionData.cards)) {
            throw new Error(`Session cards must be an array for ${context}.`);
        }
        
        if (typeof sessionData.totalCardsInSession !== 'number' || sessionData.totalCardsInSession < 0) {
            throw new Error(`Invalid total cards count in session for ${context}.`);
        }
        
        return true;
    }

    /**
     * Validate numeric bounds
     * @param {any} value - Value to validate
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @param {string} fieldName - Name of field for error message
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateNumericBounds(value, min, max, fieldName = 'value', context = 'operation') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`${fieldName} must be a valid number for ${context}.`);
        }
        
        if (value < min || value > max) {
            throw new Error(`${fieldName} must be between ${min} and ${max} for ${context}. Got: ${value}`);
        }
        
        return true;
    }

    /**
     * Validate flag reason
     * @param {any} reason - Flag reason to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateFlagReason(reason, context = 'card flagging') {
        const validReasons = ['incorrect', 'spelling', 'confusing', 'other'];
        
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            throw new Error(`Reason is required for ${context}.`);
        }
        
        const normalizedReason = reason.trim().toLowerCase();
        if (!validReasons.includes(normalizedReason)) {
            throw new Error(`Invalid flag reason for ${context}. Must be one of: ${validReasons.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Validate and sanitize comment text
     * @param {any} comment - Comment to validate
     * @param {number} maxLength - Maximum allowed length
     * @param {string} context - Context for error message
     * @returns {string|null} Sanitized comment or null
     * @throws {Error} If invalid
     */
    static validateComment(comment, maxLength = 500, context = 'card flagging') {
        if (comment === null || comment === undefined) {
            return null;
        }
        
        if (typeof comment !== 'string') {
            throw new Error(`Comment must be a string for ${context}.`);
        }
        
        if (comment.length > maxLength) {
            throw new Error(`Comment too long for ${context}. Maximum ${maxLength} characters allowed.`);
        }
        
        return this.sanitizeString(comment, maxLength);
    }

    /**
     * Sanitize string input with enhanced XSS protection
     * @param {any} input - Input to sanitize
     * @param {number} maxLength - Maximum allowed length
     * @returns {string} Sanitized string
     */
    static sanitizeString(input, maxLength = 1000) {
        if (typeof input !== 'string') {
            return '';
        }
        
        // Enhanced XSS protection - remove potentially dangerous patterns
        let sanitized = input
            .replace(/[<>]/g, '') // Remove angle brackets to prevent HTML injection
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/data:/gi, '') // Remove data: protocol
            .replace(/vbscript:/gi, '') // Remove vbscript: protocol
            .replace(/on\w+\s*=/gi, '') // Remove event handlers (onclick, onload, etc.)
            .replace(/style\s*=/gi, '') // Remove style attributes
            .replace(/expression\s*\(/gi, '') // Remove CSS expression()
            .replace(/url\s*\(/gi, '') // Remove CSS url()
            .replace(/&lt;script/gi, '') // Remove encoded script tags
            .replace(/&gt;/gi, '') // Remove encoded greater than
            .replace(/&#x3c;/gi, '') // Remove hex encoded less than
            .replace(/&#60;/gi, '') // Remove decimal encoded less than
            .trim();
        
        // Truncate if too long
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        
        return sanitized;
    }

    /**
     * Escape characters for safe insertion into HTML
     * @param {any} input - String to escape
     * @returns {string} Escaped string safe for innerHTML
     */
    static escapeHtml(input) {
        if (typeof input !== 'string') {
            return '';
        }
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Validate object has required properties
     * @param {any} obj - Object to validate
     * @param {string[]} requiredProps - Array of required property names
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateRequiredProperties(obj, requiredProps, context = 'operation') {
        if (!obj || typeof obj !== 'object') {
            throw new Error(`Invalid object for ${context}.`);
        }
        
        for (const prop of requiredProps) {
            if (!(prop in obj) || obj[prop] === null || obj[prop] === undefined) {
                throw new Error(`Missing required property '${prop}' for ${context}.`);
            }
        }
        
        return true;
    }

    /**
     * Validate array and its elements
     * @param {any} arr - Array to validate
     * @param {Function} elementValidator - Function to validate each element
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateArray(arr, elementValidator, context = 'operation') {
        if (!Array.isArray(arr)) {
            throw new Error(`Expected array for ${context}.`);
        }
        
        if (elementValidator) {
            for (let i = 0; i < arr.length; i++) {
                try {
                    elementValidator(arr[i], i);
                } catch (error) {
                    throw new Error(`Invalid array element at index ${i} for ${context}: ${error.message}`);
                }
            }
        }
        
        return true;
    }

    /**
     * Validate date string or Date object
     * @param {any} date - Date to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateDate(date, context = 'operation') {
        let dateObj;
        
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            throw new Error(`Invalid date format for ${context}. Must be string or Date object.`);
        }
        
        if (isNaN(dateObj.getTime())) {
            throw new Error(`Invalid date value for ${context}.`);
        }
        
        return true;
    }

    /**
     * Check if value is a valid UUID
     * @param {any} uuid - UUID to validate
     * @param {string} context - Context for error message
     * @returns {boolean} True if valid
     * @throws {Error} If invalid
     */
    static validateUUID(uuid, context = 'operation') {
        if (!uuid || typeof uuid !== 'string') {
            throw new Error(`UUID is required for ${context}.`);
        }
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
            throw new Error(`Invalid UUID format for ${context}.`);
        }
        
        return true;
    }
}

// Convenience functions for common validations
export const validateUserId = (userId, context) => Validator.validateUserId(userId, context);
export const validateCardId = (cardId, context) => Validator.validateCardId(cardId, context);
export const validateRating = (rating, context) => Validator.validateRating(rating, context);
export const validateResponseTime = (responseTime, context) => Validator.validateResponseTime(responseTime, context);
export const validateEmail = (email, context) => Validator.validateEmail(email, context);
export const validatePassword = (password, context) => Validator.validatePassword(password, context);
export const validateFlagReason = (reason, context) => Validator.validateFlagReason(reason, context);
export const validateComment = (comment, maxLength, context) => Validator.validateComment(comment, maxLength, context);
export const sanitizeString = (input, maxLength) => Validator.sanitizeString(input, maxLength);

export default Validator;