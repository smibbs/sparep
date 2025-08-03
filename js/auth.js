import { getSupabaseClient } from './supabase-client.js';
import { SESSION_CONFIG } from './config.js';
import { handleError } from './errorHandler.js';
import { validateEmail, validatePassword, sanitizeString } from './validator.js';

// Authentication service for handling user registration, login, and session management
class AuthService {
    constructor() {
        this.supabasePromise = null;
        this.currentUser = null;
        this.userProfile = null;
        this.authStateListeners = new Set();
        this.initialize();
    }

    async initialize() {
        try {
            await this.initializeWithRetry();
        } catch (error) {
            // Failed to initialize AuthService after retries
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
                // AuthService initialized successfully
                return;
            } catch (error) {
                retries++;
                // Failed to initialize AuthService
                
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
            // Error getting current user
            return null;
        }
    }

    // Get user profile with tier information
    async getUserProfile(forceRefresh = false) {
        if (this.userProfile && !forceRefresh) {
            return this.userProfile;
        }

        try {
            const supabase = await this.getSupabase();
            const user = await this.getCurrentUser();
            if (!user) throw new Error('No authenticated user');

            const { data: profile, error } = await supabase
                .from('user_profiles')
                .select('id, email, display_name, user_tier, reviews_today, last_review_date, daily_new_cards_limit, daily_review_limit')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            
            this.userProfile = profile;
            return profile;
        } catch (error) {
            // Error getting user profile
            return null;
        }
    }

    // Get user tier
    async getUserTier() {
        const profile = await this.getUserProfile();
        return profile?.user_tier || 'free';
    }

    /**
     * Check if user is admin (CLIENT-SIDE ONLY - FOR UI DISPLAY)
     * 
     * ⚠️  SECURITY WARNING: This is a client-side check for UI optimization only.
     * ⚠️  DO NOT rely on this for security decisions or access control.
     * ⚠️  All security enforcement must happen server-side through RLS policies
     *     and database functions that use the server-side is_admin() function.
     * 
     * Use this ONLY for:
     * - Showing/hiding UI elements (nav links, buttons)
     * - Client-side user experience optimization
     * - Reducing unnecessary server requests
     * 
     * For actual security verification, use verifyAdminAccess() instead.
     * 
     * @returns {Promise<boolean>} True if user appears to be admin (client-side check only)
     */
    async isAdmin() {
        const profile = await this.getUserProfile();
        return profile?.user_tier === 'admin';
    }

    /**
     * Check if user has premium access (CLIENT-SIDE ONLY - FOR UI DISPLAY)
     * 
     * ⚠️  SECURITY WARNING: This is a client-side check for UI optimization only.
     * ⚠️  Server-side access control is enforced through RLS policies and
     *     database functions that verify user_tier server-side.
     * 
     * @returns {Promise<boolean>} True if user appears to have premium access (client-side check only)
     */
    async hasPremiumAccess() {
        const tier = await this.getUserTier();
        return tier === 'paid' || tier === 'admin';
    }

    /**
     * Verify admin access with server-side validation (SECURE)
     * 
     * ✅ SECURE: This method performs server-side verification by calling
     *    a database function that uses auth.uid() and server-side RLS policies.
     * 
     * Use this for:
     * - Actual security verification before sensitive operations
     * - Double-checking admin status before critical actions
     * - Validating admin access in admin interfaces
     * 
     * @returns {Promise<boolean>} True if user is verified as admin server-side
     * @throws {Error} If verification fails or user is not authenticated
     */
    async verifyAdminAccess() {
        try {
            const supabase = await getSupabaseClient();
            
            // Use a lightweight database function that calls is_admin() server-side
            // This function should exist in the database and use SECURITY DEFINER
            const { data, error } = await supabase.rpc('verify_admin_access');
            
            if (error) {
                if (error.message?.includes('permission') || error.message?.includes('Admin privileges required')) {
                    return false; // User is not admin
                }
                throw new Error(`Admin verification failed: ${error.message}`);
            }
            
            return data === true;
        } catch (error) {
            console.error('Admin verification error:', error);
            // On error, assume not admin for security
            return false;
        }
    }

    // Get daily review limit for user
    async getDailyReviewLimit() {
        const profile = await this.getUserProfile();
        if (!profile) return SESSION_CONFIG.FREE_USER_DAILY_LIMIT;
        
        switch (profile.user_tier) {
            case 'free': return SESSION_CONFIG.FREE_USER_DAILY_LIMIT;
            case 'paid':
            case 'admin': return SESSION_CONFIG.PAID_USER_DAILY_LIMIT; // Effectively unlimited
            default: return SESSION_CONFIG.FREE_USER_DAILY_LIMIT;
        }
    }

    // Check if user has daily reviews remaining
    async hasReviewsRemaining() {
        const profile = await this.getUserProfile();
        if (!profile) return false;
        
        const tier = profile.user_tier;
        if (tier === 'paid' || tier === 'admin') return true;
        
        // For free users, check daily limit
        const today = new Date().toDateString();
        const lastReviewDate = profile.last_review_date ? new Date(profile.last_review_date).toDateString() : null;
        
        // Reset count if it's a new day
        const reviewsToday = (lastReviewDate === today) ? profile.reviews_today : 0;
        
        return reviewsToday < SESSION_CONFIG.FREE_USER_DAILY_LIMIT;
    }

    // Subscribe to auth state changes
    onAuthStateChange(callback) {
        this.getSupabase().then(supabase => {
            supabase.auth.onAuthStateChange((event, session) => {
                callback(session?.user || null, event);
            });
        }).catch(error => {
            // Error setting up auth state change listener
        });
    }

    // Get base URL for the application
    static getBaseUrl() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        
        // For GitHub Pages
        if (hostname.includes('github.io')) {
            // Extract the repository name from the pathname
            const pathParts = pathname.split('/');
            const repoName = pathParts[1]; // Second part after the first slash
            const basePath = `/${repoName}/`;
            return basePath;
        }
        
        // For custom domain (nanotopic.co.uk and www.nanotopic.co.uk)
        if (hostname.includes('nanotopic.co.uk')) {
            return '/';
        }
        
        // For local development
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('local')) {
            return '/';
        }
        
        // Default fallback
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
        AuthService.performMobileRedirect('index.html');
    }

    // Redirect to login page
    static redirectToLogin() {
        AuthService.performMobileRedirect('login.html');
    }
    
    // Improved mobile redirect with multiple fallback methods
    static performMobileRedirect(path) {
        const url = AuthService.getUrl(path);
        const absoluteUrl = AuthService.getAbsoluteUrl(path);
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const isProduction = !window.location.hostname.includes('localhost');
        
        
        // Method 1: Standard redirect (works on most browsers)
        try {
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = url;
                return;
            }
        } catch (error) {
            console.warn('[Auth] Standard redirect failed:', error);
        }
        
        // Method 2: Direct assignment (Safari fallback)
        try {
            if (typeof window !== 'undefined' && window.location) {
                window.location = url;
                return;
            }
        } catch (error) {
            console.warn('[Auth] Direct assignment redirect failed:', error);
        }
        
        // Method 3: Replace method (prevents back button issues on mobile)
        try {
            if (typeof window !== 'undefined' && window.location && window.location.replace) {
                window.location.replace(url);
                return;
            }
        } catch (error) {
            console.warn('[Auth] Replace redirect failed:', error);
        }
        
        // Method 4: Force page reload as last resort
        try {
            if (typeof window !== 'undefined') {
                window.open(url, '_self');
            }
        } catch (error) {
            console.error('[Auth] All redirect methods failed:', error);
            // Show user a manual navigation option with more context
            const message = isProduction ? 
                `Navigation failed on mobile. Please manually go to: ${url}` :
                `Please navigate to: ${url}`;
            alert(message);
        }
    }

    // Instance method wrapper for use in instance context
    performMobileRedirect(path) {
        AuthService.performMobileRedirect(path);
    }

    // Sign out
    async signOut() {
        try {
            const supabase = await this.getSupabase();
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            // Clear subject cache on logout to prevent memory leaks
            if (typeof window !== 'undefined' && window.clearSubjectCache) {
                window.clearSubjectCache();
            }
            
            AuthService.redirectToLogin();
        } catch (error) {
            // Still attempt redirect on error to ensure user gets logged out
            // Clear cache even on error
            if (typeof window !== 'undefined' && window.clearSubjectCache) {
                window.clearSubjectCache();
            }
            AuthService.redirectToLogin();
        }
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
        this.forgotPasswordLink?.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const email = this.loginEmail?.value?.trim();
            if (!email) {
                this.showMessage(this.loginMessage, 'Please enter your email address');
                return;
            }

            try {
                this.showLoading(true);
                
                // Get supabase client directly
                const supabase = await this.getSupabase();
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: AuthService.getAbsoluteUrl('reset-password.html')
                });

                if (error) throw error;

                this.showMessage(this.loginMessage, 'Password reset instructions sent to your email', 'success');
                
            } catch (error) {
                console.error('Password reset error:', error);
                this.showMessage(this.loginMessage, error.message || 'Failed to send reset email');
            } finally {
                this.showLoading(false);
            }
        });

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
            // Error checking auth state
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
        
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const isProduction = !window.location.hostname.includes('localhost');
        
        
        // Mobile-specific: blur active element to dismiss keyboard
        if (document.activeElement && document.activeElement.blur && isMobile) {
            document.activeElement.blur();
        }
        
        const email = sanitizeString(this.loginEmail.value.trim(), 254);
        const password = this.loginPassword.value;
        
        // Validate inputs before proceeding
        try {
            validateEmail(email, 'login');
            validatePassword(password, 'login');
        } catch (validationError) {
            this.showMessage(this.loginMessage, validationError.message, 'error');
            this.showLoading(false);
            return;
        }

        // Mobile-specific: add haptic feedback if available
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(50);
        }

        try {
            this.showLoading(true);
            
            // Mobile-specific: add timeout for network requests
            const timeoutMs = isProduction ? 20000 : 15000; // Longer timeout for production
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
            );
            
            const supabase = await this.getSupabase();
            
            const authPromise = supabase.auth.signInWithPassword({
                email,
                password
            });

            const { data, error } = await Promise.race([authPromise, timeoutPromise]);

            if (error) {
                console.error(`[Auth] Sign in error:`, error);
                throw error;
            }

            this.showMessage(this.loginMessage, 'Login successful! Redirecting...', 'success');
            
            // Mobile-specific: shorter delay for better UX on mobile
            const redirectDelay = isMobile ? 500 : 1000;
            setTimeout(() => {
                this.performMobileRedirect('index.html');
            }, redirectDelay);
            
        } catch (error) {
            console.error(`[Auth] Login failed:`, error);
            
            // Mobile-specific error handling
            let errorMessage = error.message || 'Failed to sign in';
            if (error.message === 'Request timeout') {
                errorMessage = isProduction ? 
                    'Connection timeout on mobile. Please check your internet and try again.' :
                    'Connection timeout. Please check your internet and try again.';
            } else if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Invalid email or password. Please check your credentials and try again.';
            }
            
            this.showMessage(this.loginMessage, errorMessage);
            
            // Mobile-specific: vibrate on error if available
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate([100, 50, 100]);
            }
        } finally {
            this.showLoading(false);
        }
    }

    async handleRegistration(e) {
        e.preventDefault();
        this.clearMessages();
        
        const email = sanitizeString(this.registerEmail.value.trim(), 254);
        const password = this.registerPassword.value;
        const confirmPass = this.confirmPassword.value;
        const displayName = sanitizeString(this.displayName.value.trim(), 100);

        // Enhanced input validation
        try {
            validateEmail(email, 'registration');
            validatePassword(password, 'registration');
            
            if (!displayName || displayName.length < 1) {
                throw new Error('Display name is required for registration.');
            }
            if (displayName.length > 50) {
                throw new Error('Display name must be 50 characters or less.');
            }
        } catch (validationError) {
            this.showMessage(this.registerMessage, validationError.message, 'error');
            return;
        }

        // Password confirmation check
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
            // Registration error
            this.showMessage(this.registerMessage, error.message || 'Failed to register');
        } finally {
            this.showLoading(false);
        }
    }


    handleAuthStateChange(event, session) {
        this.currentUser = session?.user || null;
        // Clear cached user profile when auth state changes
        this.userProfile = null;
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
                // Error in auth state listener
            }
        });
    }

    // Update user profile
    async updateUserProfile(profileData) {
        try {
            const supabase = await this.getSupabase();
            const user = await this.getCurrentUser();
            if (!user) throw new Error('No authenticated user');

            // Update display_name in user_profiles table
            if (profileData.display_name !== undefined) {
                const { error: profileError } = await supabase
                    .from('user_profiles')
                    .update({ display_name: profileData.display_name })
                    .eq('id', user.id);

                if (profileError) {
                    throw new Error('Failed to update profile information');
                }
            }

            // Update email if provided and different
            if (profileData.email && profileData.email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({
                    email: profileData.email
                });

                if (emailError) {
                    // Rollback display name change if email update failed
                    if (profileData.display_name !== undefined) {
                        await supabase
                            .from('user_profiles')
                            .update({ display_name: this.userProfile?.display_name || '' })
                            .eq('id', user.id);
                    }
                    throw new Error('Failed to update email address. Please check that the email is valid and not already in use.');
                }
            }

            // Update other user metadata if provided
            const userMetadataUpdates = {};
            if (profileData.display_name !== undefined) {
                userMetadataUpdates.display_name = profileData.display_name;
            }

            if (Object.keys(userMetadataUpdates).length > 0) {
                const { error: metadataError } = await supabase.auth.updateUser({
                    data: userMetadataUpdates
                });

                if (metadataError) {
                    console.warn('Failed to update user metadata:', metadataError);
                    // Don't throw here as the profile update was successful
                }
            }

            // Refresh user profile cache
            this.userProfile = null;
            await this.getUserProfile(true);

            return { success: true };
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    // Change user password
    async changePassword(currentPassword, newPassword) {
        try {
            const supabase = await this.getSupabase();
            
            // Note: Supabase doesn't have a direct way to verify current password
            // before changing it. The updateUser method will change the password
            // if the user is authenticated. For additional security, you might
            // want to implement a re-authentication flow.
            
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                throw new Error('Failed to update password. Please try again.');
            }

            return { success: true };
        } catch (error) {
            console.error('Error changing password:', error);
            throw error;
        }
    }

    // Delete user account
    async deleteAccount() {
        try {
            const supabase = await this.getSupabase();
            const user = await this.getCurrentUser();
            if (!user) throw new Error('No authenticated user');

            // Note: Supabase doesn't provide a direct way to delete user accounts
            // from the client side for security reasons. This would typically
            // require a server-side function or admin API call.
            // For now, we'll sign out the user and provide instructions.
            
            await this.signOut();
            
            throw new Error('Account deletion must be requested through customer support. You have been signed out for security.');
        } catch (error) {
            console.error('Error deleting account:', error);
            throw error;
        }
    }

    // Send password reset email
    async sendPasswordResetEmail(email) {
        try {
            const supabase = await this.getSupabase();
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: AuthService.getAbsoluteUrl('reset-password.html')
            });

            if (error) {
                throw new Error('Failed to send password reset email. Please check the email address and try again.');
            }

            return { success: true };
        } catch (error) {
            console.error('Error sending password reset email:', error);
            throw error;
        }
    }

    // Verify email change
    async verifyEmailChange(token) {
        try {
            const supabase = await this.getSupabase();
            
            const { error } = await supabase.auth.verifyOtp({
                token_hash: token,
                type: 'email_change'
            });

            if (error) {
                throw new Error('Failed to verify email change. The link may be expired or invalid.');
            }

            // Refresh user profile after email verification
            this.userProfile = null;
            await this.getUserProfile(true);

            return { success: true };
        } catch (error) {
            console.error('Error verifying email change:', error);
            throw error;
        }
    }
}

// Export both the class and the singleton instance
export { AuthService };
const auth = new AuthService();
export default auth;
window.authService = auth; 