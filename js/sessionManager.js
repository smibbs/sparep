/**
 * SessionManager - Handles batch session loading and local caching
 */
import { SESSION_CONFIG, CACHE_CONFIG, ADAPTIVE_SESSION_CONFIG } from './config.js';
import Validator from './validator.js';

const DEBUG = false;

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
     * @param {string} deckId - Optional deck ID to filter cards by specific deck
     * @returns {Promise<boolean>} Success status
     */
    async initializeSession(userId, dbService, deckId = null) {
        try {
            // Load cards for the session (with optional deck filtering)
            const cards = await this.loadSessionCards(userId, dbService, deckId);
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
                completedCards: new Set(), // Cards marked complete after receiving a 0-3 rating
                currentCardIndex: 0,
                sessionStartTime: new Date().toISOString(),
                metadata: {
                    deckId: deckId, // Store deck ID for session type detection
                    sessionType: deckId ? 'deck-specific' : 'general'
                }
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
     * Load cards for the session using adaptive hybrid selection
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @param {string} deckId - Optional deck ID to filter cards by specific deck
     * @returns {Promise<Array>} Array of cards with session metadata
     */
    async loadSessionCards(userId, dbService, deckId = null) {
        try {
            // Fixed 10-card sessions for both general and deck-specific modes
            const strictDeckMode = deckId !== null;
            const sessionSize = SESSION_CONFIG.CARDS_PER_SESSION; // Always use 10 cards per session
            
            console.log(`🎯 Session size target: ${sessionSize} (strict deck mode: ${strictDeckMode})`);
            
            // Use the new adaptive session cards method (with optional deck filtering)
            const sessionResult = await dbService.getAdaptiveSessionCards(userId, sessionSize, deckId);
            const { cards, metadata } = sessionResult;

            console.log(`📋 SessionManager: Loaded ${cards.length} cards using adaptive selection${deckId ? ` (STRICT DECK MODE: ${deckId})` : ' (all decks)'}`);
            console.log(`🎯 User stage: ${metadata.userStage}`);
            console.log(`🔒 Strict deck mode: ${metadata.strictDeckMode ? 'ENABLED - no cross-deck fallbacks' : 'DISABLED - fallbacks allowed'}`);
            console.log(`📊 Card sources: ${metadata.cardSources.due} due, ${metadata.cardSources.new} new, ${metadata.cardSources.fallback} fallback`);
            console.log(`📈 Achieved ratios: ${metadata.achievedRatios.duePercentage}% due, ${metadata.achievedRatios.newPercentage}% new, ${metadata.achievedRatios.fallbackPercentage}% fallback`);

            if (DEBUG && cards.length > 0) {
                console.log('🔍 Sample adaptive card:', cards[0]);
            }

            // Global card access - no deck isolation needed

            // Transform cards to match expected session format
            const formattedCards = cards.map(card => ({
                card_template_id: card.card_template_id,
                // deck_id no longer needed - cards are globally accessible
                cards: {
                    question: card.question,
                    answer: card.answer,
                    id: card.card_template_id,
                    subject_name: card.subject_name,
                    deck_name: card.deck_name,
                    tags: card.tags
                },
                stability: card.stability || 1.0,
                difficulty: card.difficulty || 5.0,
                state: card.state || 'new',
                total_reviews: card.total_reviews || 0,
                due_at: card.due_at,
                last_reviewed_at: card.last_reviewed_at,
                reps: card.reps || 0,
                lapses: card.lapses || 0,
                correct_reviews: card.correct_reviews || 0,
                incorrect_reviews: card.incorrect_reviews || 0,
                // Store source information for analytics
                _cardSource: card.card_source || this.determineCardSource(card, metadata),
                _sessionMetadata: metadata
            }));

            if (DEBUG && formattedCards.length > 0) {
                console.log('🔧 Sample formatted card:', formattedCards[0]);
            }

            // No additional verification needed - global card access

            // Apply client-side shuffling to randomize presentation order
            const shuffledCards = this.shuffleCards(formattedCards);
            console.log(`🔀 Applied client-side shuffling to ${shuffledCards.length} cards`);

            // Deduplicate cards by card_template_id to avoid completion tracking issues
            const seenIds = new Set();
            const uniqueCards = shuffledCards.filter(card => {
                const cardId = String(card.card_template_id);
                if (seenIds.has(cardId)) {
                    console.log(`🔍 Removing duplicate card with ID: ${cardId}`);
                    return false; // Skip this duplicate
                }
                seenIds.add(cardId);
                return true; // Keep this unique card
            });
            
            if (DEBUG) {
                console.log('🔍 Unique cards after deduplication:', uniqueCards.length);
            }
            console.log('🔍 Removed duplicates:', shuffledCards.length - uniqueCards.length);
            
            // Ensure we have cards available
            if (uniqueCards.length === 0) {
                throw new Error('No cards available for session');
            }
            
            // Store session metadata for analytics
            if (uniqueCards.length > 0) {
                uniqueCards._sessionMetadata = metadata;
            }
            
            return uniqueCards;
        } catch (error) {
            console.error('Failed to load adaptive session cards:', error);
            // Fallback to legacy method if adaptive fails
            console.warn('Falling back to legacy card selection method...');
            return this.loadLegacySessionCards(userId, dbService, deckId);
        }
    }

    /**
     * Determine card source for analytics (due/new/fallback)
     * @param {Object} card - Card object
     * @param {Object} metadata - Session metadata
     * @returns {string} Card source type
     */
    determineCardSource(card, metadata) {
        const now = new Date();
        const dueAt = new Date(card.due_at);
        
        if (card.state === 'new') {
            return 'new';
        } else if (card.state === 'review' && dueAt <= now) {
            return 'due';
        } else {
            return 'fallback';
        }
    }

    /**
     * Shuffle cards array using Fisher-Yates algorithm for fair randomization
     * @param {Array} cards - Array of cards to shuffle
     * @returns {Array} Shuffled array of cards
     */
    shuffleCards(cards) {
        // Create a copy to avoid mutating the original array
        const shuffled = [...cards];
        
        // Fisher-Yates shuffle algorithm
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        return shuffled;
    }

    /**
     * Legacy card loading method as fallback
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @param {string} deckId - Optional deck ID to filter cards by specific deck
     * @returns {Promise<Array>} Array of cards using legacy method
     */
    async loadLegacySessionCards(userId, dbService, deckId = null) {
        try {
            console.log(`🔄 Legacy fallback mode${deckId ? ` with deck filtering: ${deckId}` : ' (all decks)'}`);
            
            // Fixed 10-card sessions for both general and deck-specific modes
            const strictDeckMode = deckId !== null;
            const sessionSize = SESSION_CONFIG.CARDS_PER_SESSION; // Always use 10 cards per session
            
            console.log(`🎯 Legacy session size target: ${sessionSize} (strict deck mode: ${strictDeckMode})`);
            
            // Use deck-aware methods with appropriate limits
            const dueCards = await dbService.getDueCardsWithLimit(userId, sessionSize, deckId);
            console.log(`📋 SessionManager (Legacy): Found ${dueCards.length} due cards`);
            
            // Always limit to exactly 10 cards per session
            const targetSessionSize = sessionSize; // Fixed 10 cards regardless of mode
            
            console.log(`🔒 Fixed 10-card session mode: ${strictDeckMode ? 'deck-specific' : 'general'} - using exactly ${targetSessionSize} cards`);
            
            // Determine if we already have enough due cards
            let limitedDueCards = dueCards;
            let formattedNewCards = [];
            if (dueCards.length >= targetSessionSize) {
                limitedDueCards = dueCards.slice(0, targetSessionSize);
            } else if (!strictDeckMode) {
                // Only try to fill session with new cards if NOT in strict deck mode
                const newCardsNeeded = targetSessionSize - dueCards.length;
                const newCards = await dbService.getNewCardsWithLimit(userId, 1, newCardsNeeded, deckId);
                console.log(`🆕 SessionManager (Legacy): Found ${newCards.length} new cards`);
                formattedNewCards = newCards;
            } else {
                // In strict deck mode, fill remaining slots up to 10 cards
                const newCardsNeeded = Math.max(0, targetSessionSize - dueCards.length);
                const availableNewCards = await dbService.getNewCardsWithLimit(userId, 1, newCardsNeeded, deckId);
                console.log(`🆕 SessionManager (Legacy Strict): Found ${availableNewCards.length} new cards from target deck (needed ${newCardsNeeded})`);
                formattedNewCards = availableNewCards;
            }
            
            // Transform new cards to match expected format (if any)
            if (formattedNewCards.length > 0) {
                formattedNewCards = formattedNewCards.map(card => ({
                    card_template_id: card.card_template_id || card.id,
                    cards: {
                        question: card.question,
                        answer: card.answer,
                        id: card.card_template_id || card.id,
                        subject_name: card.subject_name,
                        deck_name: card.deck_name
                    },
                    stability: card.stability || 1.0,
                    difficulty: card.difficulty || 5.0,
                    state: card.state || 'new',
                    total_reviews: 0,
                    due_at: card.due_at || new Date().toISOString(),
                    _cardSource: 'new'
                }));
            }

            // Transform due cards to match the expected nested structure
            const formattedDueCards = limitedDueCards.map(card => ({
                card_template_id: card.card_template_id,
                cards: {
                    question: card.question,
                    answer: card.answer,
                    id: card.card_template_id,
                    subject_name: card.subject_name,
                    deck_name: card.deck_name,
                    tags: card.tags
                },
                stability: card.stability || 1.0,
                difficulty: card.difficulty || 5.0,
                state: card.state || 'review',
                total_reviews: card.total_reviews || 0,
                due_at: card.due_at,
                last_reviewed_at: card.last_reviewed_at,
                _cardSource: 'due'
            }));

            const allCards = [...formattedDueCards, ...formattedNewCards];
            console.log(`🎯 Legacy session: ${allCards.length} total cards`);
            
            // Deduplicate cards by card_template_id
            const seenIds = new Set();
            const uniqueCards = allCards.filter(card => {
                const cardId = String(card.card_template_id);
                if (seenIds.has(cardId)) {
                    return false;
                }
                seenIds.add(cardId);
                return true;
            });
            
            if (uniqueCards.length === 0) {
                throw new Error('No cards available for session');
            }
            
            return uniqueCards;
        } catch (error) {
            console.error('Failed to load legacy session cards:', error);
            throw error;
        }
    }

    /**
     * Record a rating for the current card.
     * @param {number} rating - Rating value (0-3).
     * @param {number} responseTime - Response time in milliseconds.
     * @returns {boolean} Success status.
     *
     * Optionally validates the rating via {@link Validator.validateRating} before recording.
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

        // Optionally validate rating value (0-3 scale)
        try {
            Validator.validateRating(rating, 'session rating');
        } catch (error) {
            console.error('Rating validation failed:', error);
            return false;
        }

        const currentCard = this.getCurrentCard();
        const cardId = String(currentCard.card_template_id); // Ensure consistent string type
        
        
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
            const cardId = String(card.card_template_id); // Ensure string consistency
            
            
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
        this.cleanupExpiredSessions();
        this.enforceCacheSize();
        return this.getCacheHealth();
    }
    
    /**
     * Apply mobile-specific optimizations
     */
    applyMobileOptimizations() {
        
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
     * Check if a session exists in storage or memory
     * @returns {boolean} True if session exists
     */
    hasSession() {
        // First check memory
        if (this.sessionData && this.sessionData.cards && this.sessionData.cards.length > 0) {
            return true;
        }
        
        // If not in memory, check storage
        try {
            const stored = this.getFromStorage(this.sessionStorageKey);
            if (stored) {
                const parsedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
                return !!(parsedData && parsedData.cards && parsedData.cards.length > 0);
            }
        } catch (error) {
            console.warn('Error checking session storage:', error);
        }
        
        return false;
    }

    /**
     * Get the deck ID from the current session (if any)
     * @returns {string|null} Deck ID or null for general sessions
     */
    getSessionDeckId() {
        // First check memory
        if (this.sessionData?.metadata) {
            return this.sessionData.metadata.deckId || null;
        }
        
        // If not in memory, check storage
        try {
            const stored = this.getFromStorage(this.sessionStorageKey);
            if (stored) {
                const parsedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
                if (parsedData?.metadata) {
                    return parsedData.metadata.deckId || null;
                } else {
                    console.warn('🔄 Legacy session detected in storage without metadata - treating as general session');
                    return null;
                }
            }
        } catch (error) {
            console.warn('Error checking session deck ID from storage:', error);
        }
        
        return null;
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