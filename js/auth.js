// Authentication service for handling user registration, login, and session management
class AuthService {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentUser = null;
        this.setupDOMElements();
        this.setupEventListeners();
        this.initializeAuthState();
    }

    // Get base URL for the application
    getBaseUrl() {
        // For local development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return '/';
        }
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
                this.redirectToApp();
            }
        } catch (error) {
            console.error('Error checking auth state:', error.message);
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

            if (error) {
                console.error('Registration error:', error);
                throw error;
            }

            // Show success message
            this.showMessage(
                this.registerMessage,
                'Registration successful! Please check your email to confirm your account.',
                'success'
            );

        } catch (error) {
            console.error('Detailed registration error:', error);
            this.showMessage(this.registerMessage, error.message || 'Failed to register user');
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
        console.log('Auth state changed:', event);
        
        switch (event) {
            case 'SIGNED_IN':
                this.currentUser = session.user;
                this.redirectToApp();
                break;
                
            case 'SIGNED_OUT':
                this.currentUser = null;
                // Only redirect if we're not already on the login page
                if (!window.location.pathname.includes('login.html')) {
                    window.location.href = this.getUrl('login.html');
                }
                break;
                
            case 'USER_UPDATED':
                this.currentUser = session.user;
                break;
        }
    }

    redirectToApp() {
        window.location.href = this.getUrl('index.html');
    }

    static async signOut() {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) {
            console.error('Error signing out:', error.message);
            throw error;
        }
    }
}

// Initialize the auth service when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authService = new AuthService();
}); 