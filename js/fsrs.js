/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
 * Full implementation with parameter support
 */

// Constants for FSRS calculations
const RATING = {
    AGAIN: 1,
    HARD: 2,
    GOOD: 3,
    EASY: 4
};

// Card states
const CARD_STATE = {
    NEW: 'new',
    LEARNING: 'learning',
    REVIEW: 'review',
    RELEARNING: 'relearning'
};

// Default parameters (used as fallback)
const DEFAULT_PARAMS = {
    w0: 0.4197, w1: 1.1829, w2: 3.1262, w3: 15.4722, w4: 7.2102,
    w5: 0.5316, w6: 1.0651, w7: 0.0234, w8: 1.616, w9: 0.0721,
    w10: 0.1284, w11: 1.0824, w12: 0.0, w13: 100.0, w14: 1.0,
    w15: 10.0, w16: 2.9013,
    learning_steps_minutes: [1, 10],
    graduating_interval_days: 1,
    easy_interval_days: 4,
    maximum_interval_days: 36500,
    minimum_interval_days: 1
};

/**
 * Calculate retrievability based on elapsed time and stability
 * @param {number} elapsedTime - Time elapsed since last review (in days)
 * @param {number} stability - Current stability value
 * @returns {number} Retrievability (0-1)
 */
function calculateRetrievability(elapsedTime, stability) {
    return Math.pow(1 + elapsedTime / (9 * stability), -1);
}

/**
 * Calculate stability for new cards based on rating
 * @param {number} rating - User rating (1-4)
 * @param {Object} params - FSRS parameters
 * @returns {number} Initial stability
 */
function calculateInitialStability(rating, params = DEFAULT_PARAMS) {
    return Math.max(params.w12, params.w0 + params.w1 * (rating - 3));
}

/**
 * Calculate difficulty for new cards based on rating
 * @param {number} rating - User rating (1-4)
 * @param {Object} params - FSRS parameters
 * @returns {number} Initial difficulty
 */
function calculateInitialDifficulty(rating, params = DEFAULT_PARAMS) {
    const difficulty = params.w4 - (rating - 3) * params.w5;
    return Math.min(Math.max(params.w14, difficulty), params.w15);
}

/**
 * Calculate the next review interval based on stability
 * @param {number} stability - Current stability value
 * @param {Object} params - FSRS parameters
 * @returns {number} Interval in days
 */
function calculateInterval(stability, params = DEFAULT_PARAMS) {
    const interval = stability * 9;
    return Math.min(Math.max(params.minimum_interval_days, Math.round(interval)), params.maximum_interval_days);
}

/**
 * Calculate the next review date based on current stability, difficulty, and rating
 * @param {number} stability - Current stability value
 * @param {number} difficulty - Current difficulty value (1.0 to 10.0)
 * @param {number} rating - User rating (1-4)
 * @param {Object} params - FSRS parameters
 * @param {string} state - Current card state
 * @returns {Object} - Next review date and updated metrics
 */
function calculateNextReview(stability, difficulty, rating, params = DEFAULT_PARAMS, state = CARD_STATE.REVIEW) {
    // Validate inputs
    stability = Math.max(params.w12 || 0.1, stability);
    difficulty = Math.min(Math.max(params.w14, difficulty), params.w15);
    
    // Calculate interval based on stability
    const interval = calculateInterval(stability, params);
    
    // Calculate next review date
    const now = new Date();
    const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    
    return {
        nextReviewDate: nextReview,
        interval: interval,
        stability: stability,
        difficulty: difficulty
    };
}

/**
 * Update stability based on current value, difficulty, rating, and elapsed time
 * @param {number} currentStability - Current stability value
 * @param {number} difficulty - Current difficulty value
 * @param {number} rating - User rating (1-4)
 * @param {number} elapsedDays - Days since last review
 * @param {Object} params - FSRS parameters
 * @returns {number} - Updated stability value
 */
function updateStability(currentStability, difficulty, rating, elapsedDays = 0, params = DEFAULT_PARAMS) {
    // Validate inputs
    currentStability = Math.max(params.w12 || 0.1, currentStability);
    difficulty = Math.min(Math.max(params.w14, difficulty), params.w15);
    elapsedDays = Math.max(0, elapsedDays);
    
    // Calculate retrievability if elapsed time is available
    const retrievability = elapsedDays > 0 ? calculateRetrievability(elapsedDays, currentStability) : 0.9;
    
    // FSRS stability update formula
    let newStability;
    
    if (rating === RATING.AGAIN) {
        // Failed review - significant stability decrease
        newStability = currentStability * Math.exp(params.w11) * (
            Math.pow(difficulty, params.w5) * 
            Math.pow(currentStability, params.w6) * 
            Math.exp(-params.w7 * elapsedDays)
        ) * params.w10;
    } else {
        // Successful review - stability increase based on rating
        const difficultyFactor = Math.pow(difficulty, params.w5);
        const stabilityFactor = Math.pow(currentStability, params.w6);
        const timeFactor = Math.exp(-params.w7 * elapsedDays);
        
        switch (rating) {
            case RATING.HARD:
                newStability = currentStability * (1 + params.w1 * difficultyFactor * stabilityFactor * timeFactor * params.w9);
                break;
            case RATING.GOOD:
                newStability = currentStability * (1 + params.w1 * difficultyFactor * stabilityFactor * timeFactor);
                break;
            case RATING.EASY:
                newStability = currentStability * (1 + params.w1 * difficultyFactor * stabilityFactor * timeFactor * params.w8);
                break;
            default:
                newStability = currentStability;
        }
    }
    
    // Apply stability bounds
    return Math.min(Math.max(params.w12 || 0.1, newStability), params.w13);
}

/**
 * Update difficulty based on current value and rating
 * @param {number} currentDifficulty - Current difficulty value
 * @param {number} rating - User rating (1-4)
 * @param {Object} params - FSRS parameters
 * @returns {number} - Updated difficulty value
 */
function updateDifficulty(currentDifficulty, rating, params = DEFAULT_PARAMS) {
    // Validate inputs
    currentDifficulty = Math.min(Math.max(params.w14, currentDifficulty), params.w15);
    
    // FSRS difficulty update formula
    const difficultyAdjustment = params.w16 * (rating - 3);
    const newDifficulty = currentDifficulty + difficultyAdjustment;
    
    // Apply difficulty bounds and decay
    const boundedDifficulty = Math.min(Math.max(params.w14, newDifficulty), params.w15);
    
    // Apply difficulty decay (makes difficulty gradually decrease over time)
    return boundedDifficulty - params.w11 * (boundedDifficulty - params.w14) * 0.01;
}

// Export functions for use in other modules
export {
    RATING,
    CARD_STATE,
    DEFAULT_PARAMS,
    calculateRetrievability,
    calculateInitialStability,
    calculateInitialDifficulty,
    calculateInterval,
    calculateNextReview,
    updateStability,
    updateDifficulty
};

/* Unit Tests (as comments for reference)
test('calculateNextReview', () => {
    const params = DEFAULT_PARAMS;
    const result = calculateNextReview(1.0, 5.0, RATING.GOOD, params);
    expect(result.interval).toBeGreaterThan(0);
    expect(result.nextReviewDate).toBeInstanceOf(Date);
});

test('updateStability', () => {
    const params = DEFAULT_PARAMS;
    expect(updateStability(1.0, 5.0, RATING.AGAIN, 1, params)).toBeGreaterThan(0);
    expect(updateStability(2.0, 5.0, RATING.GOOD, 1, params)).toBeGreaterThan(2.0);
    expect(updateStability(2.0, 5.0, RATING.HARD, 1, params)).toBeLessThan(updateStability(2.0, 5.0, RATING.GOOD, 1, params));
});

test('updateDifficulty', () => {
    const params = DEFAULT_PARAMS;
    expect(updateDifficulty(5.0, RATING.AGAIN, params)).toBeGreaterThan(5.0);
    expect(updateDifficulty(5.0, RATING.EASY, params)).toBeLessThan(5.0);
    expect(updateDifficulty(1.0, RATING.HARD, params)).toBeGreaterThanOrEqual(params.w14);
    expect(updateDifficulty(10.0, RATING.AGAIN, params)).toBeLessThanOrEqual(params.w15);
});

test('calculateInitialStability', () => {
    const params = DEFAULT_PARAMS;
    expect(calculateInitialStability(RATING.GOOD, params)).toBeGreaterThan(0);
    expect(calculateInitialStability(RATING.EASY, params)).toBeGreaterThan(calculateInitialStability(RATING.HARD, params));
});
*/ 