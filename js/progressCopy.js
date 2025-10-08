/**
 * Progress Copy Module
 * Generates motivational, user-friendly copy for progress metrics
 * All copy is celebratory and frames challenges as opportunities
 */

/**
 * Generate copy for retention rate KPI
 * @param {number} current - Current retention percentage
 * @param {number} delta - Change from previous period
 * @param {number} days - Time window in days
 * @returns {string}
 */
export function getRetentionCopy(current, delta, days = 7) {
    const period = days === 7 ? 'week' : days === 30 ? 'month' : `${days} days`;

    if (delta > 0) {
        return `Your ${days}-day retention is <strong>${current}%</strong> — <strong>+${delta} pts</strong> vs last ${period}. Nice work.`;
    } else if (delta < 0) {
        return `Your ${days}-day retention is <strong>${current}%</strong> — <strong>${delta} pts</strong> vs last ${period}. Small adjustments ahead.`;
    } else {
        return `Your ${days}-day retention is <strong>${current}%</strong> — steady and consistent.`;
    }
}

/**
 * Generate copy for streak KPI
 * @param {number} streak - Current streak in days
 * @returns {string}
 */
export function getStreakCopy(streak) {
    if (streak === 0) {
        return `Start a new streak today — one session is all it takes.`;
    } else if (streak === 1) {
        return `🔥 <strong>1-day streak!</strong> Come back tomorrow to keep it alive.`;
    } else if (streak < 7) {
        return `🔥 <strong>${streak}-day streak!</strong> You're building a habit. One quick session tomorrow keeps it alive.`;
    } else if (streak < 30) {
        return `🔥 <strong>${streak}-day streak!</strong> Impressive consistency. Keep the chain going.`;
    } else {
        return `🔥 <strong>${streak}-day streak!</strong> Extraordinary dedication. This is who you are now.`;
    }
}

/**
 * Generate copy for response time KPI
 * @param {number} current - Current median response time in seconds
 * @param {number} delta - Change from previous period
 * @param {number} days - Time window in days
 * @returns {string}
 */
export function getResponseTimeCopy(current, delta, days = 7) {
    if (delta < 0) {
        const improvement = Math.abs(delta);
        return `⚡ Faster recall: <strong>${improvement}s quicker</strong> than last ${days === 7 ? 'week' : 'month'}. Smoother connections.`;
    } else if (delta > 0) {
        return `Response time: <strong>${current}s</strong> (up ${delta}s). Taking a bit longer — totally normal as difficulty increases.`;
    } else {
        return `⚡ Steady response time: <strong>${current}s</strong> — consistent pace.`;
    }
}

/**
 * Generate copy for stability KPI
 * @param {number} current - Current average stability
 * @param {number} previous - Previous average stability
 * @param {number} delta - Change from previous period
 * @returns {string}
 */
export function getStabilityCopy(current, previous, delta) {
    if (previous === 0 || current === 0) {
        return `Building memory strength — keep reviewing to see gains.`;
    }

    const ratio = (current / previous).toFixed(1);

    if (delta > 0) {
        return `Memories last <strong>${ratio}×</strong> longer than last month — brilliant pacing.`;
    } else if (delta < 0) {
        return `Average stability: <strong>${current}</strong> days. Small dip — keep going to rebuild strength.`;
    } else {
        return `Stable memory strength: <strong>${current}</strong> days between reviews.`;
    }
}

/**
 * Generate copy for study velocity KPI
 * @param {number} current - Current velocity (cards/day)
 * @param {number} delta - Change from previous period
 * @returns {string}
 */
export function getStudyVelocityCopy(current, delta) {
    if (current === 0) {
        return `Start a session to build momentum.`;
    }

    const sign = delta > 0 ? '+' : '';
    const absDelta = Math.abs(delta);

    if (delta > 0) {
        return `⚡ <strong>${current} cards/day</strong> — up <strong>${sign}${absDelta}</strong> from last week. Strong momentum!`;
    } else if (delta === 0) {
        return `Consistent <strong>${current} cards/day</strong> — steady rhythm.`;
    } else {
        // Slight drop - frame positively
        return `Pace: <strong>${current} cards/day</strong> (down ${absDelta}). Quick session to rebuild momentum?`;
    }
}

/**
 * Generate copy for due cards KPI
 * @param {number} count - Number of cards due
 * @param {number} estimatedMinutes - Estimated time in minutes
 * @returns {string}
 */
export function getDueTomorrowCopy(count, estimatedMinutes) {
    if (count === 0) {
        return `<strong>0</strong> due tomorrow — you're ahead! Nice work.`;
    } else if (count <= 5) {
        return `<strong>${count}</strong> due tomorrow — quick ${estimatedMinutes}-min session keeps you ahead.`;
    } else if (count <= 20) {
        return `<strong>${count}</strong> due tomorrow — ~${estimatedMinutes} mins will keep you comfortably ahead.`;
    } else {
        return `<strong>${count}</strong> due tomorrow — ~${estimatedMinutes} mins. Break it into chunks if needed.`;
    }
}

/**
 * Generate copy for retention trend chart
 * @param {Array} data - Retention over time data
 * @param {number} days - Time window
 * @returns {string}
 */
export function getRetentionTrendCopy(data, days = 14) {
    if (!data || data.length < 2) {
        return `Do your first 10 cards to unlock retention insights.`;
    }

    const first = data[0].retention;
    const last = data[data.length - 1].retention;
    const delta = last - first;

    if (delta > 5) {
        return `Your retention trend is <strong>↑ +${delta} pts</strong> over the last ${days} days. Excellent progress.`;
    } else if (delta < -5) {
        return `Your retention trend is <strong>↓ ${delta} pts</strong> over the last ${days} days. Time to focus on weak areas.`;
    } else {
        return `Your retention is holding steady around <strong>${last}%</strong> — consistent performance.`;
    }
}

/**
 * Generate copy for due forecast
 * @param {Array} data - Due forecast data
 * @param {number} days - Forecast window
 * @returns {string}
 */
export function getDueForecastCopy(data, days = 7) {
    if (!data || data.length === 0) {
        return `No cards due in the next ${days} days — you're all caught up!`;
    }

    const total = data.reduce((sum, d) => sum + d.count, 0);
    const avgPerDay = Math.round(total / days);
    const minutesPerDay = Math.ceil(avgPerDay * 5 / 60); // Estimate 5s per card

    if (total === 0) {
        return `<strong>0</strong> cards due in the next ${days} days — you're ahead!`;
    } else if (avgPerDay <= 10) {
        return `<strong>${total}</strong> cards due next ${days} days. Light load — ~${minutesPerDay} min/day keeps you ahead.`;
    } else {
        return `<strong>${total}</strong> cards due next ${days} days. ~${minutesPerDay} min/day keeps you comfortably ahead.`;
    }
}

/**
 * Generate copy for focus/weakness identification
 * @param {Array} subjectData - Difficulty-accuracy data by subject
 * @returns {string}
 */
export function getFocusCopy(subjectData) {
    if (!subjectData || subjectData.length === 0) {
        return `Keep studying to identify focus areas.`;
    }

    // Find highest difficulty + lowest accuracy
    const weakest = subjectData
        .filter(s => s.accuracy < 80)
        .sort((a, b) => (b.avgDifficulty - a.avgDifficulty))
        [0];

    if (weakest) {
        return `Quick win: <strong>${weakest.subjectName}</strong> needs attention (${weakest.accuracy}% accuracy). Tap to start a focused review.`;
    }

    return `All subjects looking strong — keep up the balanced practice.`;
}

/**
 * Generate copy for session rating summary
 * @param {number} percentGoodEasy - Percentage of Good+Easy ratings
 * @returns {string}
 */
export function getSessionRatingCopy(percentGoodEasy) {
    if (percentGoodEasy >= 80) {
        return `Great run — <strong>${percentGoodEasy}%</strong> Good/Easy today. You're in the zone.`;
    } else if (percentGoodEasy >= 60) {
        return `Solid session — <strong>${percentGoodEasy}%</strong> Good/Easy. Steady progress.`;
    } else if (percentGoodEasy >= 40) {
        return `Challenging session — <strong>${percentGoodEasy}%</strong> Good/Easy. Building strength.`;
    } else {
        return `Tough session — <strong>${percentGoodEasy}%</strong> Good/Easy. These reps count double.`;
    }
}

/**
 * Generate copy for subject mastery
 * @param {string} subjectName - Name of subject
 * @param {number} accuracy - Accuracy percentage
 * @param {number} previousAccuracy - Previous accuracy (if available)
 * @returns {string}
 */
export function getSubjectMasteryCopy(subjectName, accuracy, previousAccuracy = null) {
    if (previousAccuracy !== null) {
        const delta = accuracy - previousAccuracy;
        if (delta > 5) {
            return `Mastery rising — <strong>${subjectName}</strong> up <strong>+${delta} pts</strong> this week.`;
        } else if (delta < -5) {
            return `<strong>${subjectName}</strong> dipped <strong>${delta} pts</strong> — worth revisiting.`;
        }
    }

    if (accuracy >= 90) {
        return `<strong>${subjectName}</strong>: <strong>${accuracy}%</strong> — nearly mastered.`;
    } else if (accuracy >= 70) {
        return `<strong>${subjectName}</strong>: <strong>${accuracy}%</strong> — solid foundation.`;
    } else {
        return `<strong>${subjectName}</strong>: <strong>${accuracy}%</strong> — room to grow.`;
    }
}

/**
 * Generate copy for learning curve insights
 * @param {Array} data - Learning curve data
 * @returns {string}
 */
export function getLearningCurveCopy(data) {
    if (!data || data.length < 3) {
        return `Need more review history to show your learning curve.`;
    }

    const earlyAccuracy = data[0]?.accuracy || 0;
    const lateAccuracy = data[data.length - 1]?.accuracy || 0;

    if (lateAccuracy >= earlyAccuracy) {
        return `Your curve is flattening — more correct answers after longer gaps. Memory is strengthening.`;
    } else {
        return `Keep reviewing — your long-term retention will improve with consistency.`;
    }
}

/**
 * Generate empty state copy
 * @param {string} chartType - Type of chart
 * @returns {string}
 */
export function getEmptyStateCopy(chartType) {
    const messages = {
        retention: `Do your first 10 cards to unlock retention insights.`,
        streak: `Complete your first session to start tracking your streak.`,
        dueForecast: `No cards scheduled yet. Study some cards to see your future workload.`,
        responseTime: `Need at least 20 reviews to show response time trends.`,
        stability: `Need at least 20 reviews to show stability trends.`,
        difficultyAccuracy: `Need at least 20 reviews per subject to show this chart.`,
        sessionRatings: `Complete a session to see rating breakdowns.`,
        subjectMastery: `Study cards from multiple subjects to see mastery breakdown.`,
        learningCurve: `Need more review history to show your forgetting curve.`
    };

    return messages[chartType] || `Keep studying to unlock this insight.`;
}

export default {
    getRetentionCopy,
    getStreakCopy,
    getResponseTimeCopy,
    getStabilityCopy,
    getDueTomorrowCopy,
    getStudyVelocityCopy,
    getRetentionTrendCopy,
    getDueForecastCopy,
    getFocusCopy,
    getSessionRatingCopy,
    getSubjectMasteryCopy,
    getLearningCurveCopy,
    getEmptyStateCopy
};
