// slideMenu.js - Sliding navigation menu component

import auth from './auth.js';
import userAvatar from './userAvatar.js';
import { Validator } from './validator.js';

export class SlideMenu {
    constructor() {
        this.menuElement = null;
        this.backdropElement = null;
        this.isOpen = false;
        this.userProfile = null;
        this.focusableElements = [];
        this.lastFocusedElement = null;
    }

    /**
     * Initialize the slide menu component
     */
    async initialize() {
        try {
            
            // Get user profile data
            this.userProfile = await auth.getUserProfile();
            
            if (!this.userProfile) {
                console.error('Could not load user profile for slide menu');
                return false;
            }

            // Create menu elements
            this.createMenuElements();
            
            // Insert into DOM
            this.insertIntoDom();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize avatar with menu toggle callback
            await userAvatar.initialize(() => this.toggle());
            
            return true;
        } catch (error) {
            console.error('Error initializing slide menu:', error);
            return false;
        }
    }

    /**
     * Create the menu DOM elements
     */
    createMenuElements() {
        // Create backdrop
        this.backdropElement = document.createElement('div');
        this.backdropElement.className = 'slide-menu-backdrop';
        this.backdropElement.setAttribute('aria-hidden', 'true');

        // Create menu container
        this.menuElement = document.createElement('div');
        this.menuElement.className = 'slide-menu';
        this.menuElement.setAttribute('role', 'navigation');
        this.menuElement.setAttribute('aria-label', 'Main navigation menu');
        this.menuElement.setAttribute('aria-hidden', 'true');

        // Create menu content
        this.menuElement.innerHTML = this.generateMenuHTML();
        
        // Cache focusable elements
        this.updateFocusableElements();
    }

    /**
     * Generate the menu HTML content
     */
    generateMenuHTML() {
        const currentPage = this.getCurrentPageType();
        const rawInitials = userAvatar.getInitials() || this.generateInitials(this.userProfile.display_name || this.userProfile.email);
        const userInitials = Validator.escapeHtml(rawInitials);
        const userName = Validator.escapeHtml(this.extractDisplayName(this.userProfile.display_name));
        const userEmail = Validator.escapeHtml(this.userProfile.email);
        const isAdmin = this.userProfile.user_tier === 'admin';

        return `
            <div class="slide-menu-header">
                <div class="user-info">
                    <h3 class="user-name">${userName}</h3>
                    <p class="user-email">${userEmail}</p>
                </div>
                <div class="header-avatar">${userInitials}</div>
            </div>
            <nav class="slide-menu-nav">
                <a href="index.html" class="slide-menu-item ${currentPage === 'index' ? 'current-page' : ''}" data-page="study">
                    Study Now
                </a>
                <a href="dashboard.html" class="slide-menu-item ${currentPage === 'dashboard' ? 'current-page' : ''}" data-page="dashboard">
                    Dashboard
                </a>
                <a href="profile.html" class="slide-menu-item ${currentPage === 'profile' ? 'current-page' : ''}" data-page="profile">
                    Profile
                </a>
                <a href="admin.html" class="slide-menu-item admin-only ${isAdmin ? 'visible' : ''} ${currentPage === 'admin' ? 'current-page' : ''}" data-page="admin">
                    Admin
                </a>
                <button class="slide-menu-item sign-out" data-action="sign-out">
                    Sign Out
                </button>
            </nav>
            <div class="slide-menu-footer">
                <p class="app-version">microcards v1.0</p>
            </div>
        `;
    }

    /**
     * Insert menu elements into the DOM
     */
    insertIntoDom() {
        // Remove existing menu elements
        const existingMenu = document.querySelector('.slide-menu');
        const existingBackdrop = document.querySelector('.slide-menu-backdrop');
        if (existingMenu) existingMenu.remove();
        if (existingBackdrop) existingBackdrop.remove();

        // Insert at the end of body
        document.body.appendChild(this.backdropElement);
        document.body.appendChild(this.menuElement);
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Backdrop click to close
        this.backdropElement.addEventListener('click', () => {
            this.close();
        });

        // Menu item clicks
        this.menuElement.addEventListener('click', (e) => {
            const item = e.target.closest('.slide-menu-item');
            if (!item) return;

            const action = item.dataset.action;
            const page = item.dataset.page;

            if (action === 'sign-out') {
                e.preventDefault();
                this.handleSignOut();
            } else if (page) {
                // Close menu before navigation
                this.close();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isOpen) {
                this.handleKeydown(e);
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.menuElement.contains(e.target) && 
                !e.target.closest('.user-avatar')) {
                this.close();
            }
        });

        // Handle menu item keyboard navigation
        this.menuElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const item = e.target.closest('.slide-menu-item');
                if (item) {
                    e.preventDefault();
                    item.click();
                }
            }
        });
    }

    /**
     * Handle keyboard navigation
     */
    handleKeydown(e) {
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
            case 'Tab':
                this.handleTabNavigation(e);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.focusNextItem();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.focusPreviousItem();
                break;
        }
    }

    /**
     * Handle tab navigation within menu
     */
    handleTabNavigation(e) {
        if (this.focusableElements.length === 0) return;

        const firstElement = this.focusableElements[0];
        const lastElement = this.focusableElements[this.focusableElements.length - 1];

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    /**
     * Focus next menu item
     */
    focusNextItem() {
        const currentIndex = this.focusableElements.indexOf(document.activeElement);
        const nextIndex = (currentIndex + 1) % this.focusableElements.length;
        this.focusableElements[nextIndex].focus();
    }

    /**
     * Focus previous menu item
     */
    focusPreviousItem() {
        const currentIndex = this.focusableElements.indexOf(document.activeElement);
        const prevIndex = currentIndex <= 0 ? this.focusableElements.length - 1 : currentIndex - 1;
        this.focusableElements[prevIndex].focus();
    }

    /**
     * Update cached focusable elements
     */
    updateFocusableElements() {
        if (!this.menuElement) return;
        
        this.focusableElements = Array.from(this.menuElement.querySelectorAll(
            'a[href], button, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.disabled && !el.hidden);
    }

    /**
     * Open the menu
     */
    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.lastFocusedElement = document.activeElement;

        // Add active classes
        this.backdropElement.classList.add('active');
        this.menuElement.classList.add('active');
        
        // Update ARIA attributes
        this.menuElement.setAttribute('aria-hidden', 'false');
        this.backdropElement.setAttribute('aria-hidden', 'false');

        // Update avatar state
        userAvatar.updateState(true);

        // Focus first menu item
        requestAnimationFrame(() => {
            if (this.focusableElements.length > 0) {
                this.focusableElements[0].focus();
            }
        });

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the menu
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;

        // Remove active classes
        this.backdropElement.classList.remove('active');
        this.menuElement.classList.remove('active');
        
        // Update ARIA attributes
        this.menuElement.setAttribute('aria-hidden', 'true');
        this.backdropElement.setAttribute('aria-hidden', 'true');

        // Update avatar state
        userAvatar.updateState(false);

        // Restore focus
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    /**
     * Toggle menu open/close
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Handle sign out action
     */
    async handleSignOut() {
        try {
            // Close menu first
            this.close();
            
            // Show loading state on avatar
            const avatarElement = document.querySelector('.user-avatar');
            if (avatarElement) {
                avatarElement.style.opacity = '0.6';
                avatarElement.style.pointerEvents = 'none';
            }

            // Sign out
            await auth.signOut();
            
            // Redirect will happen automatically via auth state listener
        } catch (error) {
            console.error('Error signing out:', error);
            
            // Restore avatar state
            const avatarElement = document.querySelector('.user-avatar');
            if (avatarElement) {
                avatarElement.style.opacity = '';
                avatarElement.style.pointerEvents = '';
            }
        }
    }

    /**
     * Get current page type for highlighting
     */
    getCurrentPageType() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        if (filename.includes('dashboard')) return 'dashboard';
        if (filename.includes('admin')) return 'admin';
        if (filename.includes('profile')) return 'profile';
        if (filename.includes('index') || filename === '' || filename === '/') return 'index';
        
        return 'other';
    }

    /**
     * Extract display name from user profile
     */
    extractDisplayName(displayName) {
        if (!displayName || displayName.trim() === '') {
            return 'User';
        }
        return displayName.trim();
    }

    /**
     * Generate initials fallback
     */
    generateInitials(nameOrEmail) {
        if (!nameOrEmail) return 'U';
        
        const cleaned = nameOrEmail.trim();
        const emailMatch = cleaned.match(/^([^@]+)@/);
        const workingText = emailMatch ? emailMatch[1] : cleaned;
        const parts = workingText.split(/[\s\-\_\.]+/).filter(part => part.length > 0);
        
        if (parts.length === 0) return 'U';
        if (parts.length === 1) {
            const word = parts[0];
            return word.length >= 2 ? word.substring(0, 2).toUpperCase() : word.charAt(0).toUpperCase();
        }
        
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }

    /**
     * Update menu with new user data
     */
    async updateUserData(newUserProfile = null) {
        try {
            // Update user profile
            this.userProfile = newUserProfile || await auth.getUserProfile(true);
            if (!this.userProfile) return false;

            // Update avatar
            await userAvatar.updateUserData(this.userProfile);

            // Regenerate menu content
            this.menuElement.innerHTML = this.generateMenuHTML();
            this.updateFocusableElements();

            return true;
        } catch (error) {
            console.error('Error updating slide menu data:', error);
            return false;
        }
    }

    /**
     * Destroy the menu component
     */
    destroy() {
        if (this.backdropElement) {
            this.backdropElement.remove();
            this.backdropElement = null;
        }
        if (this.menuElement) {
            this.menuElement.remove();
            this.menuElement = null;
        }
        
        this.isOpen = false;
        this.userProfile = null;
        this.focusableElements = [];
        this.lastFocusedElement = null;
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Destroy avatar
        userAvatar.destroy();
    }
}

// Export default instance
export default new SlideMenu();