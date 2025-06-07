// Application state
const appState = {
    currentCardIndex: 0,
    isFlipped: false,
    questions: [],
    totalCards: 0
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize application
    console.clear(); // Clear any previous messages
    console.log('%c Flashcard App Initialization ', 'background: #333; color: white; padding: 2px 6px; border-radius: 3px;');

    // Verify questions data is loaded and initialize state
    if (typeof questions === 'undefined' || !Array.isArray(questions)) {
        console.error('❌ Questions data failed to load!');
    } else {
        // Initialize application state
        appState.questions = questions;
        appState.totalCards = questions.length;
        
        console.log('%c ✓ Questions data loaded successfully ', 'color: green; font-weight: bold;');
        console.log('%c ✓ Loaded ' + appState.totalCards + ' questions ', 'color: green;');
        console.log('%c ✓ Application state initialized ', 'color: green;');
        console.table(appState);
    }
}); 