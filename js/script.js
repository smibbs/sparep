// Basic debug log
console.log('Script starting...');

// Application state
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    
    // Debug: Check if questions exist
    console.log('Questions available:', typeof questions !== 'undefined');
    
    // Initialize if questions are available
    if (typeof questions !== 'undefined' && Array.isArray(questions)) {
        // Set up state
        appState.questions = questions;
        appState.totalCards = questions.length;
        
        // Log state
        console.log('State initialized:');
        console.log(appState);
    } else {
        console.error('Questions not loaded properly');
    }
}); 