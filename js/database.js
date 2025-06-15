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
            console.log('Getting next due card for user:', user.id);

            // Get user's settings for new cards per day
            const { data: userProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('daily_new_cards_limit')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.log('No user profile found, using default limit of 20');
            }

            const newCardsLimit = userProfile?.daily_new_cards_limit || 20;
            console.log('New cards limit:', newCardsLimit);

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

            console.log('Due cards found:', dueCards?.length || 0);

            // If we found a due card, return it
            if (dueCards && dueCards.length > 0) {
                const dueCard = dueCards[0];
                console.log('Returning due card:', dueCard.card_id);
                return {
                    id: dueCard.card_id,
                    question: dueCard.cards.question,
                    answer: dueCard.cards.answer,
                    stability: dueCard.stability,
                    difficulty: dueCard.difficulty
                };
            }

            // Get count of new cards studied today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const { data: newCardsToday, error: countError } = await supabase
                .from('user_card_progress')
                .select('card_id')
                .eq('user_id', user.id)
                .eq('state', 'new')
                .gte('created_at', today.toISOString())
                .limit(1);

            if (countError) {
                console.error('Error counting new cards:', countError);
                throw countError;
            }

            console.log('New cards studied today:', newCardsToday?.length || 0);

            // If we haven't reached the daily limit, get a new card
            if (!newCardsToday || newCardsToday.length < newCardsLimit) {
                console.log('Under daily limit, fetching new card');
                const newCards = await this.getNewCards(user.id, 1);
                console.log('New cards fetched:', newCards?.length || 0);
                if (newCards && newCards.length > 0) {
                    const newCard = newCards[0];
                    console.log('Returning new card:', newCard.id);
                    return {
                        id: newCard.id,
                        question: newCard.question,
                        answer: newCard.answer,
                        stability: 1.0,
                        difficulty: 5.0
                    };
                } else {
                    console.log('No new cards available');
                }
            } else {
                console.log('Daily new cards limit reached');
            }

            // No cards available
            console.log('No cards available to return');
            return null;

        } catch (error) {
            console.error('Error in getNextDueCard:', error);
            throw error;
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

            // Determine state transition
            const currentState = currentProgress?.state || 'new';
            let nextState = currentState;
            
            if (currentState === 'new') {
                nextState = rating >= 3 ? 'review' : 'learning';
            } else if (currentState === 'learning') {
                nextState = rating >= 3 ? 'review' : 'learning';
            } else if (currentState === 'review') {
                nextState = rating === 1 ? 'learning' : 'review';
            }

            // Update user_card_progress
            const { error: updateError } = await supabase
                .from('user_card_progress')
                .upsert({
                    user_id: user.id,
                    card_id: cardId,
                    stability: stability,
                    difficulty: difficulty,
                    due_date: nextReviewDate,
                    last_review_date: now,
                    next_review_date: nextReviewDate,
                    reps: (currentProgress?.reps || 0) + 1,
                    total_reviews: (currentProgress?.total_reviews || 0) + 1,
                    correct_reviews: (currentProgress?.correct_reviews || 0) + (rating >= 3 ? 1 : 0),
                    incorrect_reviews: (currentProgress?.incorrect_reviews || 0) + (rating < 3 ? 1 : 0),
                    average_time_ms: responseTime,
                    state: nextState,
                    last_rating: rating,
                    lapses: (currentProgress?.lapses || 0) + (rating === 1 ? 1 : 0),
                    elapsed_days: 0,
                    scheduled_days: Math.ceil((new Date(nextReviewDate) - new Date(now)) / (1000 * 60 * 60 * 24)),
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
                    stability_before: currentProgress?.stability || 1.0,
                    difficulty_before: currentProgress?.difficulty || 5.0,
                    elapsed_days: currentProgress ? 
                        Math.ceil((new Date(now) - new Date(currentProgress.last_review_date || now)) / (1000 * 60 * 60 * 24)) : 0,
                    scheduled_days: currentProgress?.scheduled_days || 0,
                    stability_after: stability,
                    difficulty_after: difficulty,
                    state_before: currentState,
                    state_after: nextState,
                    created_at: now
                });

            if (reviewError) {
                console.error('Error recording review history:', reviewError);
                throw reviewError;
            }

        } catch (error) {
            console.error('Error in recordReview:', error);
            throw error;
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
     * Get new cards that haven't been studied yet
     * @param {string} userId - The user's ID
     * @param {number} limit - Maximum number of new cards to return
     * @returns {Promise<Array>} Array of new cards
     */
    async getNewCards(userId, limit = 20) {
        try {
            console.log('Getting new cards for user:', userId, 'limit:', limit);
            const supabase = await this.getSupabase();

            // First get all seen card IDs
            const { data: seenCards, error: seenError } = await supabase
                .from('user_card_progress')
                .select('card_id')
                .eq('user_id', userId);

            if (seenError) {
                console.error('Error fetching seen cards:', seenError);
                throw seenError;
            }

            const seenCardIds = seenCards?.map(p => p.card_id) || [];
            console.log('Number of seen cards:', seenCardIds.length);

            // Then get new cards
            const { data: newCards, error: newError } = await supabase
                .from('cards')
                .select('*')
                .not('id', 'in', `(${seenCardIds.join(',')})`)
                .limit(limit);

            if (newError) {
                console.error('Error fetching new cards:', newError);
                throw newError;
            }

            console.log('Found new cards:', newCards?.length || 0);
            if (newCards?.length > 0) {
                console.log('Sample new card:', {
                    id: newCards[0].id,
                    question: newCards[0].question.substring(0, 50) + '...'
                });
            }

            // Initialize progress for the new card
            if (newCards && newCards.length > 0) {
                console.log('Initializing progress for new cards');
                const now = new Date().toISOString();
                const progressRecords = newCards.map(card => ({
                    user_id: userId,
                    card_id: card.id,
                    stability: 1.0,
                    difficulty: 5.0,
                    state: 'new',
                    next_review_date: now,
                    last_review_date: null,
                    due_date: now,
                    reps: 0,
                    total_reviews: 0,
                    correct_reviews: 0,
                    incorrect_reviews: 0,
                    lapses: 0,
                    average_time_ms: 0,
                    elapsed_days: 0,
                    scheduled_days: 0
                }));

                const { error: insertError } = await supabase
                    .from('user_card_progress')
                    .upsert(progressRecords, {
                        onConflict: 'user_id,card_id'
                    });

                if (insertError) {
                    console.error('Error initializing progress for new cards:', insertError);
                    throw insertError;
                }
                console.log('Successfully initialized progress for new cards');
            }

            return newCards || [];
        } catch (error) {
            console.error('Error in getNewCards:', error);
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
            .select('id')
            .not('id', 'in', (
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
            card_id: card.id,
            stability: 1.0,
            difficulty: 5.0,
            state: 'new',
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
        // 2. New cards (state = 'new')
        const { data, error } = await supabase
            .from('user_card_progress')
            .select(`
                *,
                cards (
                    id,
                    question,
                    answer,
                    subject_id
                )
            `)
            .eq('user_id', userId)
            .or(`next_review_date.lte.${now},state.eq.new`)
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
            id: record.cards.id,
            question: record.cards.question,
            answer: record.cards.answer,
            subject_id: record.cards.subject_id,
            progress: {
                stability: record.stability,
                difficulty: record.difficulty,
                state: record.state,
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