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
    AuthService.redirectToLogin();
}

/**
 * Application state management
 */
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0,
    isAnimating: false,
    isLoading: true,
    user: null
};

// Animation duration in milliseconds (matches CSS transition)
const ANIMATION_DURATION = 600;

/**
 * UI State Management Functions
 */
function showLoading() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('error-state').classList.add('hidden');
    document.getElementById('content').classList.add('hidden');
}

function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');
}

function showContent() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
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
 * Renders the current card's content
 */
function renderCard() {
    const currentQuestion = appState.questions[appState.currentCardIndex];
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

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    
    try {
        // Check authentication
        const user = await AuthService.getCurrentUser();
        if (!user) {
            AuthService.redirectToLogin();
            return;
        }
        
        appState.user = user;

        // Subscribe to auth changes
        AuthService.onAuthStateChange((user, event) => {
            appState.user = user;
            if (!user) {
                AuthService.redirectToLogin();
                return;
            }
        });

        if (typeof questions === 'undefined') {
            showError();
            return;
        }

        // Initialize state
        appState.questions = questions;
        appState.totalCards = questions.length;
        appState.isLoading = false;
        
        // Show content and render first card
        showContent();
        renderCard();
        
        // Add keyboard event listener
        document.addEventListener('keydown', handleKeydown);
        
        // Add click event listener to the card
        const card = document.querySelector('.card');
        if (card) {
            card.addEventListener('click', flipCard);
        }
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError();
    }
}); 