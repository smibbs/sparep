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

    // Verify card elements are in DOM
    const frontElement = document.querySelector('.card-front');
    const backElement = document.querySelector('.card-back');
    console.log('Card elements found:', {
        frontExists: !!frontElement,
        backExists: !!backElement
    });
}); 