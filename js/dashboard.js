import database from './database.js';
import { getSupabaseClient } from './supabase-client.js';

/**
 * Get user statistics for the dashboard
 * @param {string} userId
 * @returns {Promise<{totalStudied: number, accuracy: number, cardsDue: number, streak: number}>}
 */
export async function getUserStats(userId) {
    const supabase = await getSupabaseClient();
    // Total cards studied (at least 1 review)
    const { data: progress, error: progressError } = await supabase
        .from('user_card_progress')
        .select('total_reviews')
        .eq('user_id', userId);
    if (progressError) throw progressError;
    const totalStudied = (progress || []).filter(p => (p.total_reviews || 0) > 0).length;

    // Review accuracy (correct_reviews / total_reviews)
    const { data: reviews, error: reviewsError } = await supabase
        .from('user_card_progress')
        .select('correct_reviews, total_reviews')
        .eq('user_id', userId);
    if (reviewsError) throw reviewsError;
    let correct = 0, total = 0;
    (reviews || []).forEach(r => {
        correct += r.correct_reviews || 0;
        total += r.total_reviews || 0;
    });
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Cards due today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const { data: dueCards, error: dueError } = await supabase
        .from('user_card_progress')
        .select('next_review_date')
        .eq('user_id', userId)
        .lte('next_review_date', tomorrow.toISOString());
    if (dueError) throw dueError;
    const cardsDue = (dueCards || []).length;

    // Study streak (days with at least 1 review, consecutive up to today)
    const { data: history, error: historyError } = await supabase
        .from('review_history')
        .select('review_date')
        .eq('user_id', userId)
        .order('review_date', { ascending: false });
    if (historyError) throw historyError;
    const days = new Set((history || []).map(h => (new Date(h.review_date)).toDateString()));
    let streak = 0;
    let d = new Date();
    while (days.has(d.toDateString())) {
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return {
        totalStudied,
        accuracy,
        cardsDue,
        streak
    };
}

/**
 * Get subject progress breakdown for the user
 * @param {string} userId
 * @returns {Promise<Array<{subject_id: string, subject_name: string, percent: number, total: number, completed: number}>>}
 */
export async function getSubjectProgress(userId) {
    const supabase = await getSupabaseClient();
    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('subject_id, name');
    if (subjectsError) throw subjectsError;
    // Get all cards for user with progress
    const { data: progress, error: progressError } = await supabase
        .from('user_card_progress')
        .select('card_id, state, cards:card_id(subject_id)')
        .eq('user_id', userId);
    if (progressError) throw progressError;
    // Group by subject
    const subjectMap = {};
    (subjects || []).forEach(s => {
        subjectMap[s.subject_id] = { subject_id: s.subject_id, subject_name: s.name, total: 0, completed: 0 };
    });
    (progress || []).forEach(p => {
        const sid = p.cards?.subject_id;
        if (!sid || !subjectMap[sid]) return;
        subjectMap[sid].total++;
        if (p.state === 'review') subjectMap[sid].completed++;
    });
    // Calculate percent
    return Object.values(subjectMap).map(s => ({
        ...s,
        percent: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0
    }));
} 