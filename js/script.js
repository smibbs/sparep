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
    user: null,
    dbService: null
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

function showError(message) {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.textContent = message || 'Failed to load flashcards. Please try again later.';
    }
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
 * Display the current card
 */
function displayCurrentCard() {
    if (!appState.cards || appState.cards.length === 0) {
        showError('No cards available for review.');
        return;
    }

    const currentCard = appState.cards[appState.currentCardIndex];
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

    // Reset card to front face
    const card = document.querySelector('.card');
    if (card) {
        card.classList.remove('flipped');
    }

    showContent();
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

        showLoading();

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
    console.log('DOM Content Loaded, initializing app...');
    showLoading();
    
    try {
        // Wait for database service to be initialized
        console.log('Waiting for database service...');
        let attempts = 0;
        while (!window.dbService && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
            console.log('Attempt', attempts, 'to get database service...');
        }
        
        if (!window.dbService) {
            throw new Error('Database service failed to initialize');
        }
        
        console.log('Database service found, setting up app state...');
        appState.dbService = window.dbService;
        
        // Check authentication
        console.log('Checking authentication...');
        const user = await AuthService.getCurrentUser();
        console.log('Current user:', user);
        
        if (!user) {
            console.log('No user found, redirecting to login...');
            AuthService.redirectToLogin();
            return;
        }
        
        appState.user = user;

        // Subscribe to auth changes
        AuthService.onAuthStateChange((user, event) => {
            console.log('Auth state changed:', event, 'user:', user);
            appState.user = user;
            if (!user) {
                AuthService.redirectToLogin();
                return;
            }
        });

        // Load cards from database
        console.log('Loading cards...');
        await loadCards();

        // Add event listeners
        console.log('Setting up event listeners...');
        document.addEventListener('keydown', handleKeydown);
        
        // Check if elements exist before adding event listeners
        const cardElement = document.querySelector('.card');
        if (cardElement) {
            cardElement.addEventListener('click', flipCard);
        } else {
            console.error('Card element not found');
        }
        
        const prevButton = document.getElementById('prev-button');
        const nextButton = document.getElementById('next-button');
        const flipButton = document.getElementById('flip-button');
        const logoutButton = document.getElementById('logout-button');
        const retryButton = document.getElementById('retry-button');
        const errorLogoutButton = document.getElementById('error-logout-button');
        
        if (prevButton) {
            prevButton.addEventListener('click', previousCard);
        } else {
            console.error('Previous button not found');
        }
        
        if (nextButton) {
            nextButton.addEventListener('click', nextCard);
        } else {
            console.error('Next button not found');
        }
        
        if (flipButton) {
            flipButton.addEventListener('click', flipCard);
        } else {
            console.error('Flip button not found');
        }
        
        if (logoutButton) {
            logoutButton.addEventListener('click', () => AuthService.signOut());
        } else {
            console.error('Logout button not found');
        }
        
        if (retryButton) {
            retryButton.addEventListener('click', () => location.reload());
        } else {
            console.error('Retry button not found');
        }
        
        if (errorLogoutButton) {
            errorLogoutButton.addEventListener('click', () => AuthService.signOut());
        } else {
            console.error('Error logout button not found');
        }

        console.log('App initialization complete!');
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application. Please try again later.');
    }
}); 