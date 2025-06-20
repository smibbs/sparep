// Import required modules
import { RATING, calculateNextReview, updateStability, updateDifficulty } from './fsrs.js';
import database from './database.js';
import auth from './auth.js';

// Use global Supabase client
const supabase = window.supabaseClient;

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
    currentCardIndex: 0,
    cards: [],
    totalCards: 0,
    isLoading: true,
    user: null,
    dbService: database,  // Use the default database instance
    authService: auth,    // Use the default auth instance
    currentCard: null,
    cardStartTime: null,
    sessionReviewedCount: 0, // Track cards reviewed in this session
    sessionTotal: 0,         // Total cards in this session
    isCompleted: false,      // Track if session is completed
    cardInnerClickHandler: null // Store reference to card-inner click handler
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
function updateProgress() {
    const currentCardElement = document.getElementById('current-card');
    const totalCardsElement = document.getElementById('total-cards');
    
    if (currentCardElement && totalCardsElement) {
        // Show session progress: Card X of Y
        currentCardElement.textContent = appState.sessionReviewedCount + 1;
        totalCardsElement.textContent = appState.sessionTotal;
    }
}

/**
 * Display the current card
 */
function displayCurrentCard() {
    if (!appState.cards || appState.cards.length === 0) {
        showError('No cards available for review.');
        return;
    }
    // If session is complete, show completion message
    if (appState.sessionReviewedCount >= appState.sessionTotal) {
        showNoMoreCardsMessage();
        return;
    }

    const currentCard = appState.cards[appState.currentCardIndex];
    // Displaying card
    appState.currentCard = currentCard; // Store current card in state
    appState.cardStartTime = Date.now(); // Track when the card was shown
    
    // Robust check for card data
    if (!currentCard || typeof currentCard.cards?.question !== 'string' || typeof currentCard.cards?.answer !== 'string') {
        showError('Card data is missing or invalid. Please refresh or contact support.');
        return;
    }

    const cardFront = document.querySelector('.card-front');
    const cardBack = document.querySelector('.card-back');
    
    if (!cardFront || !cardBack) {
        // Card elements not found
        return;
    }

    // Update card content and progress info
    cardFront.innerHTML = `<p>${currentCard.cards.question}</p>`;
    cardBack.innerHTML = `<p>${currentCard.cards.answer}</p>`;
    const progressInfo = getProgressInfo(currentCard);
    if (progressInfo) {
        cardFront.innerHTML += progressInfo;
    }

    // Reset card to front face and show rating buttons
    const card = document.querySelector('.card');
    if (card) {
        card.classList.remove('revealed');
    }

    // Update progress display
    updateProgress();

    // Enable rating buttons
    const ratingButtons = document.querySelectorAll('.rating-button');
    ratingButtons.forEach(btn => btn.disabled = false);

    // Set up initial button visibility - flip button should be visible, rating buttons hidden
    const flipButton = document.getElementById('flip-button');
    const ratingButtonsDiv = document.getElementById('rating-buttons');
    const controls = document.querySelector('.controls');
    const cardInner = document.querySelector('.card-inner');
    const flagButton = document.getElementById('flag-button');
    
    if (flipButton && ratingButtonsDiv && controls) {
        flipButton.classList.remove('hidden');
        ratingButtonsDiv.classList.add('hidden');
        controls.classList.add('flip-only');
    }
    
    // Show flag button for non-admin users only
    if (flagButton) {
        appState.authService.isAdmin().then(isAdmin => {
            if (isAdmin) {
                flagButton.classList.add('hidden');
            } else {
                flagButton.classList.remove('hidden');
            }
        }).catch(() => {
            // If error checking admin status, show flag button
            flagButton.classList.remove('hidden');
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
 * Load cards from the database
 */
async function loadCards() {
    try {
        if (!appState.user) {
            throw new Error('No user found');
        }

        // Start loading state
        await transitionToState('loading');
        
        // Update loading message to be more specific
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = 'Preparing your study session...';
        }

        // Initialize progress for new user if needed
        await appState.dbService.initializeUserProgress(appState.user.id);
        
        // Update loading message
        if (loadingText) {
            loadingText.textContent = 'Loading your flashcards...';
        }

        // First check daily limit for free users
        const userProfile = await appState.authService.getUserProfile(true); // Force refresh
        const userTier = userProfile?.user_tier || 'free';
        
        if (userTier === 'free') {
            const today = new Date().toDateString();
            const lastReviewDate = userProfile?.last_review_date ? 
                new Date(userProfile.last_review_date).toDateString() : null;
            
            const reviewsToday = (lastReviewDate === today) ? 
                (userProfile.reviews_today || 0) : 0;
            
            if (reviewsToday >= 20) {
                showContent(true);
                showDailyLimitMessage({ 
                    limitReached: true, 
                    tier: 'free', 
                    reviewsToday, 
                    limit: 20 
                });
                return;
            }
        }

        // Get due cards for the user (temporarily using old method)
        const cards = await appState.dbService.getCardsDue(appState.user.id);
        
        if (!cards || cards.length === 0) {
            // Show completion card instead of error message
            showContent(true);
            showNoMoreCardsMessage();
            return;
        }

        appState.cards = cards;
        appState.currentCardIndex = 0;
        appState.sessionReviewedCount = 0;
        appState.sessionTotal = cards.length;
        appState.isCompleted = false; // Reset completion state for new session
        
        // Display the first card
        displayCurrentCard();
        
        // Transition to content
        await transitionToState('content');
        
    } catch (error) {
        showError(error.message || 'Failed to load your study session');
    }
}

/**
 * Renders the current card's content
 */
function renderCard() {
    const currentQuestion = appState.cards[appState.currentCardIndex];
    if (!currentQuestion) return;

    const frontElement = document.querySelector('.card-front');
    const backElement = document.querySelector('.card-back');

    if (frontElement && backElement) {
        frontElement.textContent = currentQuestion.question;
        backElement.textContent = currentQuestion.answer;
        updateProgress();
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

        // Set up auth state change listener
        auth.onAuthStateChange((user) => {
            appState.user = user;
            if (!user) {
                auth.redirectToLogin();
            }
        });

        // Set up event listeners first
        setupEventListeners();
        
        // Load cards (this will handle its own state transitions)
        await loadCards();
        
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
    const flagButton = document.getElementById('flag-button');

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
            btn.addEventListener('click', debounce(handleRating, 400));
        });
    }
    if (flagButton) {
        flagButton.addEventListener('click', handleFlagCard);
    }
    // Add retry and logout handlers
    if (retryButton) {
        retryButton.addEventListener('click', loadCards);
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
    const flagButton = document.getElementById('flag-button');
    
    if (!card || !flipButton || !ratingButtons || !controls) {
        // Required DOM elements not found
        return;
    }
    
    card.classList.toggle('revealed');
    if (card.classList.contains('revealed')) {
        // Show rating buttons, hide flip button
        ratingButtons.classList.remove('hidden');
        flipButton.classList.add('hidden');
        controls.classList.remove('flip-only');
        // Keep flag button visible for non-admins
        if (flagButton) {
            appState.authService.isAdmin().then(isAdmin => {
                if (!isAdmin) {
                    flagButton.classList.remove('hidden');
                }
            });
        }
    } else {
        // Show flip button, hide rating buttons
        ratingButtons.classList.add('hidden');
        flipButton.classList.remove('hidden');
        controls.classList.add('flip-only');
        // Keep flag button visible for non-admins
        if (flagButton) {
            appState.authService.isAdmin().then(isAdmin => {
                if (!isAdmin) {
                    flagButton.classList.remove('hidden');
                }
            });
        }
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

        // Disable rating buttons while processing
        const ratingButtons = document.querySelectorAll('.rating-button');
        ratingButtons.forEach(btn => btn.disabled = true);

        // Calculate response time (if we have a start time)
        const responseTime = appState.cardStartTime ? 
            Date.now() - appState.cardStartTime : // Keep in milliseconds
            null;

        // Only pass minimal data; FSRS logic is now in database.js
        await appState.dbService.recordReview({
            card_id: cardId,
            rating,
            responseTime
        });

        // Increment session reviewed count
        appState.sessionReviewedCount++;
        
        // Check daily limit after each review for free users
        const userProfile = await appState.authService.getUserProfile(true); // Force refresh
        const userTier = userProfile?.user_tier || 'free';
        
        if (userTier === 'free') {
            const today = new Date().toDateString();
            const lastReviewDate = userProfile?.last_review_date ? 
                new Date(userProfile.last_review_date).toDateString() : null;
            
            const reviewsToday = (lastReviewDate === today) ? 
                (userProfile.reviews_today || 0) : 0;
            
            if (reviewsToday >= 20) {
                // Daily limit reached, stop the session
                showDailyLimitMessage({ 
                    limitReached: true, 
                    tier: 'free', 
                    reviewsToday, 
                    limit: 20 
                });
                return;
            }
        }
        
        // Move to next card or show completion
        appState.currentCardIndex++;
        if (appState.currentCardIndex >= appState.cards.length) {
            showNoMoreCardsMessage();
        } else {
            displayCurrentCard();
        }

        // Re-enable rating buttons
        ratingButtons.forEach(btn => btn.disabled = false);

    } catch (error) {
        // Error handling rating
        showError('Failed to record your rating. Please try again.');
        
        // Re-enable rating buttons on error
        const ratingButtons = document.querySelectorAll('.rating-button');
        ratingButtons.forEach(btn => btn.disabled = false);
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
    
    if (frontContent) {
        frontContent.innerHTML = `
            <div class="no-cards-message">
                <h2>Great job! 🎉</h2>
                <p>You've completed all your reviews for now.</p>
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
        moveToNextCard();
        
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
function moveToNextCard() {
    appState.currentCardIndex++;
    if (appState.currentCardIndex >= appState.cards.length) {
        showNoMoreCardsMessage();
    } else {
        displayCurrentCard();
    }
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initializeApp); 