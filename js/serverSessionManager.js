/**
 * ServerSessionManager - Server-authoritative session management
 * Replaces client-side session logic with server RPC calls for daily cap enforcement
 */

const DEBUG = false;

class ServerSessionManager {
    constructor() {
        this.sessionData = null;
        this.currentSessionId = null;
        this.userId = null;
        this.dbService = null;
    }

    /**
     * Initialize or load a session using server-side RPC
     * @param {string} userId - The user's ID
     * @param {Object} dbService - Database service instance
     * @returns {Promise<boolean>} Success status
     */
    async initializeSession(userId, dbService) {
        try {
            this.userId = userId;
            this.dbService = dbService;
            
            console.log(`🚀 ServerSessionManager: Initializing session for user ${userId}`);
            
            // Call server RPC to get or create session
            const supabase = await dbService.getSupabase();
            const { data, error } = await supabase.rpc('get_or_create_user_session', {
                p_user_id: userId
            });

            if (error) {
                console.error('Server session RPC error:', error);
                throw new Error(`Failed to initialize session: ${error.message}`);
            }

            if (!data.success) {
                if (data.limit_reached) {
                    // Daily limit reached - throw specific error
                    const error = new Error('Daily limit reached');
                    error.limitReached = true;
                    error.limitInfo = {
                        tier: data.tier,
                        reviewsToday: data.reviews_today,
                        limit: data.limit
                    };
                    throw error;
                }
                throw new Error(data.message || 'Failed to create session');
            }

            // Store session data from server
            this.currentSessionId = data.session_id;
            this.sessionData = {
                sessionId: data.session_id,
                userId: userId,
                cards: data.cards_data || [],
                totalCardsInSession: data.max_cards,
                currentCardIndex: data.current_index || 0,
                submittedCount: data.submitted_count || 0,
                sessionType: data.session_type,
                isNewSession: data.is_new_session,
                // Keep these for compatibility with existing UI code
                ratings: {}, // Will be populated from reviews if session is resumed
                completedCards: new Set(), // Will be managed server-side
                sessionStartTime: new Date().toISOString(),
                metadata: {
                    sessionType: 'general'
                }
            };
            
            // If this is a resumed session with submitted cards, populate ratings from reviews
            if (!data.is_new_session && data.submitted_count > 0) {
                await this.loadRatingsFromReviews();
            }

            console.log(`✅ ServerSessionManager: Session initialized with ${this.sessionData.cards.length} cards`);
            console.log(`📊 Current progress: ${this.sessionData.submittedCount}/${this.sessionData.totalCardsInSession}`);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize server session:', error);
            throw error;
        }
    }

    /**
     * Record a rating using server-side RPC with daily cap enforcement
     * @param {number} rating - Rating value (0-3).
     * @param {number} responseTime - Response time in milliseconds.
     * @returns {Promise<boolean>} Success status.
     */
    async recordRating(rating, responseTime) {
        if (!this.currentSessionId || !this.sessionData) {
            console.error('No active session for recording rating');
            return false;
        }

        const currentCard = this.getCurrentCard();
        if (!currentCard) {
            console.error('No current card for recording rating');
            return false;
        }

        try {
            console.log(`📝 ServerSessionManager: Recording rating ${rating} for card ${currentCard.card_template_id}`);
            
            // Call server RPC to submit answer
            const supabase = await this.dbService.getSupabase();
            const { data, error } = await supabase.rpc('submit_card_answer', {
                p_session_id: this.currentSessionId,
                p_card_template_id: currentCard.card_template_id,
                p_rating: rating,
                p_response_time: responseTime
            });

            if (error) {
                console.error('Server submit answer RPC error:', error);
                throw new Error(`Failed to submit answer: ${error.message}`);
            }

            if (!data.success) {
                if (data.limit_reached) {
                    // Daily limit reached during submission
                    const error = new Error('Daily limit reached');
                    error.limitReached = true;
                    error.limitInfo = {
                        tier: data.tier,
                        reviewsToday: data.reviews_today,
                        limit: data.limit
                    };
                    throw error;
                }
                throw new Error(data.message || 'Failed to submit answer');
            }

            // Update local session data with server response
            this.sessionData.submittedCount = data.submitted_count;
            this.sessionData.currentCardIndex = data.current_index;
            
            // Track rating locally for UI display purposes
            const cardId = String(currentCard.card_template_id);
            if (!this.sessionData.ratings[cardId]) {
                this.sessionData.ratings[cardId] = [];
            }
            this.sessionData.ratings[cardId].push({
                rating: rating,
                responseTime: responseTime,
                timestamp: new Date().toISOString()
            });
            
            // Mark card as completed locally for UI consistency
            this.sessionData.completedCards.add(cardId);
            
            console.log(`✅ ServerSessionManager: Answer recorded. Progress: ${this.sessionData.submittedCount}/${this.sessionData.totalCardsInSession}`);
            
            return true;
        } catch (error) {
            console.error('Failed to record rating on server:', error);
            throw error;
        }
    }

    /**
     * Get the current card to display
     * @returns {Object|null} Current card object
     */
    getCurrentCard() {
        if (!this.sessionData || !this.sessionData.cards) {
            return null;
        }

        // Use server-provided current index
        if (this.sessionData.currentCardIndex < this.sessionData.cards.length) {
            const card = this.sessionData.cards[this.sessionData.currentCardIndex];
            
            // Transform card data to match expected client format
            if (card) {
                return {
                    card_template_id: card.card_template_id,
                    cards: {
                        question: card.question,
                        answer: card.answer,
                        id: card.card_template_id,
                        subject_name: card.subject_name,
                        // deck_name no longer needed - cards are globally accessible
                        tags: card.tags
                    },
                    stability: card.stability || 1.0,
                    difficulty: card.difficulty || 5.0,
                    state: card.state || 'new',
                    total_reviews: card.total_reviews || 0,
                    due_at: card.due_at,
                    last_reviewed_at: card.last_reviewed_at
                };
            }
        }

        return null; // No more cards or session complete
    }

    /**
     * Check if the session is complete
     * @returns {boolean} True if all cards in session have been completed
     */
    isSessionComplete() {
        if (!this.sessionData) {
            return false;
        }
        
        // Session is complete when submitted count reaches max cards
        return this.sessionData.submittedCount >= this.sessionData.totalCardsInSession;
    }

    /**
     * Get session progress
     * @returns {Object} Progress information
     */
    getProgress() {
        if (!this.sessionData) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const completed = this.sessionData.submittedCount;
        const total = this.sessionData.totalCardsInSession;
        const percentage = total > 0 ? (completed / total) * 100 : 0;

        return {
            completed: completed,
            total: total,
            percentage: percentage
        };
    }

    /**
     * Get all session data for compatibility with existing code
     * @returns {Object} Complete session data
     */
    getSessionData() {
        return this.sessionData;
    }

    /**
     * Load ratings from reviews table for completed session display
     * This populates the ratings object from today's reviews for the current user
     */
    async loadRatingsFromReviews() {
        if (!this.userId || !this.dbService || !this.sessionData || !this.sessionData.cards) {
            console.warn('Cannot load ratings: missing required data');
            return;
        }
        
        try {
            console.log('🔍 ServerSessionManager: Loading ratings from reviews for session display');
            
            // Get card IDs that are in this session
            const sessionCardIds = this.sessionData.cards.map(card => card.card_template_id);
            
            if (sessionCardIds.length === 0) {
                console.log('No cards in session to load ratings for');
                return;
            }
            
            // Query reviews from today for cards in this session
            const supabase = await this.dbService.getSupabase();
            const { data: reviews, error } = await supabase
                .from('reviews')
                .select('card_template_id, rating, response_time_ms, reviewed_at')
                .eq('user_id', this.userId)
                .in('card_template_id', sessionCardIds)
                .gte('reviewed_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z') // Today
                .order('reviewed_at', { ascending: true });
                
            if (error) {
                console.error('Error loading ratings from reviews:', error);
                return;
            }
            
            if (!reviews || reviews.length === 0) {
                console.log('No reviews found for session cards today');
                return;
            }
            
            console.log(`📊 Found ${reviews.length} reviews for session cards`);
            
            // Populate ratings object in the format expected by the UI
            this.sessionData.ratings = {};
            
            reviews.forEach(review => {
                const cardId = String(review.card_template_id);
                
                if (!this.sessionData.ratings[cardId]) {
                    this.sessionData.ratings[cardId] = [];
                }
                
                this.sessionData.ratings[cardId].push({
                    rating: review.rating,
                    responseTime: review.response_time_ms,
                    timestamp: new Date(review.reviewed_at).toISOString()
                });
                
                // Also mark card as completed in the set
                this.sessionData.completedCards.add(cardId);
            });
            
            console.log(`✅ Loaded ratings for ${Object.keys(this.sessionData.ratings).length} cards`);
            
        } catch (error) {
            console.error('Failed to load ratings from reviews:', error);
        }
    }

    /**
     * Clear the current session (server sessions persist, but clear local state)
     */
    clearSession() {
        this.sessionData = null;
        this.currentSessionId = null;
        this.userId = null;
        this.dbService = null;
    }

    // Compatibility methods for existing code that expects client-side session management
    
    /**
     * Load session - not needed for server sessions, but kept for compatibility
     * @returns {boolean} Always returns false since server manages sessions
     */
    loadSession() {
        return false; // Server manages sessions
    }

    /**
     * Check if session exists - for server sessions, always need to call initializeSession
     * @returns {boolean} True if we have active session data
     */
    hasSession() {
        return this.sessionData !== null && this.currentSessionId !== null;
    }

    /**
     * Get session deck ID for compatibility - always returns null now
     * @returns {string|null} Always null - decks no longer supported
     */
    getSessionDeckId() {
        return null;
    }

    /**
     * Save session - not needed for server sessions, but kept for compatibility
     */
    saveSession() {
        // Server automatically persists session state
        if (DEBUG) {
            console.log('ServerSessionManager: saveSession() called - server automatically persists');
        }
    }

    /**
     * Generate session ID - not used for server sessions, but kept for compatibility
     * @returns {string} Session ID
     */
    generateSessionId() {
        return 'server_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Storage-related methods not needed for server sessions
    detectStorageMethod() { return 'server'; }
    detectMobileDevice() { return false; }
    initializeCacheManagement() { }
    getCacheHealth() { return { storageMethod: 'server' }; }
    manualCleanup() { return {}; }
    destroy() { }
}

// Export the ServerSessionManager class
export default ServerSessionManager;