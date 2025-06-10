// Database operations wrapper for Supabase
class DatabaseService {
    constructor() {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        this.supabase = window.supabaseClient;
        console.log('DatabaseService initialized with Supabase client');
    }

    /**
     * Fetches cards that are due for review for a specific user
     * @param {string} userId - The user's ID
     * @returns {Promise<Array>} Array of cards due for review
     */
    async getCardsDue(userId) {
        try {
            console.log('Fetching due cards for user:', userId);
            const { data, error } = await this.supabase
                .from('user_card_progress')
                .select(`
                    *,
                    cards:card_id (
                        id,
                        question,
                        answer,
                        subject_id,
                        subsection
                    )
                `)
                .eq('user_id', userId)
                .lte('next_review_date', new Date().toISOString())
                .order('next_review_date', { ascending: true });

            if (error) throw error;
            console.log('Due cards response:', data);
            return data || [];
        } catch (error) {
            console.error('Error fetching due cards:', error);
            throw error;
        }
    }

    /**
     * Fetches new cards that the user hasn't seen yet
     * @param {string} userId - The user's ID
     * @param {number} limit - Maximum number of new cards to fetch
     * @returns {Promise<Array>} Array of new cards
     */
    async getNewCards(userId, limit = 10) {
        try {
            console.log('Fetching new cards for user:', userId);
            // First, get all card IDs that the user has progress for
            const { data: progressData, error: progressError } = await this.supabase
                .from('user_card_progress')
                .select('card_id')
                .eq('user_id', userId);

            if (progressError) throw progressError;
            console.log('Progress data:', progressData);

            const seenCardIds = progressData?.map(p => p.card_id) || [];
            console.log('Seen card IDs:', seenCardIds);

            // Then get cards that aren't in that list
            const query = this.supabase
                .from('cards')
                .select('*');
                
            if (seenCardIds.length > 0) {
                query.not('id', 'in', `(${seenCardIds.join(',')})`);
            }
            query.limit(limit);

            const { data, error } = await query;

            if (error) throw error;
            console.log('New cards response:', data);
            return data || [];
        } catch (error) {
            console.error('Error fetching new cards:', error);
            throw error;
        }
    }

    /**
     * Records a review for a card
     * @param {string} userId - The user's ID
     * @param {string} cardId - The card's ID
     * @param {number} rating - The review rating (1-4)
     * @param {number} responseTime - Time taken to respond in milliseconds
     * @returns {Promise<Object>} The recorded review
     */
    async recordReview(userId, cardId, rating, responseTime) {
        try {
            // Get current progress
            const { data: progressData, error: progressError } = await this.supabase
                .from('user_card_progress')
                .select('*')
                .eq('user_id', userId)
                .eq('card_id', cardId)
                .single();

            if (progressError) throw progressError;

            // Calculate new FSRS values (to be implemented in fsrs.js)
            const now = new Date();
            const reviewData = {
                user_id: userId,
                card_id: cardId,
                rating,
                response_time: responseTime,
                stability_before: progressData?.stability || 1.0,
                difficulty_before: progressData?.difficulty || 5.0,
                elapsed_days: progressData ? 
                    (now - new Date(progressData.last_review_date)) / (1000 * 60 * 60 * 24) : 
                    0,
                scheduled_days: progressData?.scheduled_days || 0
            };

            // Insert review record
            const { data: review, error: reviewError } = await this.supabase
                .from('review_history')
                .insert([reviewData])
                .select()
                .single();

            if (reviewError) throw reviewError;
            return review;
        } catch (error) {
            console.error('Error recording review:', error.message);
            throw error;
        }
    }

    /**
     * Initializes progress tracking for a user-card pair
     * @param {string} userId - The user's ID
     * @param {string} cardId - The card's ID
     * @returns {Promise<Object>} The created progress record
     */
    async initializeUserProgress(userId, cardId) {
        try {
            const initialProgress = {
                user_id: userId,
                card_id: cardId,
                stability: 1.0,
                difficulty: 5.0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                state: 'new',
                last_review_date: null,
                next_review_date: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('user_card_progress')
                .insert([initialProgress])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error initializing user progress:', error);
            throw error;
        }
    }

    /**
     * Gets user's progress for a specific card
     * @param {string} userId - The user's ID
     * @param {string} cardId - The card's ID
     * @returns {Promise<Object>} The user's progress for the card
     */
    async getUserProgress(userId, cardId) {
        try {
            const { data, error } = await this.supabase
                .from('user_card_progress')
                .select('*')
                .eq('user_id', userId)
                .eq('card_id', cardId)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
            return data;
        } catch (error) {
            console.error('Error fetching user progress:', error.message);
            throw error;
        }
    }
}

// Initialize database service when the DOM is loaded and Supabase client is available
function initDatabaseService() {
    try {
        window.dbService = new DatabaseService();
        console.log('Database service initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database service:', error);
        // Try again in 100ms if Supabase client isn't ready
        setTimeout(initDatabaseService, 100);
    }
}

document.addEventListener('DOMContentLoaded', initDatabaseService);

/**
 * Initialize progress records for a new user
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 */
async function initializeUserProgress(userId) {
    try {
        console.log('Initializing progress for user:', userId);
        
        // Get all cards that don't have progress records for this user
        const { data: cards, error: cardsError } = await supabase
            .from('cards')
            .select('card_id')
            .not('card_id', 'in', (
                supabase
                    .from('user_card_progress')
                    .select('card_id')
                    .eq('user_id', userId)
            ));

        if (cardsError) {
            console.error('Error fetching cards for initialization:', cardsError);
            throw cardsError;
        }

        if (!cards || cards.length === 0) {
            console.log('No new cards to initialize for user');
            return;
        }

        console.log('Initializing', cards.length, 'cards for user');

        // Create progress records for each card
        const progressRecords = cards.map(card => ({
            user_id: userId,
            card_id: card.card_id,
            stability: 1.0,
            difficulty: 5.0,
            card_state: 'new',
            next_review_date: new Date().toISOString(),
            total_reviews: 0,
            last_review_date: null
        }));

        const { error: insertError } = await supabase
            .from('user_card_progress')
            .insert(progressRecords);

        if (insertError) {
            console.error('Error initializing user progress:', insertError);
            throw insertError;
        }

        console.log('Successfully initialized progress for', progressRecords.length, 'cards');
    } catch (error) {
        console.error('Error in initializeUserProgress:', error);
        throw error;
    }
}

/**
 * Get cards that are due for review for a specific user
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} - Array of due cards with their progress data
 */
async function getDueCards(userId) {
    try {
        console.log('Fetching due cards for user:', userId);
        
        const now = new Date().toISOString();
        
        // Get cards that are either:
        // 1. Due for review (next_review_date <= now)
        // 2. New cards (card_state = 'new')
        const { data, error } = await supabase
            .from('user_card_progress')
            .select(`
                *,
                cards (
                    card_id,
                    question,
                    answer,
                    subject_id
                )
            `)
            .eq('user_id', userId)
            .or(`next_review_date.lte.${now},card_state.eq.new`)
            .order('next_review_date', { ascending: true });

        if (error) {
            console.error('Error fetching due cards:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log('No cards due for review');
            return [];
        }

        // Transform the data to a more usable format
        const dueCards = data.map(record => ({
            id: record.cards.card_id,
            question: record.cards.question,
            answer: record.cards.answer,
            subject_id: record.cards.subject_id,
            progress: {
                stability: record.stability,
                difficulty: record.difficulty,
                state: record.card_state,
                next_review_date: record.next_review_date,
                last_review_date: record.last_review_date,
                total_reviews: record.total_reviews
            }
        }));

        console.log(`Found ${dueCards.length} cards due for review`);
        return dueCards;
    } catch (error) {
        console.error('Error in getDueCards:', error);
        throw error;
    }
}

// Export the new function along with existing ones
export {
    getDueCards,
    initializeUserProgress
    // ... other existing exports ...
}; 