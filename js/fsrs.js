/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
 * Full implementation with parameter support
 */

// Constants for FSRS calculations - Updated to 0-3 scale (standard FSRS)
const RATING = {
    AGAIN: 0,
    HARD: 1,
    GOOD: 2,
    EASY: 3
};

// Card states - matching database card_state ENUM exactly
const CARD_STATE = {
    NEW: 'new',
    LEARNING: 'learning',
    REVIEW: 'review',
    RELEARNING: 'relearning',
    BURIED: 'buried',
    SUSPENDED: 'suspended'
};

// FSRS algorithm constants
const FSRS_CONSTANTS = {
    FACTOR: 19/81,  // F = 19/81 (from FSRS paper)
    DECAY: -0.5,    // C = -0.5 (exponential decay constant)
    DESIRED_RETENTION: 0.9  // Default desired retention rate
};

// Default parameters (used as fallback) - All 19 FSRS parameters
// Updated to match DATABASE_STRUCTURE.md defaults for modern FSRS
const DEFAULT_PARAMS = {
    // Modern FSRS weights (w0-w18) - matching database defaults
    w0: 0.4872, w1: 1.4003, w2: 3.1145, w3: 15.69, w4: 7.1434,
    w5: 0.6477, w6: 1.0007, w7: 0.0674, w8: 1.6597, w9: 0.1712,
    w10: 1.1178, w11: 2.0225, w12: 0.0904, w13: 0.3025, w14: 2.1214,
    w15: 0.2498, w16: 2.9466, w17: 0.4891, w18: 0.6468,
    
    // Learning configuration - matching database defaults
    learning_steps_minutes: [1, 10],
    graduating_interval_days: 1,
    easy_interval_days: 4,
    maximum_interval_days: 36500, // ~100 years
    minimum_interval_days: 1,
    
    // Relearning configuration - matching fsrs_params table
    relearning_steps_minutes: [10],
    minimum_relearning_interval_days: 1,
    
    // Lapse configuration - matching fsrs_params table
    lapse_minimum_interval_days: 1,
    lapse_multiplier: 0.5,
    
    // Retention configuration - matching database precision (4,3)
    desired_retention: 0.900 // 90% retention as DECIMAL(4,3)
};

/**
 * Calculate retrievability based on elapsed time and stability
 * Formula: R(t) = (1 + F * (t/S))^C where F = 19/81, C = -0.5
 * @param {number} elapsedTime - Time elapsed since last review (in days)
 * @param {number} stability - Current stability value
 * @returns {number} Retrievability (0-1)
 */
function calculateRetrievability(elapsedTime, stability) {
    if (stability <= 0) return 0;
    return Math.pow(1 + FSRS_CONSTANTS.FACTOR * (elapsedTime / stability), FSRS_CONSTANTS.DECAY);
}

/**
 * Calculate stability for new cards based on rating
 * @param {number} rating - User rating (0-3)
 * @param {Object} params - FSRS parameters
 * @returns {number} Initial stability
 */
function calculateInitialStability(rating, params = DEFAULT_PARAMS) {
    const w0 = typeof params.w0 === 'number' && !isNaN(params.w0) ? params.w0 : DEFAULT_PARAMS.w0;
    const w1 = typeof params.w1 === 'number' && !isNaN(params.w1) ? params.w1 : DEFAULT_PARAMS.w1;
    const w12 = typeof params.w12 === 'number' && !isNaN(params.w12) ? params.w12 : DEFAULT_PARAMS.w12;
    return Math.max(w12, w0 + w1 * (rating - 2));
}

/**
 * Calculate difficulty for new cards based on rating
 * @param {number} rating - User rating (0-3)
 * @param {Object} params - FSRS parameters
 * @returns {number} Initial difficulty
 */
function calculateInitialDifficulty(rating, params = DEFAULT_PARAMS) {
    const w4 = typeof params.w4 === 'number' && !isNaN(params.w4) ? params.w4 : DEFAULT_PARAMS.w4;
    const w5 = typeof params.w5 === 'number' && !isNaN(params.w5) ? params.w5 : DEFAULT_PARAMS.w5;
    const w14 = typeof params.w14 === 'number' && !isNaN(params.w14) ? params.w14 : DEFAULT_PARAMS.w14;
    const w15 = typeof params.w15 === 'number' && !isNaN(params.w15) ? params.w15 : DEFAULT_PARAMS.w15;
    
    const difficulty = w4 - (rating - 2) * w5;
    return Math.min(Math.max(w14, difficulty), w15);
}

/**
 * Calculate the next review interval based on stability and desired retention
 * Formula: I(R_d) = (S / F) * (R_d^(1/C) - 1) where F = 19/81, C = -0.5
 * @param {number} stability - Current stability value
 * @param {number} desiredRetention - Desired retention rate (0-1)
 * @param {Object} params - FSRS parameters
 * @returns {number} Interval in days
 */
function calculateInterval(stability, desiredRetention = null, params = DEFAULT_PARAMS) {
    const minInterval = params.minimum_interval_days || DEFAULT_PARAMS.minimum_interval_days;
    const maxInterval = params.maximum_interval_days || DEFAULT_PARAMS.maximum_interval_days;
    
    if (stability <= 0) return minInterval;
    
    const retention = desiredRetention || params.desired_retention || DEFAULT_PARAMS.desired_retention;
    
    // I(R_d) = (S / F) * (R_d^(1/C) - 1)
    const interval = (stability / FSRS_CONSTANTS.FACTOR) * (Math.pow(retention, 1 / FSRS_CONSTANTS.DECAY) - 1);
    
    return Math.min(Math.max(minInterval, Math.round(interval)), maxInterval);
}

/**
 * Calculate the next review date based on current stability, difficulty, and rating
 * @param {number} stability - Current stability value
 * @param {number} difficulty - Current difficulty value (1.0 to 10.0)
 * @param {number} rating - User rating (0-3)
 * @param {Object} params - FSRS parameters
 * @param {string} state - Current card state
 * @returns {Object} - Next review date and updated metrics
 */
function calculateNextReview(stability, difficulty, rating, params = DEFAULT_PARAMS, state = CARD_STATE.REVIEW) {
    // Validate inputs - add fallback values to prevent NaN
    const w12 = typeof params.w12 === 'number' && !isNaN(params.w12) ? params.w12 : DEFAULT_PARAMS.w12;
    const w14 = typeof params.w14 === 'number' && !isNaN(params.w14) ? params.w14 : DEFAULT_PARAMS.w14;
    const w15 = typeof params.w15 === 'number' && !isNaN(params.w15) ? params.w15 : DEFAULT_PARAMS.w15;
    const desired_retention = typeof params.desired_retention === 'number' && !isNaN(params.desired_retention) ? params.desired_retention : DEFAULT_PARAMS.desired_retention;
    
    stability = Math.max(w12, stability);
    difficulty = Math.min(Math.max(w14, difficulty), w15);
    
    // Calculate interval based on stability and desired retention
    const interval = calculateInterval(stability, desired_retention, params);
    
    // Calculate next review date
    const now = new Date();
    const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    
    return {
        nextReviewDate: nextReview,
        interval: interval,
        stability: stability,
        difficulty: difficulty,
        scheduledDays: interval // Add this for database compatibility
    };
}

/**
 * Update stability based on current value, difficulty, rating, and elapsed time
 * Uses the correct FSRS stability update formulas
 * @param {number} currentStability - Current stability value
 * @param {number} difficulty - Current difficulty value
 * @param {number} rating - User rating (0-3)
 * @param {number} elapsedDays - Days since last review
 * @param {Object} params - FSRS parameters
 * @returns {number} - Updated stability value
 */
function updateStability(currentStability, difficulty, rating, elapsedDays = 0, params = DEFAULT_PARAMS) {
    console.log('🔍 updateStability called with:', { currentStability, difficulty, rating, elapsedDays });
    console.log('🔍 updateStability params check:', { w12: params.w12, w13: params.w13, w14: params.w14, w15: params.w15 });
    
    // Validate inputs - use modern FSRS defaults
    const w8 = typeof params.w8 === 'number' && !isNaN(params.w8) ? params.w8 : DEFAULT_PARAMS.w8;
    const w9 = typeof params.w9 === 'number' && !isNaN(params.w9) ? params.w9 : DEFAULT_PARAMS.w9;
    const w10 = typeof params.w10 === 'number' && !isNaN(params.w10) ? params.w10 : DEFAULT_PARAMS.w10;
    const w11 = typeof params.w11 === 'number' && !isNaN(params.w11) ? params.w11 : DEFAULT_PARAMS.w11;
    const w12 = typeof params.w12 === 'number' && !isNaN(params.w12) ? params.w12 : DEFAULT_PARAMS.w12;
    const w13 = typeof params.w13 === 'number' && !isNaN(params.w13) ? params.w13 : DEFAULT_PARAMS.w13;
    const w14 = typeof params.w14 === 'number' && !isNaN(params.w14) ? params.w14 : DEFAULT_PARAMS.w14;
    const w15 = typeof params.w15 === 'number' && !isNaN(params.w15) ? params.w15 : DEFAULT_PARAMS.w15;
    const w16 = typeof params.w16 === 'number' && !isNaN(params.w16) ? params.w16 : DEFAULT_PARAMS.w16;
    
    currentStability = Math.max(w12, currentStability);
    difficulty = Math.min(Math.max(w14, difficulty), w15);
    elapsedDays = Math.max(0, elapsedDays);
    
    console.log('🔍 updateStability validated inputs:', { currentStability, difficulty, rating, elapsedDays });
    
    // Calculate retrievability based on elapsed time
    const retrievability = elapsedDays > 0 ? calculateRetrievability(elapsedDays, currentStability) : 0.9;
    
    // FSRS stability update formulas based on rating
    let newStability;
    
    if (rating === RATING.AGAIN) {
        // Failed review - stability decrease
        // S' = S * w11 * (1 - retrievability) * ((11 - difficulty) / 10)
        newStability = currentStability * w11 * (1 - retrievability) * ((11 - difficulty) / 10);
    } else {
        // Successful review - stability increase
        // Base stability increase factor
        const stabilityIncrease = Math.exp(w8) * 
            (11 - difficulty) * 
            Math.pow(currentStability, w9) * 
            (Math.exp(w10 * (1 - retrievability)) - 1);
        
        // Rating-specific multipliers
        let ratingMultiplier;
        switch (rating) {
            case RATING.HARD: // 1
                ratingMultiplier = w15;
                break;
            case RATING.GOOD: // 2
                ratingMultiplier = 1;
                break;
            case RATING.EASY: // 3
                ratingMultiplier = w16;
                break;
            default:
                ratingMultiplier = 1;
        }
        
        newStability = currentStability + stabilityIncrease * ratingMultiplier;
    }
    
    // Apply stability bounds
    const result = Math.min(Math.max(w12, newStability), w13);
    console.log('🔍 updateStability result:', result);
    return result;
}

/**
 * Update difficulty based on current value and rating
 * @param {number} currentDifficulty - Current difficulty value
 * @param {number} rating - User rating (0-3)
 * @param {Object} params - FSRS parameters
 * @returns {number} - Updated difficulty value
 */
function updateDifficulty(currentDifficulty, rating, params = DEFAULT_PARAMS) {
    console.log('🔍 updateDifficulty called with:', { currentDifficulty, rating });
    console.log('🔍 updateDifficulty params check:', { w14: params.w14, w15: params.w15, w6: params.w6 });
    
    // Validate inputs - use modern FSRS defaults
    const w6 = typeof params.w6 === 'number' && !isNaN(params.w6) ? params.w6 : DEFAULT_PARAMS.w6;
    const w14 = typeof params.w14 === 'number' && !isNaN(params.w14) ? params.w14 : DEFAULT_PARAMS.w14;
    const w15 = typeof params.w15 === 'number' && !isNaN(params.w15) ? params.w15 : DEFAULT_PARAMS.w15;
    
    currentDifficulty = Math.min(Math.max(w14, currentDifficulty), w15);
    
    // FSRS difficulty update formula using correct parameter w6
    const difficultyAdjustment = w6 * (rating - 2);
    const newDifficulty = currentDifficulty + difficultyAdjustment;
    
    // Apply difficulty bounds
    const result = Math.min(Math.max(w14, newDifficulty), w15);
    console.log('🔍 updateDifficulty result:', result);
    return result;
}

// Export functions for use in other modules
export {
    RATING,
    CARD_STATE,
    DEFAULT_PARAMS,
    FSRS_CONSTANTS,
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