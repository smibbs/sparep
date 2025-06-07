// Debug message to confirm we're running the latest version
console.log('DEBUG: Running latest script version');

// Application state
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0
};

// Log initial state
console.log('Initial appState:', appState);

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
    
    // Log final state
    console.log('Final appState:', {
        currentCardIndex: appState.currentCardIndex,
        isFlipped: appState.isFlipped,
        totalCards: appState.totalCards,
        questionsLoaded: appState.questions.length
    });
}); 