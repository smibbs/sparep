console.log("JS loaded");

// Verify questions data is loaded
if (typeof questions === 'undefined') {
    console.error('Questions data failed to load');
} else {
    console.log('Questions data loaded successfully');
    console.log(`Loaded ${questions.length} questions`);
    console.log('First question:', questions[0]);
} 