/**
 * SessionManager - Handles batch session loading and local caching
 */
import { SESSION_CONFIG } from './config.js';

class SessionManager {
    constructor() {
        this.sessionData = null;
        this.currentCardIndex = 0;
        this.sessionStorageKey = 'flashcard_session';
        
        // Initialize storage mechanism based on browser capabilities
        this.storageMethod = this.detectStorageMethod();
        this.memoryFallback = new Map(); // Memory-based fallback for storage restrictions
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
            // Clear from all possible storage locations
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
     * Load session from storage (for page refresh handling)
     * @returns {boolean} True if session was loaded
     */
    loadSession() {
        try {
            let stored = null;
            
            // Try to get session from the appropriate storage method
            if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                stored = window.sessionStorage.getItem(this.sessionStorageKey);
            } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                stored = window.localStorage.getItem(this.sessionStorageKey);
            } else {
                // Get from memory fallback
                stored = this.memoryFallback.get(this.sessionStorageKey) || null;
            }
            
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
            
            // Try to save to the appropriate storage method
            if (this.storageMethod === 'sessionStorage' && typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem(this.sessionStorageKey, JSON.stringify(dataToStore));
            } else if (this.storageMethod === 'localStorage' && typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(this.sessionStorageKey, JSON.stringify(dataToStore));
            } else {
                // Save to memory fallback
                this.memoryFallback.set(this.sessionStorageKey, JSON.stringify(dataToStore));
            }
            
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
}

// Export the SessionManager class
export default SessionManager;