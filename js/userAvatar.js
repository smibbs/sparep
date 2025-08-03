// userAvatar.js - User avatar component with dynamic initials generation

import auth from './auth.js';

export class UserAvatar {
    constructor() {
        this.avatarElement = null;
        this.userProfile = null;
        this.initials = '';
        this.onClickCallback = null;
    }

    /**
     * Initialize the user avatar component
     * @param {Function} onClickCallback - Callback function when avatar is clicked
     */
    async initialize(onClickCallback = null) {
        try {
            this.onClickCallback = onClickCallback;
            
            // Get user profile data
            this.userProfile = await auth.getUserProfile();
            
            if (!this.userProfile) {
                console.error('Could not load user profile for avatar');
                return false;
            }

            // Generate initials
            this.initials = this.generateInitials(this.userProfile.display_name || this.userProfile.email);
            
            // Create avatar element
            this.createAvatarElement();
            
            // Insert into DOM
            this.insertIntoDom();
            
            // Set up event listeners
            this.setupEventListeners();
            
            return true;
        } catch (error) {
            console.error('Error initializing user avatar:', error);
            return false;
        }
    }

    /**
     * Generate user initials from display name or email
     * @param {string} nameOrEmail - User's display name or email
     * @returns {string} - User initials (max 2 characters)
     */
    generateInitials(nameOrEmail) {
        if (!nameOrEmail) return 'U';
        
        // Clean the input
        const cleaned = nameOrEmail.trim();
        
        // If it looks like an email, use the part before @
        const emailMatch = cleaned.match(/^([^@]+)@/);
        const workingText = emailMatch ? emailMatch[1] : cleaned;
        
        // Split by common separators and get initials
        const parts = workingText.split(/[\s\-\_\.]+/).filter(part => part.length > 0);
        
        if (parts.length === 0) return 'U';
        if (parts.length === 1) {
            // Single word - take first character, or first 2 if it's long enough
            const word = parts[0];
            return word.length >= 2 ? word.substring(0, 2).toUpperCase() : word.charAt(0).toUpperCase();
        }
        
        // Multiple parts - take first character of first two parts
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }

    /**
     * Create the avatar DOM element
     */
    createAvatarElement() {
        this.avatarElement = document.createElement('div');
        this.avatarElement.className = 'user-avatar';
        this.avatarElement.textContent = this.initials;
        this.avatarElement.setAttribute('role', 'button');
        this.avatarElement.setAttribute('tabindex', '0');
        this.avatarElement.setAttribute('aria-label', `User menu for ${this.userProfile.display_name || this.userProfile.email}`);
        this.avatarElement.setAttribute('aria-expanded', 'false');
        this.avatarElement.setAttribute('aria-haspopup', 'menu');
        this.avatarElement.title = `${this.userProfile.display_name || this.userProfile.email} - Click to open menu`;
    }

    /**
     * Insert avatar into the DOM
     */
    insertIntoDom() {
        // Remove any existing avatar
        const existingAvatar = document.querySelector('.user-avatar');
        if (existingAvatar) {
            existingAvatar.remove();
        }

        // Insert at the end of body (will be positioned fixed)
        document.body.appendChild(this.avatarElement);
    }

    /**
     * Set up event listeners for the avatar
     */
    setupEventListeners() {
        if (!this.avatarElement) return;

        // Click handler
        this.avatarElement.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleClick();
        });

        // Keyboard handler
        this.avatarElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.handleClick();
            }
        });

        // Prevent context menu for cleaner UX
        this.avatarElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    /**
     * Handle avatar click/activation
     */
    handleClick() {
        if (this.onClickCallback && typeof this.onClickCallback === 'function') {
            this.onClickCallback();
        }
    }

    /**
     * Update avatar state (for menu open/close)
     * @param {boolean} isMenuOpen - Whether the menu is currently open
     */
    updateState(isMenuOpen) {
        if (!this.avatarElement) return;
        
        if (isMenuOpen) {
            this.avatarElement.classList.add('menu-open');
            this.avatarElement.setAttribute('aria-expanded', 'true');
        } else {
            this.avatarElement.classList.remove('menu-open');
            this.avatarElement.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Update avatar with new user data
     * @param {Object} newUserProfile - Updated user profile data
     */
    async updateUserData(newUserProfile = null) {
        try {
            // Refresh user profile data
            this.userProfile = newUserProfile || await auth.getUserProfile(true); // force refresh
            if (!this.userProfile) return false;

            // Regenerate initials
            const newInitials = this.generateInitials(this.userProfile.display_name || this.userProfile.email);
            
            // Update if changed
            if (newInitials !== this.initials) {
                this.initials = newInitials;
                if (this.avatarElement) {
                    this.avatarElement.textContent = this.initials;
                    this.avatarElement.setAttribute('aria-label', `User menu for ${this.userProfile.display_name || this.userProfile.email}`);
                    this.avatarElement.title = `${this.userProfile.display_name || this.userProfile.email} - Click to open menu`;
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error updating user avatar data:', error);
            return false;
        }
    }

    /**
     * Get current user profile data
     * @returns {Object|null} - Current user profile
     */
    getUserProfile() {
        return this.userProfile;
    }

    /**
     * Get current initials
     * @returns {string} - Current user initials
     */
    getInitials() {
        return this.initials;
    }

    /**
     * Destroy the avatar component
     */
    destroy() {
        if (this.avatarElement) {
            this.avatarElement.remove();
            this.avatarElement = null;
        }
        this.userProfile = null;
        this.initials = '';
        this.onClickCallback = null;
    }
}

// Export default instance
export default new UserAvatar();