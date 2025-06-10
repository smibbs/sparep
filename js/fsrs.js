/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm Implementation
 * Simplified version for MVP
 */

// Constants for FSRS calculations
const RATING = {
    AGAIN: 1,
    HARD: 2,
    GOOD: 3,
    EASY: 4
};

// Base intervals for each rating (in days)
const BASE_INTERVALS = {
    [RATING.AGAIN]: 1,
    [RATING.HARD]: 2,
    [RATING.GOOD]: 3,
    [RATING.EASY]: 4
};

/**
 * Calculate the next review date based on current stability, difficulty, and rating
 * @param {number} stability - Current stability value (1.0 to infinity)
 * @param {number} difficulty - Current difficulty value (1.0 to 10.0)
 * @param {number} rating - User rating (1-4)
 * @returns {Object} - Next review date and updated metrics
 */
function calculateNextReview(stability, difficulty, rating) {
    // Validate inputs
    stability = Math.max(1.0, stability);
    difficulty = Math.min(Math.max(1.0, difficulty), 10.0);
    
    // Calculate retrievability decay (simplified for MVP)
    const interval = BASE_INTERVALS[rating] * stability;
    
    // Calculate next review date
    const now = new Date();
    const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    
    return {
        nextReviewDate: nextReview,
        interval: interval
    };
}

/**
 * Update stability based on current value and rating
 * @param {number} currentStability - Current stability value
 * @param {number} rating - User rating (1-4)
 * @returns {number} - Updated stability value
 */
function updateStability(currentStability, rating) {
    // Validate inputs
    currentStability = Math.max(1.0, currentStability);
    
    // Stability multipliers for each rating
    const stabilityMultipliers = {
        [RATING.AGAIN]: 0.5,  // Decrease stability
        [RATING.HARD]: 0.8,   // Slightly decrease stability
        [RATING.GOOD]: 1.2,   // Increase stability
        [RATING.EASY]: 1.5    // Significantly increase stability
    };
    
    // Calculate new stability
    const newStability = currentStability * stabilityMultipliers[rating];
    
    // Ensure stability doesn't go below 1.0
    return Math.max(1.0, newStability);
}

/**
 * Update difficulty based on current value and rating
 * @param {number} currentDifficulty - Current difficulty value
 * @param {number} rating - User rating (1-4)
 * @returns {number} - Updated difficulty value
 */
function updateDifficulty(currentDifficulty, rating) {
    // Validate inputs
    currentDifficulty = Math.min(Math.max(1.0, currentDifficulty), 10.0);
    
    // Difficulty adjustments for each rating
    const difficultyAdjustments = {
        [RATING.AGAIN]: 1.2,  // Increase difficulty
        [RATING.HARD]: 1.1,   // Slightly increase difficulty
        [RATING.GOOD]: 0.9,   // Slightly decrease difficulty
        [RATING.EASY]: 0.8    // Decrease difficulty
    };
    
    // Calculate new difficulty
    const newDifficulty = currentDifficulty * difficultyAdjustments[rating];
    
    // Ensure difficulty stays within bounds
    return Math.min(Math.max(1.0, newDifficulty), 10.0);
}

// Export functions for use in other modules
export {
    RATING,
    calculateNextReview,
    updateStability,
    updateDifficulty
};

/* Unit Tests (as comments for reference)
test('calculateNextReview', () => {
    const result = calculateNextReview(1.0, 5.0, RATING.GOOD);
    expect(result.interval).toBe(3);
    expect(result.nextReviewDate).toBeInstanceOf(Date);
});

test('updateStability', () => {
    expect(updateStability(1.0, RATING.AGAIN)).toBe(1.0);  // Can't go below 1.0
    expect(updateStability(2.0, RATING.GOOD)).toBe(2.4);   // Should increase
    expect(updateStability(2.0, RATING.HARD)).toBe(1.6);   // Should decrease
});

test('updateDifficulty', () => {
    expect(updateDifficulty(5.0, RATING.AGAIN)).toBe(6.0);  // Should increase
    expect(updateDifficulty(5.0, RATING.EASY)).toBe(4.0);   // Should decrease
    expect(updateDifficulty(1.0, RATING.HARD)).toBe(1.1);   // Should stay within bounds
    expect(updateDifficulty(10.0, RATING.AGAIN)).toBe(10.0); // Can't exceed 10.0
});
*/ 