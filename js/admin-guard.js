/**
 * Admin Guard System - Immediate Authentication Protection
 * 
 * This module provides immediate authentication and authorization checks
 * that run BEFORE admin page content loads, preventing unauthorized access
 * and resource exposure.
 * 
 * Usage:
 * - Import and call AdminGuard.protect() at the top of admin pages
 * - Guards will redirect unauthorized users before content loads
 * - Supports both localhost and production domains
 */

import { getSupabaseClient } from './supabase-client.js';

class AdminGuard {
    constructor() {
        this.supabaseClient = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the Supabase client for auth checks
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            this.supabaseClient = await getSupabaseClient();
            this.isInitialized = true;
        } catch (error) {
            console.error('[AdminGuard] Failed to initialize Supabase client:', error);
            this.redirectToLogin('Authentication service unavailable');
            throw error;
        }
    }

    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>} True if user has valid session
     */
    async isAuthenticated() {
        try {
            await this.initialize();
            
            const { data: { session }, error } = await this.supabaseClient.auth.getSession();
            if (error) {
                console.error('[AdminGuard] Session check error:', error);
                return false;
            }
            
            return session && session.user;
        } catch (error) {
            console.error('[AdminGuard] Authentication check failed:', error);
            return false;
        }
    }

    /**
     * Verify admin access with server-side validation
     * @returns {Promise<boolean>} True if user is verified admin
     */
    async verifyAdminAccess() {
        const startTime = Date.now();
        try {
            console.log('[AdminGuard] Starting admin verification...');
            await this.initialize();
            console.log('[AdminGuard] Supabase client initialized');

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Admin verification timeout')), 10000)
            );

            const verificationPromise = (async () => {
                console.log('[AdminGuard] Getting user...');
                const { data: { user }, error: userError } = await this.supabaseClient.auth.getUser();
                if (userError || !user) {
                    console.log('[AdminGuard] No user found or error:', userError);
                    return false;
                }
                console.log('[AdminGuard] User found, ID:', user.id);

                // Query profiles table to verify admin status server-side
                // RLS policies ensure only the user can query their own profile
                console.log('[AdminGuard] Querying profiles table...');
                const { data: profile, error } = await this.supabaseClient
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error('[AdminGuard] Admin verification query error:', error);
                    return false;
                }
                console.log('[AdminGuard] Profile data:', profile);

                const isAdmin = profile?.is_admin === true;
                console.log('[AdminGuard] Is admin:', isAdmin);
                return isAdmin;
            })();

            const result = await Promise.race([verificationPromise, timeoutPromise]);
            const duration = Date.now() - startTime;
            console.log(`[AdminGuard] Admin verification completed in ${duration}ms`);

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[AdminGuard] Admin verification error after ${duration}ms:`, error);
            return false;
        }
    }

    /**
     * Get base URL for redirects (works on localhost and production)
     */
    getBaseUrl() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        
        // For GitHub Pages
        if (hostname.includes('github.io')) {
            const pathParts = pathname.split('/');
            const repoName = pathParts[1];
            return `/${repoName}/`;
        }
        
        // For custom domain (nanotopic.co.uk)
        if (hostname.includes('nanotopic.co.uk')) {
            return '/';
        }
        
        // For local development
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('local')) {
            return '/';
        }
        
        return '/';
    }

    /**
     * Redirect to login page
     * @param {string} reason - Optional reason for redirect
     */
    redirectToLogin(reason = null) {
        const baseUrl = this.getBaseUrl();
        const loginUrl = `${baseUrl}login.html`;
        
        if (reason) {
            console.warn(`[AdminGuard] Redirecting to login: ${reason}`);
        }
        
        // Immediate redirect to prevent content exposure
        window.location.href = loginUrl;
    }

    /**
     * Redirect to main app
     * @param {string} reason - Optional reason for redirect
     */
    redirectToApp(reason = null) {
        const baseUrl = this.getBaseUrl();
        const appUrl = `${baseUrl}index.html`;
        
        if (reason) {
            console.warn(`[AdminGuard] Redirecting to app: ${reason}`);
        }
        
        window.location.href = appUrl;
    }

    /**
     * Show loading state while checking authentication
     */
    showAuthLoading() {
        // Hide all page content immediately
        document.body.style.visibility = 'hidden';
        
        // Create loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'admin-guard-loading';
        loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="border: 4px solid #333; border-top: 4px solid #007AFF; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <p style="margin: 0; font-size: 16px;">Verifying admin access...</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingOverlay);
    }

    /**
     * Remove loading state and show page content
     */
    hideAuthLoading() {
        const loadingOverlay = document.getElementById('admin-guard-loading');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
        
        document.body.style.visibility = 'visible';
    }

    /**
     * Main protection method - call this at the top of admin pages
     * @param {Object} options - Configuration options
     * @param {string} options.redirectOnFail - Where to redirect unauthorized users ('login' or 'app')
     * @param {boolean} options.showLoading - Show loading state during checks
     * @returns {Promise<boolean>} True if access granted
     */
    async protect(options = {}) {
        const protectStartTime = Date.now();
        console.log('[AdminGuard] Starting protection check...');

        const {
            redirectOnFail = 'login',
            showLoading = true
        } = options;

        try {
            if (showLoading) {
                this.showAuthLoading();
            }

            // Step 1: Check authentication
            console.log('[AdminGuard] Checking authentication...');
            const authStartTime = Date.now();
            const isAuth = await this.isAuthenticated();
            console.log(`[AdminGuard] Authentication check completed in ${Date.now() - authStartTime}ms`);

            if (!isAuth) {
                console.log('[AdminGuard] Authentication failed, redirecting...');
                if (redirectOnFail === 'login') {
                    this.redirectToLogin('User not authenticated');
                } else {
                    this.redirectToApp('User not authenticated');
                }
                return false;
            }

            // Step 2: Verify admin access
            console.log('[AdminGuard] Verifying admin access...');
            const isAdmin = await this.verifyAdminAccess();

            if (!isAdmin) {
                console.log('[AdminGuard] Admin verification failed, redirecting...');
                if (redirectOnFail === 'login') {
                    this.redirectToLogin('Admin access required');
                } else {
                    this.redirectToApp('Admin access required');
                }
                return false;
            }

            // Access granted - show page content
            const totalDuration = Date.now() - protectStartTime;
            console.log(`[AdminGuard] Protection check PASSED in ${totalDuration}ms`);

            if (showLoading) {
                this.hideAuthLoading();
            }

            return true;

        } catch (error) {
            const totalDuration = Date.now() - protectStartTime;
            console.error(`[AdminGuard] Protection check FAILED after ${totalDuration}ms:`, error);

            if (showLoading) {
                this.hideAuthLoading();
            }

            // On error, deny access for security
            if (redirectOnFail === 'login') {
                this.redirectToLogin('Authentication error occurred');
            } else {
                this.redirectToApp('Authentication error occurred');
            }

            return false;
        }
    }

    /**
     * Create periodic validation for admin sessions
     * @param {number} intervalMinutes - How often to validate (default: 5 minutes)
     * @param {number} maxFailures - Max failures before logout (default: 2)
     */
    startPeriodicValidation(intervalMinutes = 5, maxFailures = 2) {
        let validationFailures = 0;
        const intervalMs = intervalMinutes * 60 * 1000;

        const validateAdminStatus = async () => {
            try {
                const isAdminValid = await this.verifyAdminAccess();

                if (!isAdminValid) {
                    validationFailures++;
                    console.warn(`[AdminGuard] Periodic validation failed (${validationFailures}/${maxFailures})`);
                    
                    if (validationFailures >= maxFailures) {
                        alert('Your admin session has expired. Please log in again.');
                        this.redirectToLogin('Admin session expired');
                        return;
                    }
                } else {
                    validationFailures = 0;
                }
            } catch (error) {
                validationFailures++;
                console.error('[AdminGuard] Periodic validation error:', error);
                
                if (validationFailures >= maxFailures) {
                    alert('Unable to verify admin access. Please log in again.');
                    this.redirectToLogin('Validation error');
                }
            }
        };

        // Start validation after 30 seconds, then at regular intervals
        setTimeout(validateAdminStatus, 30000);
        setInterval(validateAdminStatus, intervalMs);
    }
}

// Create singleton instance
const adminGuard = new AdminGuard();

// Export both class and instance
export { AdminGuard };
export default adminGuard;

// Make available globally for debugging
window.adminGuard = adminGuard;