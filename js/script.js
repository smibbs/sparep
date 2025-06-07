// Debug message to confirm we're running the latest version
console.log('DEBUG: Running latest script version');

// Application state
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0,
    isAnimating: false, // Track animation state
    isLoading: true // Track loading state
};

// Constants
const ANIMATION_DURATION = 600; // Match CSS transition duration (in ms)

// Show/hide states
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

// Update progress indicator
function updateProgress() {
    const currentCardElement = document.getElementById('current-card');
    const totalCardsElement = document.getElementById('total-cards');
    
    if (currentCardElement && totalCardsElement) {
        currentCardElement.textContent = appState.currentCardIndex + 1;
        totalCardsElement.textContent = appState.totalCards;
    } else {
        console.error('Progress indicator elements not found');
    }
}

// Render the current card
function renderCard() {
    const currentQuestion = appState.questions[appState.currentCardIndex];
    if (!currentQuestion) {
        console.error('No question found at index:', appState.currentCardIndex);
        return;
    }

    const frontElement = document.querySelector('.card-front');
    const backElement = document.querySelector('.card-back');

    if (frontElement && backElement) {
        frontElement.textContent = currentQuestion.question;
        backElement.textContent = currentQuestion.answer;
        
        // Update progress indicator
        updateProgress();
        
        // Debug logging to verify content
        console.log('Card content updated:', {
            front: frontElement.textContent,
            back: backElement.textContent,
            cardIndex: appState.currentCardIndex + 1,
            totalCards: appState.totalCards
        });
    } else {
        console.error('Card elements not found');
    }
}

// Handle card flip
function flipCard() {
    // Prevent flip during animation
    if (appState.isAnimating) {
        console.log('Ignoring click: animation in progress');
        return;
    }

    const card = document.querySelector('.card');
    if (!card) {
        console.error('Card element not found');
        return;
    }

    // Start animation
    appState.isAnimating = true;
    
    // Toggle flip state
    appState.isFlipped = !appState.isFlipped;
    
    // Update card class
    card.classList.toggle('flipped');
    
    // Log flip state
    console.log('Card flipped:', appState.isFlipped);

    // Reset animation flag after animation completes
    setTimeout(() => {
        appState.isAnimating = false;
        console.log('Animation completed, ready for next flip');
    }, ANIMATION_DURATION);
}

// Handle next card
function nextCard() {
    // Debug state before changes
    console.log('Next card clicked. Current state:', {
        currentIndex: appState.currentCardIndex,
        totalCards: appState.totalCards,
        questions: appState.questions,
        isAnimating: appState.isAnimating
    });

    // Prevent navigation during animation
    if (appState.isAnimating) {
        console.log('Ignoring next: animation in progress');
        return;
    }

    // Start animation
    appState.isAnimating = true;

    // Unflip card if it's flipped
    const card = document.querySelector('.card');
    if (card && appState.isFlipped) {
        card.classList.remove('flipped');
        appState.isFlipped = false;
    }

    // Increment index with wraparound
    appState.currentCardIndex = (appState.currentCardIndex + 1) % appState.totalCards;
    
    // Debug state after increment
    console.log('After increment:', {
        newIndex: appState.currentCardIndex,
        totalCards: appState.totalCards,
        nextQuestion: appState.questions[appState.currentCardIndex]
    });
    
    // Update card content
    renderCard();

    // Reset animation flag after animation completes
    setTimeout(() => {
        appState.isAnimating = false;
        console.log('Ready for next action');
    }, ANIMATION_DURATION);

    console.log('Moved to next card:', appState.currentCardIndex + 1, 'of', appState.totalCards);
}

// Handle previous card
function previousCard() {
    // Debug state before changes
    console.log('Previous card clicked. Current state:', {
        currentIndex: appState.currentCardIndex,
        totalCards: appState.totalCards,
        isAnimating: appState.isAnimating
    });

    // Prevent navigation during animation
    if (appState.isAnimating) {
        console.log('Ignoring previous: animation in progress');
        return;
    }

    // Start animation
    appState.isAnimating = true;

    // Unflip card if it's flipped
    const card = document.querySelector('.card');
    if (card && appState.isFlipped) {
        card.classList.remove('flipped');
        appState.isFlipped = false;
    }

    // Decrement index with wraparound
    appState.currentCardIndex = ((appState.currentCardIndex - 1) + appState.totalCards) % appState.totalCards;
    
    // Debug state after decrement
    console.log('After decrement:', {
        newIndex: appState.currentCardIndex,
        totalCards: appState.totalCards,
        prevQuestion: appState.questions[appState.currentCardIndex]
    });
    
    // Update card content
    renderCard();

    // Reset animation flag after animation completes
    setTimeout(() => {
        appState.isAnimating = false;
        console.log('Ready for next action');
    }, ANIMATION_DURATION);

    console.log('Moved to previous card:', appState.currentCardIndex + 1, 'of', appState.totalCards);
}

// Handle keyboard navigation
function handleKeydown(event) {
    // Prevent default behavior for our navigation keys
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
        case ' ': // Spacebar
            flipCard();
            break;
    }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - checking questions...');
    
    // Show loading state initially
    showLoading();
    
    // Simulate network delay (remove in production)
    setTimeout(() => {
        if (typeof questions === 'undefined') {
            console.error('ERROR: questions is undefined');
            showError();
            return;
        }

        try {
            // Initialize state with more detailed logging
            appState.questions = questions;
            appState.totalCards = questions.length;
            appState.isLoading = false;
            
            // Update progress indicator with initial values
            updateProgress();
            
            // Log state
            console.log('State initialized:', {
                currentCardIndex: appState.currentCardIndex,
                isFlipped: appState.isFlipped,
                totalCards: appState.totalCards,
                questionsLoaded: appState.questions.length,
                questionsArray: appState.questions
            });

            // Render the first card
            renderCard();

            // Add click handlers
            const card = document.querySelector('.card');
            const nextButton = document.querySelector('#next-button');
            const prevButton = document.querySelector('#prev-button');

            if (card) {
                card.addEventListener('click', flipCard);
                console.log('Click handler attached to card');
            } else {
                console.error('Could not find card element to attach click handler');
            }

            if (nextButton) {
                nextButton.addEventListener('click', nextCard);
                console.log('Click handler attached to next button');
            } else {
                console.error('Could not find next button');
            }

            if (prevButton) {
                prevButton.addEventListener('click', previousCard);
                console.log('Click handler attached to previous button');
            } else {
                console.error('Could not find previous button');
            }

            // Add keyboard navigation
            document.addEventListener('keydown', handleKeydown);
            console.log('Keyboard navigation enabled');
            console.log('Use Arrow Left/Right to navigate, Spacebar to flip');

            // Show content after successful initialization
            showContent();
        } catch (error) {
            console.error('Error initializing app:', error);
            showError();
        }
    }, 1000); // 1 second delay to show loading state (remove in production)
}); 