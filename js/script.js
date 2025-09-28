// Import required modules
import { RATING, calculateNextReview, updateStability, updateDifficulty } from './fsrs.js';
import database from './database.js';
import auth from './auth.js';
import SessionManager from './sessionManager.js';
import ServerSessionManager from './serverSessionManager.js';
import { SESSION_CONFIG } from './config.js';
import NavigationController from './navigation.js';
import slideMenu from './slideMenu.js';
import { handleError } from './errorHandler.js';
import { getSupabaseClient } from './supabase-client.js';
import { Validator } from './validator.js';
import TimerManager from './timerManager.js';
import './spinner.js'; // Centralized spinner system

// Supabase client instance
let supabase;

/**
 * Check if user is admin and show admin navigation link
 * @param {string} userId
 */
async function checkAndShowAdminNav(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
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
        // Silently fail - admin link stays hidden (no user notification needed)
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
    // For custom domain (nanotopic.co.uk)
    if (window.location.hostname.includes('nanotopic.co.uk')) {
        return '/';
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
    cardTimer: new TimerManager(), // Timer for active viewing time tracking
    sessionReviewedCount: 0, // Track cards reviewed in this session
    totalCards: 0,
    isLoading: true,
    isLoadingSession: false, // Prevent concurrent loadSession calls
    loadSessionStartTime: null, // Timestamp for race condition detection
    user: null,
    dbService: database,  // Use the default database instance
    authService: auth,    // Use the default auth instance
    sessionManager: new ServerSessionManager(), // Server-side session management
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
let loadingStartTime = null;

// Minimum loading duration to ensure users can read the loading message
const MINIMUM_LOADING_TIME = 1000; // 1 second
const TRANSITION_DURATION = 300; // 300ms

// Mobile-specific loading state management
const MOBILE_MAX_LOADING_TIME = 30000; // 30 seconds max loading on mobile
let loadingTimeoutId = null;
let loadingStartTimestamp = null;

// Desktop-specific loading state management
const DESKTOP_MAX_LOADING_TIME = 30000; // 30 seconds max loading on desktop
let desktopLoadingTimeoutId = null;
let desktopLoadingStartTimestamp = null;

async function transitionToState(newState, message = null) {
    if (currentState === newState) return;
    
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const savingState = document.getElementById('saving-state');
    const content = document.getElementById('content');
    
    // Clear loading timeouts when leaving loading state
    if (currentState === 'loading' && newState !== 'loading') {
        clearMobileLoadingTimeout();
        clearDesktopLoadingTimeout();
    }
    
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
    if (newState === 'saving') {
        const savingMessage = message || 'Saving your progress...';
        spinnerManager.show('saving-state', {
            message: savingMessage,
            type: 'saving'
        });
        
        // Also update legacy element if it exists
        const savingText = document.querySelector('.saving-text');
        if (savingText) {
            savingText.textContent = savingMessage;
        }
    }
    if (newState === 'loading') {
        // Show loading spinner with appropriate message
        let loadingMessage = message;
        if (!loadingMessage) {
            // Use dynamic message from database
            try {
                if (appState.dbService) {
                    loadingMessage = appState.dbService.getRandomLoadingMessageSync();
                } else {
                    loadingMessage = 'Generating your flashcards...';
                }
            } catch (error) {
                console.warn('❌ Failed to get dynamic loading message:', error);
                loadingMessage = 'Generating your flashcards...';
            }
        }
        
        spinnerManager.show('loading-state', {
            message: loadingMessage,
            type: 'loading'
        });
        
        // Also update legacy element if it exists
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = loadingMessage;
        }
    }
    
    // Show new state
    const newElement = getElementForState(newState);
    if (newElement) {
        newElement.classList.remove('hidden');
        newElement.classList.add('fade-in');
        setTimeout(() => newElement.classList.remove('fade-in'), TRANSITION_DURATION);
    }
    
    // Ensure error state is explicitly hidden when showing content
    if (newState === 'content') {
        const errorState = document.getElementById('error-state');
        if (errorState && !errorState.classList.contains('hidden')) {
            errorState.classList.add('hidden');
        }
    }
    
    currentState = newState;
    
    // Track loading start time and setup loading timeouts
    if (newState === 'loading') {
        minimumLoadingStartTime = Date.now();
        setupMobileLoadingTimeout();
        setupDesktopLoadingTimeout();
    }
}

function getCurrentStateElement() {
    switch (currentState) {
        case 'loading': return document.getElementById('loading-state');
        case 'error': return document.getElementById('error-state');
        case 'saving': return document.getElementById('saving-state');
        case 'content': return document.getElementById('content');
        default: return null;
    }
}

function getElementForState(state) {
    switch (state) {
        case 'loading': return document.getElementById('loading-state');
        case 'error': return document.getElementById('error-state');
        case 'saving': return document.getElementById('saving-state');
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
function showLoading(show, message) {
    if (show) {
        spinnerManager.show('loading-state', {
            message: message || 'Loading...',
            type: 'loading'
        });
        transitionToState('loading');
    } else {
        spinnerManager.hide('loading-state');
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
    spinnerManager.hide('loading-state');
    // Deprecated - use transitionToState() instead
    // Kept for compatibility
}

/**
 * Setup mobile-specific loading timeout to prevent stuck states
 */
function setupMobileLoadingTimeout() {
    // Only setup timeout on mobile devices
    if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        return;
    }
    
    // Clear any existing timeout
    clearMobileLoadingTimeout();
    
    loadingStartTimestamp = Date.now();
    loadingTimeoutId = setTimeout(() => {
        handleMobileLoadingTimeout();
    }, MOBILE_MAX_LOADING_TIME);
}

/**
 * Clear mobile loading timeout
 */
function clearMobileLoadingTimeout() {
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
    loadingStartTimestamp = null;
}

/**
 * Handle mobile loading timeout - show recovery options
 */
function handleMobileLoadingTimeout() {
    const isProduction = !window.location.hostname.includes('localhost');
    const hostname = window.location.hostname;
    
    console.error('Loading timeout detected on mobile device', {
        hostname,
        isProduction,
        currentState,
        loadingDuration: loadingStartTimestamp ? Date.now() - loadingStartTimestamp : 'unknown'
    });
    
    // Check if we're still in loading state
    if (currentState !== 'loading') {
        return;
    }
    
    // Production-specific error messages with more context
    let timeoutMessage;
    if (isProduction) {
        timeoutMessage = `
            Loading timeout on ${hostname}. This might be due to:
            • Mobile network connectivity issues
            • Production server response delays
            • HTTPS/security policy restrictions
            • Safari/mobile browser storage limitations
            
            Try refreshing the page or switching to a different network.
        `;
    } else {
        timeoutMessage = `
            Loading is taking longer than expected. This might be due to:
            • Slow network connection
            • Mobile browser restrictions
            • Session storage issues
            
            Try refreshing the page or checking your internet connection.
        `;
    }
    
    showError(timeoutMessage);
    
    // Clear any stuck session data that might be causing issues
    try {
        if (appState?.sessionManager) {
            appState.sessionManager.clearSession();
        }
    } catch (error) {
        console.warn('Failed to clear session during timeout recovery:', error);
    }
    
    // Add mobile-specific recovery button with production context
    setTimeout(() => {
        const errorActions = document.querySelector('.error-actions');
        if (errorActions && !document.getElementById('mobile-recovery-button')) {
            const recoveryButton = document.createElement('button');
            recoveryButton.id = 'mobile-recovery-button';
            recoveryButton.className = 'nav-button';
            recoveryButton.textContent = isProduction ? 'Hard Refresh' : 'Force Refresh';
            recoveryButton.onclick = () => {
                // Production-specific: force bypass cache
                if (isProduction) {
                    window.location.href = window.location.href + '?t=' + Date.now();
                } else {
                    window.location.reload(true);
                }
            };
            errorActions.insertBefore(recoveryButton, errorActions.firstChild);
        }
    }, 100);
}

/**
 * Setup desktop loading timeout to prevent stuck states
 */
function setupDesktopLoadingTimeout() {
    // Only setup timeout on desktop devices
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        return;
    }

    // Clear any existing timeout
    clearDesktopLoadingTimeout();

    desktopLoadingStartTimestamp = Date.now();
    desktopLoadingTimeoutId = setTimeout(() => {
        handleDesktopLoadingTimeout();
    }, DESKTOP_MAX_LOADING_TIME);
}

/**
 * Clear desktop loading timeout
 */
function clearDesktopLoadingTimeout() {
    if (desktopLoadingTimeoutId) {
        clearTimeout(desktopLoadingTimeoutId);
        desktopLoadingTimeoutId = null;
    }
    desktopLoadingStartTimestamp = null;
}

/**
 * Handle desktop loading timeout - show retry option
 */
function handleDesktopLoadingTimeout() {
    const hostname = window.location.hostname;
    console.error('Loading timeout detected on desktop', {
        hostname,
        currentState,
        loadingDuration: desktopLoadingStartTimestamp ? Date.now() - desktopLoadingStartTimestamp : 'unknown'
    });

    if (currentState !== 'loading') {
        return;
    }

    showError('Loading is taking longer than expected. Please check your internet connection and try again.');

    // Clear any stuck session data that might be causing issues
    try {
        if (appState?.sessionManager) {
            appState.sessionManager.clearSession();
        }
    } catch (error) {
        console.warn('Failed to clear session during timeout recovery:', error);
    }

    setTimeout(() => {
        const errorActions = document.querySelector('.error-actions');
        if (errorActions && !document.getElementById('desktop-retry-button')) {
            const retryButton = document.createElement('button');
            retryButton.id = 'desktop-retry-button';
            retryButton.className = 'nav-button';
            retryButton.textContent = 'Retry';
            retryButton.onclick = () => window.location.reload();
            errorActions.insertBefore(retryButton, errorActions.firstChild);
        }
    }, 100);
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
 * Get subject name by ID with caching (LRU cache with 100 entry limit)
 */
const subjectCache = new Map();
const SUBJECT_CACHE_MAX_SIZE = 100;

function evictOldestCacheEntry() {
    if (subjectCache.size >= SUBJECT_CACHE_MAX_SIZE) {
        const firstKey = subjectCache.keys().next().value;
        subjectCache.delete(firstKey);
    }
}

function clearSubjectCache() {
    subjectCache.clear();
}

// Expose to global scope for access from other modules
window.clearSubjectCache = clearSubjectCache;

async function getSubjectName(subjectId) {
    if (subjectCache.has(subjectId)) {
        // Move to end for LRU behavior
        const value = subjectCache.get(subjectId);
        subjectCache.delete(subjectId);
        subjectCache.set(subjectId, value);
        return value;
    }
    
    try {
        const supabase = await appState.dbService.getSupabase();
        const { data: subject, error } = await supabase
            .from('subjects')
            .select('name')
            .eq('id', subjectId)
            .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
            
        if (error) throw error;
        
        const subjectName = subject?.name || 'Unknown Subject';
        
        // Evict oldest entry if cache is full
        evictOldestCacheEntry();
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
// Add guard to prevent rapid successive calls
let displayCurrentCardInProgress = false;

async function displayCurrentCard() {
    // Prevent rapid successive calls
    if (displayCurrentCardInProgress) {
        return;
    }
    
    displayCurrentCardInProgress = true;
    
    try {
        if (!appState.currentCard) {
            console.warn('displayCurrentCard called without a current card', appState);
            showError('No card available for review.');
            return;
        }

    const currentCard = appState.currentCard;
    // Start timing for active viewing
    appState.cardTimer.start(); // Track active viewing time

    // Robust check for card data
    if (!currentCard || typeof currentCard.cards?.question !== 'string' || typeof currentCard.cards?.answer !== 'string') {
        console.error('Card data is missing or invalid:', currentCard);
        showError('Card data is missing or invalid. Please refresh or contact support.');
        return;
    }

    const cardFront = document.querySelector('.card-front');
    const cardBack = document.querySelector('.card-back');
    const card = document.querySelector('.card');

    if (!cardFront || !cardBack || !card) {
        console.error('Card display elements not found', { cardFront, cardBack, card });
        showError('Card display elements not found.');
        return;
    }

    // Update card content and progress info
    // Use pre-fetched subject name first, fallback to lookup if needed
    let subjectName = 'Unknown Subject';
    if (currentCard.cards?.subject_name) {
        // Use pre-fetched subject name from session data
        subjectName = currentCard.cards.subject_name;
    } else if (currentCard.cards?.subject_id) {
        // Fallback: fetch subject name if not pre-fetched
        try {
            subjectName = await getSubjectName(currentCard.cards.subject_id);
        } catch (error) {
            console.warn('Failed to fetch subject name:', error);
        }
    }
    
    // Batch all DOM updates to minimize reflows/repaints
    const lastSeenText = formatTimeAgo(currentCard.last_reviewed_at);
    const progressInfo = getProgressInfo(currentCard);
    
    // Get all DOM elements at once
    const flipButton = document.getElementById('flip-button');
    const ratingButtonsDiv = document.getElementById('rating-buttons');
    const controls = document.querySelector('.controls');
    const ratingButtons = document.querySelectorAll('.rating-button');
    const flagCardButton = document.getElementById('flag-overlay-button');
    
    // Batch content updates
    const frontContent = `<div class="last-seen-indicator" id="last-seen-front">Last seen: ${Validator.escapeHtml(lastSeenText)}</div><div class="subject-label">${Validator.escapeHtml(subjectName)}</div><p>${Validator.escapeHtml(currentCard.cards.question)}</p>${progressInfo || ''}`;
    const backContent = `<div class="last-seen-indicator" id="last-seen-back">Last seen: ${Validator.escapeHtml(lastSeenText)}</div><div class="subject-label">${Validator.escapeHtml(subjectName)}</div><p>${Validator.escapeHtml(currentCard.cards.answer)}</p>`;
    
    // Update content in one batch
    cardFront.innerHTML = frontContent;
    cardBack.innerHTML = backContent;
    
    // Reset card state and update UI in one batch
    if (card) {
        card.classList.remove('revealed');
        
        // Check if card has "hot" tag and apply CSS class
        const hasHotTag = currentCard.cards?.tags && Array.isArray(currentCard.cards.tags) && currentCard.cards.tags.includes('hot');
        if (hasHotTag) {
            card.classList.add('hot');
        } else {
            card.classList.remove('hot');
        }
    }
    
    // Batch all button state changes
    if (flipButton && ratingButtonsDiv && controls) {
        flipButton.classList.remove('hidden');
        ratingButtonsDiv.classList.add('hidden');
        controls.classList.add('flip-only');
    }
    
    // Enable rating buttons
    ratingButtons.forEach(btn => btn.disabled = false);
    
    // Update progress display in background
    updateProgress().catch(error => {
        console.warn('Failed to update progress:', error);
    });
    
    // Flag visibility controlled by CSS based on card reveal state now
    
    // Ensure card-inner is clickable for normal cards (reset from completion state)
    if (cardInner) {
        cardInner.style.cursor = 'pointer';
        // Re-add event listener if it was removed during completion
        if (appState.cardInnerClickHandler && appState.isCompleted) {
            cardInner.addEventListener('click', appState.cardInnerClickHandler);
        }
    }

    showContent(true);
    
    } finally {
        displayCurrentCardInProgress = false;
    }
}

/**
 * Handle session completion - submit batch and show appropriate UI
 */
async function handleSessionComplete() {
    try {
        // Show saving spinner
        spinnerManager.show('saving-state', {
            message: 'Saving your progress...',
            type: 'saving'
        });
        
        // Yield to the browser so the spinner can animate
        await new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(resolve);
            } else {
                setTimeout(resolve, 0);
            }
        });

        // Get session data BEFORE clearing for completion statistics
        const sessionData = appState.sessionManager.getSessionData();
        
        // For server sessions, load ratings from reviews table for completion display
        if (appState.sessionManager instanceof ServerSessionManager) {
            await appState.sessionManager.loadRatingsFromReviews();
            // Update session data with loaded ratings
            sessionData.ratings = appState.sessionManager.sessionData.ratings;
        } else {
            // For client sessions (legacy), submit batch to database
            await appState.dbService.submitBatchReviews(sessionData);
        }
        
        // Clear the session
        appState.sessionManager.clearSession();
        
        // Clear subject cache to prevent memory leaks
        clearSubjectCache();
        
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

    // Count final ratings for each card (using ratings 1 and 3)
    const ratingCounts = { 1: 0, 3: 0 };
    const ratingLabels = { 1: 'Again', 3: 'Known' };
    const ratingColors = { 1: '#dc3545', 3: '#28a745' };

    // Analyze ratings for each card
    for (const [cardId, ratings] of Object.entries(sessionData.ratings)) {
        if (ratings && ratings.length > 0) {
            // Get the final rating for this card (last rating in the array)
            const finalRating = ratings[ratings.length - 1].rating;
            if (ratingCounts[finalRating] !== undefined) {
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
    
    for (const rating of [1, 3]) {
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
        const cardData = sessionData.cards.find(card => String(card.card_template_id) === cardId);
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
            // Fallback to simple approximation (updated for 0-3 scale)
            const intervalDays = { 0: 1, 1: 3, 2: 7, 3: 14 };
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
        const cardData = sessionData.cards.find(card => String(card.card_template_id) === cardId);
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
            // Fallback to simple approximation (updated for 0-3 scale)
            const intervalDays = { 0: 1, 1: 3, 2: 7, 3: 14 };
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
                            <p>You've completed your 10-card session for today.</p>
                            <p>Free users can complete 1 session per day (10 cards total).</p>
                            <p>Come back tomorrow for your next session!</p>
                            
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
                            <p>You've completed 10 cards in this session.</p>
                            
                            <div class="session-stats">
                                ${ratingChart}
                                ${scheduleChart}
                                ${reviewSummary}
                            </div>
                            
                            <div class="session-actions">
                                <button id="new-session-button" class="nav-button">Start New Session</button>
                                <!-- Phase 1: Deck selection disabled -->
                            </div>
                        </div>
                    </div>
                `;
                
                // Add event listener for new session button
                const newSessionButton = document.getElementById('new-session-button');
                if (newSessionButton) {
                    newSessionButton.addEventListener('click', async (event) => {
                        // Prevent default and stop propagation
                        event.preventDefault();
                        event.stopPropagation();
                        
                        // Prevent double-clicks and concurrent calls
                        if (appState.isLoadingSession) {
                            return;
                        }
                        
                        
                        // Disable button temporarily
                        newSessionButton.disabled = true;
                        
                        try {
                            // Force a new session (don't load from storage)
                            appState.forceNewSession = true;
                            await loadSession();
                        } finally {
                            // Re-enable button after a delay
                            setTimeout(() => {
                                newSessionButton.disabled = false;
                            }, 1000);
                        }
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
                        <p>You've completed your 10-card study session.</p>
                        
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

    const reviewDate = new Date(card.progress.due_at);
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
    console.log(`🚀 loadSession() called at ${new Date().toISOString()}`);
    
    // Simple race condition prevention with timestamp
    const callTime = Date.now();
    
    // Atomic flag setting to prevent race conditions
    if (appState.isLoadingSession) {
        return;
    }
    
    // Set flag immediately to prevent race condition
    appState.isLoadingSession = true;
    appState.loadSessionStartTime = callTime;
    
    // Double-check after setting flag (in case another call set it simultaneously)
    if (appState.loadSessionStartTime !== callTime) {
        appState.isLoadingSession = false;
        return;
    }
    
    try {
        if (!appState.user) {
            throw new Error('No user found');
        }
        
        console.log(`👤 User found: ${appState.user.email}`);
        console.log(`🔧 Session loading proceeding...`);

        // Start loading state
        await transitionToState('loading');
        console.log(`⏳ Transitioned to loading state`);

        // Phase 1: No deck selection needed - all sessions are general
        console.log(`🎯 Phase 1: Global card access - no deck selection needed`);
        
        // Check if there's an existing session
        const hasExistingSession = appState.sessionManager.hasSession();
        const existingSessionDeckId = hasExistingSession ? appState.sessionManager.getSessionDeckId() : null;
        
        // Force new session if:
        // 1. Explicitly requested (appState.forceNewSession)
        // 2. Legacy session without metadata (needs upgrade)
        const isLegacySession = hasExistingSession && !appState.sessionManager.sessionData?.metadata;
        const shouldForceNewSession = appState.forceNewSession || isLegacySession;
        
        console.log(`🔄 Session analysis:`);
        console.log(`  - Has existing session: ${hasExistingSession}`);
        if (hasExistingSession) {
            console.log(`  - Session metadata:`, appState.sessionManager.sessionData?.metadata);
            if (appState.sessionManager.sessionData) {
                console.log(`  - Session card count: ${appState.sessionManager.sessionData.cards?.length || 0}`);
            }
        }
        console.log(`  - Is legacy session: ${isLegacySession}`);
        console.log(`  - Should force new session: ${shouldForceNewSession}`);
        
        // Try to load existing session from storage first (only if session type matches)
        if (!shouldForceNewSession && appState.sessionManager.loadSession()) {
            console.log(`💾 Found existing session in storage`);
            // Session loaded from storage, get current card
            appState.currentCard = appState.sessionManager.getCurrentCard();
            
            if (appState.currentCard) {
                // Display content immediately since session is ready
                await displayCurrentCard();
                await transitionToState('content');
                return;
            }
            
            // If no current card but session exists, check if complete
            if (appState.sessionManager.isSessionComplete()) {
                await handleSessionComplete();
                return;
            }
        } else {
            console.log(`🆕 No existing session found or forced new session - creating new session`);
        }
        
        // Clear force new session flag AND clear any stale session data
        appState.forceNewSession = false;
        appState.isCompleted = false; // Reset completion state
        appState.sessionManager.clearSession();
        console.log(`🧹 Cleared session state`);

        // Ensure user profile exists before doing any operations
        console.log(`👥 Ensuring user profile exists...`);
        await appState.dbService.ensureUserProfileExists(appState.user.id);
        console.log(`✅ User profile confirmed`);

        // Initialize progress for missing cards (this will find new cards in card_templates)
        try {
            await appState.dbService.initializeMissingUserProgress(appState.user.id);
        } catch (error) {
            console.warn('⚠️ Could not initialize missing cards:', error);
            // Continue anyway - some cards might still be available
        }
        
        // Check daily review limit BEFORE attempting to create session
        console.log(`🔍 Checking daily review limit for user...`);
        const limitCheck = await appState.dbService.checkDailyReviewLimit(appState.user.id);
        
        if (limitCheck.limitReached) {
            console.log(`🚫 Daily review limit reached: ${limitCheck.reviewsToday}/${limitCheck.limit} for ${limitCheck.tier} user`);
            showContent(true);
            restoreCardStructure();
            showDailyLimitMessage(limitCheck);
            return;
        }
        
        console.log(`✅ Daily limit check passed: ${limitCheck.reviewsToday}/${limitCheck.limit} reviews today (${limitCheck.tier} user)`);

        // Initialize new session with server-side daily limit enforcement
        // Support both subject path and deck ID filtering from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const subjectPath = urlParams.get('subject');
        const deckId = urlParams.get('deck');

        // Deck-specific sessions take priority over subject filtering
        let sessionOptions = {};
        if (deckId) {
            sessionOptions = { deckId };
            console.log(`🎯 Creating deck-specific session for deck: ${deckId}`);
        } else if (subjectPath) {
            sessionOptions = { subjectPath };
            console.log(`🎯 Creating subject-specific session for path: ${subjectPath}`);
        }

        try {
            await appState.sessionManager.initializeSession(appState.user.id, appState.dbService, sessionOptions);
            
            // Phase 6: Shuffle and finalize session order if newly created
            if (appState.sessionManager.sessionData?.status === 'created') {
                console.log('🔀 New session created - shuffling and finalizing order');
                await appState.sessionManager.shuffleAndFinalize(true);
                console.log('✅ Session order finalized');
            } else if (appState.sessionManager.sessionData?.status === 'active') {
                console.log('📋 Resuming active session with existing order');
            }
            
            // No need to reset milestone tracking - it's based on daily totals now
        } catch (error) {
            if (error.limitReached) {
                // Server-side daily limit reached
                showContent(true);
                restoreCardStructure();
                showDailyLimitMessage({
                    limitReached: true,
                    tier: error.limitInfo.tier,
                    reviewsToday: error.limitInfo.reviewsToday,
                    limit: error.limitInfo.limit
                });
                return;
            }
            if (error.message.includes('No cards available')) {
                showContent(true);
                restoreCardStructure(); // Restore original HTML structure
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
        
        // Restore card structure first (in case completion screen overwrote it)
        restoreCardStructure();
        
        // Display the card immediately after session is ready
        await displayCurrentCard();
        
        // Transition to content
        await transitionToState('content');
        
    } catch (error) {
        console.error('Session loading failed:', error);
        
        // Mobile-specific error handling
        let errorMessage = error.message || 'Failed to load your study session';
        
        // Add mobile-specific context to error messages
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            if (error.message?.includes('Network') || error.message?.includes('fetch')) {
                errorMessage = 'Network error on mobile. Please check your connection and try again.';
            } else if (error.message?.includes('storage') || error.message?.includes('quota')) {
                errorMessage = 'Mobile browser storage issue. Try clearing browser data or using a different browser.';
            } else if (error.message?.includes('session')) {
                errorMessage = 'Session error on mobile. This sometimes happens when switching apps. Please try refreshing.';
            }
        }
        
        showError(errorMessage);
        
        // Clear potentially corrupted data on mobile
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            try {
                appState.sessionManager.clearSession();
            } catch (clearError) {
                console.warn('Failed to clear session on mobile error:', clearError);
            }
        }
    } finally {
        // Always clear the loading flag and timestamp
        appState.isLoadingSession = false;
        appState.loadSessionStartTime = null;
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
        // Ensure Supabase client is ready
        supabase = await getSupabaseClient();

        // Initialize loading messages service FIRST so it's ready for dynamic messages
        try {
            const { default: loadingMessagesService } = await import('./loadingMessages.js');
            await loadingMessagesService.forceRefresh();
            
            // Set dynamic loading message immediately
            const loadingText = document.querySelector('.loading-text');
            if (loadingText && appState.dbService) {
                try {
                    const dynamicMessage = appState.dbService.getRandomLoadingMessageSync();
                    loadingText.textContent = dynamicMessage;
                } catch (error) {
                    console.warn('Failed to set initial dynamic loading message:', error);
                }
            } else {
                console.warn('Loading text element or dbService not available for initial message');
            }
        } catch (error) {
            console.error('Error initializing loading messages service:', error);
            // Continue even if loading messages initialization fails
        }
        
        // Start with loading state (loading messages service is now ready)
        await transitionToState('loading');
        
        // Record start time to ensure minimum loading duration
        loadingStartTime = Date.now();
        
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

        // Initialize slide menu navigation
        await slideMenu.initialize();

        // Initialize navigation controller
        appState.navigationController = new NavigationController();

        // Initialize FSRS parameters for the user
        try {
            await database.getUserFSRSParameters(user.id);
        } catch (error) {
            console.error('Error initializing FSRS parameters:', error);
            // Continue even if FSRS parameter initialization fails
        }

        // Initialize streak UI for milestone notifications only
        try {
            const { default: streakUI } = await import('./streakUI.js');
            await streakUI.initialize(appState.user.id);
            window.streakUI = streakUI; // Make globally available
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
    const flagCardButton = document.getElementById('flag-overlay-button');
    const primaryControls = document.querySelector('.primary-controls');


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
    if (flagCardButton) {
        flagCardButton.addEventListener('click', handleFlagCard);
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
    
    // Set up mobile browser state management
    setupMobileBrowserStateManagement();
}

/**
 * Setup mobile browser state management for session persistence
 */
function setupMobileBrowserStateManagement() {
    // Only setup on mobile devices
    if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        return;
    }
    
    // Handle app backgrounding/foregrounding on mobile
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // App going to background - save current state
            handleMobileAppBackground();
        } else {
            // App returning to foreground - restore/verify state
            handleMobileAppForeground();
        }
    });
    
    // Handle page unload (mobile browser switching)
    window.addEventListener('beforeunload', () => {
        // Ensure session is saved before leaving
        if (appState.sessionManager && appState.sessionManager.sessionData) {
            appState.sessionManager.saveSession();
        }
    });
    
    // Handle page show (returning from cache)
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            // Page was loaded from browser cache
            handleMobilePageRestore();
        }
    });
    
    // Handle orientation change (mobile specific)
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            // Recalculate layout after orientation change
            if (appState.currentCard) {
                // Force a redraw to handle layout issues
                const card = document.querySelector('.card');
                if (card) {
                    card.style.display = 'none';
                    card.offsetHeight; // Force reflow
                    card.style.display = '';
                }
            }
        }, 100);
    });
}

/**
 * Handle mobile app going to background
 */
function handleMobileAppBackground() {
    
    // Save current session state
    if (appState.sessionManager && appState.sessionManager.sessionData) {
        try {
            appState.sessionManager.saveSession();
        } catch (error) {
            console.warn('Failed to save session on background:', error);
        }
    }
    
    // Timer will automatically pause due to visibility change events
    
    // Clear any running timeouts to prevent issues when returning
    clearMobileLoadingTimeout();
}

/**
 * Handle mobile app returning to foreground
 */
function handleMobileAppForeground() {
    
    // Check if we need to refresh auth state
    if (appState.authService && typeof appState.authService.getCurrentUser === 'function') {
        appState.authService.getCurrentUser().then(user => {
            if (!user && appState.user) {
                // User session expired while in background
                appState.authService.redirectToLogin();
            } else if (user && !appState.user) {
                // User logged in while in background (shouldn't happen but handle it)
                appState.user = user;
            }
        }).catch(error => {
            console.warn('Error checking user state on foreground:', error);
        });
    }
    
    // Timer will automatically resume due to visibility change events
    
    // Check if we're stuck in loading state and recover
    if (currentState === 'loading') {
        const loadingDuration = loadingStartTimestamp ? 
            (Date.now() - loadingStartTimestamp) : 0;
        
        if (loadingDuration > 10000) { // 10 seconds
            console.warn('Detected stuck loading state on mobile foreground');
            setupMobileLoadingTimeout(); // Restart timeout
        }
    }
}

/**
 * Handle mobile page restore from browser cache
 */
function handleMobilePageRestore() {
    
    // Verify current state makes sense
    if (currentState === 'loading') {
        // We might have been stuck in loading when cached
        
        // Try to recover by restarting the session load
        if (appState.user && !appState.isLoadingSession) {
            setTimeout(() => {
                loadSession().catch(error => {
                    console.error('Failed to restart session after cache restore:', error);
                });
            }, 1000);
        }
    }
    
    // Re-initialize storage method in case it changed
    if (appState.sessionManager && typeof appState.sessionManager.detectStorageMethod === 'function') {
        const newStorageMethod = appState.sessionManager.detectStorageMethod();
        if (newStorageMethod !== appState.sessionManager.storageMethod) {
            appState.sessionManager.storageMethod = newStorageMethod;
        }
    }
}

function handleFlip() {
    // Prevent flipping if session is completed
    if (appState.isCompleted) return;
    
    if (!appState.currentCard) return;
    const card = document.querySelector('.card');
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    const controls = document.querySelector('.controls');

    if (!card || !flipButton || !ratingButtons || !controls) {
        // Required DOM elements not found
        return;
    }

    card.classList.toggle('revealed');
    
    // Flag overlay visibility is controlled by CSS based on card reveal state
    if (card.classList.contains('revealed')) {
        // Show rating buttons, hide flip button
        ratingButtons.classList.remove('hidden');
        flipButton.classList.add('hidden');
        controls.classList.remove('flip-only');
    } else {
        // Show flip button, hide rating buttons
        ratingButtons.classList.add('hidden');
        flipButton.classList.remove('hidden');
        controls.classList.add('flip-only');
    }
}

async function handleRating(event) {
    const button = event.target;
    const rating = parseInt(button.dataset.rating);
    
    try {
        if (!rating || !appState.currentCard) return;

        // Defensive logging for card_template_id and user_id
        const cardId = appState.currentCard.card_template_id;
        const userId = appState.user?.id;
        if (!cardId || !userId) {
            // handleRating: Missing cardId or userId
            showError('Failed to record your rating. Card or user information is missing.');
            return;
        }

        // Disable rating buttons while processing (visual feedback)
        const ratingButtons = document.querySelectorAll('.rating-button');
        const ratingButtonsContainer = document.getElementById('rating-buttons');
        const flagCardButton = document.getElementById('flag-overlay-button');
        
        // Use CSS class for better performance and visual feedback
        if (ratingButtonsContainer) {
            ratingButtonsContainer.classList.add('processing');
        }
        ratingButtons.forEach(btn => btn.disabled = true);
        if (flagCardButton) flagCardButton.disabled = true;

        // Get active viewing time from timer
        const responseTime = appState.cardTimer.stop();

        // Record the rating using server-side session manager
        try {
            await appState.sessionManager.recordRating(rating, responseTime);
        } catch (error) {
            // Handle daily limit reached error
            if (error.message === 'Daily limit reached' && error.limitInfo) {
                console.log(`🚫 Daily review limit reached during rating: ${error.limitInfo.reviewsToday}/${error.limitInfo.limit}`);
                showContent(true);
                restoreCardStructure();
                showDailyLimitMessage(error.limitInfo);
                return;
            }
            // Re-throw other errors
            throw error;
        }

        // Increment session reviewed count
        appState.sessionReviewedCount++;
        
        // Track milestone for cards reviewed (only for ratings 1, 2, 3 - Hard/Good/Easy) - non-blocking
        if (rating >= 1 && typeof window.streakUI !== 'undefined') {
            // Run streak tracking in background without blocking UI
            window.streakUI.trackCardReview().catch(error => {
                console.error('Error tracking card review milestone:', error);
            });
        }
        
        // Check if session is complete
        if (appState.sessionManager.isSessionComplete()) {
            // Don't trigger completion if we're currently loading a session
            if (appState.isLoadingSession) {
                return;
            }
            
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
        if (flagCardButton) flagCardButton.disabled = false;

    } catch (error) {
        // Error handling rating
        console.error('Error in handleRating:', error);
        console.error('Rating:', rating);
        console.error('Current card:', appState.currentCard);
        console.error('Session data:', appState.sessionManager.getSessionData());
        
        // Handle server-side daily limit errors during answer submission
        if (error.limitReached) {
            // Daily limit reached during answer submission - show limit message
            restoreCardStructure();
            showDailyLimitMessage({
                limitReached: true,
                tier: error.limitInfo.tier,
                reviewsToday: error.limitInfo.reviewsToday,
                limit: error.limitInfo.limit
            });
            return; // Don't re-enable buttons since we're showing limit message
        }
        
        // More specific error messages for other errors
        if (error.message.includes('Failed to submit answer')) {
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
    const cardElement = document.querySelector('.card');
    
    frontContent.textContent = card.question;
    backContent.textContent = card.answer;
    
    // Check if card has "hot" tag and apply CSS class
    if (cardElement) {
        const hasHotTag = card.tags && Array.isArray(card.tags) && card.tags.includes('hot');
        if (hasHotTag) {
            cardElement.classList.add('hot');
        } else {
            cardElement.classList.remove('hot');
        }
    }
    
    // Update progress display
    currentCardSpan.textContent = card.position || '?';
    totalCardsSpan.textContent = card.total || '?';
}

/**
 * Restore the original card HTML structure (needed after completion screen overwrites it)
 */
function restoreCardStructure() {
    const contentDiv = document.getElementById('content');
    if (contentDiv) {
        contentDiv.innerHTML = `
            <div class="progress-container">
                <div class="progress-bar hidden" id="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
                <div class="progress-text hidden" id="progress-text">Card 1</div>
            </div>
            <div class="card">
                <div class="card-inner">
                    <div class="card-front">
                        <div class="last-seen-indicator" id="last-seen-front">Never</div>
                        <p>Front of card (Question)</p>
                    </div>
                    <div class="card-back">
                        <div class="last-seen-indicator" id="last-seen-back">Never</div>
                        <p>Back of card (Answer)</p>
                    </div>
                </div>
                <button id="flag-overlay-button" class="flag-button flag-overlay" title="Report this card" aria-label="Report this card">🚩</button>
            </div>
            <div class="controls">
                <div class="primary-controls">
                    <button id="flip-button" class="nav-button">Flip</button>
                </div>
                <div id="rating-buttons" class="rating-buttons hidden">
                    <button id="rate-again" class="rating-button rating-again" data-rating="1">Again</button>
                    <button id="rate-known" class="rating-button rating-known" data-rating="3">Known</button>
                </div>
            </div>
        `;
        
        // Re-attach event listeners after restoring HTML structure
        setupEventListeners();
    }
}

function showNoMoreCardsMessage() {
    const frontContent = document.querySelector('.card-front p');
    const backContent = document.querySelector('.card-back p');
    const lastSeenFront = document.getElementById('last-seen-front');
    const lastSeenBack = document.getElementById('last-seen-back');
    const flipButton = document.getElementById('flip-button');
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
                <p>Come back after 00:00 (Europe/London) for more flashcard practice!</p>
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
        } else if (appState.currentCard.card_template_id) {
            cardId = appState.currentCard.card_template_id;
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
    // Check if we have a session manager and are in an active session
    if (!appState.sessionManager || !appState.sessionManager.sessionData) {
        console.warn('No active session for moveToNextCard');
        return;
    }
    
    // Mark the current card as completed so it won't show again in this session
    if (appState.currentCard && appState.currentCard.card_template_id) {
        const cardId = String(appState.currentCard.card_template_id);
        appState.sessionManager.sessionData.completedCards.add(cardId);
        appState.sessionManager.saveSession();
    }
    
    // Get the next card from the session
    appState.currentCard = appState.sessionManager.getCurrentCard();
    
    if (appState.currentCard) {
        await displayCurrentCard();
    } else {
        // No more cards in session
        if (appState.sessionManager.isSessionComplete()) {
            await handleSessionComplete();
        } else {
            showNoMoreCardsMessage();
        }
    }
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initializeApp); 
