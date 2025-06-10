import auth from './auth.js';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginMessage = document.getElementById('loginMessage');
const registerMessage = document.getElementById('registerMessage');
const loadingSpinner = document.getElementById('loadingSpinner');
const tabButtons = document.querySelectorAll('.tab-btn');
const authForms = document.querySelectorAll('.auth-form');
const forgotPasswordLink = document.getElementById('forgotPassword');

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
tabButtons.forEach(button => button.addEventListener('click', switchTab));
forgotPasswordLink.addEventListener('click', handleForgotPassword);

// Show/hide loading spinner
function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

// Show message in the appropriate form
function showMessage(message, isError, form) {
    const messageElement = form === 'login' ? loginMessage : registerMessage;
    messageElement.textContent = message;
    messageElement.className = `form-message ${isError ? 'error' : 'success'}`;
}

// Switch between login and register tabs
function switchTab(event) {
    const selectedTab = event.target.dataset.tab;
    
    // Update tab buttons
    tabButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.tab === selectedTab);
    });
    
    // Update form visibility
    authForms.forEach(form => {
        form.classList.toggle('active', form.id === `${selectedTab}Form`);
    });
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();
    showLoading(true);
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signIn(email, password);
        window.location.href = '/index.html';
    } catch (error) {
        showMessage(error.message || 'Failed to login. Please try again.', true, 'login');
    } finally {
        showLoading(false);
    }
}

// Handle register form submission
async function handleRegister(event) {
    event.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const displayName = document.getElementById('displayName').value;
    
    // Validate password match
    if (password !== confirmPassword) {
        showMessage('Passwords do not match', true, 'register');
        return;
    }
    
    showLoading(true);
    
    try {
        await auth.signUp(email, password);
        showMessage('Registration successful! Please check your email to confirm your account.', false, 'register');
        // Clear the form
        registerForm.reset();
    } catch (error) {
        showMessage(error.message || 'Failed to register. Please try again.', true, 'register');
    } finally {
        showLoading(false);
    }
}

// Handle forgot password link click
async function handleForgotPassword(event) {
    event.preventDefault();
    
    const email = prompt('Please enter your email address:');
    if (!email) return;
    
    showLoading(true);
    
    try {
        await auth.resetPassword(email);
        alert('Password reset instructions have been sent to your email.');
    } catch (error) {
        alert(error.message || 'Failed to send reset instructions. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Check if user is already logged in
auth.getCurrentUser().then(user => {
    if (user) {
        window.location.href = '/index.html';
    }
}); 