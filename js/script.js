// Import required modules
import { RATING, calculateNextReview, updateStability, updateDifficulty } from './fsrs.js';
import database from './database.js';
import auth from './auth.js';
import SessionManager from './sessionManager.js';
import { SESSION_CONFIG } from './config.js';
import NavigationController from './navigation.js';

// Use global Supabase client
const supabase = window.supabaseClient;

/**
 * Check if user is admin and show admin navigation link
 * @param {string} userId
 */
async function checkAndShowAdminNav(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('user_tier')
            .eq('id', userId)
            .single();

        if (!error && profile && profile.user_tier === 'admin') {
            const adminNavLink = document.getElementById('admin-nav-link');
            if (adminNavLink) {
                adminNavLink.classList.remove('hidden');
                
                // Update mobile menu admin link as well
                if (appState.navigationController) {
                    appState.navigationController.updateAdminVisibility();
                }
            }
        }
    } catch (error) {
        console.log('Could not check admin status:', error);
        // Silently fail - admin link stays hidden
    }
}

/**
 * Gets the base URL for the application
 */
function getBaseUrl() {
    // For GitHub Pages
    if (window.location.hostname.includes('github.io')) {
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts[1]; // Second part after the first slash
        return `/${repoName}/`;
    }
    // For local development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/';
    }
    return '/';
}

/**
 * Redirects to login page
 */
function redirectToLogin() {
    auth.redirectToLogin();
}

// Initialize app state
const appState = {
    currentCard: null,
    cardStartTime: null,
    sessionReviewedCount: 0, // Track cards reviewed in this session
    totalCards: 0,
    isLoading: true,
    user: null,
    dbService: database,  // Use the default database instance
    authService: auth,    // Use the default auth instance
    sessionManager: new SessionManager(), // Session management
    isCompleted: false,      // Track if session is completed
    cardInnerClickHandler: null, // Store reference to card-inner click handler
    forceNewSession: false, // Flag to force new session creation
    navigationController: null // Navigation controller for hamburger menu
};

/**
 * UI State Management Functions with Smooth Transitions
 */

// Global state tracking
let currentState = 'loading';
let stateChangePromise = null;
let minimumLoadingStartTime = null;

// Minimum loading duration to prevent flashes
const MINIMUM_LOADING_TIME = 800; // 800ms
const TRANSITION_DURATION = 300; // 300ms

async function transitionToState(newState, message = null) {
    if (currentState === newState) return;
    
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const content = document.getElementById('content');
    
    // Ensure minimum loading time if transitioning away from loading
    if (currentState === 'loading' && minimumLoadingStartTime) {
        const elapsed = Date.now() - minimumLoadingStartTime;
        if (elapsed < MINIMUM_LOADING_TIME) {
            await new Promise(resolve => setTimeout(resolve, MINIMUM_LOADING_TIME - elapsed));
        }
    }
    
    // Fade out current state
    const currentElement = getCurrentStateElement();
    if (currentElement && !currentElement.classList.contains('hidden')) {
        currentElement.classList.add('fade-out');
        await new Promise(resolve => setTimeout(resolve, TRANSITION_DURATION));
        currentElement.classList.add('hidden');
        currentElement.classList.remove('fade-out');
    }
    
    // Update message if provided
    if (message && newState === 'error') {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = getUserFriendlyMessage(message);
        }
    }
    
    // Show new state
    const newElement = getElementForState(newState);
    if (newElement) {
        newElement.classList.remove('hidden');
        newElement.classList.add('fade-in');
        setTimeout(() => newElement.classList.remove('fade-in'), TRANSITION_DURATION);
    }
    
    currentState = newState;
    
    // Track loading start time
    if (newState === 'loading') {
        minimumLoadingStartTime = Date.now();
    }
}

function getCurrentStateElement() {
    switch (currentState) {
        case 'loading': return document.getElementById('loading-state');
        case 'error': return document.getElementById('error-state');
        case 'content': return document.getElementById('content');
        default: return null;
    }
}

function getElementForState(state) {
    switch (state) {
        case 'loading': return document.getElementById('loading-state');
        case 'error': return document.getElementById('error-state');
        case 'content': return document.getElementById('content');
        default: return null;
    }
}

function getUserFriendlyMessage(message) {
    if (!message) return 'Something went wrong. Please try again.';
    
    // Convert technical errors to user-friendly messages
    if (/no cards.*due/i.test(message)) {
        return 'Great job! You\'re all caught up. No cards are due for review right now. Check back later or study ahead!';
    }
    if (/no cards.*available/i.test(message)) {
        return 'Getting your study session ready... This may take a moment.';
    }
    if (/permission denied|42501/i.test(message)) {
        return 'Access issue detected. Please try refreshing the page or contact support.';
    }
    if (/not found|PGRST116/i.test(message)) {
        return 'Study content is being prepared. Please try again in a moment.';
    }
    if (/network|fetch/i.test(message)) {
        return 'Connection issue. Please check your internet and try again.';
    }
    if (/not logged in|not authenticated/i.test(message)) {
        return 'Session expired. Please log in again.';
    }
    if (/failed to load/i.test(message)) {
        return 'Having trouble loading your study session. Please try again.';
    }
    
    // Return a generic friendly message for unknown errors
    return 'Something went wrong. Please try again or refresh the page.';
}

// Legacy function for compatibility
function showLoading(show) {
    if (show) {
        transitionToState('loading');
    } else {
        // Don't automatically hide loading - let other functions transition to the appropriate state
    }
}

function showError(message) {
    transitionToState('error', message);
}

function showContent(show) {
    if (show) {
        transitionToState('content');
    }
}

function hideLoading() {
    // Deprecated - use transitionToState() instead
    // Kept for compatibility
}

/**
 * Updates the progress indicator with current card position
 */
async function updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressContainer = document.querySelector('.progress-container');
    
    if (progressBar && progressFill && progressText) {
        try {
            // Get session progress
            const sessionProgress = appState.sessionManager.getProgress();
            
            // Show progress bar for all users based on session completion
            const percentage = sessionProgress.percentage;
            
            progressFill.style.width = percentage + '%';
            progressBar.classList.remove('hidden');
            if (progressContainer) {
                progressContainer.classList.remove('hidden'); // Ensure container is visible
            }
            progressText.classList.add('hidden');
        } catch (error) {
            // Fallback to simple display if error getting session progress
            const sessionProgress = appState.sessionManager.getProgress();
            const percentage = sessionProgress.percentage || 0;
            
            progressFill.style.width = percentage + '%';
            progressBar.classList.remove('hidden');
            if (progressContainer) {
                progressContainer.classList.remove('hidden'); // Ensure container is visible
            }
            progressText.classList.add('hidden');
        }
    }
}

/**
 * Get subject name by ID with caching
 */
const subjectCache = new Map();
async function getSubjectName(subjectId) {
    if (subjectCache.has(subjectId)) {
        return subjectCache.get(subjectId);
    }
    
    try {
        const supabase = await appState.dbService.getSupabase();
        const { data: subject, error } = await supabase
            .from('subjects')
            .select('name')
            .eq('id', subjectId)
            .single();
            
        if (error) throw error;
        
        const subjectName = subject?.name || 'Unknown Subject';
        subjectCache.set(subjectId, subjectName);
        return subjectName;
    } catch (error) {
        console.warn('Failed to fetch subject:', error);
        return 'Unknown Subject';
    }
}

/**
 * Display the current card
 */
async function displayCurrentCard() {
    if (!appState.currentCard) {
        showError('No card available for review.');
        return;
    }

    const currentCard = appState.currentCard;
    // Displaying card
    appState.cardStartTime = Date.now(); // Track when the card was shown
    
    // Robust check for card data
    if (!currentCard || typeof currentCard.cards?.question !== 'string' || typeof currentCard.cards?.answer !== 'string') {
        showError('Card data is missing or invalid. Please refresh or contact support.');
        return;
    }

    const cardFront = document.querySelector('.card-front');
    const cardBack = document.querySelector('.card-back');
    const card = document.querySelector('.card');
    
    if (!cardFront || !cardBack || !card) {
        // Card elements not found
        return;
    }

    // Update card content and progress info
    // Fetch subject name separately if not already cached
    let subjectName = 'Unknown Subject';
    if (currentCard.cards?.subject_id) {
        try {
            subjectName = await getSubjectName(currentCard.cards.subject_id);
        } catch (error) {
            console.warn('Failed to fetch subject name:', error);
        }
    }
    
    // Batch all DOM updates to minimize reflows/repaints
    const lastSeenText = formatTimeAgo(currentCard.last_review_date);
    const progressInfo = getProgressInfo(currentCard);
    
    // Get all DOM elements at once
    const flipButton = document.getElementById('flip-button');
    const ratingButtonsDiv = document.getElementById('rating-buttons');
    const reportCardContainer = document.getElementById('report-card-container');
    const controls = document.querySelector('.controls');
    const ratingButtons = document.querySelectorAll('.rating-button');
    const reportCardLink = document.getElementById('report-card-link');
    
    // Batch content updates
    const frontContent = `<div class="last-seen-indicator" id="last-seen-front">${lastSeenText}</div><div class="subject-label">${subjectName}</div><p>${currentCard.cards.question}</p>${progressInfo || ''}`;
    const backContent = `<div class="last-seen-indicator" id="last-seen-back">${lastSeenText}</div><div class="subject-label">${subjectName}</div><p>${currentCard.cards.answer}</p>`;
    
    // Update content in one batch
    cardFront.innerHTML = frontContent;
    cardBack.innerHTML = backContent;
    
    // Reset card state and update UI in one batch
    if (card) {
        card.classList.remove('revealed');
    }
    
    // Batch all button state changes
    if (flipButton && ratingButtonsDiv && controls) {
        flipButton.classList.remove('hidden');
        ratingButtonsDiv.classList.add('hidden');
        if (reportCardContainer) {
            reportCardContainer.classList.add('hidden');
        }
        controls.classList.add('flip-only');
    }
    
    // Enable rating buttons
    ratingButtons.forEach(btn => btn.disabled = false);
    
    // Update progress display in background
    updateProgress().catch(error => {
        console.warn('Failed to update progress:', error);
    });
    
    // Show report card link for non-admin users only (non-blocking)
    if (reportCardLink) {
        appState.authService.isAdmin().then(isAdmin => {
            if (isAdmin) {
                reportCardLink.classList.add('hidden');
            } else {
                reportCardLink.classList.remove('hidden');
            }
        }).catch(() => {
            // If error checking admin status, show report card link
            reportCardLink.classList.remove('hidden');
        });
    }
    
    // Ensure card-inner is clickable for normal cards (reset from completion state)
    if (cardInner) {
        cardInner.style.cursor = 'pointer';
        // Re-add event listener if it was removed during completion
        if (appState.cardInnerClickHandler && appState.isCompleted) {
            cardInner.addEventListener('click', appState.cardInnerClickHandler);
        }
    }

    showContent(true);
}

/**
 * Handle session completion - submit batch and show appropriate UI
 */
async function handleSessionComplete() {
    try {
        // Start loading state for batch submission
        await transitionToState('loading');
        
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = 'Saving your progress...';
        }

        // Get session data BEFORE clearing for completion statistics
        const sessionData = appState.sessionManager.getSessionData();
        
        // Submit batch to database
        await appState.dbService.submitBatchReviews(sessionData);
        
        // Clear the session
        appState.sessionManager.clearSession();
        
        // Show completion UI with session data
        showContent(true);
        await showSessionCompleteMessage(sessionData);
        
    } catch (error) {
        console.error('Failed to submit session:', error);
        showError('Failed to save your progress. Please try again.');
    }
}

/**
 * Generate rating chart HTML for session completion
 * @param {Object} sessionData - Session data containing ratings
 * @returns {string} HTML string for rating chart
 */
function generateRatingChart(sessionData) {
    if (!sessionData || !sessionData.ratings) {
        return '<div class="rating-chart"><p>No rating data available</p></div>';
    }

    // Count final ratings for each card
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const ratingLabels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
    const ratingColors = { 1: '#dc3545', 2: '#ffc107', 3: '#28a745', 4: '#17a2b8' };

    // Analyze ratings for each card
    for (const [cardId, ratings] of Object.entries(sessionData.ratings)) {
        if (ratings && ratings.length > 0) {
            // Get the final rating for this card (last rating in the array)
            const finalRating = ratings[ratings.length - 1].rating;
            if (finalRating >= 1 && finalRating <= 4) {
                ratingCounts[finalRating]++;
            }
        }
    }

    const totalCards = Object.values(ratingCounts).reduce((sum, count) => sum + count, 0);
    
    if (totalCards === 0) {
        return '<div class="rating-chart"><p>No cards rated in this session</p></div>';
    }

    // Generate chart HTML
    let chartHTML = '<div class="rating-chart"><h3>Session Ratings</h3>';
    
    for (let rating = 1; rating <= 4; rating++) {
        const count = ratingCounts[rating];
        const percentage = totalCards > 0 ? (count / totalCards) * 100 : 0;
        const color = ratingColors[rating];
        const label = ratingLabels[rating];
        
        chartHTML += `
            <div class="rating-row">
                <div class="rating-label">${label}</div>
                <div class="rating-bar-container">
                    <div class="rating-bar" style="width: ${percentage}%; background-color: ${color}"></div>
                    <div class="rating-count">${count}</div>
                </div>
            </div>
        `;
    }
    
    chartHTML += '</div>';
    return chartHTML;
}

/**
 * Generate review schedule chart HTML for session completion
 * @param {Object} sessionData - Session data containing cards and ratings
 * @returns {string} HTML string for review schedule chart
 */
function generateReviewScheduleChart(sessionData) {
    if (!sessionData || !sessionData.cards || !sessionData.ratings) {
        return '<div class="schedule-chart"><p>No review data available</p></div>';
    }

    // Define time buckets with colors
    const timeBuckets = {
        today: { count: 0, label: 'Today', color: '#ff6b6b' },      // Red - urgent
        week: { count: 0, label: 'This Week', color: '#ffa726' },   // Orange - soon
        month: { count: 0, label: 'This Month', color: '#ffee58' }, // Yellow - medium
        later: { count: 0, label: 'Later', color: '#66bb6a' }      // Green - distant
    };

    const now = new Date();

    // Calculate next review dates using FSRS for each card
    for (const [cardId, ratings] of Object.entries(sessionData.ratings)) {
        if (!ratings || ratings.length === 0) continue;

        // Get the final rating for this card
        const finalRating = ratings[ratings.length - 1].rating;
        
        // Find the corresponding card data
        const cardData = sessionData.cards.find(card => String(card.card_id) === cardId);
        if (!cardData) continue;

        // Calculate next review date using FSRS
        let nextReviewDate;
        try {
            // Get current stability and difficulty, with fallbacks
            const currentStability = cardData.stability || 1.0;
            const currentDifficulty = cardData.difficulty || 5.0;
            const currentState = cardData.state || 'review';
            
            // Use FSRS calculateNextReview function
            const fsrsResult = calculateNextReview(currentStability, currentDifficulty, finalRating);
            nextReviewDate = fsrsResult.nextReviewDate;
        } catch (error) {
            console.warn('FSRS calculation failed, using approximation:', error);
            // Fallback to simple approximation
            const intervalDays = { 1: 1, 2: 3, 3: 7, 4: 14 };
            const days = intervalDays[finalRating] || 7;
            nextReviewDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        }

        // Categorize into time buckets
        const diffMs = nextReviewDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays < 1) {
            timeBuckets.today.count++;
        } else if (diffDays < 7) {
            timeBuckets.week.count++;
        } else if (diffDays < 30) {
            timeBuckets.month.count++;
        } else {
            timeBuckets.later.count++;
        }
    }

    // Calculate total for percentages
    const totalCards = Object.values(timeBuckets).reduce((sum, bucket) => sum + bucket.count, 0);
    
    if (totalCards === 0) {
        return '<div class="schedule-chart"><p>No cards in this session</p></div>';
    }

    // Generate chart HTML
    let chartHTML = '<div class="schedule-chart"><h3>Review Schedule</h3>';
    
    // Create horizontal bars for each time bucket
    for (const [key, bucket] of Object.entries(timeBuckets)) {
        const percentage = totalCards > 0 ? (bucket.count / totalCards) * 100 : 0;
        
        chartHTML += `
            <div class="schedule-row">
                <div class="schedule-label">${bucket.label}</div>
                <div class="schedule-bar-container">
                    <div class="schedule-bar" style="width: ${percentage}%; background-color: ${bucket.color}"></div>
                    <div class="schedule-count">${bucket.count}</div>
                </div>
            </div>
        `;
    }
    
    chartHTML += '</div>';
    return chartHTML;
}

/**
 * Generate review summary HTML for session completion
 * @param {Object} sessionData - Session data containing cards and ratings
 * @returns {string} HTML string for review summary
 */
function generateReviewSummary(sessionData) {
    if (!sessionData || !sessionData.cards || !sessionData.ratings) {
        return '<div class="review-summary"><p>No review data available</p></div>';
    }

    // Calculate next review dates for each card using FSRS
    const now = new Date();
    const timeBuckets = {
        day: 0,    // <1 day
        week: 0,   // 1-7 days
        month: 0,  // 7-30 days
        later: 0   // >30 days
    };

    for (const [cardId, ratings] of Object.entries(sessionData.ratings)) {
        if (!ratings || ratings.length === 0) continue;

        // Get the final rating for this card
        const finalRating = ratings[ratings.length - 1].rating;
        
        // Find the corresponding card data
        const cardData = sessionData.cards.find(card => String(card.card_id) === cardId);
        if (!cardData) continue;

        // Calculate next review date using FSRS
        let nextReviewDate;
        try {
            // Get current stability and difficulty, with fallbacks
            const currentStability = cardData.stability || 1.0;
            const currentDifficulty = cardData.difficulty || 5.0;
            
            // Use FSRS calculateNextReview function
            const fsrsResult = calculateNextReview(currentStability, currentDifficulty, finalRating);
            nextReviewDate = fsrsResult.nextReviewDate;
        } catch (error) {
            console.warn('FSRS calculation failed, using approximation:', error);
            // Fallback to simple approximation
            const intervalDays = { 1: 1, 2: 3, 3: 7, 4: 14 };
            const days = intervalDays[finalRating] || 7;
            nextReviewDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        }

        // Categorize into time buckets
        const diffMs = nextReviewDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays < 1) {
            timeBuckets.day++;
        } else if (diffDays < 7) {
            timeBuckets.week++;
        } else if (diffDays < 30) {
            timeBuckets.month++;
        } else {
            timeBuckets.later++;
        }
    }

    // Generate summary text
    const summaryParts = [];
    if (timeBuckets.day > 0) {
        summaryParts.push(`${timeBuckets.day} cards due in <1 day`);
    }
    if (timeBuckets.week > 0) {
        summaryParts.push(`${timeBuckets.week} cards due in <1 week`);
    }
    if (timeBuckets.month > 0) {
        summaryParts.push(`${timeBuckets.month} cards due in <1 month`);
    }
    if (timeBuckets.later > 0) {
        summaryParts.push(`${timeBuckets.later} cards due later`);
    }

    const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'No upcoming reviews';

    return `
        <div class="review-summary">
            <h3>Next Reviews</h3>
            <p>${summaryText}</p>
        </div>
    `;
}

/**
 * Show session completion message with tier-specific options
 * @param {Object} sessionData - Session data containing ratings and cards
 */
async function showSessionCompleteMessage(sessionData) {
    const contentDiv = document.getElementById('content');
    
    // Set completion state
    appState.isCompleted = true;
    
    // Generate session statistics
    const ratingChart = generateRatingChart(sessionData);
    const scheduleChart = generateReviewScheduleChart(sessionData);
    const reviewSummary = generateReviewSummary(sessionData);
    
    // Get user tier to show appropriate message
    try {
        const userProfile = await appState.authService.getUserProfile(true);
        const userTier = userProfile?.user_tier || 'free';
        
        if (contentDiv) {
            if (userTier === 'free') {
                // Free users - show limit reached
                contentDiv.innerHTML = `
                    <div class="completion-wrapper">
                        <div class="completion-message">
                            <h2>Session Complete!</h2>
                            <p>You've completed your ${SESSION_CONFIG.CARDS_PER_SESSION}-card session.</p>
                            <p>Your daily review limit has been reached.</p>
                            <p>Come back tomorrow for more cards!</p>
                            
                            <div class="session-stats">
                                ${ratingChart}
                                ${scheduleChart}
                                ${reviewSummary}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Paid users - offer new session
                contentDiv.innerHTML = `
                    <div class="completion-wrapper">
                        <div class="completion-message">
                            <h2>Session Complete!</h2>
                            <p>You've completed ${SESSION_CONFIG.CARDS_PER_SESSION} cards in this session.</p>
                            
                            <div class="session-stats">
                                ${ratingChart}
                                ${scheduleChart}
                                ${reviewSummary}
                            </div>
                            
                            <div class="session-actions">
                                <button id="new-session-button" class="nav-button">Start New Session</button>
                            </div>
                        </div>
                    </div>
                `;
                
                // Add event listener for new session button
                const newSessionButton = document.getElementById('new-session-button');
                if (newSessionButton) {
                    newSessionButton.addEventListener('click', async () => {
                        // Force a new session (don't load from storage)
                        appState.forceNewSession = true;
                        await loadSession();
                    });
                }
            }
        }
    } catch (error) {
        // Fallback message
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="completion-wrapper">
                    <div class="completion-message">
                        <h2>Session Complete!</h2>
                        <p>You've completed your study session.</p>
                        
                        <div class="session-stats">
                            ${ratingChart}
                            ${scheduleChart}
                            ${reviewSummary}
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

/**
 * Get formatted progress information for a card
 * @param {Object} card - The card object with progress data
 * @returns {string} HTML string with progress information
 */
function getProgressInfo(card) {
    if (!card.progress) return '';

    const reviewDate = new Date(card.progress.next_review_date);
    const now = new Date();
    const isOverdue = reviewDate < now;
    
    let status = card.progress.state;
    if (isOverdue && status !== 'new') {
        status = 'overdue';
    }

    const statusClass = `status-${status.toLowerCase()}`;
    
    return `
        <div class="card-status ${statusClass}">
            <span class="status-label">Status: ${status}</span>
            <span class="review-count">Reviews: ${card.progress.total_reviews}</span>
        </div>
    `;
}

/**
 * Initialize or load a session
 */
async function loadSession() {
    try {
        if (!appState.user) {
            throw new Error('No user found');
        }

        // Start loading state
        await transitionToState('loading');
        
        // Update loading message
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = 'Preparing your study session...';
        }

        // Try to load existing session from storage first (only if not explicitly starting new)
        if (!appState.forceNewSession && appState.sessionManager.loadSession()) {
            // Session loaded from storage, get current card
            appState.currentCard = appState.sessionManager.getCurrentCard();
            
            if (appState.currentCard) {
                await displayCurrentCard();
                await transitionToState('content');
                return;
            }
            
            // If no current card but session exists, check if complete
            if (appState.sessionManager.isSessionComplete()) {
                await handleSessionComplete();
                return;
            }
        }
        
        // Clear force new session flag
        appState.forceNewSession = false;

        // Initialize progress for new user if needed
        await appState.dbService.initializeUserProgress(appState.user.id);
        
        // Check daily limit for free users before starting new session
        const userProfile = await appState.authService.getUserProfile(true);
        const userTier = userProfile?.user_tier || 'free';
        
        if (userTier === 'free') {
            const today = new Date().toDateString();
            const lastReviewDate = userProfile?.last_review_date ? 
                new Date(userProfile.last_review_date).toDateString() : null;
            
            const reviewsToday = (lastReviewDate === today) ? 
                (userProfile.reviews_today || 0) : 0;
            
            if (reviewsToday >= SESSION_CONFIG.FREE_USER_DAILY_LIMIT) {
                showContent(true);
                showDailyLimitMessage({ 
                    limitReached: true, 
                    tier: 'free', 
                    reviewsToday, 
                    limit: SESSION_CONFIG.FREE_USER_DAILY_LIMIT 
                });
                return;
            }
        }

        // Initialize new session with configured number of cards
        if (loadingText) {
            loadingText.textContent = 'Loading your flashcards...';
        }
        
        try {
            await appState.sessionManager.initializeSession(appState.user.id, appState.dbService);
            
            // No need to reset milestone tracking - it's based on daily totals now
        } catch (error) {
            if (error.message.includes('No cards available')) {
                showContent(true);
                showNoMoreCardsMessage();
                return;
            }
            throw error; // Re-throw other errors
        }
        
        // Get the first card
        appState.currentCard = appState.sessionManager.getCurrentCard();
        
        if (!appState.currentCard) {
            showContent(true);
            showNoMoreCardsMessage();
            return;
        }

        appState.isCompleted = false;
        
        // Display the card
        await displayCurrentCard();
        
        // Transition to content
        await transitionToState('content');
        
    } catch (error) {
        showError(error.message || 'Failed to load your study session');
    }
}


// DOM Elements
const flipButton = document.getElementById('flip-button');
const ratingButtons = document.getElementById('rating-buttons');
const cardInner = document.querySelector('.card-inner');
const currentCardSpan = document.getElementById('current-card');
const totalCardsSpan = document.getElementById('total-cards');
const content = document.getElementById('content');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');

// Initialize the app
async function initializeApp() {
    try {
        // Start with loading state
        await transitionToState('loading');
        
        // Update loading message
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = 'Initializing your study session...';
        }
        
        // Check authentication
        const user = await auth.getCurrentUser();
        if (!user) {
            auth.redirectToLogin();
            return;
        }

        // Store user in app state
        appState.user = user;

        // Check if user is admin and show admin link
        await checkAndShowAdminNav(user.id);

        // Initialize navigation controller
        appState.navigationController = new NavigationController();

        // Initialize FSRS parameters for the user
        try {
            await database.getUserFSRSParameters(user.id);
            console.log('FSRS parameters initialized for user');
        } catch (error) {
            console.error('Error initializing FSRS parameters:', error);
            // Continue even if FSRS parameter initialization fails
        }

        // Initialize streak UI for milestone notifications only
        try {
            const { default: streakUI } = await import('./streakUI.js');
            await streakUI.initialize(appState.user.id);
            window.streakUI = streakUI; // Make globally available
            console.log('Streak UI initialized');
        } catch (error) {
            console.error('Error initializing streak UI:', error);
            // Continue even if streak UI initialization fails
        }

        // Set up auth state change listener
        auth.onAuthStateChange((user) => {
            appState.user = user;
            if (!user) {
                auth.redirectToLogin();
            }
        });

        // Set up event listeners first
        setupEventListeners();
        
        // Load session (this will handle its own state transitions)
        await loadSession();
        
    } catch (error) {
        showError(error.message || 'Failed to start your study session');
    }
}

// Debounce utility
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

function setupEventListeners() {
    // Get DOM elements
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    const retryButton = document.getElementById('retry-button');
    const logoutButton = document.getElementById('logout-button');
    const errorLogoutButton = document.getElementById('error-logout-button');
    const cardInner = document.querySelector('.card-inner');
    const reportCardLink = document.getElementById('report-card-link');

    // Add event listeners
    if (flipButton) {
        flipButton.addEventListener('click', handleFlip);
    }
    if (cardInner) {
        // Store reference to the handler so we can remove it later
        appState.cardInnerClickHandler = handleFlip;
        cardInner.addEventListener('click', appState.cardInnerClickHandler);
    }
    if (ratingButtons) {
        ratingButtons.querySelectorAll('.rating-button').forEach(btn => {
            btn.addEventListener('click', debounce(handleRating, 200));
        });
    }
    if (reportCardLink) {
        reportCardLink.addEventListener('click', handleFlagCard);
    }
    // Add retry and logout handlers
    if (retryButton) {
        retryButton.addEventListener('click', loadSession);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', () => auth.signOut());
    }
    if (errorLogoutButton) {
        errorLogoutButton.addEventListener('click', () => auth.signOut());
    }
    
    // Set up flag modal event listeners
    setupFlagModalListeners();
}

function handleFlip() {
    // Prevent flipping if session is completed
    if (appState.isCompleted) return;
    
    if (!appState.currentCard) return;
    const card = document.querySelector('.card');
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    const controls = document.querySelector('.controls');
    const reportCardLink = document.getElementById('report-card-link');
    
    if (!card || !flipButton || !ratingButtons || !controls) {
        // Required DOM elements not found
        return;
    }
    
    const reportCardContainer = document.getElementById('report-card-container');
    
    card.classList.toggle('revealed');
    if (card.classList.contains('revealed')) {
        // Show rating buttons and report card link, hide flip button
        ratingButtons.classList.remove('hidden');
        flipButton.classList.add('hidden');
        controls.classList.remove('flip-only');
        // Show report card container for non-admins
        if (reportCardContainer && reportCardLink) {
            appState.authService.isAdmin().then(isAdmin => {
                if (!isAdmin) {
                    reportCardContainer.classList.remove('hidden');
                }
            });
        }
    } else {
        // Show flip button, hide rating buttons and report card link
        ratingButtons.classList.add('hidden');
        if (reportCardContainer) {
            reportCardContainer.classList.add('hidden');
        }
        flipButton.classList.remove('hidden');
        controls.classList.add('flip-only');
    }
}

async function handleRating(event) {
    try {
        const button = event.target;
        const rating = parseInt(button.dataset.rating);
        if (!rating || !appState.currentCard) return;

        // Defensive logging for card_id and user_id
        const cardId = appState.currentCard.card_id;
        const userId = appState.user?.id;
        if (!cardId || !userId) {
            // handleRating: Missing cardId or userId
            showError('Failed to record your rating. Card or user information is missing.');
            return;
        }

        // Disable rating buttons while processing (visual feedback)
        const ratingButtons = document.querySelectorAll('.rating-button');
        const ratingButtonsContainer = document.getElementById('rating-buttons');
        
        // Use CSS class for better performance and visual feedback
        if (ratingButtonsContainer) {
            ratingButtonsContainer.classList.add('processing');
        }
        ratingButtons.forEach(btn => btn.disabled = true);

        // Calculate response time (if we have a start time)
        const responseTime = appState.cardStartTime ? 
            Date.now() - appState.cardStartTime : // Keep in milliseconds
            null;

        // Record the rating in the session manager (local cache)
        const recordSuccess = appState.sessionManager.recordRating(rating, responseTime);
        if (!recordSuccess) {
            throw new Error('Failed to record rating in session manager');
        }

        // Increment session reviewed count
        appState.sessionReviewedCount++;
        
        // Track milestone for cards reviewed (only for ratings 2, 3, 4) - non-blocking
        if (rating >= 2 && typeof window.streakUI !== 'undefined') {
            // Run streak tracking in background without blocking UI
            window.streakUI.trackCardReview().catch(error => {
                console.error('Error tracking card review milestone:', error);
            });
        }
        
        // Check if session is complete
        if (appState.sessionManager.isSessionComplete()) {
            await handleSessionComplete();
            return;
        }
        
        // Get the next card from the session
        appState.currentCard = appState.sessionManager.getCurrentCard();
        
        if (appState.currentCard) {
            await displayCurrentCard();
        } else {
            // This shouldn't happen if session isn't complete
            console.error('Session state inconsistent: no current card but session not complete');
            console.error('Session data:', appState.sessionManager.getSessionData());
            showError('Session state error. Please refresh the page to continue.');
        }

        // Re-enable rating buttons after processing
        if (ratingButtonsContainer) {
            ratingButtonsContainer.classList.remove('processing');
        }
        ratingButtons.forEach(btn => btn.disabled = false);

    } catch (error) {
        // Error handling rating
        console.error('Error in handleRating:', error);
        console.error('Rating:', rating);
        console.error('Current card:', appState.currentCard);
        console.error('Session data:', appState.sessionManager.getSessionData());
        
        // More specific error messages
        if (error.message.includes('Failed to record rating in session manager')) {
            showError('Failed to save your rating. Please try again.');
        } else if (error.message.includes('Session state error')) {
            showError('Session state error. Please refresh the page to continue.');
        } else {
            showError('An error occurred while processing your rating. Please try again.');
        }
        
        // Re-enable rating buttons on error
        const ratingButtons = document.querySelectorAll('.rating-button');
        const ratingButtonsContainer = document.getElementById('rating-buttons');
        
        if (ratingButtonsContainer) {
            ratingButtonsContainer.classList.remove('processing');
        }
        ratingButtons.forEach(btn => btn.disabled = false);
    }
}

/**
 * Format time difference into human-readable "time ago" string
 * @param {string|Date|null} lastReviewDate - Last review date
 * @returns {string} Formatted time string
 */
function formatTimeAgo(lastReviewDate) {
    if (!lastReviewDate) {
        return 'Never';
    }

    const now = new Date();
    const lastReview = new Date(lastReviewDate);
    const diffMs = now - lastReview;
    
    // Handle invalid dates
    if (isNaN(diffMs) || diffMs < 0) {
        return 'Never';
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 5) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
        return diffHours === 1 ? '1h ago' : `${diffHours}h ago`;
    } else if (diffDays < 7) {
        return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else if (diffDays < 30) {
        return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
    } else {
        return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
    }
}

function updateCardDisplay(card) {
    const frontContent = document.querySelector('.card-front p');
    const backContent = document.querySelector('.card-back p');
    
    frontContent.textContent = card.question;
    backContent.textContent = card.answer;
    
    // Update progress display
    currentCardSpan.textContent = card.position || '?';
    totalCardsSpan.textContent = card.total || '?';
}

function showNoMoreCardsMessage() {
    const frontContent = document.querySelector('.card-front p');
    const backContent = document.querySelector('.card-back p');
    const lastSeenFront = document.getElementById('last-seen-front');
    const lastSeenBack = document.getElementById('last-seen-back');
    const flipButton = document.getElementById('flip-button');
    const reportCardLink = document.getElementById('report-card-link');
    const ratingButtons = document.getElementById('rating-buttons');
    const progressDiv = document.querySelector('.progress');
    const cardInner = document.querySelector('.card-inner');
    const card = document.querySelector('.card');
    
    // Set completion state to disable flip functionality
    appState.isCompleted = true;
    
    // Hide last seen indicators during completion
    if (lastSeenFront) lastSeenFront.style.display = 'none';
    if (lastSeenBack) lastSeenBack.style.display = 'none';
    
    // Ensure card is showing the front face
    if (card) {
        card.classList.remove('revealed');
    }
    
    // Remove click event listener from card-inner to prevent flipping
    if (cardInner && appState.cardInnerClickHandler) {
        cardInner.style.cursor = 'default';
        cardInner.removeEventListener('click', appState.cardInnerClickHandler);
    }
    
    if (frontContent) {
        frontContent.innerHTML = `
            <div class="no-cards-message">
                <h2>No Cards Available</h2>
                <p>No cards are available for review right now.</p>
                <p>Come back later for more cards.</p>
            </div>
        `;
    }
    
    if (backContent) {
        backContent.textContent = '';
    }
    
    if (flipButton) {
        flipButton.classList.add('hidden');
    }
    
    const reportCardContainer = document.getElementById('report-card-container');
    if (reportCardContainer) {
        reportCardContainer.classList.add('hidden');
    }
    
    if (ratingButtons) {
        ratingButtons.classList.add('hidden');
    }
    
    if (progressDiv) {
        progressDiv.classList.add('hidden');
    }
}

function showDailyLimitMessage(limitInfo) {
    const frontContent = document.querySelector('.card-front p');
    const backContent = document.querySelector('.card-back p');
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    const progressDiv = document.querySelector('.progress');
    const cardInner = document.querySelector('.card-inner');
    const card = document.querySelector('.card');
    
    // Set completion state to disable flip functionality
    appState.isCompleted = true;
    
    // Ensure card is showing the front face
    if (card) {
        card.classList.remove('revealed');
    }
    
    // Remove click event listener from card-inner to prevent flipping
    if (cardInner && appState.cardInnerClickHandler) {
        cardInner.style.cursor = 'default';
        cardInner.removeEventListener('click', appState.cardInnerClickHandler);
    }
    
    const { tier, reviewsToday, limit } = limitInfo;
    
    if (frontContent) {
        frontContent.innerHTML = `
            <div class="daily-limit-message">
                <h2>Daily Limit Reached! ⏰</h2>
                <p>You've completed <strong>${reviewsToday}</strong> out of <strong>${limit}</strong> daily reviews as a ${tier} user.</p>
                <p>Come back tomorrow for more flashcard practice!</p>
                <div class="upgrade-info">
                    <p><strong>Want unlimited reviews?</strong></p>
                    <p>Upgrade to a paid account for unlimited daily reviews and access to premium features.</p>
                </div>
            </div>
        `;
    }
    
    if (backContent) {
        backContent.textContent = '';
    }
    
    if (flipButton) {
        flipButton.classList.add('hidden');
    }
    
    const reportCardContainer = document.getElementById('report-card-container');
    if (reportCardContainer) {
        reportCardContainer.classList.add('hidden');
    }
    
    if (ratingButtons) {
        ratingButtons.classList.add('hidden');
    }
    
    if (progressDiv) {
        progressDiv.classList.add('hidden');
    }
}

/**
 * Handle flag card button click
 */
function handleFlagCard() {
    if (!appState.currentCard) return;
    
    const modal = document.getElementById('flag-modal');
    if (modal) {
        modal.classList.remove('hidden');
        resetFlagModal();
    }
}

/**
 * Set up flag modal event listeners
 */
function setupFlagModalListeners() {
    const modal = document.getElementById('flag-modal');
    const closeButton = document.getElementById('modal-close');
    const cancelButton = document.getElementById('cancel-flag');
    const submitButton = document.getElementById('submit-flag');
    const reasonRadios = document.querySelectorAll('input[name="flag-reason"]');
    const otherReasonInput = document.getElementById('other-reason-input');
    const otherReasonText = document.getElementById('other-reason-text');

    // Close modal handlers
    if (closeButton) {
        closeButton.addEventListener('click', closeFlagModal);
    }
    if (cancelButton) {
        cancelButton.addEventListener('click', closeFlagModal);
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFlagModal();
            }
        });
    }

    // Handle reason selection
    reasonRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            // Show/hide other reason input
            if (radio.value === 'other') {
                otherReasonInput.classList.remove('hidden');
                otherReasonText.focus();
            } else {
                otherReasonInput.classList.add('hidden');
            }
            
            // Update visual selection
            updateReasonSelection();
            validateFlagForm();
        });
    });

    // Handle other reason text input
    if (otherReasonText) {
        otherReasonText.addEventListener('input', validateFlagForm);
    }

    // Handle form submission
    if (submitButton) {
        submitButton.addEventListener('click', submitFlag);
    }

    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeFlagModal();
        }
    });
}

/**
 * Close the flag modal
 */
function closeFlagModal() {
    const modal = document.getElementById('flag-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    resetFlagModal();
}

/**
 * Reset the flag modal to initial state
 */
function resetFlagModal() {
    // Clear all radio buttons
    const reasonRadios = document.querySelectorAll('input[name="flag-reason"]');
    reasonRadios.forEach(radio => {
        radio.checked = false;
    });
    
    // Hide other reason input
    const otherReasonInput = document.getElementById('other-reason-input');
    const otherReasonText = document.getElementById('other-reason-text');
    if (otherReasonInput) {
        otherReasonInput.classList.add('hidden');
    }
    if (otherReasonText) {
        otherReasonText.value = '';
    }
    
    // Reset visual selection
    updateReasonSelection();
    validateFlagForm();
}

/**
 * Update visual selection for reason options
 */
function updateReasonSelection() {
    const reasonOptions = document.querySelectorAll('.reason-option');
    reasonOptions.forEach(option => {
        const radio = option.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

/**
 * Validate the flag form and enable/disable submit button
 */
function validateFlagForm() {
    const submitButton = document.getElementById('submit-flag');
    const reasonRadios = document.querySelectorAll('input[name="flag-reason"]');
    const otherReasonText = document.getElementById('other-reason-text');
    
    let isValid = false;
    
    // Check if any reason is selected
    const selectedReason = Array.from(reasonRadios).find(radio => radio.checked);
    
    if (selectedReason) {
        if (selectedReason.value === 'other') {
            // For "other", require text input
            isValid = otherReasonText && otherReasonText.value.trim().length > 0;
        } else {
            // For predefined reasons, just need selection
            isValid = true;
        }
    }
    
    if (submitButton) {
        submitButton.disabled = !isValid;
    }
}

/**
 * Submit the flag report
 */
async function submitFlag() {
    try {
        const submitButton = document.getElementById('submit-flag');
        const reasonRadios = document.querySelectorAll('input[name="flag-reason"]');
        const otherReasonText = document.getElementById('other-reason-text');
        
        // Disable submit button during submission
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Reporting...';
        }
        
        // Get selected reason
        const selectedReason = Array.from(reasonRadios).find(radio => radio.checked);
        if (!selectedReason) {
            throw new Error('Please select a reason for reporting this card');
        }
        
        let reason = selectedReason.value;
        let comment = null;
        
        if (reason === 'other') {
            comment = otherReasonText.value.trim();
            if (!comment) {
                throw new Error('Please describe the issue');
            }
        }
        
        // Submit the flag
        if (!appState.currentCard) {
            throw new Error('No card selected');
        }
        
        // Handle different card data structures
        let cardId;
        if (appState.currentCard.cards && appState.currentCard.cards.id) {
            cardId = appState.currentCard.cards.id;
        } else if (appState.currentCard.card_id) {
            cardId = appState.currentCard.card_id;
        } else if (appState.currentCard.id) {
            cardId = appState.currentCard.id;
        } else {
            throw new Error('Card ID not found');
        }
        await appState.dbService.flagCard(cardId, reason, comment);
        
        // Close modal and show success message
        closeFlagModal();
        showFlagSuccessMessage();
        
        // Move to next card since this one is now flagged
        await moveToNextCard();
        
    } catch (error) {
        // Show error message
        alert(error.message || 'Failed to report card. Please try again.');
        
        // Reset submit button
        const submitButton = document.getElementById('submit-flag');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Report Card';
        }
    }
}

/**
 * Show success message after flagging
 */
function showFlagSuccessMessage() {
    // Could show a toast notification or temporary message
    // For now, we'll use a simple alert
    setTimeout(() => {
        alert('Thank you for your report. This card has been flagged for review.');
    }, 100);
}

/**
 * Move to the next card after flagging
 */
async function moveToNextCard() {
    appState.currentCardIndex++;
    if (appState.currentCardIndex >= appState.cards.length) {
        showNoMoreCardsMessage();
    } else {
        await displayCurrentCard();
    }
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initializeApp); 