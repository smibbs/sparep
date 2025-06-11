import { getSupabaseClient } from './supabase-client.js';

class DatabaseService {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.initialize();
    }

    async initialize() {
        try {
            await this.ensureReviewHistorySchema();
            console.log('Database service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database service:', error);
        }
    }

    async getSupabase() {
        return await this.supabasePromise;
    }

    async ensureReviewHistorySchema() {
        const supabase = await this.getSupabase();
        
        // Just check if the table exists by trying to select a single row
        const { error } = await supabase
            .from('review_history')
            .select('id')
            .limit(1);

        if (error) {
            console.error('Review history table check failed:', error);
        }
    }

    async getNextDueCard() {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;

            // First try to get a card that's due for review
            const { data: dueCards, error: dueError } = await supabase
                .from('user_card_progress')
                .select(`
                    card_id,
                    stability,
                    difficulty,
                    next_review_date,
                    cards (
                        id,
                        question,
                        answer
                    )
                `)
                .eq('user_id', user.id)
                .lte('next_review_date', new Date().toISOString())
                .order('next_review_date', { ascending: true })
                .limit(1);

            if (dueError) {
                console.error('Error fetching due cards:', dueError);
                throw dueError;
            }

            // If we found a due card, return it
            if (dueCards && dueCards.length > 0) {
                const dueCard = dueCards[0];
                return {
                    id: dueCard.card_id,
                    question: dueCard.cards.question,
                    answer: dueCard.cards.answer,
                    stability: dueCard.stability,
                    difficulty: dueCard.difficulty
                };
            }

            // Get all card IDs that the user has progress for
            const { data: progressData, error: progressError } = await supabase
                .from('user_card_progress')
                .select('card_id')
                .eq('user_id', user.id);

            if (progressError) {
                console.error('Error fetching progress data:', progressError);
                throw progressError;
            }

            // Get a new card that the user hasn't seen yet
            const seenCardIds = progressData?.map(p => p.card_id) || [];
            const query = supabase
                .from('cards')
                .select('id, question, answer');

            if (seenCardIds.length > 0) {
                query.not('id', 'in', `(${seenCardIds.join(',')})`);
            }

            const { data: newCards, error: newError } = await query.limit(1);

            if (newError) {
                console.error('Error fetching new cards:', newError);
                throw newError;
            }

            // If we found a new card, return it with default values
            if (newCards && newCards.length > 0) {
                return {
                    ...newCards[0],
                    stability: 1.0,
                    difficulty: 5.0
                };
            }

            // No cards available
            return null;

        } catch (error) {
            console.error('Error in getNextDueCard:', error);
            throw new Error('Failed to load next card: ' + error.message);
        }
    }

    async recordReview(reviewData) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            const { cardId, rating, responseTime, stability, difficulty, nextReviewDate } = reviewData;
            const now = new Date().toISOString();

            // First, get the current progress to use as "before" state
            const { data: currentProgress, error: progressError } = await supabase
                .from('user_card_progress')
                .select('*')
                .eq('user_id', user.id)
                .eq('card_id', cardId)
                .single();

            if (progressError && progressError.code !== 'PGRST116') { // PGRST116 is "not found"
                console.error('Error fetching current progress:', progressError);
                throw progressError;
            }

            const currentState = currentProgress?.state || 'new';
            const currentStability = currentProgress?.stability || 1.0;
            const currentDifficulty = currentProgress?.difficulty || 5.0;

            // Update user_card_progress
            const { error: updateError } = await supabase
                .from('user_card_progress')
                .upsert({
                    user_id: user.id,
                    card_id: cardId,
                    stability: stability,
                    difficulty: difficulty,
                    next_review_date: nextReviewDate,
                    last_review_date: now,
                    reps: (currentProgress?.reps || 0) + 1,
                    total_reviews: (currentProgress?.total_reviews || 0) + 1,
                    correct_reviews: (currentProgress?.correct_reviews || 0) + (rating >= 3 ? 1 : 0),
                    incorrect_reviews: (currentProgress?.incorrect_reviews || 0) + (rating < 3 ? 1 : 0),
                    average_time_ms: responseTime,
                    state: 'learning',
                    lapses: (currentProgress?.lapses || 0) + (rating < 3 ? 1 : 0),
                    elapsed_days: 0,
                    scheduled_days: 0,
                    updated_at: now
                }, {
                    onConflict: 'user_id,card_id'
                });

            if (updateError) {
                console.error('Error updating progress:', updateError);
                throw updateError;
            }

            // Record the review in review_history
            const { error: reviewError } = await supabase
                .from('review_history')
                .insert({
                    user_id: user.id,
                    card_id: cardId,
                    rating: rating,
                    response_time_ms: responseTime,
                    stability_before: currentStability,
                    difficulty_before: currentDifficulty,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    stability_after: stability,
                    difficulty_after: difficulty,
                    state_before: currentState,
                    state_after: 'learning',
                    created_at: now
                });

            if (reviewError) {
                console.error('Error recording review:', reviewError);
                throw reviewError;
            }

            return { success: true };
        } catch (error) {
            console.error('Error in recordReview:', error);
            throw new Error('Failed to record review: ' + error.message);
        }
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

// Export the DatabaseService class and create a default instance
export { DatabaseService };
const database = new DatabaseService();
export default database;

// Initialize database service when the DOM is loaded and Supabase client is available
function initDatabaseService() {
    try {
        window.dbService = database; // Use the same instance
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

// Export utility functions
export {
    getDueCards,
    initializeUserProgress
}; 