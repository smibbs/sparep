import { getSupabaseClient } from './supabase-client.js';
import { updateStability, updateDifficulty, calculateNextReview, calculateInitialStability, calculateInitialDifficulty } from './fsrs.js';
import fsrsParametersService from './fsrsParameters.js';
import fsrsOptimizationService from './fsrsOptimization.js';
import { SESSION_CONFIG } from './config.js';
import { handleError, withErrorHandling } from './errorHandler.js';
import { validateRating, validateResponseTime, validateUserId, validateCardId, validateFlagReason, validateComment } from './validator.js';
import loadingMessagesService from './loadingMessages.js';

class DatabaseService {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.initialize();
        
        // Mobile-specific retry configuration
        this.retryConfig = {
            maxRetries: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 3 : 2,
            baseDelay: 1000, // 1 second
            maxDelay: 8000,  // 8 seconds max
            backoffFactor: 2
        };
    }

    async initialize() {
        try {
            await this.ensureReviewHistorySchema();
            } catch (error) {
        }
    }

    async getSupabase() {
        return await this.supabasePromise;
    }

    /**
     * Mobile-specific retry wrapper for network operations
     * @param {Function} operation - Async function to retry
     * @param {string} operationName - Name for logging
     * @returns {Promise} - Result of the operation
     */
    async withMobileRetry(operation, operationName = 'database operation') {
        let lastError;
        
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry for certain types of errors
                if (this.shouldNotRetry(error)) {
                    throw error;
                }
                
                // Don't retry on final attempt
                if (attempt === this.retryConfig.maxRetries) {
                    break;
                }
                
                // Calculate delay with exponential backoff
                const delay = Math.min(
                    this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
                    this.retryConfig.maxDelay
                );
                
                console.warn(`${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error.message);
                
                // Add jitter to prevent thundering herd
                const jitter = Math.random() * 200;
                await new Promise(resolve => setTimeout(resolve, delay + jitter));
            }
        }
        
        // All retries failed
        throw new Error(`${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError.message}`);
    }

    /**
     * Check if an error should not be retried
     * @param {Error} error - The error to check
     * @returns {boolean} - True if should not retry
     */
    shouldNotRetry(error) {
        // Don't retry authentication errors
        if (error.message?.includes('JWT') || error.message?.includes('auth') || error.message?.includes('unauthorized')) {
            return true;
        }
        
        // Don't retry permission errors
        if (error.message?.includes('permission') || error.message?.includes('RLS') || error.code === '42501') {
            return true;
        }
        
        // Don't retry validation errors
        if (error.message?.includes('validation') || error.code === '23505') {
            return true;
        }
        
        // Retry network and temporary errors
        return false;
    }

    async ensureReviewHistorySchema() {
        const supabase = await this.getSupabase();
        
        // Check if the new reviews table exists by trying to select a single row
        const { error } = await supabase
            .from('reviews')
            .select('id')
            .limit(1);

        if (error) {
            // New table check failed, try old table for backward compatibility
            const { error: oldError } = await supabase
                .from('reviews')
                .select('id')
                .limit(1);
            
            if (oldError) {
                console.warn('Neither new nor old review table found');
            }
        }
    }

    async getNextDueCard() {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;

            // Get user's profile with tier information (updated for new schema)
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('daily_new_cards_limit, user_tier, reviews_today, last_review_date')
                .eq('id', user.id)
                .single();

            if (profileError) {
                // Profile error will use default values
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

            // Get the next card for review (closest due_at first)
            // Build card filter based on user tier
            let cardFilter = `
                card_template_id,
                stability,
                difficulty,
                due_at,
                card_templates!inner (
                    id,
                    question,
                    answer,
                    flagged_for_review
                )
            `;
            
            let query = supabase
                .from('user_cards')
                .select(cardFilter)
                .eq('user_id', user.id);
                
            // Filter out flagged cards for non-admin users
            if (userTier !== 'admin') {
                query = query.eq('card_templates.flagged_for_review', false);
            }
            
            const { data: dueCards, error: dueError } = await query
                .order('due_at', { ascending: true })
                .limit(1);

            if (dueError) {
                    throw dueError;
            }


            // If we found a card, return it
            if (dueCards && dueCards.length > 0) {
                const card = dueCards[0];
                return {
                    id: card.card_template_id,
                    question: card.card_templates.question,
                    answer: card.card_templates.answer,
                    stability: card.stability,
                    difficulty: card.difficulty
                };
            }

            // Get count of new cards studied today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const { data: newCardsToday, error: countError } = await supabase
                .from('user_cards')
                .select('card_template_id')
                .eq('user_id', user.id)
                .eq('state', 'new')
                .gte('created_at', today.toISOString())
                .limit(1);

            if (countError) {
                // Error counting new cards
                throw countError;
            }


            // If we haven't reached the daily limit, get a new card
            if (!newCardsToday || newCardsToday.length < newCardsLimit) {
                const newCards = await this.getNewCards(user.id, 1, userTier);
                if (newCards && newCards.length > 0) {
                    const newCard = newCards[0];
                    return {
                        id: newCard.id,
                        question: newCard.question,
                        answer: newCard.answer,
                        stability: 1.0,
                        difficulty: 5.0
                    };
                }
            }

            // No cards available to return
            return null;

        } catch (error) {
            const handledError = handleError(error, 'getNextDueCard');
            throw new Error(handledError.userMessage);
        }
    }

    async recordReview(reviewData) {
        try {
            const supabase = await this.getSupabase();
            const user = (await supabase.auth.getUser()).data.user;
            const { card_template_id, rating, responseTime } = reviewData;
            const now = new Date().toISOString();

            // Defensive checks for user_id and card_template_id
            if (!user || !user.id) {
                throw new Error('User not authenticated or missing user ID.');
            }
            if (!card_template_id || typeof card_template_id !== 'string' || card_template_id === 'undefined') {
                throw new Error('Missing or invalid card_template_id for review.');
            }
            
            // Additional validation for review parameters
            validateRating(rating, 'review submission');
            validateResponseTime(responseTime, 'review submission');

            // Get or find the deck_id for this card
            let deckId = reviewData.deck_id;
            if (!deckId) {
                // Try to find existing user_cards record to get deck_id
                const { data: existingCard } = await supabase
                    .from('user_cards')
                    .select('deck_id')
                    .eq('user_id', user.id)
                    .eq('card_template_id', card_template_id)
                    .single();
                    
                if (existingCard) {
                    deckId = existingCard.deck_id;
                } else {
                    // Get or create default deck for user
                    const { data: defaultDecks } = await supabase
                        .from('decks')
                        .select('id')
                        .eq('user_id', user.id)
                        .limit(1);
                        
                    if (defaultDecks && defaultDecks.length > 0) {
                        deckId = defaultDecks[0].id;
                    } else {
                        // Create default deck
                        const { data: newDeck, error: deckError } = await supabase
                            .from('decks')
                            .insert({
                                name: 'Default Deck',
                                description: 'Auto-created default deck',
                                user_id: user.id
                            })
                            .select('id')
                            .single();
                            
                        if (deckError) throw new Error('Failed to create default deck');
                        deckId = newDeck.id;
                    }
                }
            }

            // Fetch current progress with deck_id
            const { data: currentProgress, error: progressError } = await supabase
                .from('user_cards')
                .select('user_id, card_template_id, deck_id, state, due_at, reps, total_reviews, difficulty, stability, correct_reviews, incorrect_reviews, lapses, last_reviewed_at, created_at, updated_at')
                .eq('user_id', user.id)
                .eq('card_template_id', card_template_id)
                .eq('deck_id', deckId)
                .single();

            if (progressError && progressError.code !== 'PGRST116') {
                throw new Error(progressError.message || 'Failed to fetch card progress. Please try again.');
            }

            // Load user FSRS parameters
            const fsrsParams = await this.getUserFSRSParameters(user.id);
            
            // Calculate elapsed days since last review
            const lastReviewDate = currentProgress?.last_reviewed_at;
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
                nextState = rating >= 2 ? 'review' : 'learning';
            } else if (currentState === 'learning') {
                nextState = rating >= 2 ? 'review' : 'learning';
            } else if (currentState === 'review') {
                nextState = rating === 0 ? 'learning' : 'review';
            }

            // Update user_cards with proper composite key
            const { error: updateError } = await supabase
                .from('user_cards')
                .upsert({
                    user_id: user.id,
                    card_template_id: card_template_id,
                    deck_id: deckId,
                    stability: newStability,
                    difficulty: newDifficulty,
                    last_reviewed_at: now,
                    due_at: nextReviewDate.toISOString(),
                    reps: (currentProgress?.reps || 0) + 1,
                    total_reviews: (currentProgress?.total_reviews || 0) + 1,
                    correct_reviews: (currentProgress?.correct_reviews || 0) + (rating >= 2 ? 1 : 0),
                    incorrect_reviews: (currentProgress?.incorrect_reviews || 0) + (rating < 2 ? 1 : 0),
                    state: nextState,
                    last_rating: rating,
                    lapses: (currentProgress?.lapses || 0) + (rating === 0 ? 1 : 0),
                    elapsed_days: elapsedDays,
                    scheduled_days: reviewResult.scheduledDays || 0,
                    updated_at: now
                }, {
                    onConflict: 'user_id,card_template_id,deck_id'
                });

            if (updateError) {
                throw updateError;
            }

            // Record the review in reviews table with all required fields
            const { error: reviewError } = await supabase
                .from('reviews')
                .insert({
                    user_id: user.id,
                    card_template_id: card_template_id,
                    deck_id: deckId,
                    rating: rating,
                    response_time_ms: responseTime,
                    state_before: currentState,
                    stability_before: currentStability,
                    difficulty_before: currentDifficulty,
                    due_at_before: currentProgress?.due_at || null,
                    state_after: nextState,
                    stability_after: newStability,
                    difficulty_after: newDifficulty,
                    due_at_after: nextReviewDate.toISOString(),
                    elapsed_days: elapsedDays,
                    scheduled_days: reviewResult.scheduledDays || 0,
                    reps_before: currentProgress?.reps || 0,
                    lapses_before: currentProgress?.lapses || 0,
                    reviewed_at: now,
                    created_at: now
                });

            if (reviewError) {
                throw reviewError;
            }

            // Only increment daily review count for completed reviews (rating >= 1 for 0-3 scale)
            if (rating >= 1) {
                const { error: incrementError } = await supabase.rpc('increment_daily_reviews', {
                    p_user_id: user.id
                });

                if (incrementError) {
                    // Error incrementing daily review count - not critical, continue
                    console.warn('Failed to increment daily review count:', incrementError);
                }
            }

        } catch (error) {
            const handledError = handleError(error, 'recordReview');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Gets the next single card due for review for a specific user
     * @param {string} userId - The user's ID
     * @returns {Promise<Object|null>} Next due card or null if none available
     */
    async getNextDueCard(userId) {
        try {
            // Validate user ID
            validateUserId(userId, 'getting next due card');
            
            const supabase = await this.getSupabase();
            const now = new Date();
            const nowISOString = now.toISOString();

            // Get user profile to determine card filtering and admin status
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_tier, is_admin')
                .eq('id', userId)
                .single();

            const userTier = userProfile?.user_tier || 'free';
            const isAdmin = userProfile?.is_admin === true;

            // Get the next card from the due cards view with proper ordering
            let dueQuery = supabase
                .from('v_due_user_cards')
                .select('*')
                .eq('user_id', userId);

            // Filter out flagged cards for non-admin users
            if (!isAdmin) {
                // The view already filters flagged cards, but add explicit check
                dueQuery = dueQuery.eq('flagged_for_review', false);
            }

            const { data: dueCards, error: dueError } = await dueQuery
                .order('overdue_seconds', { ascending: false })
                .limit(1);

            if (dueError) throw dueError;

            if (dueCards && dueCards.length > 0) {
                return dueCards[0];
            }

            // If no due cards, try to get a new card using the new cards view
            const { data: newCards, error: newError } = await supabase
                .from('v_new_user_cards')
                .select('*')
                .eq('user_id', userId)
                .limit(1);
                
            if (newError) throw newError;
            
            return newCards && newCards.length > 0 ? {
                card_template_id: newCards[0].card_template_id,
                deck_id: newCards[0].deck_id,
                question: newCards[0].question,
                answer: newCards[0].answer,
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
        return await this.withMobileRetry(async () => {
            return await this._getCardsDueCore(userId);
        }, 'get due cards');
    }

    async _getCardsDueCore(userId) {
        try {
            // Validate user ID
            validateUserId(userId, 'getting due cards');
            
            const supabase = await this.getSupabase();
            const now = new Date();
            const nowISOString = now.toISOString();

            // Get user tier to determine card filtering (updated for new schema)
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('user_tier')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error('❌ Error fetching user profile:', profileError);
                throw profileError;
            }

            const userTier = userProfile?.user_tier || 'free';

            // Simplified select query for now - just get user_cards first
            let cardSelect = `id, user_id, card_template_id, state, due_at, last_reviewed_at, ease_factor, interval_days, reps, lapses, difficulty, stability, retrievability, created_at, updated_at`;

            // 1. Get cards that are actually due for review using the due cards view
            let dueQuery = supabase
                .from('v_due_user_cards')
                .select('*')
                .eq('user_id', userId);

            // Skip complex filtering for now - we'll filter after fetching the data

            const { data: dueCards, error: dueError } = await dueQuery;
            
            if (dueError) {
                console.error('❌ Error in due cards query:', dueError);
                throw dueError;
            }


            // 2. Get ALL new cards using the new cards view  
            let newQuery = supabase
                .from('v_new_user_cards')
                .select('*')
                .eq('user_id', userId);

            // Skip complex filtering for now

            const { data: newCards, error: newCardsError } = await newQuery
                .order('added_at', { ascending: true });
            if (newCardsError) throw newCardsError;

            // Now fetch the card_templates data for all the cards we found
            const allFoundCards = [...(dueCards || []), ...(newCards || [])];
            const cardTemplateIds = [...new Set(allFoundCards.map(card => card.card_template_id))];
            
            let cardTemplatesData = [];
            if (cardTemplateIds.length > 0) {
                const { data: templates, error: templatesError } = await supabase
                    .from('card_templates')
                    .select('id, question, answer, subject_id, subsection, flagged_for_review')
                    .in('id', cardTemplateIds);
                
                if (templatesError) throw templatesError;
                cardTemplatesData = templates || [];
            }

            // Create a map for quick lookup
            const templatesMap = new Map(cardTemplatesData.map(template => [template.id, template]));
            
            // Add template data to each card
            const enrichedDueCards = (dueCards || []).map(card => ({
                ...card,
                card_templates: templatesMap.get(card.card_template_id)
            })).filter(card => card.card_templates); // Filter out cards without templates
            
            const enrichedNewCards = (newCards || []).map(card => ({
                ...card,
                card_templates: templatesMap.get(card.card_template_id)
            })).filter(card => card.card_templates);


            // 3. Separate due cards by state and combine strategically using enriched data
            const reviewCards = (enrichedDueCards || []).filter(card => card.state === 'review');
            const learningCards = (enrichedDueCards || []).filter(card => card.state === 'learning');
            const newStateCards = (enrichedDueCards || []).filter(card => card.state === 'new');
            const additionalNewCards = (enrichedNewCards || []);
            
            // Deduplicate new cards by card_template_id to avoid duplicates
            const seenCardIds = new Set();
            const deduplicatedNewCards = [];
            
            // Add new cards from due query first
            for (const card of newStateCards) {
                if (!seenCardIds.has(card.card_template_id)) {
                    seenCardIds.add(card.card_template_id);
                    deduplicatedNewCards.push(card);
                }
            }
            
            // Add additional new cards, but only if we haven't seen them
            for (const card of additionalNewCards) {
                if (!seenCardIds.has(card.card_template_id)) {
                    seenCardIds.add(card.card_template_id);
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
                if (!finalSeenCardIds.has(card.card_template_id)) {
                    finalSeenCardIds.add(card.card_template_id);
                    finalSessionCards.push(card);
                }
            }
            
            
            return finalSessionCards;
        } catch (error) {
            const handledError = handleError(error, 'getCardsDue');
            throw new Error(handledError.userMessage);
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
            // Validate inputs
            validateUserId(userId, 'getting new cards');
            if (typeof limit !== 'number' || limit < 0 || limit > 100) {
                throw new Error('Invalid limit for getting new cards. Must be between 0 and 100.');
            }
            
            const supabase = await this.getSupabase();

            // Use the new cards view instead of complex logic
            const { data: newCards, error: newError } = await supabase
                .from('v_new_user_cards')
                .select('*')
                .eq('user_id', userId)
                .limit(limit);

            if (newError) {
                throw newError;
            }

            // If no new cards found, try initializing missing progress records
            if (!newCards || newCards.length === 0) {
                console.log('🔍 No new cards found in view, trying to initialize missing progress records...');
                try {
                    const initResult = await this.initializeMissingUserProgress(userId);
                    if (initResult.initialized > 0) {
                        console.log(`✅ Initialized ${initResult.initialized} missing cards, retrying query...`);
                        
                        // Retry the query after initialization
                        const { data: retryCards, error: retryError } = await supabase
                            .from('v_new_user_cards')
                            .select('*')
                            .eq('user_id', userId)
                            .limit(limit);
                            
                        if (retryError) {
                            console.warn('⚠️ Retry query failed:', retryError);
                        } else if (retryCards && retryCards.length > 0) {
                            console.log(`✅ Found ${retryCards.length} cards after initialization`);
                            return retryCards;
                        }
                    }
                } catch (initError) {
                    console.warn('⚠️ Could not initialize missing cards:', initError);
                }
            }


            // Initialize progress for the new card (already handled by the view)
            // The v_new_user_cards view only returns cards that are already in user_cards
            // so no need to initialize progress here
                // Progress records are already handled by the database views
            }

            return newCards || [];
        } catch (error) {
            console.error('❌ getNewCards specific error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                fullError: error
            });
            const handledError = handleError(error, 'getNewCards');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Initializes progress tracking for a user-card-deck combination
     * @param {string} user_id - The user's ID
     * @param {string} card_template_id - The card template ID
     * @param {string} deck_id - The deck ID (required for composite primary key)
     * @returns {Promise<Object>} The created progress record
     */
    async initializeUserProgress(user_id, card_template_id, deck_id) {
        try {
            if (!card_template_id) {
                return null;
            }
            if (!deck_id) {
                throw new Error('deck_id is required for card initialization');
            }
            
            const supabase = await this.getSupabase();
            const now = new Date().toISOString();
            const initialProgress = {
                user_id: user_id,
                card_template_id: card_template_id,
                deck_id: deck_id,  // Required for composite primary key
                stability: 0.0000,  // Default FSRS stability
                difficulty: 5.0000, // Default FSRS difficulty
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                state: 'new',
                last_reviewed_at: null,
                due_at: now,
                total_reviews: 0,
                correct_reviews: 0,
                incorrect_reviews: 0,
                average_response_time_ms: 0,
                last_rating: null
            };
            
            const { data, error } = await supabase
                .from('user_cards')
                .insert([initialProgress])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            const handledError = handleError(error, 'initializeUserProgress');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Gets user's progress for a specific card in a specific deck
     * @param {string} user_id - The user's ID
     * @param {string} card_template_id - The card template ID
     * @param {string} deck_id - The deck ID (required for composite primary key)
     * @returns {Promise<Object>} The user's progress for the card
     */
    async getUserProgress(user_id, card_template_id, deck_id) {
        try {
            if (!deck_id) {
                throw new Error('deck_id is required for getUserProgress');
            }
            
            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('user_cards')
                .select('user_id, card_template_id, deck_id, state, due_at, reps, total_reviews, difficulty, stability, correct_reviews, incorrect_reviews, lapses, last_reviewed_at, last_rating, average_response_time_ms, created_at, updated_at')
                .eq('user_id', user_id)
                .eq('card_template_id', card_template_id)
                .eq('deck_id', deck_id)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
            return data;
        } catch (error) {
            const handledError = handleError(error, 'getUserProgress');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Initialize progress records for missing cards for a user  
     * @param {string} userId - The user's ID
     * @returns {Promise<{initialized: number, skipped: number}>}
     */
    async initializeMissingUserProgress(userId) {
        try {
            validateUserId(userId, 'initializing missing user progress');
            
            const supabase = await this.getSupabase();
            
            // First get all existing card template IDs for this user
            const { data: existingUserCards, error: existingError } = await supabase
                .from('user_cards')
                .select('card_template_id')
                .eq('user_id', userId);
                
            if (existingError) {
                throw existingError;
            }
            
            const existingCardIds = (existingUserCards || []).map(uc => uc.card_template_id);
            
            // Get all card_templates that don't have corresponding user_cards records
            let query = supabase
                .from('card_templates')
                .select('id, subject_id');
                
            if (existingCardIds.length > 0) {
                query = query.not('id', 'in', `(${existingCardIds.join(',')})`);
            }
            
            const { data: missingCards, error: missingError } = await query;
                
            if (missingError) {
                throw missingError;
            }
            
            if (!missingCards || missingCards.length === 0) {
                return { initialized: 0, skipped: 0 };
            }
            
            console.log(`🔧 Found ${missingCards.length} missing progress records for user ${userId}`);
            
            // Get or create a default deck for this user
            let defaultDeckId = null;
            try {
                // First try to find an existing deck for this user
                const { data: existingDecks, error: deckError } = await supabase
                    .from('decks')
                    .select('id')
                    .eq('user_id', userId)
                    .limit(1);
                    
                if (deckError) throw deckError;
                
                if (existingDecks && existingDecks.length > 0) {
                    defaultDeckId = existingDecks[0].id;
                } else {
                    // Create a default deck for the user
                    const { data: newDeck, error: createError } = await supabase
                        .from('decks')
                        .insert({
                            name: 'Default Deck',
                            description: 'Auto-created default deck for study cards',
                            user_id: userId,
                            is_active: true
                        })
                        .select('id')
                        .single();
                        
                    if (createError) throw createError;
                    defaultDeckId = newDeck.id;
                    console.log(`📦 Created default deck: ${defaultDeckId}`);
                }
            } catch (deckError) {
                console.error('❌ Could not get/create default deck:', deckError);
                // Try to proceed without deck_id (might fail but let's see)
            }
            
            const now = new Date().toISOString();
            
            // Create progress records for missing cards
            const progressRecords = missingCards.map(card => ({
                user_id: userId,
                card_template_id: card.id,
                deck_id: defaultDeckId, // Use the default deck
                stability: 1.0,
                difficulty: 5.0,
                state: 'new',
                due_at: now,
                reps: 0,
                total_reviews: 0,
                correct_reviews: 0,
                incorrect_reviews: 0,
                lapses: 0,
                last_reviewed_at: null,
                created_at: now,
                updated_at: now
            }));
            
            // Insert progress records in batches to avoid query size limits
            const batchSize = 100;
            let totalInserted = 0;
            
            for (let i = 0; i < progressRecords.length; i += batchSize) {
                const batch = progressRecords.slice(i, i + batchSize);
                
                const { error: insertError } = await supabase
                    .from('user_cards')
                    .insert(batch);
                    
                if (insertError) {
                    console.error(`❌ Error inserting batch ${i}-${i + batch.length}:`, insertError);
                    throw insertError;
                }
                
                totalInserted += batch.length;
                console.log(`✅ Initialized ${totalInserted}/${progressRecords.length} progress records`);
            }
            
            return { 
                initialized: totalInserted, 
                skipped: 0 
            };
            
        } catch (error) {
            console.error('Error initializing missing user progress:', error);
            const handledError = handleError(error, 'initializeMissingUserProgress');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Get diagnostic information about missing card progress records
     * @param {string} userId - The user's ID
     * @returns {Promise<{totalCardTemplates: number, userProgressRecords: number, missingRecords: number}>}
     */
    async getDiagnosticInfo(userId) {
        try {
            validateUserId(userId, 'getting diagnostic info');
            
            const supabase = await this.getSupabase();
            
            // Count total card templates
            const { count: totalCardTemplates, error: templatesError } = await supabase
                .from('card_templates')
                .select('*', { count: 'exact', head: true });
                
            if (templatesError) throw templatesError;
            
            // Count user progress records
            const { count: userProgressRecords, error: progressError } = await supabase
                .from('user_cards')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
                
            if (progressError) throw progressError;
            
            const missingRecords = (totalCardTemplates || 0) - (userProgressRecords || 0);
            
            return {
                totalCardTemplates: totalCardTemplates || 0,
                userProgressRecords: userProgressRecords || 0,
                missingRecords: Math.max(0, missingRecords)
            };
            
        } catch (error) {
            console.error('Error getting diagnostic info:', error);
            const handledError = handleError(error, 'getDiagnosticInfo');
            throw new Error(handledError.userMessage);
        }
    }

    /**
     * Flags a card for admin review
     * @param {string} card_template_id - The card's ID
     * @param {string} reason - The reason for flagging ('incorrect', 'spelling', 'confusing', 'other')
     * @param {string} comment - Optional comment about the flag
     * @returns {Promise<boolean>} Success status
     */
    async flagCard(card_template_id, reason, comment = null) {
        try {
            // Validate inputs with enhanced security checks
            validateCardId(card_template_id, 'flagging card');
            validateFlagReason(reason, 'flagging card');
            const sanitizedComment = validateComment(comment, 500, 'flagging card');
            
            const supabase = await this.getSupabase();
            
            // Use the database function to flag the card with sanitized inputs
            const { data, error } = await supabase.rpc('flag_card_for_review', {
                p_card_template_id: card_template_id,
                p_reason: reason.trim().toLowerCase(),
                p_comment: sanitizedComment
            });

            if (error) {
                throw error;
            }

            return true;
        } catch (error) {
            // Handle specific flagging errors first
            if (error.message?.includes('already flagged')) {
                throw new Error('You have already flagged this card');
            } else if (error.message?.includes('Admin users should use')) {
                throw new Error('Admin users should use the admin interface for card management');
            }
            
            // Use centralized error handling for other errors
            const handledError = handleError(error, 'flagCard');
            throw new Error(handledError.userMessage);
            throw error;
        }
    }

    /**
     * Checks if current user has already flagged a card
     * @param {string} card_template_id - The card's ID
     * @returns {Promise<boolean>} Whether the card is already flagged by current user
     */
    async hasUserFlaggedCard(card_template_id) {
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
                .eq('card_template_id', card_template_id)
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
                .from('card_templates')
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
                .from('card_templates')
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
                .from('card_templates')
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
        return await this.withMobileRetry(async () => {
            return await this._submitBatchReviewsCore(sessionData);
        }, 'batch review submission');
    }

    async _submitBatchReviewsCore(sessionData) {
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
                const cardInSession = sessionData.cards.find(c => c.card_template_id === cardId);
                if (!cardInSession) continue;
                
                // Get deck_id by querying the card_templates table or existing user_cards record
                let deckId = null;
                try {
                    // First try to get deck_id from existing user_cards record
                    const { data: existingRecord } = await supabase
                        .from('user_cards')
                        .select('deck_id')
                        .eq('user_id', user.id)
                        .eq('card_template_id', cardId)
                        .single();
                    
                    if (existingRecord) {
                        deckId = existingRecord.deck_id;
                    } else {
                        // If no existing record, get deck_id from card_templates
                        const { data: cardTemplate } = await supabase
                            .from('card_templates')
                            .select('deck_id')
                            .eq('id', cardId)
                            .single();
                        
                        if (cardTemplate) {
                            deckId = cardTemplate.deck_id;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to get deck_id for card:', cardId, error);
                    continue; // Skip this card if we can't get deck_id
                }

                // Use existing progress or defaults for new cards
                
                const currentStability = parseFloat(cardInSession.stability) || 1.0;
                const currentDifficulty = parseFloat(cardInSession.difficulty) || 5.0;
                const currentState = cardInSession.state || 'new';
                
                
                // Calculate elapsed days since last review
                const lastReviewDate = cardInSession.last_reviewed_at;
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
                    console.log('🔍 Update function inputs:', JSON.stringify({
                        currentStability,
                        currentDifficulty,
                        rating: completingRating.rating,
                        elapsedDays,
                        fsrsParamsKeys: Object.keys(fsrsParams),
                        w0: fsrsParams.w0,
                        w1: fsrsParams.w1
                    }, null, 2));
                    
                    newStability = updateStability(currentStability, currentDifficulty, completingRating.rating, elapsedDays, fsrsParams);
                    newDifficulty = updateDifficulty(currentDifficulty, completingRating.rating, fsrsParams);
                    
                    console.log('🔍 Update function outputs:', JSON.stringify({
                        newStability,
                        newDifficulty
                    }, null, 2));
                }
                
                // Use FSRS scheduling for all ratings including "again"
                console.log('🔍 FSRS inputs:', {
                    newStability,
                    newDifficulty, 
                    rating: completingRating.rating,
                    currentState,
                    fsrsParams
                });
                
                const reviewResult = calculateNextReview(newStability, newDifficulty, completingRating.rating, fsrsParams, currentState);
                const nextReviewDate = reviewResult.nextReviewDate;
                
                console.log('🔍 FSRS result:', {
                    reviewResult,
                    nextReviewDate,
                    nextReviewDateValid: nextReviewDate instanceof Date && !isNaN(nextReviewDate.getTime())
                });

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
                    card_template_id: cardId,
                    deck_id: deckId,
                    stability: newStability,
                    difficulty: newDifficulty,
                    
                    last_reviewed_at: now,
                    due_at: nextReviewDate.toISOString(),
                    reps: (cardInSession.reps || 0) + totalReviews,
                    total_reviews: (cardInSession.total_reviews || 0) + totalReviews,
                    correct_reviews: (cardInSession.correct_reviews || 0) + correctReviews,
                    incorrect_reviews: (cardInSession.incorrect_reviews || 0) + incorrectReviews,
                    state: nextState,
                    last_rating: completingRating.rating,
                    lapses: (cardInSession.lapses || 0) + lapses,
                    updated_at: now
                });

                // Add review history records for each rating
                for (const rating of allRatings) {
                    reviewRecords.push({
                        user_id: user.id,
                        card_template_id: cardId,
                        deck_id: deckId,
                        rating: rating.rating,
                        response_time_ms: rating.responseTime,
                        stability_before: currentStability,
                        difficulty_before: currentDifficulty,
                        reps_before: cardInSession.reps || 0,
                        lapses_before: cardInSession.lapses || 0,
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
                .from('user_cards')
                .upsert(progressUpdates);

            if (progressError) throw progressError;

            // Insert review history records
            if (reviewRecords.length > 0) {
                const { error: reviewError } = await supabase
                    .from('reviews')
                    .insert(reviewRecords);

                if (reviewError) throw reviewError;
            }

            // Update daily review count (only for completed cards)
            if (completedCardCount > 0) {
                for (let i = 0; i < completedCardCount; i++) {
                    const { error: incrementError } = await supabase.rpc('increment_daily_reviews', {
                        p_user_id: user.id
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
                } catch (streakError) {
                    console.warn('Failed to update streak:', streakError);
                    // Don't fail the session if streak update fails
                }

                // Check if FSRS parameter optimization is needed after session completion
                try {
                    const optimizationStatus = await fsrsOptimizationService.checkOptimizationNeeded(user.id);
                    
                    if (optimizationStatus.shouldOptimize) {
                        // Trigger optimization in background (don't wait for completion)
                        fsrsOptimizationService.optimizeUserParameters(user.id, { conservative: true })
                            .then(result => {
                                if (result.success) {
                                    // Store optimization result for potential UI notification
                                    if (typeof window !== 'undefined') {
                                        window.fsrsOptimizationResult = {
                                            success: true,
                                            improvements: result.improvements,
                                            confidence: result.confidence,
                                            reviewsAnalyzed: result.reviewsAnalyzed
                                        };
                                    }
                                }
                            })
                            .catch(optimizationError => {
                                console.warn('FSRS optimization failed:', optimizationError);
                            });
                    }
                } catch (optimizationError) {
                    console.warn('Failed to check FSRS optimization:', optimizationError);
                    // Don't fail the session if optimization check fails
                }
            }

            return true;
        } catch (error) {
            console.error('Error submitting batch reviews:', error);
            const handledError = handleError(error, 'submitBatchReviews');
            throw new Error(handledError.userMessage);
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
            const handledError = handleError(error, 'loadUserFSRSParameters');
            throw new Error(handledError.userMessage);
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
            const handledError = handleError(error, 'updateUserFSRSParameters');
            throw new Error(handledError.userMessage);
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
            const handledError = handleError(error, 'initializeUserFSRSParameters');
            throw new Error(handledError.userMessage);
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
            
            
            // Check Portuguese cards
            const { data: cards, error: cardsError } = await supabase
                .from('card_templates')
                .select('id, question, subject_id, flagged_for_review')
                .eq('subject_id', subject.id);
            
            if (cardsError) {
                console.error('Cards error:', cardsError);
                return;
            }
            
            
            // Check user progress for Portuguese cards
            const { data: progress, error: progressError } = await supabase
                .from('user_cards')
                .select('card_template_id, state, due_at')
                .eq('user_id', userId)
                .in('card_template_id', cards?.map(c => c.id) || []);
            
            if (progressError) {
                console.error('Progress error:', progressError);
                return;
            }
            
            
            // Test the actual query used in getCardsDue
            const { data: dueTest, error: dueTestError } = await supabase
                .from('user_cards')
                .select(`
                    *,
                    card_templates!inner (
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
                .eq('card_templates.flagged_for_review', false)
                .eq('card_templates.subjects.is_active', true)
                .eq('card_templates.subjects.is_public', true)
                .eq('card_templates.subjects.name', 'Portuguese');
            
            if (dueTestError) {
                console.error('Due test error:', dueTestError);
                return;
            }
            
            
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
                .from('profiles')
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

    /**
     * Ensure user profile exists for the given user
     * @param {string} userId - The user's ID
     * @returns {Promise<void>}
     */
    async ensureUserProfileExists(userId) {
        try {
            const supabase = await this.getSupabase();
            
            // Check if user profile exists
            const { data: existingProfile, error: checkError } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', userId)
                .maybeSingle();
                
            if (checkError) {
                console.error('Error checking user profile:', checkError);
                return;
            }
            
            // If profile exists, we're done
            if (existingProfile) {
                return;
            }
            
            
            // Get user email from current auth session (safer than admin API)
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user || user.id !== userId) {
                console.error('Error getting authenticated user data:', userError);
                return;
            }
            
            const displayName = user.user_metadata?.display_name || 
                              user.email?.split('@')[0] || 
                              'User';
            
            // Create user profile
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    email: user.email,
                    display_name: displayName,
                    daily_new_cards_limit: 20,
                    daily_review_limit: 100
                });
                
            if (insertError) {
                console.error('❌ Error creating user profile:', insertError);
            }
            
        } catch (error) {
            console.error('Error in ensureUserProfileExists:', error);
        }
    }

    /**
     * Get a random loading message for loading states
     * @param {boolean} forceRefresh - Force cache refresh
     * @returns {Promise<string>} - Random loading message
     */
    async getRandomLoadingMessage(forceRefresh = false) {
        try {
            return await loadingMessagesService.getRandomMessage(forceRefresh);
        } catch (error) {
            console.error('Error getting random loading message:', error);
            return 'Generating your flashcards...'; // Fallback
        }
    }

    /**
     * Get a random loading message synchronously (from cache only)
     * @returns {string} - Random loading message
     */
    getRandomLoadingMessageSync() {
        try {
            return loadingMessagesService.getRandomMessageSync();
        } catch (error) {
            console.error('Error getting random loading message sync:', error);
            return 'Generating your flashcards...'; // Fallback
        }
    }

    /**
     * Test utility to verify cards are loading properly
     * @param {string} userId - The user's ID
     * @returns {Promise<Object>} Test results
     */
    async testCardLoading(userId) {
        try {
            console.log('🧪 Running card loading test...');
            
            // Get diagnostic info
            const diagnostics = await this.getDiagnosticInfo(userId);
            console.log('📊 Diagnostics:', diagnostics);
            
            // Try to get new cards
            const newCards = await this.getNewCards(userId, 10);
            console.log(`🃏 Found ${newCards ? newCards.length : 0} new cards`);
            if (newCards && newCards.length > 0) {
                console.log('🔍 Sample new card structure:', newCards[0]);
            }
            
            // Try to get due cards
            const dueCards = await this.getCardsDue(userId);
            console.log(`⏰ Found ${dueCards ? dueCards.length : 0} due cards`);
            if (dueCards && dueCards.length > 0) {
                console.log('🔍 Sample due card structure:', dueCards[0]);
            }
            
            return {
                diagnostics,
                newCardsCount: newCards ? newCards.length : 0,
                dueCardsCount: dueCards ? dueCards.length : 0,
                newCards: newCards ? newCards.slice(0, 3) : [], // Show first 3 for inspection
                success: true
            };
            
        } catch (error) {
            console.error('❌ Card loading test failed:', error);
            return {
                error: error.message,
                success: false
            };
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
        
        // Expose test function globally for easy debugging
        window.testCardLoading = async (userId) => {
            if (!userId && window.authService) {
                const user = await window.authService.getCurrentUser();
                userId = user?.id;
            }
            if (!userId) {
                console.error('No user ID provided and no current user found');
                return;
            }
            return await database.testCardLoading(userId);
        };
        
        window.getDiagnostics = async (userId) => {
            if (!userId && window.authService) {
                const user = await window.authService.getCurrentUser();
                userId = user?.id;
            }
            if (!userId) {
                console.error('No user ID provided and no current user found');
                return;
            }
            return await database.getDiagnosticInfo(userId);
        };
        
        window.initializeMissingCards = async (userId) => {
            if (!userId && window.authService) {
                const user = await window.authService.getCurrentUser();
                userId = user?.id;
            }
            if (!userId) {
                console.error('No user ID provided and no current user found');
                return;
            }
            return await database.initializeMissingUserProgress(userId);
        };
        
    } catch (error) {
        // Try again in 100ms if Supabase client isn't ready
        setTimeout(initDatabaseService, 100);
    }
}

document.addEventListener('DOMContentLoaded', initDatabaseService);

/**
 * Initialize progress records for a new user (DEPRECATED)
 * 
 * ⚠️  IMPORTANT: This function is deprecated as it doesn't handle the new
 *     composite primary key (user_id, card_template_id, deck_id) properly.
 * 
 *     Cards must now be added to specific decks. Use the database service's
 *     initializeUserProgress(user_id, card_template_id, deck_id) instead.
 * 
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 * @deprecated Use DatabaseService.initializeUserProgress(user_id, card_template_id, deck_id)
 */
async function initializeUserProgress(userId) {
    try {
        console.warn('initializeUserProgress standalone function is deprecated. Cards must be added to specific decks.');
        
        // This function can no longer work properly due to the composite primary key
        // requiring deck_id. New users should create cards within specific decks.
        
        // For backward compatibility, we could:
        // 1. Get the user's default deck
        // 2. Initialize cards in that deck
        // But this should be handled at a higher level in the application
        
        throw new Error('Card initialization requires a deck_id. Use the deck-based card creation flow instead.');

    } catch (error) {
        const handledError = handleError(error, 'initializeUserProgress_standalone');
        throw new Error(handledError.userMessage);
    }
}

/**
 * Get cards that are due for review for a specific user
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} - Array of due cards with their progress data
 */
async function getDueCards(userId) {
    try {
        
        const now = new Date().toISOString();
        
        // Get cards that are either:
        // 1. Due for review (due_at <= now)
        // 2. New cards (state = 'new')
        const { data, error } = await supabase
            .from('user_cards')
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
            .or(`due_at.lte.${now},state.eq.new`)
            .order('due_at', { ascending: true });

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            return [];
        }

        // Transform the data to a more usable format
        const dueCards = data.map(record => ({
            id: record.cards.id,
            question: record.card_templates.question,
            answer: record.card_templates.answer,
            subject_id: record.cards.subject_id,
            progress: {
                stability: record.stability,
                difficulty: record.difficulty,
                state: record.state,
                due_at: record.due_at,
                last_reviewed_at: record.last_reviewed_at,
                total_reviews: record.total_reviews
            }
        }));

        return dueCards;
    } catch (error) {
        const handledError = handleError(error, 'getDueCards_standalone');
        throw new Error(handledError.userMessage);
    }
}

// =============================================================================
// NEW SCHEMA METHODS - Updated for the rewritten database
// =============================================================================

/**
 * Get due cards using the new v_due_user_cards view
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of cards to fetch
 * @returns {Promise<Array>} Array of due cards
 */
async function getDueCardsFromView(userId, limit = 50) {
    try {
        validateUserId(userId, 'getting due cards from view');
        
        const supabase = await getSupabaseClient();
        
        const { data, error } = await supabase
            .from('v_due_user_cards')
            .select('*')
            .eq('user_id', userId)
            .order('overdue_seconds', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        const handledError = handleError(error, 'getDueCardsFromView');
        throw new Error(handledError.userMessage);
    }
}

/**
 * Get new cards using the new v_new_user_cards view
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of cards to fetch
 * @returns {Promise<Array>} Array of new cards
 */
async function getNewCardsFromView(userId, limit = 20) {
    try {
        validateUserId(userId, 'getting new cards from view');
        
        const supabase = await getSupabaseClient();
        
        const { data, error } = await supabase
            .from('v_new_user_cards')
            .select('*')
            .eq('user_id', userId)
            .order('added_at', { ascending: true })
            .limit(limit);
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        const handledError = handleError(error, 'getNewCardsFromView');
        throw new Error(handledError.userMessage);
    }
}


/**
 * Get random loading message from new loading_messages table
 * @param {string} context - Context for message selection
 * @returns {Promise<string>} Loading message
 */
async function getRandomLoadingMessage(context = 'general') {
    try {
        const supabase = await getSupabaseClient();
        
        const { data, error } = await supabase.rpc('get_random_loading_message', {
            p_context: context
        });
        
        if (error) {
            console.warn('Failed to get random loading message:', error);
            return 'Loading your study session...';
        }
        
        return data && data.length > 0 ? data[0].message : 'Loading your study session...';
        
    } catch (error) {
        console.warn('Error getting random loading message:', error);
        return 'Loading your study session...';
    }
}

/**
 * Get random loading message synchronously (cached version)
 * @returns {string} Loading message
 */
function getRandomLoadingMessageSync() {
    // This should be populated by the loadingMessages service
    const cachedMessages = window.cachedLoadingMessages || [
        'Loading your study session...',
        'Preparing your flashcards...',
        'Getting your next cards ready...',
        'Optimizing your learning schedule...',
        'Generating your study session...'
    ];
    
    const randomIndex = Math.floor(Math.random() * cachedMessages.length);
    return cachedMessages[randomIndex];
}

// Export utility functions
export {
    getDueCards,
    initializeUserProgress
}; 