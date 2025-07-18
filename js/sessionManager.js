/**
 * SessionManager - Handles batch session loading and local caching
 */
import { SESSION_CONFIG } from './config.js';

class SessionManager {
    constructor() {
        this.sessionData = null;
        this.currentCardIndex = 0;
        this.sessionStorageKey = 'flashcard_session';
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
        sessionStorage.removeItem(this.sessionStorageKey);
    }

    /**
     * Load session from storage (for page refresh handling)
     * @returns {boolean} True if session was loaded
     */
    loadSession() {
        try {
            const stored = sessionStorage.getItem(this.sessionStorageKey);
            if (stored) {
                const parsedData = JSON.parse(stored);
                
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
            
            sessionStorage.setItem(this.sessionStorageKey, JSON.stringify(dataToStore));
        } catch (error) {
            console.error('Failed to save session to storage:', error);
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