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
    cardStartTime: null
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

/**
 * Updates the progress indicator with current card position
 */
function updateProgress() {
    const currentCardElement = document.getElementById('current-card');
    const totalCardsElement = document.getElementById('total-cards');
    
    if (currentCardElement && totalCardsElement) {
        currentCardElement.textContent = appState.currentCardIndex + 1;
        totalCardsElement.textContent = appState.totalCards;
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

    const currentCard = appState.cards[appState.currentCardIndex];
    appState.currentCard = currentCard; // Store current card in state
    appState.cardStartTime = Date.now(); // Track when the card was shown
    
    const cardFront = document.querySelector('.card-front p');
    const cardBack = document.querySelector('.card-back p');
    
    if (!cardFront || !cardBack) {
        console.error('Card elements not found');
        return;
    }

    // Update card content
    cardFront.textContent = currentCard.question;
    cardBack.textContent = currentCard.answer;

    // Update progress display
    document.getElementById('current-card').textContent = (appState.currentCardIndex + 1).toString();
    document.getElementById('total-cards').textContent = appState.cards.length.toString();

    // Add progress information if available
    const progressInfo = getProgressInfo(currentCard);
    if (progressInfo) {
        const progressElement = document.createElement('div');
        progressElement.className = 'progress-info';
        progressElement.innerHTML = progressInfo;
        cardFront.appendChild(progressElement);
    }

    // Reset card to front face and show rating buttons
    const card = document.querySelector('.card');
    if (card) {
        card.classList.remove('flipped');
    }

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
        const cards = await appState.dbService.getDueCards(appState.user.id);
        
        if (!cards || cards.length === 0) {
            const message = 'No cards are due for review right now. Great job! Check back later.';
            showError(message);
            return;
        }

        appState.cards = cards;
        appState.currentCardIndex = 0;
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
        await loadNextDueCard();
        
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

    // Add event listeners
    if (flipButton) {
        flipButton.addEventListener('click', handleFlip);
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
    
    const cardInner = document.querySelector('.card-inner');
    const flipButton = document.getElementById('flip-button');
    const ratingButtons = document.getElementById('rating-buttons');
    
    if (!cardInner || !flipButton || !ratingButtons) {
        console.error('Required DOM elements not found');
        return;
    }

    // Toggle flip state
    cardInner.classList.toggle('flipped');
    
    // Show/hide appropriate buttons
    if (cardInner.classList.contains('flipped')) {
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

        // Disable rating buttons while processing
        const ratingButtons = document.querySelectorAll('.rating-button');
        ratingButtons.forEach(btn => btn.disabled = true);

        // Calculate response time (if we have a start time)
        const responseTime = appState.cardStartTime ? 
            Date.now() - appState.cardStartTime : // Keep in milliseconds
            null;

        // Get current card's FSRS parameters
        const currentStability = appState.currentCard.stability || 1.0;
        const currentDifficulty = appState.currentCard.difficulty || 5.0;

        // Calculate new FSRS values
        const newStability = updateStability(currentStability, rating);
        const newDifficulty = updateDifficulty(currentDifficulty, rating);
        const { nextReviewDate } = calculateNextReview(newStability, newDifficulty, rating);

        // Record the review
        await appState.dbService.recordReview({
            cardId: appState.currentCard.id,
            rating,
            responseTime,
            stability: newStability,
            difficulty: newDifficulty,
            nextReviewDate: nextReviewDate.toISOString()
        });

        // Load the next card
        await loadNextDueCard();

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

async function loadNextDueCard() {
    try {
        showLoading(true);
        const card = await appState.dbService.getNextDueCard();
        
        if (card) {
            // Update app state
            appState.currentCard = card;
            appState.cardStartTime = Date.now();
            
            // Update display
            const frontContent = document.querySelector('.card-front p');
            const backContent = document.querySelector('.card-back p');
            const cardInner = document.querySelector('.card-inner');
            const flipButton = document.getElementById('flip-button');
            const ratingButtons = document.getElementById('rating-buttons');
            
            if (frontContent && backContent) {
                frontContent.textContent = card.question;
                backContent.textContent = card.answer;
            }
            
            // Reset card to front face
            if (cardInner) {
                cardInner.classList.remove('flipped');
            }
            
            // Show flip button, hide rating buttons
            if (flipButton && ratingButtons) {
                flipButton.classList.remove('hidden');
                ratingButtons.classList.add('hidden');
            }
            
            showContent(true);
        } else {
            showNoMoreCardsMessage();
        }
        showLoading(false);
    } catch (error) {
        console.error('Error loading next card:', error);
        showLoading(false);
        showError('Failed to load the next card. Please try again.');
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