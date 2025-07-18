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

// Default export for easy importing
export default SESSION_CONFIG;