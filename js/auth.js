// Temporary JS for testing login page functionality
document.addEventListener('DOMContentLoaded', () => {
    // Get tab buttons and forms
    const tabButtons = document.querySelectorAll('.tab-btn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Add click handlers to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show corresponding form
            if (button.dataset.tab === 'login') {
                loginForm.classList.add('active');
                registerForm.classList.remove('active');
            } else {
                registerForm.classList.add('active');
                loginForm.classList.remove('active');
            }
        });
    });

    // Add form submit handlers (just for testing - prevent default)
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Login form submitted');
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Register form submitted');
    });
}); 