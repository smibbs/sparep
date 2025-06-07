// Debug message to confirm we're running the latest version
console.log('DEBUG: Running latest script version');

// Application state
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0
};

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
        
        // Debug logging to verify content
        console.log('Card content updated:', {
            front: frontElement.textContent,
            back: backElement.textContent
        });
    } else {
        console.error('Card elements not found');
    }
}

// Handle card flip
function flipCard() {
    const card = document.querySelector('.card');
    if (!card) {
        console.error('Card element not found');
        return;
    }

    // Toggle flip state
    appState.isFlipped = !appState.isFlipped;
    
    // Update card class
    card.classList.toggle('flipped');
    
    // Log flip state
    console.log('Card flipped:', appState.isFlipped);
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - checking questions...');
    
    if (typeof questions === 'undefined') {
        console.error('ERROR: questions is undefined');
        return;
    }

    // Initialize state
    appState.questions = questions;
    appState.totalCards = questions.length;
    
    // Log state
    console.log('State initialized:', {
        currentCardIndex: appState.currentCardIndex,
        isFlipped: appState.isFlipped,
        totalCards: appState.totalCards,
        questionsLoaded: appState.questions.length
    });

    // Render the first card
    renderCard();

    // Add click handler to card
    const card = document.querySelector('.card');
    if (card) {
        card.addEventListener('click', flipCard);
        console.log('Click handler attached to card');
    } else {
        console.error('Could not find card element to attach click handler');
    }

    // Verify card elements are in DOM
    const frontElement = document.querySelector('.card-front');
    const backElement = document.querySelector('.card-back');
    console.log('Card elements found:', {
        frontExists: !!frontElement,
        backExists: !!backElement
    });
}); 