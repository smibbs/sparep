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
 * Loads cards from the database
 */
async function loadCards() {
    try {
        console.log('Starting to load cards...');
        showLoading();
        
        // First try to get due cards
        console.log('Attempting to get due cards...');
        let cards = await appState.dbService.getCardsDue(appState.user.id);
        console.log('Due cards received:', cards);
        
        // If no due cards, get some new cards
        if (!cards || cards.length === 0) {
            console.log('No due cards found, fetching new cards...');
            const newCards = await appState.dbService.getNewCards(appState.user.id, 10);
            console.log('New cards received:', newCards);
            cards = newCards;
            
            // Initialize progress for new cards
            console.log('Initializing progress for new cards...');
            for (const card of newCards) {
                await appState.dbService.initializeUserProgress(appState.user.id, card.id);
            }
        }
        
        // Transform cards to match expected format
        console.log('Transforming card data...');
        appState.questions = cards.map(card => {
            // Handle both due cards (with nested card data) and new cards
            if (card.cards) {
                return {
                    id: card.cards.id,
                    question: card.cards.question,
                    answer: card.cards.answer,
                    progress: {
                        stability: card.stability,
                        difficulty: card.difficulty,
                        state: card.state,
                        next_review_at: card.next_review_at
                    }
                };
            } else {
                return {
                    id: card.id,
                    question: card.question,
                    answer: card.answer,
                    progress: null // New card, no progress yet
                };
            }
        });
        
        console.log('Transformed questions:', appState.questions);
        
        appState.totalCards = appState.questions.length;
        appState.currentCardIndex = 0;
        
        if (appState.questions.length > 0) {
            console.log('Rendering first card...');
            renderCard();
            showContent();
        } else {
            console.log('No cards available for review');
            document.getElementById('error-state').textContent = 'No cards available for review at this time.';
            showError();
        }
    } catch (error) {
        console.error('Error loading cards:', error);
        document.getElementById('error-state').textContent = 'Failed to load flashcards. Please try again later.';
        showError();
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
        document.querySelector('.card').addEventListener('click', flipCard);
        document.getElementById('prev-button').addEventListener('click', previousCard);
        document.getElementById('next-button').addEventListener('click', nextCard);
        document.getElementById('logout-button').addEventListener('click', () => AuthService.signOut());

        console.log('App initialization complete!');
    } catch (error) {
        console.error('Error initializing app:', error);
        document.getElementById('error-state').textContent = 'Failed to initialize the application. Please try again later.';
        showError();
    }
}); 