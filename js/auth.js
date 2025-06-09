// Authentication service for handling user registration, login, and session management
class AuthService {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentUser = null;
        this.authStateListeners = new Set();
        this.setupDOMElements();
        this.setupEventListeners();
        this.initializeAuthState();
    }

    // Get current user
    static async getCurrentUser() {
        try {
            const { data: { session }, error } = await window.supabaseClient.auth.getSession();
            if (error) throw error;
            return session?.user || null;
        } catch (error) {
            console.error('Error getting current user:', error.message);
            return null;
        }
    }

    // Subscribe to auth state changes
    static onAuthStateChange(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange(
            (event, session) => {
                callback(session?.user || null, event);
            }
        );
        
        return () => subscription.unsubscribe();
    }

    // Get base URL for the application
    getBaseUrl() {
        // For GitHub Pages
        if (window.location.hostname.includes('github.io')) {
            // Extract the repository name from the pathname
            const pathParts = window.location.pathname.split('/');
            const repoName = pathParts[1]; // Second part after the first slash
            return `/${repoName}/`; // This ensures we include /sparep/ for GitHub Pages
        }
        // For local development
        return '/';
    }

    // Get full URL for a path
    getUrl(path) {
        const base = this.getBaseUrl();
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${base}${cleanPath}`;
    }

    // Get absolute URL including origin
    getAbsoluteUrl(path) {
        return new URL(this.getUrl(path), window.location.origin).href;
    }

    setupDOMElements() {
        // Forms and tabs
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        
        // Form elements
        this.loginEmail = document.getElementById('loginEmail');
        this.loginPassword = document.getElementById('loginPassword');
        this.registerEmail = document.getElementById('registerEmail');
        this.registerPassword = document.getElementById('registerPassword');
        this.confirmPassword = document.getElementById('confirmPassword');
        this.displayName = document.getElementById('displayName');
        
        // Message elements
        this.loginMessage = document.getElementById('loginMessage');
        this.registerMessage = document.getElementById('registerMessage');
        
        // Loading spinner
        this.loadingSpinner = document.getElementById('loadingSpinner');
        
        // Forgot password link
        this.forgotPasswordLink = document.getElementById('forgotPassword');
    }

    setupEventListeners() {
        // Tab switching
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => this.switchTab(button.dataset.tab));
        });

        // Form submissions
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.registerForm.addEventListener('submit', (e) => this.handleRegistration(e));
        
        // Password reset
        this.forgotPasswordLink?.addEventListener('click', (e) => this.handleForgotPassword(e));

        // Auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
            this.handleAuthStateChange(event, session);
        });
    }

    async initializeAuthState() {
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                this.notifyAuthStateListeners(session.user, 'INITIAL_SESSION');
                
                // Only redirect if we're on the login page
                if (window.location.pathname.includes('login.html')) {
                    this.redirectToApp();
                }
            } else if (!window.location.pathname.includes('login.html')) {
                // Redirect to login if no session and not already on login page
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Error checking auth state:', error.message);
            this.redirectToLogin();
        }
    }

    showLoading(show = true) {
        this.loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    showMessage(element, message, type = 'error') {
        element.textContent = message;
        element.className = `form-message ${type}`;
        element.style.display = 'block';
    }

    clearMessages() {
        this.loginMessage.style.display = 'none';
        this.registerMessage.style.display = 'none';
    }

    switchTab(tab) {
        this.clearMessages();
        
        // Update active tab button
        this.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Show corresponding form
        this.loginForm.classList.toggle('active', tab === 'login');
        this.registerForm.classList.toggle('active', tab === 'register');
    }

    validatePassword(password) {
        const minLength = 8;
        const hasLetter = /[A-Za-z]/.test(password);
        const hasNumber = /\d/.test(password);
        
        if (password.length < minLength) {
            return 'Password must be at least 8 characters long';
        }
        if (!hasLetter || !hasNumber) {
            return 'Password must contain at least one letter and one number';
        }
        return null;
    }

    async handleLogin(e) {
        e.preventDefault();
        this.clearMessages();
        
        const email = this.loginEmail.value.trim();
        const password = this.loginPassword.value;

        try {
            this.showLoading(true);
            
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            this.showMessage(this.loginMessage, 'Login successful! Redirecting...', 'success');
            this.redirectToApp();
            
        } catch (error) {
            this.showMessage(this.loginMessage, error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async handleRegistration(e) {
        e.preventDefault();
        this.clearMessages();
        
        const email = this.registerEmail.value.trim();
        const password = this.registerPassword.value;
        const confirmPass = this.confirmPassword.value;
        const displayName = this.displayName.value.trim();

        // Validation
        const passwordError = this.validatePassword(password);
        if (passwordError) {
            this.showMessage(this.registerMessage, passwordError);
            return;
        }

        if (password !== confirmPass) {
            this.showMessage(this.registerMessage, 'Passwords do not match');
            return;
        }

        try {
            this.showLoading(true);
            
            // Get the redirect URL
            const redirectUrl = this.getAbsoluteUrl('login.html');
            console.log('Redirect URL:', redirectUrl);
            
            // Create the signup payload
            const signupData = {
                email,
                password,
                options: {
                    emailRedirectTo: redirectUrl,
                    data: {
                        display_name: displayName
                    }
                }
            };
            
            console.log('Signup payload:', signupData);

            // Attempt signup
            const { data, error } = await this.supabase.auth.signUp(signupData);

            if (error) throw error;

            if (data?.user?.identities?.length === 0) {
                this.showMessage(this.registerMessage, 'An account with this email already exists', 'error');
                return;
            }

            this.showMessage(this.registerMessage, 'Registration successful! Please check your email to confirm your account.', 'success');
            
            // Clear the form
            this.registerForm.reset();
            
            // Switch to login tab after successful registration
            setTimeout(() => this.switchTab('login'), 3000);
            
        } catch (error) {
            this.showMessage(this.registerMessage, error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        
        const email = prompt('Please enter your email address:');
        if (!email) return;

        try {
            this.showLoading(true);
            
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: this.getAbsoluteUrl('reset-password.html')
            });

            if (error) throw error;

            alert('Password reset instructions have been sent to your email.');
            
        } catch (error) {
            alert(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    handleAuthStateChange(event, session) {
        this.currentUser = session?.user || null;
        this.notifyAuthStateListeners(this.currentUser, event);

        switch (event) {
            case 'SIGNED_IN':
                if (window.location.pathname.includes('login.html')) {
                    this.redirectToApp();
                }
                break;
            case 'SIGNED_OUT':
                this.redirectToLogin();
                break;
            case 'USER_UPDATED':
                // Handle user data updates
                break;
            case 'USER_DELETED':
                this.redirectToLogin();
                break;
        }
    }

    redirectToApp() {
        window.location.href = this.getUrl('index.html');
    }

    redirectToLogin() {
        window.location.href = this.getUrl('login.html');
    }

    static async signOut() {
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;
            
            // Get base URL for GitHub Pages
            const getBaseUrl = () => {
                if (window.location.hostname.includes('github.io')) {
                    const pathParts = window.location.pathname.split('/');
                    const repoName = pathParts[1];
                    return `/${repoName}/`;
                }
                return '/';
            };
            
            window.location.href = `${getBaseUrl()}login.html`;
        } catch (error) {
            console.error('Error signing out:', error.message);
        }
    }

    // Add listener for auth state changes
    addAuthStateListener(callback) {
        if (typeof callback === 'function') {
            this.authStateListeners.add(callback);
            // Immediately call with current state
            callback(this.currentUser, 'CURRENT_STATE');
        }
    }

    // Remove listener
    removeAuthStateListener(callback) {
        this.authStateListeners.delete(callback);
    }

    // Notify all listeners of auth state change
    notifyAuthStateListeners(user, event) {
        this.authStateListeners.forEach(listener => {
            try {
                listener(user, event);
            } catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
    }
}

// Initialize auth service when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authService = new AuthService();
}); 