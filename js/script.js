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
    isFlipped: false,
    cards: [],
    totalCards: 0,
    isAnimating: false,
    isLoading: true,
    user: null,
    dbService: database,  // Use the default database instance
    authService: auth,    // Use the default auth instance
    currentCard: null,
    cardStartTime: null,
    sessionReviewedCount: 0, // Track cards reviewed in this session
    sessionTotal: 0          // Total cards in this session
};

// Animation duration in milliseconds (matches CSS transition)
const ANIMATION_DURATION = 600;

/**
 * UI State Management Functions
 */
function showLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const content = document.getElementById('content');
    loadingState.classList.toggle('hidden', !show);
    errorState.classList.add('hidden');
    content.classList.toggle('hidden', !show);
}

function showError(message) {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.textContent = message || 'Failed to load flashcards. Please try again later.';
    }
    const errorState = document.getElementById('error-state');
    const content = document.getElementById('content');
    errorState.classList.remove('hidden');
    content.classList.add('hidden');
    loadingState.classList.add('hidden');
}

function showContent(show) {
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const content = document.getElementById('content');
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    content.classList.toggle('hidden', !show);
}

function hideLoading() {
    const loadingState = document.getElementById('loading-state');
    if (loadingState) {
        loadingState.classList.add('hidden');
    }
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
    console.log('Displaying card:', currentCard);
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
        console.error('Card elements not found');
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
        card.classList.remove('flipped');
    }

    // Update progress display
    updateProgress();

    // Enable rating buttons
    const ratingButtons = document.querySelectorAll('.rating-button');
    ratingButtons.forEach(btn => btn.disabled = false);

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
        console.log('Starting to load cards...');
        
        if (!appState.user) {
            throw new Error('No user found');
        }

        showLoading(true);

        // Initialize progress for new user if needed
        await appState.dbService.initializeUserProgress(appState.user.id);
        console.log('User progress initialized');

        // Get due cards for the user
        console.log('Attempting to get due cards...');
        const cards = await appState.dbService.getCardsDue(appState.user.id);
        console.log('Loaded cards:', cards);
        
        if (!cards || cards.length === 0) {
            const message = 'No cards are due for review right now. Great job! Check back later.';
            showError(message);
            return;
        }

        appState.cards = cards;
        appState.currentCardIndex = 0;
        appState.sessionReviewedCount = 0;
        appState.sessionTotal = cards.length;
        displayCurrentCard();
        hideLoading();
        
        console.log('Cards loaded successfully:', cards.length, 'cards');
    } catch (error) {
        console.error('Error loading cards:', error);
        showError('Failed to load cards. Please try again later.');
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

/**
 * Handles card flip animation and state
 */
function flipCard() {
    if (appState.isAnimating) return;

    const card = document.querySelector('.card');
    if (!card) return;

    appState.isAnimating = true;
    appState.isFlipped = !appState.isFlipped;
    card.classList.toggle('flipped');

    setTimeout(() => {
        appState.isAnimating = false;
    }, ANIMATION_DURATION);
}

/**
 * Navigates to the next card
 */
function nextCard() {
    if (appState.isAnimating) return;

    appState.isAnimating = true;

    const card = document.querySelector('.card');
    if (card && appState.isFlipped) {
        card.classList.remove('flipped');
        appState.isFlipped = false;
    }

    appState.currentCardIndex = (appState.currentCardIndex + 1) % appState.totalCards;
    renderCard();

    setTimeout(() => {
        appState.isAnimating = false;
    }, ANIMATION_DURATION);
}

/**
 * Navigates to the previous card
 */
function previousCard() {
    if (appState.isAnimating) return;

    appState.isAnimating = true;

    const card = document.querySelector('.card');
    if (card && appState.isFlipped) {
        card.classList.remove('flipped');
        appState.isFlipped = false;
    }

    appState.currentCardIndex = ((appState.currentCardIndex - 1) + appState.totalCards) % appState.totalCards;
    renderCard();

    setTimeout(() => {
        appState.isAnimating = false;
    }, ANIMATION_DURATION);
}

/**
 * Handles keyboard navigation
 */
function handleKeydown(event) {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault();
    }

    switch (event.key) {
        case 'ArrowRight':
            nextCard();
            break;
        case 'ArrowLeft':
            previousCard();
            break;
        case ' ':
            flipCard();
            break;
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
        showLoading(true);
        showError(null); // Clear any previous errors
        
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

        // Load first card
        await loadCards();
        
        // Set up event listeners
        setupEventListeners();
        
        showLoading(false);
        showContent(true);
    } catch (error) {
        console.error('Error initializing app:', error);
        showLoading(false);
        showError(error.message || 'Failed to initialize the app. Please try again.');
    }
}

function setupEventListeners() {
    // Get DOM elements
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    const retryButton = document.getElementById('retry-button');
    const logoutButton = document.getElementById('logout-button');
    const errorLogoutButton = document.getElementById('error-logout-button');
    const cardInner = document.querySelector('.card-inner');

    // Add event listeners
    if (flipButton) {
        flipButton.addEventListener('click', handleFlip);
    }
    
    // Enable click-to-flip on the card itself
    if (cardInner) {
        cardInner.addEventListener('click', handleFlip);
    }
    
    if (ratingButtons) {
        const buttons = ratingButtons.querySelectorAll('.rating-button');
        buttons.forEach(button => {
            button.addEventListener('click', handleRating);
        });
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

    // Add keyboard navigation
    document.addEventListener('keydown', handleKeydown);
}

function handleFlip() {
    if (!appState.currentCard) return;
    
    const card = document.querySelector('.card');
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    
    if (!card || !flipButton || !ratingButtons) {
        console.error('Required DOM elements not found');
        return;
    }

    // Toggle flip state on the .card element
    card.classList.toggle('flipped');
    
    // Show/hide appropriate buttons
    if (card.classList.contains('flipped')) {
        ratingButtons.classList.remove('hidden');
        flipButton.classList.add('hidden');
    } else {
        ratingButtons.classList.add('hidden');
        flipButton.classList.remove('hidden');
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
            console.error('handleRating: Missing cardId or userId', { cardId, userId, currentCard: appState.currentCard, user: appState.user });
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

        // Increment session reviewed count and move to next card in session
        appState.sessionReviewedCount++;
        appState.currentCardIndex++;

        // Move to next card or show completion
        if (appState.sessionReviewedCount >= appState.sessionTotal) {
            showNoMoreCardsMessage();
        } else {
            displayCurrentCard();
        }

        // Re-enable rating buttons
        ratingButtons.forEach(btn => btn.disabled = false);

    } catch (error) {
        console.error('Error handling rating:', error);
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

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initializeApp); 