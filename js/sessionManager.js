/**
 * SessionManager - Handles batch session loading and local caching
 */
import { SESSION_CONFIG, CACHE_CONFIG } from './config.js';

class SessionManager {
    constructor() {
        this.sessionData = null;
        this.currentCardIndex = 0;
        this.sessionStorageKey = 'flashcard_session';
        this.cacheStatsKey = 'flashcard_cache_stats';
        
        // Initialize storage mechanism based on browser capabilities
        this.storageMethod = this.detectStorageMethod();
        this.memoryFallback = new Map(); // Memory-based fallback for storage restrictions
        this.isMobile = this.detectMobileDevice();
        
        // Initialize cache management
        this.initializeCacheManagement();
        
        // Apply mobile-specific optimizations
        if (this.isMobile) {
            this.applyMobileOptimizations();
        }
    }

    /**
     * Detect the best available storage method for the current browser
     * @returns {string} Storage method: 'sessionStorage', 'localStorage', or 'memory'
     */
    detectStorageMethod() {
        const isSafari = this.detectSafariPrivateBrowsing();
        
        try {
            // Test sessionStorage first (preferred for sessions)
            if (typeof window !== 'undefined' && window.sessionStorage) {
                const testKey = '__storage_test__';
                window.sessionStorage.setItem(testKey, 'test');
                window.sessionStorage.removeItem(testKey);
                
                if (isSafari.isPrivate) {
                    console.warn('Safari private browsing detected - sessionStorage may be limited');
                }
                
                return 'sessionStorage';
            }
        } catch (e) {
            console.warn('sessionStorage not available, trying localStorage:', e.message);
            
            // Special handling for Safari private browsing errors
            if (isSafari.isSafari && (e.name === 'QuotaExceededError' || e.code === 22)) {
                console.warn('Safari private browsing detected via storage quota error');
            }
        }

        try {
            // Fallback to localStorage (Safari private browsing may still block this)
            if (typeof window !== 'undefined' && window.localStorage) {
                const testKey = '__storage_test__';
                window.localStorage.setItem(testKey, 'test');
                window.localStorage.removeItem(testKey);
                
                if (isSafari.isPrivate) {
                    console.warn('Using localStorage in Safari private mode - limited functionality');
                }
                
                return 'localStorage';
            }
        } catch (e) {
            console.warn('localStorage not available, using memory fallback:', e.message);
            
            // Safari private browsing completely blocks storage
            if (isSafari.isSafari && (e.name === 'QuotaExceededError' || e.code === 22)) {
                console.warn('Safari private browsing confirmed - using memory-only storage');
                this.showSafariPrivateBrowsingNotice();
            }
        }

        // Ultimate fallback: memory storage (lost on page refresh)
        return 'memory';
    }

    /**
     * Detect Safari private browsing mode
     * @returns {Object} Detection result with isSafari and isPrivate flags
     */
    detectSafariPrivateBrowsing() {
        // Check if it's Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (!isSafari) {
            return { isSafari: false, isPrivate: false };
        }

        try {
            // Try to use localStorage - in private mode this will fail
            window.localStorage.setItem('__safari_test__', '1');
            window.localStorage.removeItem('__safari_test__');
            
            // If we get here, it's Safari but not private mode
            return { isSafari: true, isPrivate: false };
        } catch (e) {
            // Safari private mode detected
            return { isSafari: true, isPrivate: true };
        }
    }

    /**
     * Show notice about Safari private browsing limitations
     */
    showSafariPrivateBrowsingNotice() {
        // Only show once per session
        if (this.hasShownPrivateNotice) return;
        this.hasShownPrivateNotice = true;

        // Use a subtle console warning rather than intrusive alert
        console.info(`
🔒 Safari Private Browsing Detected
Your study progress will be kept in memory during this session but will be lost if you:
• Refresh the page
• Navigate away and return
• Close/reopen the tab

For the best experience, consider using Safari in normal mode or another browser.
        `);

        // Optionally, could show a subtle UI notification
        // This would need to be implemented in the UI layer
    }

    /**
     * Initialize a new session with configured number of cards
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @returns {Promise<boolean>} Success status
     */
    async initializeSession(userId, dbService) {
        try {
            // Load cards for the session
            const cards = await this.loadSessionCards(userId, dbService);
            if (!cards || cards.length === 0) {
                throw new Error('No cards available for session');
            }

            // Create new session data
            this.sessionData = {
                sessionId: this.generateSessionId(),
                userId: userId,
                cards: cards,
                totalCardsInSession: cards.length, // Track actual number of cards
                ratings: {}, // cardId -> array of rating objects
                completedCards: new Set(), // Cards that have been rated (all ratings 1-4)
                currentCardIndex: 0,
                sessionStartTime: new Date().toISOString()
            };

            // Save to session storage
            this.saveSession();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize session:', error);
            throw error;
        }
    }

    /**
     * Load cards for the session (due cards + new cards)
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @returns {Promise<Array>} Array of cards
     */
    async loadSessionCards(userId, dbService) {
        try {
            // Get up to configured session size due cards
            const dueCards = await dbService.getCardsDue(userId);
            
            if (dueCards.length >= SESSION_CONFIG.CARDS_PER_SESSION) {
                return dueCards.slice(0, SESSION_CONFIG.CARDS_PER_SESSION);
            }

            // If we need more cards, get new ones
            const newCardsNeeded = SESSION_CONFIG.CARDS_PER_SESSION - dueCards.length;
            const newCards = await dbService.getNewCards(userId, newCardsNeeded);
            
            // Transform new cards to match expected format
            const formattedNewCards = newCards.map(card => ({
                card_id: card.id,
                cards: card,
                stability: 1.0,
                difficulty: 5.0,
                state: 'new',
                total_reviews: 0,
                next_review_date: new Date().toISOString()
            }));

            const allCards = [...dueCards, ...formattedNewCards];
            
            // If we still don't have enough cards, that's okay for now
            // We'll work with what we have
            if (allCards.length === 0) {
                throw new Error('No cards available for session');
            }
            
            return allCards;
        } catch (error) {
            console.error('Failed to load session cards:', error);
            throw error;
        }
    }

    /**
     * Record a rating for the current card
     * @param {number} rating - Rating value (1-4)
     * @param {number} responseTime - Response time in milliseconds
     * @returns {boolean} Success status
     */
    recordRating(rating, responseTime) {
        if (!this.sessionData || !this.getCurrentCard()) {
            return false;
        }
        
        // Validate session state before recording rating
        if (!this.validateSessionState()) {
            console.error('Session state validation failed before recording rating');
            return false;
        }

        const currentCard = this.getCurrentCard();
        const cardId = String(currentCard.card_id); // Ensure consistent string type
        
        // Initialize ratings array for this card if needed
        if (!this.sessionData.ratings[cardId]) {
            this.sessionData.ratings[cardId] = [];
        }

        // Record the rating
        const ratingData = {
            rating: rating,
            responseTime: responseTime,
            timestamp: new Date().toISOString()
        };
        
        this.sessionData.ratings[cardId].push(ratingData);

        // Handle rating logic - all ratings count as completed
        this.sessionData.completedCards.add(cardId);

        // Save to session storage
        this.saveSession();
        
        return true;
    }

    /**
     * Get the current card to display
     * @returns {Object|null} Current card object
     */
    getCurrentCard() {
        if (!this.sessionData || !this.sessionData.cards) {
            return null;
        }

        // Get the next uncompleted card from the session
        for (let i = 0; i < this.sessionData.cards.length; i++) {
            const card = this.sessionData.cards[i];
            const cardId = String(card.card_id); // Ensure string consistency
            
            // Return the first uncompleted card
            if (!this.sessionData.completedCards.has(cardId)) {
                return card;
            }
        }

        return null; // All cards completed
    }

    /**
     * Check if the session is complete
     * @returns {boolean} True if all cards in session have been rated >= 2
     */
    isSessionComplete() {
        if (!this.sessionData) {
            return false;
        }
        
        // Session is complete when all cards in the session have been completed
        return this.sessionData.completedCards.size >= this.sessionData.totalCardsInSession;
    }

    /**
     * Validate session state consistency
     * @returns {boolean} True if session state is valid
     */
    validateSessionState() {
        if (!this.sessionData) {
            return false;
        }
        
        // Check required properties
        if (!this.sessionData.cards || !Array.isArray(this.sessionData.cards)) {
            console.error('Session validation failed: cards is not an array');
            return false;
        }
        
        if (!this.sessionData.completedCards || !(this.sessionData.completedCards instanceof Set)) {
            console.error('Session validation failed: completedCards is not a Set');
            return false;
        }
        
        
        if (!this.sessionData.ratings || typeof this.sessionData.ratings !== 'object') {
            console.error('Session validation failed: ratings is not an object');
            return false;
        }
        
        if (!this.sessionData.totalCardsInSession || typeof this.sessionData.totalCardsInSession !== 'number') {
            console.error('Session validation failed: totalCardsInSession is not a number');
            return false;
        }
        
        return true;
    }

    /**
     * Get session progress (completed cards / total cards in session)
     * @returns {Object} Progress information
     */
    getProgress() {
        if (!this.sessionData) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const completed = this.sessionData.completedCards.size;
        const total = this.sessionData.totalCardsInSession;
        const percentage = total > 0 ? (completed / total) * 100 : 0;

        return {
            completed: completed,
            total: total,
            percentage: percentage
        };
    }

    /**
     * Get all session data for batch submission
     * @returns {Object} Complete session data
     */
    getSessionData() {
        return this.sessionData;
    }

    /**
     * Clear the current session
     */
    clearSession() {
        this.sessionData = null;
        this.currentCardIndex = 0;
        
        try {
            // Clear from storage using generic method
            if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.removeItem(this.sessionStorageKey);
            } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(this.sessionStorageKey);
            } else {
                // Clear from memory fallback
                this.memoryFallback.delete(this.sessionStorageKey);
            }
        } catch (error) {
            console.warn('Failed to clear session storage:', error);
            // Still clear memory fallback as ultimate cleanup
            this.memoryFallback.delete(this.sessionStorageKey);
        }
    }
    
    /**
     * Get cache health information for monitoring
     * @returns {Object} Cache health metrics
     */
    getCacheHealth() {
        const stats = this.getCacheStats();
        const currentSize = this.getStorageSize();
        const maxSize = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_STORAGE_SIZE : CACHE_CONFIG.MAX_STORAGE_SIZE;
        const memoryEntries = this.memoryFallback.size;
        const maxMemoryEntries = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_MEMORY_ENTRIES : CACHE_CONFIG.MAX_MEMORY_ENTRIES;
        
        return {
            storageMethod: this.storageMethod,
            isMobile: this.isMobile,
            storageUsage: {
                current: currentSize,
                max: maxSize,
                percentage: maxSize > 0 ? (currentSize / maxSize) * 100 : 0
            },
            memoryUsage: {
                current: memoryEntries,
                max: maxMemoryEntries,
                percentage: maxMemoryEntries > 0 ? (memoryEntries / maxMemoryEntries) * 100 : 0
            },
            statistics: stats,
            lastCleanup: stats.lastCleanup,
            cleanupRuns: stats.cleanupRuns || 0
        };
    }
    
    /**
     * Manual cache cleanup trigger (for testing/admin)
     */
    manualCleanup() {
        console.log('Running manual cache cleanup...');
        this.cleanupExpiredSessions();
        this.enforceCacheSize();
        console.log('Manual cleanup completed');
        return this.getCacheHealth();
    }
    
    /**
     * Apply mobile-specific optimizations
     */
    applyMobileOptimizations() {
        console.log('Applying mobile cache optimizations');
        
        // More aggressive cleanup for mobile
        const mobileCleanupInterval = CACHE_CONFIG.CLEANUP_INTERVAL_MS / 2; // Every 30 minutes
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
            this.enforceCacheSize();
            this.checkMemoryPressure();
        }, mobileCleanupInterval);
        
        // Monitor for mobile-specific events
        this.setupMobileEventListeners();
    }
    
    /**
     * Set up mobile-specific event listeners
     */
    setupMobileEventListeners() {
        // Listen for page visibility changes (app backgrounding)
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // App is being backgrounded, run cleanup
                    this.cleanupExpiredSessions();
                }
            });
        }
        
        // Listen for memory pressure warnings
        if ('memory' in performance && performance.memory) {
            // Chrome-specific memory monitoring
            this.memoryCheckInterval = setInterval(() => {
                this.checkMemoryPressure();
            }, 5 * 60 * 1000); // Every 5 minutes
        }
        
        // Listen for storage quota warnings
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            this.quotaCheckInterval = setInterval(() => {
                this.checkStorageQuota();
            }, 10 * 60 * 1000); // Every 10 minutes
        }
    }
    
    /**
     * Check for memory pressure and cleanup if needed
     */
    checkMemoryPressure() {
        try {
            if ('memory' in performance && performance.memory) {
                const memory = performance.memory;
                const memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
                
                // If using more than 80% of available heap, trigger aggressive cleanup
                if (memoryUsage > 0.8) {
                    console.warn('High memory usage detected, running aggressive cleanup');
                    this.aggressiveCleanup();
                }
            }
        } catch (error) {
            console.warn('Could not check memory pressure:', error);
        }
    }
    
    /**
     * Check storage quota and cleanup if approaching limit
     */
    async checkStorageQuota() {
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                const usage = estimate.usage || 0;
                const quota = estimate.quota || 0;
                
                if (quota > 0) {
                    const usagePercentage = usage / quota;
                    
                    // If using more than 85% of quota, trigger cleanup
                    if (usagePercentage > 0.85) {
                        console.warn('Storage quota approaching limit, running cleanup');
                        this.aggressiveCleanup();
                    }
                }
            }
        } catch (error) {
            console.warn('Could not check storage quota:', error);
        }
    }
    
    /**
     * Perform aggressive cleanup when under memory/storage pressure
     */
    aggressiveCleanup() {
        // Clean up all expired sessions
        this.cleanupExpiredSessions();
        
        // More aggressive size enforcement (reduce to 60% of normal limit)
        const normalMaxSize = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_STORAGE_SIZE : CACHE_CONFIG.MAX_STORAGE_SIZE;
        const aggressiveTargetSize = normalMaxSize * 0.6;
        
        if (this.storageMethod === 'memory') {
            // For memory storage, keep only the current session
            for (const [key] of this.memoryFallback.entries()) {
                if (key !== this.sessionStorageKey && key !== this.cacheStatsKey) {
                    this.memoryFallback.delete(key);
                }
            }
        } else {
            // For browser storage, reduce to aggressive target
            this.evictOldestSessions(aggressiveTargetSize);
        }
        
        // Update cache stats
        this.updateCacheStats({
            aggressiveCleanupRuns: (this.getCacheStats().aggressiveCleanupRuns || 0) + 1,
            lastAggressiveCleanup: new Date().toISOString()
        });
        
        console.log('Aggressive cleanup completed');
    }
    
    /**
     * Cleanup method called when component/page is destroyed
     */
    destroy() {
        // Clear all intervals
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
        }
        if (this.quotaCheckInterval) {
            clearInterval(this.quotaCheckInterval);
        }
        
        // Remove event listeners
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
        }
        
        console.log('SessionManager cleanup completed');
    }

    /**
     * Load session from storage (for page refresh handling)
     * @returns {boolean} True if session was loaded
     */
    loadSession() {
        try {
            // Use generic storage method
            const stored = this.getFromStorage(this.sessionStorageKey);
            
            if (stored) {
                const parsedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
                
                // Validate the loaded data structure
                if (!parsedData.cards || !Array.isArray(parsedData.cards)) {
                    console.warn('Invalid session data structure, clearing session');
                    this.clearSession();
                    return false;
                }
                
                this.sessionData = parsedData;
                // Convert Sets back from arrays (with validation)
                this.sessionData.completedCards = new Set(Array.isArray(this.sessionData.completedCards) ? this.sessionData.completedCards : []);
                
                // Add totalCardsInSession if missing (for backwards compatibility)
                if (!this.sessionData.totalCardsInSession) {
                    this.sessionData.totalCardsInSession = this.sessionData.cards ? this.sessionData.cards.length : SESSION_CONFIG.CARDS_PER_SESSION;
                }
                
                // Validate ratings structure
                if (!this.sessionData.ratings || typeof this.sessionData.ratings !== 'object') {
                    this.sessionData.ratings = {};
                }
                
                // Remove againCards if it exists (backward compatibility)
                if (this.sessionData.againCards) {
                    delete this.sessionData.againCards;
                }
                
                console.log(`Session loaded from ${this.storageMethod}`);
                return true;
            }
        } catch (error) {
            console.error('Failed to load session from storage:', error);
            // Try fallback storage methods
            if (this.storageMethod !== 'memory') {
                this.storageMethod = this.detectStorageMethod();
                return this.loadSession(); // Retry with new storage method
            }
            // Clear corrupted session data
            this.clearSession();
        }
        return false;
    }

    /**
     * Save session to storage
     */
    saveSession() {
        if (!this.sessionData) return;
        
        try {
            // Convert Sets to arrays for JSON serialization
            const dataToStore = {
                ...this.sessionData,
                completedCards: Array.from(this.sessionData.completedCards)
            };
            
            // Use generic storage method with built-in quota handling
            this.saveToStorage(this.sessionStorageKey, JSON.stringify(dataToStore));
            
            // Update cache statistics
            this.updateCacheStats({ 
                totalSessions: (this.getCacheStats().totalSessions || 0) + 1,
                lastSessionSave: new Date().toISOString()
            });            
        } catch (error) {
            console.error(`Failed to save session to ${this.storageMethod}:`, error);
            
            // Try fallback storage methods if current method fails
            if (this.storageMethod !== 'memory') {
                console.warn('Attempting to switch to fallback storage method');
                this.storageMethod = this.detectStorageMethod();
                this.saveSession(); // Retry with new storage method
            }
        }
    }

    /**
     * Generate a unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Detect if running on mobile device
     * @returns {boolean} True if mobile device
     */
    detectMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
    }

    /**
     * Initialize cache management system
     */
    initializeCacheManagement() {
        // Set up periodic cleanup
        this.setupPeriodicCleanup();
        
        // Run initial cleanup
        this.cleanupExpiredSessions();
        
        // Initialize cache statistics
        this.initializeCacheStats();
    }

    /**
     * Set up periodic cache cleanup
     */
    setupPeriodicCleanup() {
        // Clear any existing interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Set up new cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
            this.enforceCacheSize();
        }, CACHE_CONFIG.CLEANUP_INTERVAL_MS);
    }

    /**
     * Initialize cache statistics tracking
     */
    initializeCacheStats() {
        try {
            const stats = this.getCacheStats();
            if (!stats.initialized) {
                this.updateCacheStats({
                    initialized: true,
                    createdAt: new Date().toISOString(),
                    totalSessions: 0,
                    cleanupRuns: 0,
                    lastCleanup: null
                });
            }
        } catch (error) {
            console.warn('Failed to initialize cache stats:', error);
        }
    }

    /**
     * Get current cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        try {
            const stored = this.getFromStorage(this.cacheStatsKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            return {};
        }
    }

    /**
     * Update cache statistics
     * @param {Object} updates - Statistics updates
     */
    updateCacheStats(updates) {
        try {
            const current = this.getCacheStats();
            const updated = { ...current, ...updates, lastUpdated: new Date().toISOString() };
            this.saveToStorage(this.cacheStatsKey, JSON.stringify(updated));
        } catch (error) {
            console.warn('Failed to update cache stats:', error);
        }
    }

    /**
     * Clean up expired sessions from storage
     */
    cleanupExpiredSessions() {
        try {
            const expiryTime = Date.now() - (CACHE_CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
            let cleanedCount = 0;
            
            if (this.storageMethod === 'memory') {
                // Clean memory fallback
                for (const [key, value] of this.memoryFallback.entries()) {
                    if (key.startsWith('session_')) {
                        try {
                            const data = typeof value === 'string' ? JSON.parse(value) : value;
                            const sessionTime = new Date(data.sessionStartTime).getTime();
                            if (sessionTime < expiryTime) {
                                this.memoryFallback.delete(key);
                                cleanedCount++;
                            }
                        } catch (e) {
                            // Invalid session data, remove it
                            this.memoryFallback.delete(key);
                            cleanedCount++;
                        }
                    }
                }
            } else {
                // Clean browser storage
                const storage = this.storageMethod === 'sessionStorage' ? window.sessionStorage : window.localStorage;
                const keysToRemove = [];
                
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith('session_')) {
                        try {
                            const data = JSON.parse(storage.getItem(key));
                            const sessionTime = new Date(data.sessionStartTime).getTime();
                            if (sessionTime < expiryTime) {
                                keysToRemove.push(key);
                            }
                        } catch (e) {
                            // Invalid session data, mark for removal
                            keysToRemove.push(key);
                        }
                    }
                }
                
                // Remove expired sessions
                keysToRemove.forEach(key => {
                    storage.removeItem(key);
                    cleanedCount++;
                });
            }
            
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} expired sessions`);
                this.updateCacheStats({ 
                    cleanupRuns: (this.getCacheStats().cleanupRuns || 0) + 1,
                    lastCleanup: new Date().toISOString(),
                    lastCleanupCount: cleanedCount
                });
            }
        } catch (error) {
            console.error('Failed to clean up expired sessions:', error);
        }
    }

    /**
     * Enforce cache size limits using LRU eviction
     */
    enforceCacheSize() {
        try {
            const maxSize = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_STORAGE_SIZE : CACHE_CONFIG.MAX_STORAGE_SIZE;
            const maxEntries = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_MEMORY_ENTRIES : CACHE_CONFIG.MAX_MEMORY_ENTRIES;
            
            if (this.storageMethod === 'memory') {
                // Enforce memory entry limit
                if (this.memoryFallback.size > maxEntries) {
                    const entriesToRemove = this.memoryFallback.size - maxEntries;
                    const iterator = this.memoryFallback.keys();
                    
                    for (let i = 0; i < entriesToRemove; i++) {
                        const key = iterator.next().value;
                        if (key && key !== this.sessionStorageKey) { // Don't remove current session
                            this.memoryFallback.delete(key);
                        }
                    }
                }
            } else {
                // Enforce storage size limit
                const currentSize = this.getStorageSize();
                if (currentSize > maxSize * (1 - CACHE_CONFIG.QUOTA_BUFFER_PERCENTAGE)) {
                    this.evictOldestSessions(maxSize * 0.8); // Reduce to 80% of max size
                }
            }
        } catch (error) {
            console.error('Failed to enforce cache size:', error);
        }
    }

    /**
     * Get approximate storage size usage
     * @returns {number} Storage size in bytes
     */
    getStorageSize() {
        try {
            const storage = this.storageMethod === 'sessionStorage' ? window.sessionStorage : window.localStorage;
            let totalSize = 0;
            
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key) {
                    const value = storage.getItem(key);
                    totalSize += key.length + (value ? value.length : 0);
                }
            }
            
            return totalSize * 2; // Approximate UTF-16 encoding
        } catch (error) {
            return 0;
        }
    }

    /**
     * Evict oldest sessions to reduce storage size
     * @param {number} targetSize - Target size in bytes
     */
    evictOldestSessions(targetSize) {
        try {
            const storage = this.storageMethod === 'sessionStorage' ? window.sessionStorage : window.localStorage;
            const sessions = [];
            
            // Collect all session keys with timestamps
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key && key.startsWith('session_') && key !== this.sessionStorageKey) {
                    try {
                        const data = JSON.parse(storage.getItem(key));
                        sessions.push({
                            key: key,
                            timestamp: new Date(data.sessionStartTime).getTime()
                        });
                    } catch (e) {
                        // Invalid session, add to removal list
                        sessions.push({ key: key, timestamp: 0 });
                    }
                }
            }
            
            // Sort by timestamp (oldest first)
            sessions.sort((a, b) => a.timestamp - b.timestamp);
            
            // Remove sessions until we reach target size
            for (const session of sessions) {
                storage.removeItem(session.key);
                if (this.getStorageSize() <= targetSize) {
                    break;
                }
            }
        } catch (error) {
            console.error('Failed to evict old sessions:', error);
        }
    }

    /**
     * Generic method to get data from storage
     * @param {string} key - Storage key
     * @returns {string|null} Stored value
     */
    getFromStorage(key) {
        try {
            if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                return window.sessionStorage.getItem(key);
            } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            } else {
                return this.memoryFallback.get(key) || null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Generic method to save data to storage
     * @param {string} key - Storage key
     * @param {string} value - Value to store
     */
    saveToStorage(key, value) {
        try {
            // Check storage quota before saving
            if (this.storageMethod !== 'memory') {
                const currentSize = this.getStorageSize();
                const valueSize = (key.length + value.length) * 2;
                const maxSize = this.isMobile ? CACHE_CONFIG.MOBILE_MAX_STORAGE_SIZE : CACHE_CONFIG.MAX_STORAGE_SIZE;
                
                if (currentSize + valueSize > maxSize) {
                    console.warn('Storage quota approaching limit, running cleanup');
                    this.enforceCacheSize();
                }
            }
            
            if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem(key, value);
            } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
            } else {
                // Enforce memory limit
                if (this.memoryFallback.size >= (this.isMobile ? CACHE_CONFIG.MOBILE_MAX_MEMORY_ENTRIES : CACHE_CONFIG.MAX_MEMORY_ENTRIES)) {
                    // Remove oldest entry (first in Map)
                    const firstKey = this.memoryFallback.keys().next().value;
                    if (firstKey && firstKey !== this.sessionStorageKey) {
                        this.memoryFallback.delete(firstKey);
                    }
                }
                this.memoryFallback.set(key, value);
            }
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded, attempting cleanup and retry');
                this.enforceCacheSize();
                // Retry once after cleanup
                try {
                    if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                        window.sessionStorage.setItem(key, value);
                    } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem(key, value);
                    } else {
                        this.memoryFallback.set(key, value);
                    }
                } catch (retryError) {
                    console.error('Failed to save after cleanup:', retryError);
                    throw retryError;
                }
            } else {
                throw error;
            }
        }
    }
}

// Export the SessionManager class
export default SessionManager;