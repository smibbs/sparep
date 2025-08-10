/**
 * Application Configuration
 * Centralized configuration for the modern FSRS-based learning system
 */

// FSRS Rating Scale (0-3 standardized scale)
export const FSRS_RATINGS = {
    AGAIN: 0,   // Card failed, needs relearning
    HARD: 1,    // Correct but difficult
    GOOD: 2,    // Standard correct response
    EASY: 3     // Very easy, longer interval
};

// Card States (FSRS learning progression)
export const CARD_STATES = {
    NEW: 'new',
    LEARNING: 'learning', 
    REVIEW: 'review',
    RELEARNING: 'relearning',
    BURIED: 'buried',
    SUSPENDED: 'suspended'
};

// Flag Reasons for reporting card issues
export const FLAG_REASONS = {
    INCORRECT: 'incorrect',
    SPELLING: 'spelling', 
    CONFUSING: 'confusing',
    OTHER: 'other'
};

// User Tier Configuration
export const USER_TIERS = {
    FREE: 'free',
    PAID: 'paid',
    ADMIN: 'admin'
};

// Daily Limits Configuration (matching database defaults)
export const DAILY_LIMITS = {
    // Profile defaults (from database schema)
    DEFAULT_NEW_CARDS: 20,
    DEFAULT_REVIEWS: 100,
    
    // Tier-based limits for free users (enforcement)
    FREE_USER_NEW_CARDS_LIMIT: 20,
    FREE_USER_REVIEWS_LIMIT: 100,
    
    // Paid/admin users (effectively unlimited)
    PAID_USER_LIMIT: 9999,
    ADMIN_USER_LIMIT: 9999
};

// Session Configuration (legacy support)
export const SESSION_CONFIG = {
    CARDS_PER_SESSION: 10,
    
    // Legacy daily limits (deprecated - use DAILY_LIMITS instead)
    FREE_USER_DAILY_LIMIT: 100,  // Updated to match database
    PAID_USER_DAILY_LIMIT: 9999,
    ADMIN_USER_DAILY_LIMIT: 9999,
    
    // Session management (legacy)
    MAX_SESSIONS_PER_DAY: {
        free: 10,  // 100 cards ÷ 10 cards per session
        paid: 999,
        admin: 999
    }
};

// FSRS Algorithm Configuration
export const FSRS_CONFIG = {
    // Default FSRS parameters (matching database defaults)
    DEFAULT_WEIGHTS: {
        // Standard 19 FSRS weights (w0-w18)
        // These are the default values before optimization
        w0: 0.4872, w1: 1.4003, w2: 3.1145, w3: 15.69, w4: 7.1434,
        w5: 0.6477, w6: 1.0007, w7: 0.0674, w8: 1.6597, w9: 0.1712,
        w10: 1.1178, w11: 2.0225, w12: 0.0904, w13: 0.3025, w14: 2.1214,
        w15: 0.2498, w16: 2.9466, w17: 0.4891, w18: 0.6468
    },
    
    // Learning configuration defaults
    DEFAULT_LEARNING_STEPS_MINUTES: [1, 10],
    DEFAULT_RELEARNING_STEPS_MINUTES: [10],
    DEFAULT_GRADUATING_INTERVAL_DAYS: 1,
    DEFAULT_EASY_INTERVAL_DAYS: 4,
    DEFAULT_MAXIMUM_INTERVAL_DAYS: 36500, // ~100 years
    DEFAULT_MINIMUM_INTERVAL_DAYS: 1,
    DEFAULT_MINIMUM_RELEARNING_INTERVAL_DAYS: 1,
    DEFAULT_LAPSE_MINIMUM_INTERVAL_DAYS: 1,
    DEFAULT_LAPSE_MULTIPLIER: 0.5,
    DEFAULT_DESIRED_RETENTION: 0.9, // 90%
    
    // Algorithm constraints
    MIN_DIFFICULTY: 1.0,
    MAX_DIFFICULTY: 10.0,
    DEFAULT_DIFFICULTY: 5.0,
    MIN_STABILITY: 0.0001
};

// Timezone Configuration
export const TIMEZONE_CONFIG = {
    DEFAULT_TIMEZONE: 'UTC',
    DEFAULT_DAY_START_TIME: '04:00:00', // 4 AM default
    
    // Common timezone options for UI
    COMMON_TIMEZONES: [
        { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
        { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
        { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
        { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
        { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
        { value: 'Europe/London', label: 'London (GMT/BST)' },
        { value: 'Europe/Paris', label: 'Central European Time' },
        { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
        { value: 'Asia/Shanghai', label: 'China Standard Time' },
        { value: 'Australia/Sydney', label: 'Australian Eastern Time' }
    ]
};

// Streak Configuration
export const STREAK_CONFIG = {
    // Minimum cards to maintain streak
    MIN_CARDS_FOR_STREAK: 1,
    
    // Default streak freeze count
    DEFAULT_STREAK_FREEZE_COUNT: 0,
    
    // Common milestone days
    MILESTONE_DAYS: [3, 7, 14, 30, 60, 100, 365, 730]
};

// Cache Configuration
export const CACHE_CONFIG = {
    // Storage size limits (in bytes)
    MAX_STORAGE_SIZE: 5 * 1024 * 1024, // 5MB
    MAX_MEMORY_ENTRIES: 50, // Maximum entries in memory fallback
    SESSION_EXPIRY_HOURS: 24, // Sessions expire after 24 hours
    
    // Mobile-specific limits (stricter for mobile devices)
    MOBILE_MAX_STORAGE_SIZE: 2 * 1024 * 1024, // 2MB for mobile
    MOBILE_MAX_MEMORY_ENTRIES: 25, // Fewer entries for mobile
    
    // Cleanup intervals
    CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // Run cleanup every hour
    QUOTA_BUFFER_PERCENTAGE: 0.1 // Keep 10% buffer when approaching quota
};

// Loading Messages Configuration
export const LOADING_CONFIG = {
    CONTEXTS: {
        GENERAL: 'general',
        STUDY: 'study', 
        REVIEW: 'review',
        NEW_CARDS: 'new_cards'
    },
    
    CATEGORIES: {
        MOTIVATIONAL: 'motivational',
        EDUCATIONAL: 'educational',
        FUN: 'fun',
        SYSTEM: 'system'
    },
    
    DEFAULT_WEIGHT: 1,
    MAX_MESSAGES_TO_FETCH: 5
};

// Deck Configuration
export const DECK_CONFIG = {
    DEFAULT_DECK_NAME: 'Default Deck',
    DEFAULT_DECK_DESCRIPTION: 'Your main study deck. You can create additional decks to organize your learning.',
    
    // Validation limits
    MAX_DECK_NAME_LENGTH: 100,
    MAX_DECK_DESCRIPTION_LENGTH: 500,
    
    // UI limits
    DECKS_PER_PAGE: 20
};

// Card Template Configuration
export const CARD_TEMPLATE_CONFIG = {
    // Validation limits
    MAX_QUESTION_LENGTH: 2000,
    MAX_ANSWER_LENGTH: 2000,
    MAX_SUBSECTION_LENGTH: 50,
    MAX_TAGS: 20,
    MAX_TAG_LENGTH: 30,
    
    // Search configuration
    MIN_SEARCH_LENGTH: 2,
    SEARCH_RESULTS_LIMIT: 50,
    
    // Statistics thresholds
    MIN_REVIEWS_FOR_STATS: 10
};

// Default export for easy importing (maintain backward compatibility)
export default {
    // Legacy SESSION_CONFIG for backward compatibility
    ...SESSION_CONFIG,
    
    // New configuration objects
    FSRS_RATINGS,
    CARD_STATES,
    FLAG_REASONS,
    USER_TIERS,
    DAILY_LIMITS,
    FSRS_CONFIG,
    TIMEZONE_CONFIG,
    STREAK_CONFIG,
    LOADING_CONFIG,
    DECK_CONFIG,
    CARD_TEMPLATE_CONFIG
};

// Export all configurations for named imports
export {
    FSRS_RATINGS,
    CARD_STATES, 
    FLAG_REASONS,
    USER_TIERS,
    DAILY_LIMITS,
    FSRS_CONFIG,
    TIMEZONE_CONFIG,
    STREAK_CONFIG,
    LOADING_CONFIG,
    DECK_CONFIG,
    CARD_TEMPLATE_CONFIG
};