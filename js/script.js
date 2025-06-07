// Initialize application
console.log('Initializing Flashcard App...');

// Verify questions data is loaded
if (typeof questions === 'undefined' || !Array.isArray(questions)) {
    console.error('Questions data failed to load!');
} else {
    console.log('✓ Questions data loaded successfully');
    console.log(`✓ Loaded ${questions.length} questions`);
    console.log('Sample question:', questions[0]);
} 