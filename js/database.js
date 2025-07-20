import { getSupabaseClient } from './supabase-client.js';
import { updateStability, updateDifficulty, calculateNextReview, calculateInitialStability, calculateInitialDifficulty } from './fsrs.js';
import fsrsParametersService from './fsrsParameters.js';
import fsrsOptimizationService from './fsrsOptimization.js';
import { SESSION_CONFIG } from './config.js';

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

            // Get user's profile with tier information
            const { data: userProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('daily_new_cards_limit, user_tier, reviews_today, last_review_date')
                .eq('id', user.id)
                .single();

            if (profileError) {
                // No user profile found, using default limit
            }

            const userTier = userProfile?.user_tier || 'free';
            const newCardsLimit = userProfile?.daily_new_cards_limit || SESSION_CONFIG.FREE_USER_DAILY_LIMIT;
            
            // Check daily review limit for free users
            if (userTier === 'free') {
                const today = new Date().toDateString();
                const lastReviewDate = userProfile?.last_review_date ? 
                    new Date(userProfile.last_review_date).toDateString() : null;
                
                // Reset count if it's a new day
                const reviewsToday = (lastReviewDate === today) ? 
                    (userProfile.reviews_today || 0) : 0;
                
                if (reviewsToday >= SESSION_CONFIG.FREE_USER_DAILY_LIMIT) {
                    // Daily review limit reached for free user
                    return { limitReached: true, tier: 'free', reviewsToday, limit: SESSION_CONFIG.FREE_USER_DAILY_LIMIT };
                }
            }
            // User tier and limits checked

            // Get the next card for review (closest next_review_date first)
            // Build card filter based on user tier
            let cardFilter = `
                card_id,
                stability,
                difficulty,
                next_review_date,
                cards!inner (
                    id,
                    question,
                    answer,
                    flagged_for_review
                )
            `;
            
            let query = supabase
                .from('user_card_progress')
                .select(cardFilter)
                .eq('user_id', user.id);
                
            // Filter out flagged cards for non-admin users
            if (userTier !== 'admin') {
                query = query.eq('cards.flagged_for_review', false);
            }
            
            const { data: dueCards, error: dueError } = await query
                .order('next_review_date', { ascending: true })
                .limit(1);

            if (dueError) {
                // Error fetching due cards
                throw dueError;
            }

            // Due cards found

            // If we found a card, return it
            if (dueCards && dueCards.length > 0) {
                const card = dueCards[0];
                // Returning card with closest next_review_date
                return {
                    id: card.card_id,
                    question: card.cards.question,
                    answer: card.cards.answer,
                    stability: card.stability,
                    difficulty: card.difficulty
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
                const newCards = await this.getNewCards(user.id, 1, userTier);
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

            // Load user FSRS parameters
            const fsrsParams = await this.getUserFSRSParameters(user.id);
            
            // Calculate elapsed days since last review
            const lastReviewDate = currentProgress?.last_review_date;
            const elapsedDays = lastReviewDate ? 
                (new Date() - new Date(lastReviewDate)) / (1000 * 60 * 60 * 24) : 0;
            
            // FSRS calculations with parameters
            const currentStability = currentProgress?.stability || 1.0;
            const currentDifficulty = currentProgress?.difficulty || 5.0;
            const currentState = currentProgress?.state || 'new';
            
            let newStability, newDifficulty;
            
            if (currentState === 'new') {
                // First review - use initial calculations
                newStability = calculateInitialStability(rating, fsrsParams);
                newDifficulty = calculateInitialDifficulty(rating, fsrsParams);
            } else {
                // Subsequent reviews - use update functions
                newStability = updateStability(currentStability, currentDifficulty, rating, elapsedDays, fsrsParams);
                newDifficulty = updateDifficulty(currentDifficulty, rating, fsrsParams);
            }
            
            // Use FSRS scheduling for all ratings including "again"
            const reviewResult = calculateNextReview(newStability, newDifficulty, rating, fsrsParams, currentState);
            const nextReviewDate = reviewResult.nextReviewDate;

            // State transition logic
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

            // Only increment daily review count for completed reviews (rating >= 2)
            if (rating >= 2) {
                const { error: incrementError } = await supabase.rpc('increment_daily_reviews', {
                    user_id: user.id
                });

                if (incrementError) {
                    // Error incrementing daily review count - not critical, continue
                    console.warn('Failed to increment daily review count:', incrementError);
                }
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
     * Gets the next single card due for review for a specific user
     * @param {string} userId - The user's ID
     * @returns {Promise<Object|null>} Next due card or null if none available
     */
    async getNextDueCard(userId) {
        try {
            const supabase = await this.getSupabase();
            const now = new Date();
            const nowISOString = now.toISOString();

            // Get user tier to determine card filtering
            const { data: userProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('user_tier')
                .eq('id', userId)
                .single();

            const userTier = userProfile?.user_tier || 'free';

            // Build select query with card filtering based on user tier
            let cardSelect = `
                *,
                cards!inner (
                    id,
                    question,
                    answer,
                    subject_id,
                    subsection,
                    flagged_for_review
                )
            `;

            // Get the next card (ordered by next_review_date, closest first)
            let dueQuery = supabase
                .from('user_card_progress')
                .select(cardSelect)
                .eq('user_id', userId);

            // Filter out flagged cards for non-admin users
            if (userTier !== 'admin') {
                dueQuery = dueQuery.eq('cards.flagged_for_review', false);
            }

            const { data: dueCards, error: dueError } = await dueQuery
                .order('next_review_date', { ascending: true })
                .limit(1);

            if (dueError) throw dueError;

            if (dueCards && dueCards.length > 0) {
                return dueCards[0];
            }

            // If no due cards, try to get a new card
            const newCards = await this.getNewCards(userId, 1, userTier);
            return newCards && newCards.length > 0 ? {
                card_id: newCards[0].id,
                cards: newCards[0],
                stability: 1.0,
                difficulty: 5.0,
                state: 'new',
                total_reviews: 0
            } : null;
        } catch (error) {
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

            // Get user tier to determine card filtering
            const { data: userProfile, error: profileError } = await supabase
                .from('user_profiles')
                .select('user_tier')
                .eq('id', userId)
                .single();

            const userTier = userProfile?.user_tier || 'free';

            // Build select query with card filtering based on user tier
            let cardSelect = `
                *,
                cards!inner (
                    id,
                    question,
                    answer,
                    subject_id,
                    subsection,
                    flagged_for_review,
                    subjects!inner (
                        name,
                        is_active,
                        is_public
                    )
                )
            `;

            // 1. Get cards that are actually due for review (next_review_date <= NOW) or are new
            let dueQuery = supabase
                .from('user_card_progress')
                .select(cardSelect)
                .eq('user_id', userId)
                .or(`next_review_date.lte.${nowISOString},state.eq.new`);

            // Filter out flagged cards and inactive subjects for non-admin users
            if (userTier !== 'admin') {
                dueQuery = dueQuery
                    .eq('cards.flagged_for_review', false)
                    .eq('cards.subjects.is_active', true)
                    .eq('cards.subjects.is_public', true);
            }

            const { data: dueCards, error: dueError } = await dueQuery
                .order('next_review_date', { ascending: true });
            if (dueError) throw dueError;

            // Debug: Log due cards to check if filtering is working
            console.log('Due cards loaded:', dueCards?.length, 'for user tier:', userTier);
            console.log('Due cards filtered by date <= NOW or state = new');
            
            // Check for Portuguese cards specifically
            const portugueseCards = dueCards?.filter(card => card.cards?.subjects?.name === 'Portuguese') || [];
            console.log('Portuguese cards found in due cards:', portugueseCards.length);
            
            if (dueCards && dueCards.length > 0) {
                console.log('Sample due card subjects:', dueCards.slice(0, 3).map(card => ({
                    cardId: card.cards?.id,
                    subject: card.cards?.subjects?.name,
                    state: card.state,
                    nextReviewDate: card.next_review_date,
                    isDue: new Date(card.next_review_date) <= now
                })));
            }

            // 2. Get ALL new cards (no limit)
            let newQuery = supabase
                .from('user_card_progress')
                .select(cardSelect)
                .eq('user_id', userId)
                .eq('state', 'new');

            // Filter out flagged cards and inactive subjects for non-admin users
            if (userTier !== 'admin') {
                newQuery = newQuery
                    .eq('cards.flagged_for_review', false)
                    .eq('cards.subjects.is_active', true)
                    .eq('cards.subjects.is_public', true);
            }

            const { data: newCards, error: newCardsError } = await newQuery
                .order('created_at', { ascending: true });
            if (newCardsError) throw newCardsError;

            // Debug: Log new cards to check if filtering is working
            console.log('New cards (from progress) loaded:', newCards?.length, 'for user tier:', userTier);
            if (newCards && newCards.length > 0) {
                console.log('Sample new card subjects:', newCards.slice(0, 3).map(card => ({
                    cardId: card.cards?.id,
                    subject: card.cards?.subjects?.name,
                    subjectActive: card.cards?.subjects?.is_active
                })));
            }

            // 3. Separate due cards by state and combine strategically
            const reviewCards = (dueCards || []).filter(card => card.state === 'review');
            const learningCards = (dueCards || []).filter(card => card.state === 'learning');
            const newStateCards = (dueCards || []).filter(card => card.state === 'new');
            const additionalNewCards = (newCards || []);
            
            // Deduplicate new cards by card_id to avoid duplicates
            const seenCardIds = new Set();
            const deduplicatedNewCards = [];
            
            // Add new cards from due query first
            for (const card of newStateCards) {
                if (!seenCardIds.has(card.card_id)) {
                    seenCardIds.add(card.card_id);
                    deduplicatedNewCards.push(card);
                }
            }
            
            // Add additional new cards, but only if we haven't seen them
            for (const card of additionalNewCards) {
                if (!seenCardIds.has(card.card_id)) {
                    seenCardIds.add(card.card_id);
                    deduplicatedNewCards.push(card);
                }
            }
            
            const allNewCards = deduplicatedNewCards;
            
            // Create a balanced mix: prioritize truly due cards, then fill with new cards
            const allCards = [];
            
            // Now that we have proper due date filtering, we can trust that review/learning cards are actually due
            // Add all due cards first (they are legitimately due for review)
            allCards.push(...reviewCards);
            allCards.push(...learningCards);
            
            // Fill remaining slots with new cards to ensure proper session size
            const remainingSlots = Math.max(0, SESSION_CONFIG.CARDS_PER_SESSION - allCards.length);
            if (remainingSlots > 0) {
                allCards.push(...allNewCards.slice(0, remainingSlots));
            }
            
            // If we still don't have enough cards, use any remaining cards
            const finalRemainingSlots = Math.max(0, SESSION_CONFIG.CARDS_PER_SESSION - allCards.length);
            if (finalRemainingSlots > 0) {
                const additionalCards = allNewCards.slice(remainingSlots);
                allCards.push(...additionalCards.slice(0, finalRemainingSlots));
            }
            
            // Final deduplication step for entire session
            const finalSessionCards = [];
            const finalSeenCardIds = new Set();
            
            for (const card of allCards) {
                if (!finalSeenCardIds.has(card.card_id)) {
                    finalSeenCardIds.add(card.card_id);
                    finalSessionCards.push(card);
                }
            }
            
            // Debug: Log session composition
            console.log('Session composition:');
            console.log('Available cards:', {
                review: reviewCards.length,
                learning: learningCards.length, 
                new: allNewCards.length,
                total: finalSessionCards.length
            });
            console.log('Cards selected for session:', finalSessionCards.length);
            
            // Show first few cards with due date info
            finalSessionCards.slice(0, 5).forEach((card, index) => {
                const nextReview = new Date(card.next_review_date);
                const isDue = nextReview <= now;
                console.log(`${index + 1}. Subject: ${card.cards?.subjects?.name}, State: ${card.state}, Due: ${isDue ? 'Yes' : 'No'} (${nextReview.toDateString()})`);
            });
            
            return finalSessionCards;
        } catch (error) {
            // Error fetching due and new cards
            throw error;
        }
    }

    /**
     * Get new cards that haven't been studied yet
     * @param {string} userId - The user's ID
     * @param {number} limit - Maximum number of new cards to return
     * @param {string} userTier - The user's tier (free, paid, admin)
     * @returns {Promise<Array>} Array of new cards
     */
    async getNewCards(userId, limit = SESSION_CONFIG.CARDS_PER_SESSION, userTier = 'free') {
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
                .select(`
                    *,
                    subjects!inner (
                        name,
                        is_active,
                        is_public
                    )
                `);
            if (seenCardIds.length > 0) {
                newCardsQuery = newCardsQuery.not('id', 'in', `(${seenCardIds.join(',')})`);
            }
            
            // Filter out flagged cards and inactive subjects for non-admin users
            if (userTier !== 'admin') {
                newCardsQuery = newCardsQuery
                    .eq('flagged_for_review', false)
                    .eq('subjects.is_active', true)
                    .eq('subjects.is_public', true);
            }
            
            newCardsQuery = newCardsQuery.limit(limit);
            const { data: newCards, error: newError } = await newCardsQuery;

            if (newError) {
                // Error fetching new cards
                throw newError;
            }

            // Debug: Log new cards to check if filtering is working
            console.log('New cards (direct) loaded:', newCards?.length, 'for user tier:', userTier);
            if (newCards && newCards.length > 0) {
                console.log('Sample direct new card subjects:', newCards.slice(0, 3).map(card => ({
                    cardId: card.id,
                    subject: card.subjects?.name,
                    subjectActive: card.subjects?.is_active
                })));
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

    /**
     * Flags a card for admin review
     * @param {string} card_id - The card's ID
     * @param {string} reason - The reason for flagging ('incorrect', 'spelling', 'confusing', 'other')
     * @param {string} comment - Optional comment about the flag
     * @returns {Promise<boolean>} Success status
     */
    async flagCard(card_id, reason, comment = null) {
        try {
            const supabase = await this.getSupabase();
            
            // Use the database function to flag the card
            const { data, error } = await supabase.rpc('flag_card_for_review', {
                p_card_id: card_id,
                p_reason: reason,
                p_comment: comment
            });

            if (error) {
                throw error;
            }

            return true;
        } catch (error) {
            if (error.message?.includes('already flagged')) {
                throw new Error('You have already flagged this card');
            } else if (error.message?.includes('Admin users should use')) {
                throw new Error('Admin users should use the admin interface for card management');
            }
            throw error;
        }
    }

    /**
     * Checks if current user has already flagged a card
     * @param {string} card_id - The card's ID
     * @returns {Promise<boolean>} Whether the card is already flagged by current user
     */
    async hasUserFlaggedCard(card_id) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            
            if (!user) {
                return false;
            }

            const { data, error } = await supabase
                .from('user_card_flags')
                .select('id')
                .eq('user_id', user.id)
                .eq('card_id', card_id)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return !!data;
        } catch (error) {
            // If error is not "not found", rethrow
            if (error.code !== 'PGRST116') {
                throw error;
            }
            return false;
        }
    }

    /**
     * Flags a card for review by a user
     * @param {string} cardId - The card's ID
     * @param {string} reason - The reason for flagging
     * @returns {Promise<boolean>} Success status
     */
    async flagCardAsUser(cardId, reason) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            
            if (!user || !user.id) {
                throw new Error('User not authenticated');
            }

            if (!cardId || typeof cardId !== 'string') {
                throw new Error('Invalid card ID');
            }

            // Check if user has already flagged this card
            const { data: existingFlag, error: checkError } = await supabase
                .from('cards')
                .select('flagged_by, flagged_for_review')
                .eq('id', cardId)
                .single();

            if (checkError) {
                throw new Error('Failed to check card status');
            }

            // If card is already flagged by this user, don't flag again
            if (existingFlag?.flagged_for_review && existingFlag?.flagged_by === user.id) {
                throw new Error('You have already reported this card');
            }

            // If card is already flagged by someone else, don't allow re-flagging
            if (existingFlag?.flagged_for_review) {
                throw new Error('This card has already been reported');
            }

            // Flag the card
            const { error: updateError } = await supabase
                .from('cards')
                .update({
                    flagged_for_review: true,
                    flagged_by: user.id,
                    flagged_reason: reason,
                    flagged_at: new Date().toISOString()
                })
                .eq('id', cardId);

            if (updateError) {
                throw updateError;
            }

            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Checks if a card has been flagged by the current user
     * @param {string} cardId - The card's ID
     * @returns {Promise<boolean>} Whether the card is flagged by current user
     */
    async isCardFlaggedByUser(cardId) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            
            if (!user || !user.id) {
                return false;
            }

            const { data, error } = await supabase
                .from('cards')
                .select('flagged_by, flagged_for_review')
                .eq('id', cardId)
                .single();

            if (error) {
                return false;
            }

            return data?.flagged_for_review && data?.flagged_by === user.id;
        } catch (error) {
            return false;
        }
    }

    /**
     * Submit a batch of session ratings to the database
     * @param {Object} sessionData - Complete session data with ratings
     * @returns {Promise<boolean>} Success status
     */
    async submitBatchReviews(sessionData) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            
            if (!user || !user.id) {
                throw new Error('User not authenticated');
            }

            if (!sessionData || !sessionData.ratings) {
                throw new Error('Invalid session data');
            }

            // Load user FSRS parameters once for the batch
            const fsrsParams = await this.getUserFSRSParameters(user.id);
            
            // Prepare all review records and progress updates
            const reviewRecords = [];
            const progressUpdates = [];
            let completedCardCount = 0;
            const now = new Date().toISOString();

            // Process each card's ratings
            for (const [cardId, ratings] of Object.entries(sessionData.ratings)) {
                if (!ratings || ratings.length === 0) continue;

                // Get the final rating (last rating >= 2, or last rating if all are 1)
                // Use slice() to create a copy before reversing to avoid mutating original array
                const reversedRatings = ratings.slice().reverse();
                const completingRating = reversedRatings.find(r => r.rating >= 2) || ratings[ratings.length - 1];
                const allRatings = ratings; // Original array remains unchanged
                
                // Find the current progress for this card
                const cardInSession = sessionData.cards.find(c => c.card_id === cardId);
                if (!cardInSession) continue;

                // Use existing progress or defaults for new cards
                const currentStability = cardInSession.stability || 1.0;
                const currentDifficulty = cardInSession.difficulty || 5.0;
                const currentState = cardInSession.state || 'new';
                
                // Calculate elapsed days since last review
                const lastReviewDate = cardInSession.last_review_date;
                const elapsedDays = lastReviewDate ? 
                    (new Date() - new Date(lastReviewDate)) / (1000 * 60 * 60 * 24) : 0;

                // Calculate FSRS values for the final rating with parameters
                let newStability, newDifficulty;
                
                if (currentState === 'new') {
                    // First review - use initial calculations
                    newStability = calculateInitialStability(completingRating.rating, fsrsParams);
                    newDifficulty = calculateInitialDifficulty(completingRating.rating, fsrsParams);
                } else {
                    // Subsequent reviews - use update functions
                    newStability = updateStability(currentStability, currentDifficulty, completingRating.rating, elapsedDays, fsrsParams);
                    newDifficulty = updateDifficulty(currentDifficulty, completingRating.rating, fsrsParams);
                }
                
                // Use FSRS scheduling for all ratings including "again"
                const reviewResult = calculateNextReview(newStability, newDifficulty, completingRating.rating, fsrsParams, currentState);
                const nextReviewDate = reviewResult.nextReviewDate;

                // Determine next state
                let nextState = currentState;
                if (currentState === 'new') {
                    nextState = completingRating.rating >= 3 ? 'review' : 'learning';
                } else if (currentState === 'learning') {
                    nextState = completingRating.rating >= 3 ? 'review' : 'learning';
                } else if (currentState === 'review') {
                    nextState = completingRating.rating === 1 ? 'learning' : 'review';
                }

                // Count total reviews (all ratings) and correct reviews (ratings >= 3)
                const totalReviews = allRatings.length;
                const correctReviews = allRatings.filter(r => r.rating >= 3).length;
                const incorrectReviews = allRatings.filter(r => r.rating < 3).length;
                const lapses = allRatings.filter(r => r.rating === 1).length;

                // Update progress record
                progressUpdates.push({
                    user_id: user.id,
                    card_id: cardId,
                    stability: newStability,
                    difficulty: newDifficulty,
                    due_date: nextReviewDate.toISOString(),
                    last_review_date: now,
                    next_review_date: nextReviewDate.toISOString(),
                    reps: (cardInSession.reps || 0) + totalReviews,
                    total_reviews: (cardInSession.total_reviews || 0) + totalReviews,
                    correct_reviews: (cardInSession.correct_reviews || 0) + correctReviews,
                    incorrect_reviews: (cardInSession.incorrect_reviews || 0) + incorrectReviews,
                    average_time_ms: completingRating.responseTime,
                    state: nextState,
                    last_rating: completingRating.rating,
                    lapses: (cardInSession.lapses || 0) + lapses,
                    elapsed_days: 0,
                    scheduled_days: Math.ceil((new Date(nextReviewDate) - new Date(now)) / (1000 * 60 * 60 * 24)),
                    updated_at: now
                });

                // Add review history records for each rating
                for (const rating of allRatings) {
                    reviewRecords.push({
                        user_id: user.id,
                        card_id: cardId,
                        rating: rating.rating,
                        response_time_ms: rating.responseTime,
                        stability_before: currentStability,
                        difficulty_before: currentDifficulty,
                        elapsed_days: 0,
                        scheduled_days: 0,
                        stability_after: newStability,
                        difficulty_after: newDifficulty,
                        state_before: currentState,
                        state_after: nextState,
                        created_at: rating.timestamp
                    });
                }

                // Count completed cards (those with final rating >= 2)
                if (completingRating.rating >= 2) {
                    completedCardCount++;
                }
            }

            // Execute batch updates in a transaction
            const { error: progressError } = await supabase
                .from('user_card_progress')
                .upsert(progressUpdates, { onConflict: 'user_id,card_id' });

            if (progressError) throw progressError;

            // Insert review history records
            if (reviewRecords.length > 0) {
                const { error: reviewError } = await supabase
                    .from('review_history')
                    .insert(reviewRecords);

                if (reviewError) throw reviewError;
            }

            // Update daily review count (only for completed cards)
            if (completedCardCount > 0) {
                for (let i = 0; i < completedCardCount; i++) {
                    const { error: incrementError } = await supabase.rpc('increment_daily_reviews', {
                        user_id: user.id
                    });
                    if (incrementError) {
                        console.warn('Failed to increment daily review count:', incrementError);
                    }
                }

                // Update user streak after successful session completion
                // TEMPORARILY DISABLED - Fix streak column issue
                try {
                    // const { default: streakService } = await import('./streakService.js');
                    // const streakResult = await streakService.updateUserStreak(user.id);
                    
                    // if (streakResult.success && streakResult.isNewMilestone) {
                    //     console.log(`🎉 New streak milestone achieved: ${streakResult.milestoneDays} days!`);
                    //     // Store milestone achievement for UI notification
                    //     if (typeof window !== 'undefined') {
                    //         window.newStreakMilestone = {
                    //             days: streakResult.milestoneDays,
                    //             currentStreak: streakResult.currentStreak
                    //         };
                    //     }
                    // }
                    console.log('Streak update temporarily disabled to fix session completion');
                } catch (streakError) {
                    console.warn('Failed to update streak:', streakError);
                    // Don't fail the session if streak update fails
                }

                // Check if FSRS parameter optimization is needed after session completion
                try {
                    const optimizationStatus = await fsrsOptimizationService.checkOptimizationNeeded(user.id);
                    
                    if (optimizationStatus.shouldOptimize) {
                        console.log(`🧠 FSRS parameter optimization recommended: ${optimizationStatus.reason}`);
                        
                        // Trigger optimization in background (don't wait for completion)
                        fsrsOptimizationService.optimizeUserParameters(user.id, { conservative: true })
                            .then(result => {
                                if (result.success) {
                                    console.log(`✅ FSRS parameters optimized! Analyzed ${result.reviewsAnalyzed} reviews with ${(result.confidence * 100).toFixed(1)}% confidence`);
                                    
                                    // Store optimization result for potential UI notification
                                    if (typeof window !== 'undefined') {
                                        window.fsrsOptimizationResult = {
                                            success: true,
                                            improvements: result.improvements,
                                            confidence: result.confidence,
                                            reviewsAnalyzed: result.reviewsAnalyzed
                                        };
                                    }
                                } else {
                                    console.log(`⚠️ FSRS optimization skipped: ${result.reason}`);
                                }
                            })
                            .catch(optimizationError => {
                                console.warn('FSRS optimization failed:', optimizationError);
                            });
                    } else {
                        console.log(`📊 FSRS optimization status: ${optimizationStatus.reason} (${optimizationStatus.totalReviews} reviews)`);
                    }
                } catch (optimizationError) {
                    console.warn('Failed to check FSRS optimization:', optimizationError);
                    // Don't fail the session if optimization check fails
                }
            }

            return true;
        } catch (error) {
            console.error('Error submitting batch reviews:', error);
            throw error;
        }
    }

    /**
     * Get FSRS parameters for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} FSRS parameters
     */
    async getUserFSRSParameters(userId) {
        try {
            return await fsrsParametersService.getUserParameters(userId);
        } catch (error) {
            console.error('Error loading user FSRS parameters:', error);
            throw error;
        }
    }

    /**
     * Update FSRS parameters for a user
     * @param {string} userId - User ID
     * @param {Object} parameterUpdates - Parameter updates
     * @returns {Promise<Object>} Updated parameters
     */
    async updateUserFSRSParameters(userId, parameterUpdates) {
        try {
            return await fsrsParametersService.updateParameters(userId, parameterUpdates);
        } catch (error) {
            console.error('Error updating user FSRS parameters:', error);
            throw error;
        }
    }

    /**
     * Initialize default FSRS parameters for a new user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Created parameters
     */
    async initializeUserFSRSParameters(userId) {
        try {
            return await fsrsParametersService.createDefaultParameters(userId);
        } catch (error) {
            console.error('Error initializing user FSRS parameters:', error);
            throw error;
        }
    }

    /**
     * Clear FSRS parameter cache for a user
     * @param {string} userId - User ID
     */
    clearFSRSParameterCache(userId) {
        fsrsParametersService.clearCache(userId);
    }

    // Debug function to test Portuguese card selection
    async debugPortugueseCards(userId) {
        try {
            const supabase = await this.getSupabase();
            
            console.log('=== DEBUG: Portuguese Cards Analysis ===');
            
            // Check Portuguese subject
            const { data: subject, error: subjectError } = await supabase
                .from('subjects')
                .select('*')
                .eq('name', 'Portuguese')
                .single();
            
            if (subjectError) {
                console.error('Subject error:', subjectError);
                return;
            }
            
            console.log('Portuguese subject:', subject);
            
            // Check Portuguese cards
            const { data: cards, error: cardsError } = await supabase
                .from('cards')
                .select('id, question, subject_id, flagged_for_review')
                .eq('subject_id', subject.id);
            
            if (cardsError) {
                console.error('Cards error:', cardsError);
                return;
            }
            
            console.log('Portuguese cards total:', cards?.length);
            console.log('Portuguese cards flagged:', cards?.filter(c => c.flagged_for_review).length);
            
            // Check user progress for Portuguese cards
            const { data: progress, error: progressError } = await supabase
                .from('user_card_progress')
                .select('card_id, state, next_review_date')
                .eq('user_id', userId)
                .in('card_id', cards?.map(c => c.id) || []);
            
            if (progressError) {
                console.error('Progress error:', progressError);
                return;
            }
            
            console.log('Portuguese cards with progress:', progress?.length);
            console.log('Portuguese cards by state:', {
                new: progress?.filter(p => p.state === 'new').length,
                learning: progress?.filter(p => p.state === 'learning').length,
                review: progress?.filter(p => p.state === 'review').length
            });
            
            // Test the actual query used in getCardsDue
            const { data: dueTest, error: dueTestError } = await supabase
                .from('user_card_progress')
                .select(`
                    *,
                    cards!inner (
                        id,
                        question,
                        answer,
                        subject_id,
                        subsection,
                        flagged_for_review,
                        subjects!inner (
                            name,
                            is_active,
                            is_public
                        )
                    )
                `)
                .eq('user_id', userId)
                .eq('cards.flagged_for_review', false)
                .eq('cards.subjects.is_active', true)
                .eq('cards.subjects.is_public', true)
                .eq('cards.subjects.name', 'Portuguese');
            
            if (dueTestError) {
                console.error('Due test error:', dueTestError);
                return;
            }
            
            console.log('Portuguese cards returned by due query:', dueTest?.length);
            
            return {
                subject,
                totalCards: cards?.length,
                flaggedCards: cards?.filter(c => c.flagged_for_review).length,
                userProgress: progress?.length,
                dueQueryResult: dueTest?.length
            };
            
        } catch (error) {
            console.error('Debug error:', error);
            return { error: error.message };
        }
    }

    /**
     * Get current reviews_today count for a user
     * @param {string} userId - User ID
     * @returns {Promise<number>} Current reviews_today count
     */
    async getCurrentReviewsToday(userId) {
        try {
            const supabase = await this.getSupabase();
            
            const { data: profile, error } = await supabase
                .from('user_profiles')
                .select('reviews_today, last_review_date')
                .eq('id', userId)
                .single();
            
            if (error) {
                console.error('Error fetching reviews_today:', error);
                return 0;
            }
            
            // Check if it's still the same day
            const today = new Date().toISOString().split('T')[0];
            const lastReviewDate = profile.last_review_date;
            
            // If last review was today, return the count, otherwise return 0
            if (lastReviewDate === today) {
                return profile.reviews_today || 0;
            }
            
            return 0;
        } catch (error) {
            console.error('Error getting current reviews today:', error);
            return 0;
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