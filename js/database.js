import { getSupabaseClient } from './supabase-client.js';
import { updateStability, updateDifficulty, calculateNextReview } from './fsrs.js';

class DatabaseService {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.initialize();
    }

    async initialize() {
        try {
            await this.ensureReviewHistorySchema();
            // Database service initialized successfully
        } catch (error) {
            // Failed to initialize database service
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
            // Review history table check failed
        }
    }

    async getNextDueCard() {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            // Getting next due card for user

            // Get user's settings for new cards per day
            const { data: userProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('daily_new_cards_limit')
                .eq('id', user.id)
                .single();

            if (profileError) {
                // No user profile found, using default limit of 20
            }

            const newCardsLimit = userProfile?.daily_new_cards_limit || 20;
            // New cards limit set

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
                // Error fetching due cards
                throw dueError;
            }

            // Due cards found

            // If we found a due card, return it
            if (dueCards && dueCards.length > 0) {
                const dueCard = dueCards[0];
                // Returning due card
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
                // Error counting new cards
                throw countError;
            }

            // New cards studied today

            // If we haven't reached the daily limit, get a new card
            if (!newCardsToday || newCardsToday.length < newCardsLimit) {
                // Under daily limit, fetching new card
                const newCards = await this.getNewCards(user.id, 1);
                // New cards fetched
                if (newCards && newCards.length > 0) {
                    const newCard = newCards[0];
                    // Returning new card
                    return {
                        id: newCard.id,
                        question: newCard.question,
                        answer: newCard.answer,
                        stability: 1.0,
                        difficulty: 5.0
                    };
                } else {
                    // No new cards available
                }
            } else {
                // Daily new cards limit reached
            }

            // No cards available
            // No cards available to return
            return null;

        } catch (error) {
            // Error in getNextDueCard
            throw error;
        }
    }

    async recordReview(reviewData) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            const { card_id, rating, responseTime } = reviewData;
            const now = new Date().toISOString();

            // Defensive checks for user_id and card_id
            if (!user || !user.id) {
                // recordReview: Missing or invalid user
                throw new Error('User not authenticated or missing user ID.');
            }
            if (!card_id || typeof card_id !== 'string' || card_id === 'undefined') {
                // recordReview: Missing or invalid card_id
                throw new Error('Missing or invalid card_id for review.');
            }

            // Fetch current progress
            const { data: currentProgress, error: progressError } = await supabase
                .from('user_card_progress')
                .select('*')
                .eq('user_id', user.id)
                .eq('card_id', card_id)
                .single();

            if (progressError && progressError.code !== 'PGRST116') {
                // Error fetching current progress
                throw new Error(progressError.message || 'Failed to fetch card progress. Please try again.');
            }

            // FSRS calculations
            const currentStability = currentProgress?.stability || 1.0;
            const currentDifficulty = currentProgress?.difficulty || 5.0;
            const newStability = updateStability(currentStability, rating);
            const newDifficulty = updateDifficulty(currentDifficulty, rating);
            const { nextReviewDate } = calculateNextReview(newStability, newDifficulty, rating);

            // State transition logic
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
                    card_id: card_id,
                    stability: newStability,
                    difficulty: newDifficulty,
                    due_date: nextReviewDate.toISOString(),
                    last_review_date: now,
                    next_review_date: nextReviewDate.toISOString(),
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
                // Error updating progress
                throw updateError;
            }

            // Record the review in review_history
            const { error: reviewError } = await supabase
                .from('review_history')
                .insert({
                    user_id: user.id,
                    card_id: card_id,
                    rating: rating,
                    response_time_ms: responseTime,
                    stability_before: currentStability,
                    difficulty_before: currentDifficulty,
                    elapsed_days: currentProgress ? 
                        Math.ceil((new Date(now) - new Date(currentProgress.last_review_date || now)) / (1000 * 60 * 60 * 24)) : 0,
                    scheduled_days: currentProgress?.scheduled_days || 0,
                    stability_after: newStability,
                    difficulty_after: newDifficulty,
                    state_before: currentState,
                    state_after: nextState,
                    created_at: now
                });

            if (reviewError) {
                // Error recording review history
                throw reviewError;
            }

        } catch (error) {
            if (error.code === '42501' || /permission denied/i.test(error.message)) {
                throw new Error('You do not have permission to access this data.');
            } else if (/network|fetch/i.test(error.message)) {
                throw new Error('Network error: Please check your internet connection and try again.');
            } else if (/not logged in|not authenticated/i.test(error.message)) {
                throw new Error('You are not logged in. Please sign in again.');
            }
            // Error in recordReview
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
            const supabase = await this.getSupabase();
            const now = new Date();
            const nowISOString = now.toISOString();

            // 1. Get due cards
            const { data: dueCards, error: dueError } = await supabase
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
                .lte('next_review_date', nowISOString)
                .order('next_review_date', { ascending: true });
            if (dueError) throw dueError;

            // 2. Get ALL new cards (no limit)
            const { data: newCards, error: newCardsError } = await supabase
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
                .eq('state', 'new')
                .order('created_at', { ascending: true });
            if (newCardsError) throw newCardsError;

            // 3. Combine due cards and all new cards
            const allCards = [...(dueCards || []), ...(newCards || [])];
            return allCards;
        } catch (error) {
            // Error fetching due and new cards
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
            // Getting new cards for user
            const supabase = await this.getSupabase();

            // First get all seen card IDs
            const { data: seenCards, error: seenError } = await supabase
                .from('user_card_progress')
                .select('card_id')
                .eq('user_id', userId);

            if (seenError) {
                // Error fetching seen cards
                throw seenError;
            }

            const seenCardIds = seenCards?.map(p => p.card_id).filter(Boolean) || [];
            // Number of seen cards tracked

            // Then get new cards
            let newCardsQuery = supabase
                .from('cards')
                .select('*');
            if (seenCardIds.length > 0) {
                newCardsQuery = newCardsQuery.not('id', 'in', `(${seenCardIds.join(',')})`);
            }
            newCardsQuery = newCardsQuery.limit(limit);
            const { data: newCards, error: newError } = await newCardsQuery;

            if (newError) {
                // Error fetching new cards
                throw newError;
            }

            // Found new cards
            // Initialize progress for the new card
            if (newCards && newCards.length > 0) {
                // Initializing progress for new cards
                const now = new Date().toISOString();
                const progressRecords = newCards
                    .filter(card => card && card.id)
                    .map(card => ({
                        user_id: userId,
                        card_id: card.id,
                        stability: 1.0,
                        difficulty: 5.0,
                        state: 'new',
                        next_review_date: now,
                        due_date: now,
                        last_review_date: null,
                        reps: 0,
                        total_reviews: 0,
                        correct_reviews: 0,
                        incorrect_reviews: 0,
                        lapses: 0,
                        average_time_ms: 0,
                        elapsed_days: 0,
                        scheduled_days: 0
                    }));
                // Progress records to insert
                if (progressRecords.length > 0) {
                    const { error: insertError } = await supabase
                        .from('user_card_progress')
                        .upsert(progressRecords, {
                            onConflict: 'user_id,card_id'
                        });

                    if (insertError) {
                        // Error initializing progress for new cards
                        throw insertError;
                    }
                    // Successfully initialized progress for new cards
                } else {
                    // No valid new cards to initialize progress for
                }
            }

            return newCards || [];
        } catch (error) {
            // Error in getNewCards
            throw error;
        }
    }

    /**
     * Initializes progress tracking for a user-card pair
     * @param {string} user_id - The user's ID
     * @param {string} card_id - The card's ID
     * @returns {Promise<Object>} The created progress record
     */
    async initializeUserProgress(user_id, card_id) {
        try {
            if (!card_id) {
                // initializeUserProgress called with invalid card_id
                return null;
            }
            const supabase = await this.getSupabase();
            const now = new Date().toISOString();
            const initialProgress = {
                user_id: user_id,
                card_id: card_id,
                stability: 1.0,
                difficulty: 5.0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                state: 'new',
                last_review_date: null,
                next_review_date: now,
                due_date: now
            };
            // Inserting initial progress record
            const { data, error } = await supabase
                .from('user_card_progress')
                .insert([initialProgress])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            // Error initializing user progress
            throw error;
        }
    }

    /**
     * Gets user's progress for a specific card
     * @param {string} user_id - The user's ID
     * @param {string} card_id - The card's ID
     * @returns {Promise<Object>} The user's progress for the card
     */
    async getUserProgress(user_id, card_id) {
        try {
            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('user_card_progress')
                .select('*')
                .eq('user_id', user_id)
                .eq('card_id', card_id)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
            return data;
        } catch (error) {
            // Error fetching user progress
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
        // Database service initialized successfully
    } catch (error) {
        // Failed to initialize database service
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
        // Initializing progress for user
        
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
            // Error fetching cards for initialization
            throw cardsError;
        }

        if (!cards || cards.length === 0) {
            // No new cards to initialize for user
            return;
        }

        // Initializing cards for user

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
            // Error initializing user progress
            throw insertError;
        }

        // Successfully initialized progress for cards
    } catch (error) {
        // Error in initializeUserProgress
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
        // Fetching due cards for user
        
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
            // Error fetching due cards
            throw error;
        }

        if (!data || data.length === 0) {
            // No cards due for review
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

        // Found cards due for review
        return dueCards;
    } catch (error) {
        // Error in getDueCards
        throw error;
    }
}

// Export utility functions
export {
    getDueCards,
    initializeUserProgress
}; 