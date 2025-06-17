import { getSupabaseClient } from './supabase-client.js';

// Authentication service for handling user registration, login, and session management
class AuthService {
    constructor() {
        this.supabasePromise = null;
        this.currentUser = null;
        this.authStateListeners = new Set();
        this.initialize();
    }

    async initialize() {
        try {
            await this.initializeWithRetry();
        } catch (error) {
            console.error('Failed to initialize AuthService after retries:', error);
            throw error;
        }
    }

    async initializeWithRetry(maxRetries = 3, delay = 1000) {
        let retries = 0;
        
        while (retries < maxRetries) {
            try {
                // Initialize Supabase client first
                this.supabasePromise = getSupabaseClient();
                await this.supabasePromise; // Wait for initialization

                // Set up DOM and event listeners
                this.setupDOMElements();
                this.setupEventListeners();

                // Initialize auth state
                await this.initializeAuthState();
                console.log('AuthService initialized successfully');
                return;
            } catch (error) {
                retries++;
                console.error(`Failed to initialize AuthService (attempt ${retries}/${maxRetries}):`, error);
                
                if (retries === maxRetries) {
                    // Only redirect to login if we're not already on the login page and not on the test page
                    if (!window.location.pathname.includes('login.html') && 
                        !window.location.pathname.includes('database-test.html')) {
                        AuthService.redirectToLogin();
                    }
                    throw error;
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getSupabase() {
        if (!this.supabasePromise) {
            throw new Error('Supabase client not initialized');
        }
        return await this.supabasePromise;
    }

    // Get current user
    async getCurrentUser() {
        try {
            const supabase = await this.getSupabase();
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) throw error;
            return user;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    // Subscribe to auth state changes
    onAuthStateChange(callback) {
        this.getSupabase().then(supabase => {
            supabase.auth.onAuthStateChange((event, session) => {
                callback(session?.user || null, event);
            });
        }).catch(error => {
            console.error('Error setting up auth state change listener:', error);
        });
    }

    // Get base URL for the application
    static getBaseUrl() {
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
    static getUrl(path) {
        const base = AuthService.getBaseUrl();
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${base}${cleanPath}`;
    }

    // Get absolute URL including origin
    static getAbsoluteUrl(path) {
        return new URL(AuthService.getUrl(path), window.location.origin).href;
    }

    // Redirect to main app
    static redirectToApp() {
        window.location.href = AuthService.getUrl('index.html');
    }

    // Redirect to login page
    static redirectToLogin() {
        window.location.href = AuthService.getUrl('login.html');
    }

    // Sign out
    async signOut() {
        const supabase = await this.getSupabase();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        AuthService.redirectToLogin();
    }

    setupDOMElements() {
        // Only set up form elements if we're on the login page
        const isLoginPage = window.location.pathname.includes('login.html');
        if (!isLoginPage) return;

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
        // Only set up event listeners if we're on the login page
        const isLoginPage = window.location.pathname.includes('login.html');
        if (!isLoginPage) return;

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
        this.onAuthStateChange((session, event) => {
            this.handleAuthStateChange(event, session);
        });
    }

    async initializeAuthState() {
        try {
            const supabase = await this.getSupabase();
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                this.notifyAuthStateListeners(session.user, 'INITIAL_SESSION');
                
                // Only redirect if we're on the login page
                if (window.location.pathname.includes('login.html')) {
                    AuthService.redirectToApp();
                }
            } else if (!window.location.pathname.includes('login.html') && 
                       !window.location.pathname.includes('database-test.html')) {
                // Redirect to login if no session and not on login page or test page
                AuthService.redirectToLogin();
            }
        } catch (error) {
            console.error('Error checking auth state:', error);
            throw error;
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
            
            const supabase = await this.getSupabase();
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            this.showMessage(this.loginMessage, 'Login successful! Redirecting...', 'success');
            console.log('About to redirect to:', AuthService.getUrl('index.html'));
            setTimeout(() => AuthService.redirectToApp(), 1000); // Add small delay to see the message
            
        } catch (error) {
            console.error('Login error:', error);
            this.showMessage(this.loginMessage, error.message || 'Failed to sign in');
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

        // Password validation
        if (password !== confirmPass) {
            this.showMessage(this.registerMessage, 'Passwords do not match');
            return;
        }

        const passwordError = this.validatePassword(password);
        if (passwordError) {
            this.showMessage(this.registerMessage, passwordError);
            return;
        }

        try {
            this.showLoading(true);
            
            const supabase = await this.getSupabase();
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        display_name: displayName
                    }
                }
            });

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
            console.error('Registration error:', error);
            this.showMessage(this.registerMessage, error.message || 'Failed to register');
        } finally {
            this.showLoading(false);
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        
        const email = this.loginEmail.value.trim();
        if (!email) {
            this.showMessage(this.loginMessage, 'Please enter your email address');
            return;
        }

        try {
            this.showLoading(true);
            
            // Get the redirect URL
            const redirectUrl = AuthService.getAbsoluteUrl('reset-password.html');
            console.log('Redirect URL:', redirectUrl);
            
            const { error } = await this.getSupabase().auth.resetPasswordForEmail(email, {
                redirectTo: AuthService.getAbsoluteUrl('reset-password.html')
            });

            if (error) throw error;

            this.showMessage(this.loginMessage, 'Password reset instructions sent to your email', 'success');
            
        } catch (error) {
            this.showMessage(this.loginMessage, error.message);
        } finally {
            this.showLoading(false);
        }
    }

    handleAuthStateChange(event, session) {
        this.currentUser = session?.user || null;
        this.notifyAuthStateListeners(this.currentUser, event);
        
        // Handle session changes
        if (event === 'SIGNED_IN') {
            // Only redirect if we're on the login page
            if (window.location.pathname.includes('login.html')) {
                AuthService.redirectToApp();
            }
        } else if (event === 'SIGNED_OUT') {
            AuthService.redirectToLogin();
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

// Export both the class and the singleton instance
export { AuthService };
const auth = new AuthService();
export default auth;
window.authService = auth; 