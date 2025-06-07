// Remove old console.log
document.addEventListener('DOMContentLoaded', function() {
    // Initialize application
    console.clear(); // Clear any previous messages
    console.log('%c Flashcard App Initialization ', 'background: #333; color: white; padding: 2px 6px; border-radius: 3px;');

    // Verify questions data is loaded
    if (typeof questions === 'undefined' || !Array.isArray(questions)) {
        console.error('❌ Questions data failed to load!');
    } else {
        console.log('%c ✓ Questions data loaded successfully ', 'color: green; font-weight: bold;');
        console.log('%c ✓ Loaded ' + questions.length + ' questions ', 'color: green;');
        console.table(questions[0]); // Use console.table for better object display
    }
}); 