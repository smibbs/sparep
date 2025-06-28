/**
 * SessionManager - Handles batch session loading and local caching
 */
class SessionManager {
    constructor() {
        this.sessionData = null;
        this.currentCardIndex = 0;
        this.sessionStorageKey = 'flashcard_session';
    }

    /**
     * Initialize a new session with 20 cards
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @returns {Promise<boolean>} Success status
     */
    async initializeSession(userId, dbService) {
        try {
            // Load 20 cards for the session
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
                completedCards: new Set(), // Cards rated with 2, 3, or 4
                againCards: new Set(), // Cards currently in "again" state
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
     * Load 20 cards for the session (due cards + new cards)
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @returns {Promise<Array>} Array of cards
     */
    async loadSessionCards(userId, dbService) {
        try {
            // Get up to 20 due cards
            const dueCards = await dbService.getCardsDue(userId);
            
            if (dueCards.length >= 20) {
                return dueCards.slice(0, 20);
            }

            // If we need more cards, get new ones
            const newCardsNeeded = 20 - dueCards.length;
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

        const currentCard = this.getCurrentCard();
        const cardId = currentCard.card_id;
        
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

        // Handle rating logic
        if (rating === 1) {
            // "Again" - add to again pile, don't mark as completed
            this.sessionData.againCards.add(cardId);
        } else {
            // Rating 2-4 - mark as completed, remove from again pile
            this.sessionData.completedCards.add(cardId);
            this.sessionData.againCards.delete(cardId);
        }

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

        // First, get the next uncompleted card from the main deck (not in "again" pile)
        for (let i = 0; i < this.sessionData.cards.length; i++) {
            const card = this.sessionData.cards[i];
            const cardId = card.card_id;
            
            // Skip if completed or currently in "again" pile
            if (!this.sessionData.completedCards.has(cardId) && !this.sessionData.againCards.has(cardId)) {
                return card;
            }
        }

        // If no main deck cards left, show "again" cards
        const againCardIds = Array.from(this.sessionData.againCards);
        if (againCardIds.length > 0) {
            // Find the first again card that exists in our session
            for (const cardId of againCardIds) {
                const card = this.sessionData.cards.find(c => c.card_id === cardId);
                if (card) {
                    return card;
                }
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
            percentage: percentage,
            againCards: this.sessionData.againCards.size
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
                this.sessionData = JSON.parse(stored);
                // Convert Sets back from arrays
                this.sessionData.completedCards = new Set(this.sessionData.completedCards);
                this.sessionData.againCards = new Set(this.sessionData.againCards);
                // Add totalCardsInSession if missing (for backwards compatibility)
                if (!this.sessionData.totalCardsInSession) {
                    this.sessionData.totalCardsInSession = this.sessionData.cards ? this.sessionData.cards.length : 20;
                }
                return true;
            }
        } catch (error) {
            console.error('Failed to load session from storage:', error);
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
                completedCards: Array.from(this.sessionData.completedCards),
                againCards: Array.from(this.sessionData.againCards)
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