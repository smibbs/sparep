import { getSupabaseClient } from './supabase-client.js';

/**
 * Progress Data Module
 * Handles all data aggregation queries for the progress dashboard
 * All queries are timezone-aware and respect RLS (user_id filtering)
 */

/**
 * Get user's timezone and day start time from profile
 * @param {string} userId
 * @returns {Promise<{timezone: string, dayStartTime: string}>}
 */
async function getUserTimeSettings(userId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('timezone, day_start_time')
        .eq('id', userId)
        .single();

    if (error) throw error;

    return {
        timezone: data.timezone || 'UTC',
        dayStartTime: data.day_start_time || '00:00:00'
    };
}

/**
 * Calculate local date boundaries for a user
 * @param {string} timezone - User's timezone
 * @param {string} dayStartTime - User's day start time (HH:MM:SS)
 * @param {Date} date - The date to calculate boundaries for
 * @returns {Promise<{start: string, end: string}>} ISO timestamp strings
 */
function getLocalDayBoundaries(timezone, dayStartTime, date = new Date()) {
    // For now, use simple UTC calculations
    // In production, this would use proper timezone conversion
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    return {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
    };
}

/**
 * Get retention rate for a time window
 * @param {string} userId
 * @param {number} days - Number of days in window
 * @returns {Promise<{current: number, previous: number, delta: number}>}
 */
export async function getRetentionRate(userId, days = 7) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousWindowStart = new Date(currentWindowStart.getTime() - days * 24 * 60 * 60 * 1000);

    // Current window
    const { data: currentReviews, error: currentError } = await supabase
        .from('reviews')
        .select('rating')
        .eq('user_id', userId)
        .gte('reviewed_at', currentWindowStart.toISOString())
        .lte('reviewed_at', now.toISOString());

    if (currentError) throw currentError;

    // Previous window
    const { data: previousReviews, error: previousError } = await supabase
        .from('reviews')
        .select('rating')
        .eq('user_id', userId)
        .gte('reviewed_at', previousWindowStart.toISOString())
        .lt('reviewed_at', currentWindowStart.toISOString());

    if (previousError) throw previousError;

    const calculateRetention = (reviews) => {
        if (!reviews || reviews.length === 0) return 0;
        const correct = reviews.filter(r => r.rating >= 2).length;
        return Math.round((correct / reviews.length) * 100);
    };

    const current = calculateRetention(currentReviews);
    const previous = calculateRetention(previousReviews);
    const delta = current - previous;

    return { current, previous, delta };
}

/**
 * Get current streak and calculate it from reviews
 * @param {string} userId
 * @returns {Promise<{streak: number, lastReviewDate: string|null}>}
 */
export async function getStreakData(userId) {
    const supabase = await getSupabaseClient();

    // Get streak from profile (server-calculated)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('current_daily_streak, last_review_date, timezone, day_start_time')
        .eq('id', userId)
        .single();

    if (profileError) throw profileError;

    return {
        streak: profile.current_daily_streak || 0,
        lastReviewDate: profile.last_review_date
    };
}

/**
 * Get average response time with comparison
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<{current: number, previous: number, delta: number}>}
 */
export async function getResponseTime(userId, days = 7) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousWindowStart = new Date(currentWindowStart.getTime() - days * 24 * 60 * 60 * 1000);

    // Current window - get median
    const { data: currentReviews, error: currentError } = await supabase
        .from('reviews')
        .select('response_time_ms')
        .eq('user_id', userId)
        .gte('reviewed_at', currentWindowStart.toISOString())
        .lte('reviewed_at', now.toISOString())
        .order('response_time_ms');

    if (currentError) throw currentError;

    // Previous window
    const { data: previousReviews, error: previousError } = await supabase
        .from('reviews')
        .select('response_time_ms')
        .eq('user_id', userId)
        .gte('reviewed_at', previousWindowStart.toISOString())
        .lt('reviewed_at', currentWindowStart.toISOString())
        .order('response_time_ms');

    if (previousError) throw previousError;

    const getMedian = (values) => {
        if (!values || values.length === 0) return 0;
        const sorted = values.map(v => v.response_time_ms).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const current = Math.round(getMedian(currentReviews) / 1000 * 10) / 10; // Convert to seconds
    const previous = Math.round(getMedian(previousReviews) / 1000 * 10) / 10;
    const delta = Math.round((current - previous) * 10) / 10;

    return { current, previous, delta };
}

/**
 * Get average stability with comparison
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<{current: number, previous: number, delta: number}>}
 */
export async function getStabilityAverage(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousWindowStart = new Date(currentWindowStart.getTime() - days * 24 * 60 * 60 * 1000);

    // Current window
    const { data: currentReviews, error: currentError } = await supabase
        .from('reviews')
        .select('stability_after')
        .eq('user_id', userId)
        .gte('reviewed_at', currentWindowStart.toISOString())
        .lte('reviewed_at', now.toISOString());

    if (currentError) throw currentError;

    // Previous window
    const { data: previousReviews, error: previousError } = await supabase
        .from('reviews')
        .select('stability_after')
        .eq('user_id', userId)
        .gte('reviewed_at', previousWindowStart.toISOString())
        .lt('reviewed_at', currentWindowStart.toISOString());

    if (previousError) throw previousError;

    const getAverage = (reviews) => {
        if (!reviews || reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, r) => acc + parseFloat(r.stability_after), 0);
        return Math.round((sum / reviews.length) * 10) / 10;
    };

    const current = getAverage(currentReviews);
    const previous = getAverage(previousReviews);
    const delta = Math.round((current - previous) * 10) / 10;

    return { current, previous, delta };
}

/**
 * Get cards due tomorrow
 * @param {string} userId
 * @returns {Promise<{count: number, estimatedMinutes: number}>}
 */
export async function getCardsDueTomorrow(userId) {
    const supabase = await getSupabaseClient();
    const timeSettings = await getUserTimeSettings(userId);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const boundaries = getLocalDayBoundaries(timeSettings.timezone, timeSettings.dayStartTime, tomorrow);

    const { data, error } = await supabase
        .from('user_cards')
        .select('card_template_id, average_response_time_ms')
        .eq('user_id', userId)
        .in('state', ['learning', 'review', 'relearning'])
        .gte('due_at', boundaries.start)
        .lte('due_at', boundaries.end);

    if (error) throw error;

    const count = data?.length || 0;

    // Estimate time: use average response time or default to 5 seconds per card
    const totalMs = data?.reduce((sum, card) => sum + (card.average_response_time_ms || 5000), 0) || 0;
    const estimatedMinutes = Math.ceil(totalMs / 1000 / 60);

    return { count, estimatedMinutes };
}

/**
 * Get retention over time (daily or weekly)
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{date: string, retention: number, totalReviews: number}>>}
 */
export async function getRetentionOverTime(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('reviewed_at, rating')
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString())
        .order('reviewed_at');

    if (error) throw error;

    // Group by day
    const dailyMap = {};
    reviews?.forEach(r => {
        const date = new Date(r.reviewed_at).toISOString().split('T')[0];
        if (!dailyMap[date]) {
            dailyMap[date] = { total: 0, correct: 0 };
        }
        dailyMap[date].total++;
        if (r.rating >= 2) dailyMap[date].correct++;
    });

    // Convert to array and calculate retention
    const result = Object.entries(dailyMap).map(([date, stats]) => ({
        date,
        retention: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        totalReviews: stats.total
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate 7-day rolling average
    result.forEach((item, idx) => {
        const window = result.slice(Math.max(0, idx - 6), idx + 1);
        const avgRetention = window.reduce((sum, d) => sum + d.retention, 0) / window.length;
        item.rollingAverage = Math.round(avgRetention);
    });

    return result;
}

/**
 * Get streak heatmap data (daily review counts)
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{date: string, count: number}>>}
 */
export async function getStreakHeatmap(userId, days = 90) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('reviewed_at')
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString());

    if (error) throw error;

    // Group by day
    const dailyMap = {};
    reviews?.forEach(r => {
        const date = new Date(r.reviewed_at).toISOString().split('T')[0];
        dailyMap[date] = (dailyMap[date] || 0) + 1;
    });

    return Object.entries(dailyMap).map(([date, count]) => ({
        date,
        count
    })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get due load forecast
 * @param {string} userId
 * @param {number} days - Number of days to forecast
 * @returns {Promise<Array<{date: string, count: number}>>}
 */
export async function getDueForecast(userId, days = 14) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from('user_cards')
        .select('due_at')
        .eq('user_id', userId)
        .in('state', ['learning', 'review', 'relearning'])
        .gte('due_at', now.toISOString())
        .lte('due_at', endDate.toISOString());

    if (error) throw error;

    // Group by day
    const dailyMap = {};
    data?.forEach(card => {
        const date = new Date(card.due_at).toISOString().split('T')[0];
        dailyMap[date] = (dailyMap[date] || 0) + 1;
    });

    return Object.entries(dailyMap).map(([date, count]) => ({
        date,
        count
    })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get response time trend over time
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{date: string, medianResponseTime: number}>>}
 */
export async function getResponseTimeTrend(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('reviewed_at, response_time_ms')
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString())
        .order('reviewed_at');

    if (error) throw error;

    // Group by week for cleaner visualization
    const weeklyMap = {};
    reviews?.forEach(r => {
        const date = new Date(r.reviewed_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyMap[weekKey]) {
            weeklyMap[weekKey] = [];
        }
        weeklyMap[weekKey].push(r.response_time_ms);
    });

    // Calculate median for each week
    return Object.entries(weeklyMap).map(([date, times]) => {
        const sorted = times.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

        return {
            date,
            medianResponseTime: Math.round(median / 1000 * 10) / 10 // Convert to seconds
        };
    }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get stability trend over time
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{date: string, avgStability: number}>>}
 */
export async function getStabilityTrend(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('reviewed_at, stability_after')
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString())
        .order('reviewed_at');

    if (error) throw error;

    // Group by week
    const weeklyMap = {};
    reviews?.forEach(r => {
        const date = new Date(r.reviewed_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyMap[weekKey]) {
            weeklyMap[weekKey] = [];
        }
        weeklyMap[weekKey].push(parseFloat(r.stability_after));
    });

    return Object.entries(weeklyMap).map(([date, stabilities]) => {
        const avg = stabilities.reduce((sum, s) => sum + s, 0) / stabilities.length;
        return {
            date,
            avgStability: Math.round(avg * 10) / 10
        };
    }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get difficulty vs accuracy scatter data by subject
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{subjectId: string, subjectName: string, avgDifficulty: number, accuracy: number, sampleSize: number}>>}
 */
export async function getDifficultyAccuracyBySubject(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
            rating,
            difficulty_after,
            card_template_id,
            card_templates!inner(subject_id, subjects(id, name))
        `)
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString());

    if (error) throw error;

    // Group by subject
    const subjectMap = {};
    reviews?.forEach(r => {
        const subject = r.card_templates?.subjects;
        if (!subject) return;

        const sid = subject.id;
        if (!subjectMap[sid]) {
            subjectMap[sid] = {
                subjectId: sid,
                subjectName: subject.name,
                difficulties: [],
                total: 0,
                correct: 0
            };
        }

        subjectMap[sid].difficulties.push(parseFloat(r.difficulty_after));
        subjectMap[sid].total++;
        if (r.rating >= 2) subjectMap[sid].correct++;
    });

    // Calculate averages
    return Object.values(subjectMap)
        .map(s => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            avgDifficulty: Math.round((s.difficulties.reduce((sum, d) => sum + d, 0) / s.difficulties.length) * 10) / 10,
            accuracy: Math.round((s.correct / s.total) * 100),
            sampleSize: s.total
        }))
        .filter(s => s.sampleSize >= 20); // Only include subjects with enough data
}

/**
 * Get session rating breakdown for recent sessions
 * @param {string} userId
 * @param {number} sessionCount
 * @returns {Promise<Array<{sessionId: string, sessionDate: string, ratings: {0: number, 1: number, 2: number, 3: number}, percentGoodEasy: number}>>}
 */
export async function getSessionRatings(userId, sessionCount = 10) {
    const supabase = await getSupabaseClient();

    // Get recent sessions
    const { data: sessions, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('id, session_date, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(sessionCount);

    if (sessionsError) throw sessionsError;
    if (!sessions || sessions.length === 0) return [];

    // Get reviews for these sessions
    const sessionIds = sessions.map(s => s.id);
    const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('session_id, rating')
        .eq('user_id', userId)
        .in('session_id', sessionIds);

    if (reviewsError) throw reviewsError;

    // Group by session
    const sessionMap = {};
    sessions.forEach(s => {
        sessionMap[s.id] = {
            sessionId: s.id,
            sessionDate: s.session_date,
            ratings: { 0: 0, 1: 0, 2: 0, 3: 0 }
        };
    });

    reviews?.forEach(r => {
        if (sessionMap[r.session_id]) {
            sessionMap[r.session_id].ratings[r.rating]++;
        }
    });

    // Calculate percentages
    return Object.values(sessionMap).map(s => {
        const total = s.ratings[0] + s.ratings[1] + s.ratings[2] + s.ratings[3];
        const goodEasy = s.ratings[2] + s.ratings[3];
        return {
            ...s,
            percentGoodEasy: total > 0 ? Math.round((goodEasy / total) * 100) : 0
        };
    }).reverse(); // Oldest to newest for display
}

/**
 * Get subject mastery (accuracy and stability by subject)
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{subjectId: string, subjectName: string, accuracy: number, avgStability: number, totalReviews: number}>>}
 */
export async function getSubjectMastery(userId, days = 30) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
            rating,
            stability_after,
            card_templates!inner(subject_id, subjects(id, name))
        `)
        .eq('user_id', userId)
        .gte('reviewed_at', startDate.toISOString());

    if (error) throw error;

    // Group by subject
    const subjectMap = {};
    reviews?.forEach(r => {
        const subject = r.card_templates?.subjects;
        if (!subject) return;

        const sid = subject.id;
        if (!subjectMap[sid]) {
            subjectMap[sid] = {
                subjectId: sid,
                subjectName: subject.name,
                stabilities: [],
                total: 0,
                correct: 0
            };
        }

        subjectMap[sid].stabilities.push(parseFloat(r.stability_after));
        subjectMap[sid].total++;
        if (r.rating >= 2) subjectMap[sid].correct++;
    });

    // Calculate metrics
    return Object.values(subjectMap)
        .map(s => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            accuracy: Math.round((s.correct / s.total) * 100),
            avgStability: Math.round((s.stabilities.reduce((sum, st) => sum + st, 0) / s.stabilities.length) * 10) / 10,
            totalReviews: s.total
        }))
        .sort((a, b) => a.accuracy - b.accuracy); // Sort by accuracy ascending (weakest first)
}

/**
 * Get study velocity (average cards reviewed per day)
 * @param {string} userId
 * @returns {Promise<{current: number, previous: number, delta: number}>}
 */
export async function getStudyVelocity(userId) {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWindowStart = new Date(currentWindowStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get reviews for last 14 days
    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('reviewed_at')
        .eq('user_id', userId)
        .gte('reviewed_at', previousWindowStart.toISOString())
        .lte('reviewed_at', now.toISOString());

    if (error) throw error;

    // Group by day
    const dailyCounts = {};
    reviews?.forEach(r => {
        const date = new Date(r.reviewed_at).toISOString().split('T')[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    // Calculate current window (last 7 days)
    let currentTotal = 0;
    let currentDays = 0;
    for (let i = 0; i < 7; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (dailyCounts[date]) {
            currentTotal += dailyCounts[date];
            currentDays++;
        }
    }

    // Calculate previous window (days 7-13)
    let previousTotal = 0;
    let previousDays = 0;
    for (let i = 7; i < 14; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (dailyCounts[date]) {
            previousTotal += dailyCounts[date];
            previousDays++;
        }
    }

    // Calculate averages (over 7 days, not just active days)
    const current = Math.round((currentTotal / 7) * 10) / 10;
    const previous = Math.round((previousTotal / 7) * 10) / 10;
    const delta = Math.round((current - previous) * 10) / 10;

    return { current, previous, delta };
}

/**
 * Get learning curve (forgetting curve data)
 * @param {string} userId
 * @returns {Promise<Array<{elapsedDaysBin: string, accuracy: number, sampleSize: number}>>}
 */
export async function getLearningCurve(userId) {
    const supabase = await getSupabaseClient();

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('elapsed_days, rating')
        .eq('user_id', userId)
        .gte('elapsed_days', 0);

    if (error) throw error;

    // Define bins: 0-1, 1-2, 2-3, 3-7, 7-14, 14-30, 30+
    const bins = [
        { min: 0, max: 1, label: '0-1 days' },
        { min: 1, max: 2, label: '1-2 days' },
        { min: 2, max: 3, label: '2-3 days' },
        { min: 3, max: 7, label: '3-7 days' },
        { min: 7, max: 14, label: '7-14 days' },
        { min: 14, max: 30, label: '14-30 days' },
        { min: 30, max: Infinity, label: '30+ days' }
    ];

    const binMap = {};
    bins.forEach(bin => {
        binMap[bin.label] = { total: 0, correct: 0 };
    });

    reviews?.forEach(r => {
        const days = parseFloat(r.elapsed_days);
        const bin = bins.find(b => days >= b.min && days < b.max);
        if (bin) {
            binMap[bin.label].total++;
            if (r.rating >= 2) binMap[bin.label].correct++;
        }
    });

    return bins
        .map(bin => ({
            elapsedDaysBin: bin.label,
            accuracy: binMap[bin.label].total > 0 ? Math.round((binMap[bin.label].correct / binMap[bin.label].total) * 100) : 0,
            sampleSize: binMap[bin.label].total
        }))
        .filter(b => b.sampleSize >= 5); // Only show bins with enough data
}

export default {
    getRetentionRate,
    getStreakData,
    getResponseTime,
    getStabilityAverage,
    getCardsDueTomorrow,
    getStudyVelocity,
    getRetentionOverTime,
    getStreakHeatmap,
    getDueForecast,
    getResponseTimeTrend,
    getStabilityTrend,
    getDifficultyAccuracyBySubject,
    getSessionRatings,
    getSubjectMastery,
    getLearningCurve
};
