import database from './database.js';
import { getSupabaseClient } from './supabase-client.js';
import NavigationController from './navigation.js';
import slideMenu from './slideMenu.js';

/**
 * Check if user is admin and show admin navigation link
 * @param {string} userId
 */
async function checkAndShowAdminNav(userId) {
    try {
        const supabase = await getSupabaseClient();
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .single();

        if (!error && profile && profile.is_admin === true) {
            const adminNavLink = document.getElementById('admin-nav-link');
            if (adminNavLink) {
                adminNavLink.classList.remove('hidden');
                
                // Update mobile menu admin link as well
                if (navigationController) {
                    navigationController.updateAdminVisibility();
                }
            }
        }
    } catch (error) {
        console.warn('Could not check admin status:', error);
        // Silently fail - admin link stays hidden
    }
}

/**
 * Get user statistics for the dashboard
 * @param {string} userId
 * @returns {Promise<{totalStudied: number, accuracy: number, cardsDue: number, streak: number}>}
 */
export async function getUserStats(userId) {
    const supabase = await getSupabaseClient();
    
    try {
        // Use optimized views and profile data for better performance
        const [sessionInfo, deckCounts, userCards] = await Promise.all([
            // Get user session info including streak data
            supabase
                .from('v_user_study_session_info')
                .select(`
                    current_daily_streak, total_new_cards, total_due_cards,
                    user_tier, profile_created_at
                `)
                .eq('user_id', userId)
                .single(),
            
            // Get deck-based counts for cards due
            supabase
                .from('v_due_counts_by_deck')
                .select('total_due_count, total_cards')
                .eq('user_id', userId),
            
            // Get user cards for accuracy calculation
            supabase
                .from('user_cards')
                .select('total_reviews, correct_reviews')
                .eq('user_id', userId)
        ]);
        
        // Extract data with error handling
        const userInfo = sessionInfo.data || {};
        const decks = deckCounts.data || [];
        const cards = userCards.data || [];
        
        // Total cards studied (cards with at least 1 review)
        const totalStudied = cards.filter(c => (c.total_reviews || 0) > 0).length;
        
        // Review accuracy (correct_reviews / total_reviews)
        let correct = 0, total = 0;
        cards.forEach(c => {
            correct += c.correct_reviews || 0;
            total += c.total_reviews || 0;
        });
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        
        // Cards due (sum across all decks)
        const cardsDue = decks.reduce((sum, deck) => sum + (deck.total_due_count || 0), 0);
        
        // Use streak from profile (calculated server-side)
        const streak = userInfo.current_daily_streak || 0;
        
        return {
            totalStudied,
            accuracy,
            cardsDue,
            streak
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        // Fallback to basic queries if optimized views fail
        return await getUserStatsBasic(userId);
    }
}

// Fallback function with basic queries
async function getUserStatsBasic(userId) {
    const supabase = await getSupabaseClient();
    
    // Total cards studied (at least 1 review)
    const { data: progress, error: progressError } = await supabase
        .from('user_cards')
        .select('total_reviews')
        .eq('user_id', userId);
    if (progressError) throw progressError;
    const totalStudied = (progress || []).filter(p => (p.total_reviews || 0) > 0).length;

    // Review accuracy (correct_reviews / total_reviews)
    const { data: reviews, error: reviewsError } = await supabase
        .from('user_cards')
        .select('correct_reviews, total_reviews')
        .eq('user_id', userId);
    if (reviewsError) throw reviewsError;
    let correct = 0, total = 0;
    (reviews || []).forEach(r => {
        correct += r.correct_reviews || 0;
        total += r.total_reviews || 0;
    });
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Cards due today (use view if available, fallback to direct query)
    const { data: dueCards, error: dueError } = await supabase
        .from('v_due_user_cards')
        .select('card_template_id', { count: 'exact' })
        .eq('user_id', userId);
    
    const cardsDue = dueError ? 0 : (dueCards?.length || 0);

    // Get streak from profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('current_daily_streak')
        .eq('id', userId)
        .single();
    
    const streak = profile?.current_daily_streak || 0;
    
    return {
        totalStudied,
        accuracy,
        cardsDue,
        streak
    };
}

/**
 * Get deck progress breakdown for the user with card state counts
 * @param {string} userId
 * @returns {Promise<Array<{deck_id: string, deck_name: string, total: number, new: number, learning: number, review: number, other: number, percentages: {new: number, learning: number, review: number, other: number}}>>}
 */
export async function getDeckProgress(userId) {
    const supabase = await getSupabaseClient();
    
    try {
        // Use the optimized deck counts view for better performance
        const { data: deckCounts, error } = await supabase
            .from('v_due_counts_by_deck')
            .select(`
                deck_id, deck_name, total_cards,
                new_count, learning_count, review_count, suspended_count
            `)
            .eq('user_id', userId);
            
        if (error) throw error;
        
        return (deckCounts || []).map(deck => {
            const total = deck.total_cards || 0;
            const newCount = deck.new_count || 0;
            const learningCount = deck.learning_count || 0; 
            const reviewCount = deck.review_count || 0;
            const otherCount = (deck.suspended_count || 0); // suspended cards
            
            return {
                deck_id: deck.deck_id,
                deck_name: deck.deck_name,
                total,
                new: newCount,
                learning: learningCount,
                review: reviewCount,
                other: otherCount,
                percentages: {
                    new: total > 0 ? Math.round((newCount / total) * 100) : 0,
                    learning: total > 0 ? Math.round((learningCount / total) * 100) : 0,
                    review: total > 0 ? Math.round((reviewCount / total) * 100) : 0,
                    other: total > 0 ? Math.round((otherCount / total) * 100) : 0
                }
            };
        });
    } catch (error) {
        console.error('Error getting deck progress:', error);
        // Fallback to subject-based progress if deck view fails
        return await getSubjectProgressFallback(userId);
    }
}

// Fallback function for subject-based progress (legacy compatibility)
async function getSubjectProgressFallback(userId) {
    const supabase = await getSupabaseClient();
    
    // Get all subjects that have cards for this user
    const { data: progress, error: progressError } = await supabase
        .from('user_cards')
        .select(`
            state,
            card_templates!inner(subject_id, subjects(id, name))
        `)
        .eq('user_id', userId);
        
    if (progressError) throw progressError;
    
    // Group by subject and count states
    const subjectMap = {};
    
    (progress || []).forEach(p => {
        const subject = p.card_templates?.subjects;
        if (!subject) return;
        
        const sid = subject.id;
        if (!subjectMap[sid]) {
            subjectMap[sid] = { 
                subject_id: sid, 
                subject_name: subject.name, 
                total: 0, 
                new: 0, 
                learning: 0, 
                review: 0, 
                other: 0 
            };
        }
        
        subjectMap[sid].total++;
        
        // Count by state
        switch (p.state) {
            case 'new':
                subjectMap[sid].new++;
                break;
            case 'learning':
                subjectMap[sid].learning++;
                break;
            case 'review':
                subjectMap[sid].review++;
                break;
            default:
                // relearning, buried, suspended
                subjectMap[sid].other++;
                break;
        }
    });
    
    // Calculate percentages for each state
    return Object.values(subjectMap).map(s => ({
        ...s,
        percentages: {
            new: s.total > 0 ? Math.round((s.new / s.total) * 100) : 0,
            learning: s.total > 0 ? Math.round((s.learning / s.total) * 100) : 0,
            review: s.total > 0 ? Math.round((s.review / s.total) * 100) : 0,
            other: s.total > 0 ? Math.round((s.other / s.total) * 100) : 0
        }
    }));
}

// Keep the original function name for backward compatibility
export const getSubjectProgress = getDeckProgress;

// Debounce utility
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// --- Dashboard Page Logic ---

// Dashboard state management
let dashboardState = 'loading';
let dashboardLoadingStartTime = null;
const DASHBOARD_MINIMUM_LOADING_TIME = 600;
const DASHBOARD_TRANSITION_DURATION = 300;

function setDashboardButtonsDisabled(disabled) {
    const refreshBtn = document.getElementById('refresh-dashboard');
    const retryBtn = document.getElementById('dashboard-retry-button');
    if (refreshBtn) refreshBtn.disabled = !!disabled;
    if (retryBtn) retryBtn.disabled = !!disabled;
    // Never disable logout buttons
}

async function transitionDashboardToState(newState, message = null) {
    if (dashboardState === newState) return;
    
    const loading = document.getElementById('dashboard-loading');
    const error = document.getElementById('dashboard-error');
    const stats = document.getElementById('dashboard-stats');
    const errorMsg = document.getElementById('dashboard-error-message');
    
    // Ensure minimum loading time
    if (dashboardState === 'loading' && dashboardLoadingStartTime) {
        const elapsed = Date.now() - dashboardLoadingStartTime;
        if (elapsed < DASHBOARD_MINIMUM_LOADING_TIME) {
            await new Promise(resolve => setTimeout(resolve, DASHBOARD_MINIMUM_LOADING_TIME - elapsed));
        }
    }
    
    // Fade out current state
    const currentElement = getDashboardCurrentStateElement();
    if (currentElement && !currentElement.classList.contains('hidden')) {
        currentElement.classList.add('fade-out');
        await new Promise(resolve => setTimeout(resolve, DASHBOARD_TRANSITION_DURATION));
        currentElement.classList.add('hidden');
        currentElement.classList.remove('fade-out');
    }
    
    // Update error message if provided
    if (message && newState === 'error' && errorMsg) {
        errorMsg.textContent = getDashboardFriendlyMessage(message);
    }
    
    // Show new state
    const newElement = getDashboardElementForState(newState);
    if (newElement) {
        newElement.classList.remove('hidden');
        newElement.classList.add('fade-in');
        setTimeout(() => newElement.classList.remove('fade-in'), DASHBOARD_TRANSITION_DURATION);
    }
    
    dashboardState = newState;
    
    if (newState === 'loading') {
        dashboardLoadingStartTime = Date.now();
    }
}

function getDashboardCurrentStateElement() {
    switch (dashboardState) {
        case 'loading': return document.getElementById('dashboard-loading');
        case 'error': return document.getElementById('dashboard-error');
        case 'stats': return document.getElementById('dashboard-stats');
        default: return null;
    }
}

function getDashboardElementForState(state) {
    switch (state) {
        case 'loading': return document.getElementById('dashboard-loading');
        case 'error': return document.getElementById('dashboard-error');
        case 'stats': return document.getElementById('dashboard-stats');
        default: return null;
    }
}

function getDashboardFriendlyMessage(message) {
    if (!message) return 'Unable to load dashboard statistics. Please try again.';
    
    if (/permission denied|42501/i.test(message)) {
        return 'Access issue detected. Please refresh the page or contact support.';
    }
    if (/not found|PGRST116/i.test(message)) {
        return 'Dashboard data is being prepared. Please try again in a moment.';
    }
    if (/network|fetch/i.test(message)) {
        return 'Connection issue. Please check your internet and try again.';
    }
    if (/not logged in|not authenticated/i.test(message)) {
        return 'Session expired. Please log in again.';
    }
    
    return 'Unable to load your statistics. Please try refreshing the page.';
}

async function updateDashboard() {
    setDashboardButtonsDisabled(true);
    
    // Start loading state
    await transitionDashboardToState('loading');
    
    // Update loading message with dynamic content
    const loadingText = document.querySelector('#dashboard-loading .loading-text');
    if (loadingText) {
        try {
            // Try to get a dynamic loading message
            const dynamicMessage = database.getRandomLoadingMessageSync();
            loadingText.textContent = dynamicMessage;
        } catch (error) {
            console.warn('Failed to get dynamic loading message for dashboard:', error);
            loadingText.textContent = 'Loading your study statistics...';
        }
    }
    try {
        // Get user
        const user = await window.authService.getCurrentUser();
        if (!user) throw new Error('Not logged in');
        // Fetch stats
        const [userStats, deckProgress] = await Promise.all([
            getUserStats(user.id),
            getDeckProgress(user.id)
        ]);
        // Update stat cards
        document.getElementById('total-cards').textContent = userStats.totalStudied;
        document.getElementById('accuracy-rate').textContent = userStats.accuracy + '%';
        document.getElementById('cards-due').textContent = userStats.cardsDue;
        document.getElementById('study-streak').textContent = userStats.streak;
        // Check if user is admin and show admin link
        await checkAndShowAdminNav(user.id);
        
        // Update deck progress (or subject progress as fallback)
        const list = document.getElementById('subject-progress-list');
        list.innerHTML = '';
        if (deckProgress.length === 0) {
            list.innerHTML = '<p>No decks found. Create your first deck to start studying!</p>';
        } else {
            deckProgress.forEach(s => {
                const div = document.createElement('div');
                div.className = 'subject-progress-item';
                
                // Create stacked bar segments
                let barHTML = '';
                const states = [
                    { name: 'new', count: s.new, percentage: s.percentages.new, class: 'state-new' },
                    { name: 'learning', count: s.learning, percentage: s.percentages.learning, class: 'state-learning' },
                    { name: 'review', count: s.review, percentage: s.percentages.review, class: 'state-review' }
                ];
                
                // Only add 'other' state if there are cards in that state
                if (s.other > 0) {
                    states.push({ name: 'other', count: s.other, percentage: s.percentages.other, class: 'state-other' });
                }
                
                // Generate segments for states that have cards
                states.forEach(state => {
                    if (state.count > 0) {
                        // Only show number if segment is wide enough (>8% of total)
                        const showNumber = state.percentage > 8;
                        const numberHTML = showNumber ? `<span class="segment-number">${state.count}</span>` : '';
                        barHTML += `<div class="subject-progress-bar-segment ${state.class}" style="width: ${state.percentage}%;">${numberHTML}</div>`;
                    }
                });
                
                // Show deck name if available, otherwise use subject name for fallback
                const displayName = s.deck_name || s.subject_name || 'Unnamed Deck';
                div.innerHTML = `
                    <div class="subject-progress-title"><strong>${displayName}</strong></div>
                    <div class="subject-progress-bar">
                        ${barHTML}
                    </div>
                `;
                list.appendChild(div);
            });
        }
        
        // Transition to stats view
        await transitionDashboardToState('stats');
    } catch (e) {
        // Transition to error state with friendly message
        await transitionDashboardToState('error', e.message || 'Failed to load statistics');
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

// Global navigation controller
let navigationController = null;

// Wait for DOM and authService
window.addEventListener('DOMContentLoaded', async () => {
    // Wait for authService to be available
    while (!window.authService) await new Promise(r => setTimeout(r, 50));
    
    // Initialize slide menu navigation
    await slideMenu.initialize();
    
    // Initialize navigation controller
    navigationController = new NavigationController();
    
    setupDashboardEvents();
    updateDashboard();
}); 