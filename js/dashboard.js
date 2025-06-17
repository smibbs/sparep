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
    console.debug('[dashboard] getSubjectProgress: userId', userId);
    // Get all subjects
    const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name');
    console.debug('[dashboard] getSubjectProgress: subjects result', { subjects, subjectsError });
    if (subjectsError) throw subjectsError;
    // Get all cards for user with progress
    const { data: progress, error: progressError } = await supabase
        .from('user_card_progress')
        .select('card_id, state, cards:card_id(subject_id)')
        .eq('user_id', userId);
    console.debug('[dashboard] getSubjectProgress: progress result', { progress, progressError });
    if (progressError) throw progressError;
    // Group by subject
    const subjectMap = {};
    (subjects || []).forEach(s => {
        subjectMap[s.id] = { subject_id: s.id, subject_name: s.name, total: 0, completed: 0 };
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

// Debounce utility
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// --- Dashboard Page Logic ---

function setDashboardButtonsDisabled(disabled) {
    const refreshBtn = document.getElementById('refresh-dashboard');
    const retryBtn = document.getElementById('dashboard-retry-button');
    if (refreshBtn) refreshBtn.disabled = !!disabled;
    if (retryBtn) retryBtn.disabled = !!disabled;
    // Never disable logout buttons
}

async function updateDashboard() {
    setDashboardButtonsDisabled(true);
    // DEBUG: Direct query to subjects
    try {
        const supabase = await window.authService.getSupabase();
        const { data, error } = await supabase.from('subjects').select('id, name');
        console.log('[dashboard][DEBUG] Direct query to subjects:', { data, error });
    } catch (e) {
        console.error('[dashboard][DEBUG] Direct query error:', e);
    }
    const loading = document.getElementById('dashboard-loading');
    const error = document.getElementById('dashboard-error');
    const stats = document.getElementById('dashboard-stats');
    const errorMsg = document.getElementById('dashboard-error-message');
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    stats.classList.add('hidden');
    try {
        // Get user
        const user = await window.authService.getCurrentUser();
        if (!user) throw new Error('Not logged in');
        // Fetch stats
        const [userStats, subjectProgress] = await Promise.all([
            getUserStats(user.id),
            getSubjectProgress(user.id)
        ]);
        // Update stat cards
        document.getElementById('total-cards').textContent = userStats.totalStudied;
        document.getElementById('accuracy-rate').textContent = userStats.accuracy + '%';
        document.getElementById('cards-due').textContent = userStats.cardsDue;
        document.getElementById('study-streak').textContent = userStats.streak;
        // Update subject progress
        const list = document.getElementById('subject-progress-list');
        list.innerHTML = '';
        if (subjectProgress.length === 0) {
            list.innerHTML = '<p>No subjects found.</p>';
        } else {
            subjectProgress.forEach(s => {
                const div = document.createElement('div');
                div.className = 'subject-progress-item';
                div.innerHTML = `
                    <span class="subject-progress-label"><strong>${s.subject_name}</strong></span>
                    <div class="subject-progress-bar">
                        <div class="subject-progress-bar-inner" style="width: ${s.percent}%;"></div>
                    </div>
                    <span class="subject-progress-percent">${s.percent}% (${s.completed}/${s.total})</span>
                `;
                list.appendChild(div);
            });
        }
        loading.classList.add('hidden');
        error.classList.add('hidden');
        stats.classList.remove('hidden');
    } catch (e) {
        loading.classList.add('hidden');
        stats.classList.add('hidden');
        error.classList.remove('hidden');
        let message = e.message || 'Failed to load statistics.';
        if (e.code === '42501' || /permission denied/i.test(message)) {
            message = 'You do not have permission to view some data. Please contact support if this is unexpected.';
        } else if (e.code === 'PGRST116' || /not found/i.test(message)) {
            message = 'Some data could not be found. Try refreshing or contact support.';
        } else if (/network|fetch/i.test(message)) {
            message = 'Network error: Please check your internet connection and try again.';
        } else if (/not logged in|not authenticated/i.test(message)) {
            message = 'You are not logged in. Please sign in again.';
        }
        errorMsg.textContent = message;
    } finally {
        setDashboardButtonsDisabled(false);
    }
}

function setupDashboardEvents() {
    document.getElementById('refresh-dashboard')?.addEventListener('click', debounce(updateDashboard, 400));
    document.getElementById('dashboard-retry-button')?.addEventListener('click', debounce(updateDashboard, 400));
    document.getElementById('logout-button')?.addEventListener('click', () => window.authService.signOut());
    document.getElementById('dashboard-error-logout-button')?.addEventListener('click', () => window.authService.signOut());
}

// Wait for DOM and authService
window.addEventListener('DOMContentLoaded', async () => {
    // Wait for authService to be available
    while (!window.authService) await new Promise(r => setTimeout(r, 50));
    setupDashboardEvents();
    updateDashboard();
}); 