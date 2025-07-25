/**
 * Application Configuration
 * Centralized configuration for session management and user limits
 */

// Session Configuration
export const SESSION_CONFIG = {
    CARDS_PER_SESSION: 10,
    
    // User tier daily limits
    FREE_USER_DAILY_LIMIT: 20,  // 2 sessions × 10 cards
    PAID_USER_DAILY_LIMIT: 9999, // Effectively unlimited
    ADMIN_USER_DAILY_LIMIT: 9999, // Effectively unlimited
    
    // Session management
    MAX_SESSIONS_PER_DAY: {
        free: 2,
        paid: 999,
        admin: 999
    }
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

// Default export for easy importing
export default SESSION_CONFIG;