// profile.js - Profile page functionality

import auth from './auth.js';
import slideMenu from './slideMenu.js';
import { getSupabaseClient } from './supabase-client.js';

class ProfileManager {
    constructor() {
        this.supabase = null;
        this.userProfile = null;
        this.currentUser = null;
        this.isLoading = false;
        this.hasUnsavedChanges = false;
        this.originalFormData = {};
    }

    /**
     * Initialize the profile manager
     */
    async initialize() {
        try {
            // Initialize Supabase client
            this.supabase = await getSupabaseClient();
            
            // Check authentication
            this.currentUser = await auth.getCurrentUser();
            if (!this.currentUser) {
                auth.redirectToLogin();
                return;
            }

            // Initialize slide menu
            await slideMenu.initialize();

            // Load user profile
            await this.loadUserProfile();

            // Set up form handlers
            this.setupFormHandlers();
            
            // Set up modal handlers
            this.setupModalHandlers();

            // Show profile content
            this.showProfileContent();

        } catch (error) {
            console.error('Error initializing profile page:', error);
            this.showError('Failed to load profile page');
        }
    }

    /**
     * Load user profile data
     */
    async loadUserProfile() {
        try {
            this.userProfile = await auth.getUserProfile(true); // force refresh
            if (!this.userProfile) {
                throw new Error('Could not load user profile');
            }

            // Populate form fields
            this.populateForm();
            
            // Store original form data for change detection
            this.storeOriginalFormData();
            
        } catch (error) {
            console.error('Error loading user profile:', error);
            throw error;
        }
    }

    /**
     * Populate form with user data
     */
    populateForm() {
        const { firstName, lastName } = this.parseDisplayName(this.userProfile.display_name);
        
        // Personal information
        document.getElementById('firstName').value = firstName;
        document.getElementById('lastName').value = lastName;
        document.getElementById('email').value = this.userProfile.email || '';

        // Account information
        const tierBadge = document.getElementById('user-tier');
        const tierDescription = document.getElementById('tier-description');
        
        if (tierBadge && tierDescription) {
            tierBadge.textContent = this.formatTier(this.userProfile.user_tier);
            tierBadge.className = `tier-badge tier-${this.userProfile.user_tier}`;
            tierDescription.textContent = this.getTierDescription(this.userProfile.user_tier);
        }

        // Member since (using created_at if available, or current date as fallback)
        const memberSince = document.getElementById('member-since');
        if (memberSince) {
            const date = this.currentUser.created_at ? new Date(this.currentUser.created_at) : new Date();
            memberSince.textContent = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long' 
            });
        }
    }

    /**
     * Parse display name into first and last name
     */
    parseDisplayName(displayName) {
        if (!displayName || displayName.trim() === '') {
            return { firstName: '', lastName: '' };
        }

        const parts = displayName.trim().split(/\s+/);
        if (parts.length === 1) {
            return { firstName: parts[0], lastName: '' };
        }
        
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ');
        return { firstName, lastName };
    }

    /**
     * Format tier for display
     */
    formatTier(tier) {
        const tierMap = {
            'free': 'Free',
            'paid': 'Paid',
            'admin': 'Admin'
        };
        return tierMap[tier] || 'Free';
    }

    /**
     * Get tier description
     */
    getTierDescription(tier) {
        const descriptions = {
            'free': '20 cards per day',
            'paid': 'Unlimited cards',
            'admin': 'Full access + admin features'
        };
        return descriptions[tier] || '20 cards per day';
    }

    /**
     * Store original form data for change detection
     */
    storeOriginalFormData() {
        this.originalFormData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value
        };
    }

    /**
     * Check if form has unsaved changes
     */
    checkForChanges() {
        const currentData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value
        };

        this.hasUnsavedChanges = JSON.stringify(currentData) !== JSON.stringify(this.originalFormData);
        this.updateSaveButtonState();
    }

    /**
     * Update save button state based on changes and validation
     */
    updateSaveButtonState() {
        const saveButton = document.getElementById('save-button');
        const isValid = this.validateForm();
        
        if (saveButton) {
            saveButton.disabled = !this.hasUnsavedChanges || !isValid || this.isLoading;
        }
    }

    /**
     * Set up form event handlers
     */
    setupFormHandlers() {
        const form = document.getElementById('profile-form');
        const cancelButton = document.getElementById('cancel-button');
        const changePasswordButton = document.getElementById('change-password-button');
        const deleteAccountButton = document.getElementById('delete-account-button');

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Input change detection
        const inputs = form.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.clearFieldError(input.id);
                this.checkForChanges();
            });
            
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
        });

        // Cancel button
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.handleCancel();
            });
        }

        // Change password button
        if (changePasswordButton) {
            changePasswordButton.addEventListener('click', () => {
                this.showPasswordModal();
            });
        }

        // Delete account button
        if (deleteAccountButton) {
            deleteAccountButton.addEventListener('click', () => {
                this.showDeleteModal();
            });
        }

        // Prevent leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit() {
        if (!this.validateForm()) {
            return;
        }

        try {
            this.setLoading(true);
            this.clearMessages();

            const formData = {
                firstName: document.getElementById('firstName').value.trim(),
                lastName: document.getElementById('lastName').value.trim(),
                email: document.getElementById('email').value.trim()
            };

            // Update profile
            await this.updateProfile(formData);

            // Show success message
            this.showSuccessMessage('Profile updated successfully!');
            
            // Update stored form data
            this.storeOriginalFormData();
            this.hasUnsavedChanges = false;
            this.updateSaveButtonState();

            // Update slide menu with new data
            await slideMenu.updateUserData();

        } catch (error) {
            console.error('Error updating profile:', error);
            this.showErrorMessage(error.message || 'Failed to update profile. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(formData) {
        const displayName = `${formData.firstName} ${formData.lastName}`.trim();
        const emailChanged = formData.email !== this.userProfile.email;

        // Use the auth service to update profile
        await auth.updateUserProfile({
            display_name: displayName,
            email: emailChanged ? formData.email : undefined
        });

        // Refresh user profile data
        await this.loadUserProfile();

        // Special message if email was changed
        if (emailChanged) {
            this.showSuccessMessage('Profile updated! Please check your new email address for a verification link.');
        }
    }

    /**
     * Handle cancel action
     */
    handleCancel() {
        if (this.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
                return;
            }
        }

        // Reset form to original values
        this.populateForm();
        this.storeOriginalFormData();
        this.hasUnsavedChanges = false;
        this.updateSaveButtonState();
        this.clearMessages();
    }

    /**
     * Validate form
     */
    validateForm() {
        let isValid = true;

        // Validate first name
        const firstName = document.getElementById('firstName').value.trim();
        if (!firstName) {
            this.showFieldError('firstName', 'First name is required');
            isValid = false;
        } else if (firstName.length > 50) {
            this.showFieldError('firstName', 'First name must be 50 characters or less');
            isValid = false;
        }

        // Validate last name
        const lastName = document.getElementById('lastName').value.trim();
        if (!lastName) {
            this.showFieldError('lastName', 'Last name is required');
            isValid = false;
        } else if (lastName.length > 50) {
            this.showFieldError('lastName', 'Last name must be 50 characters or less');
            isValid = false;
        }

        // Validate email
        const email = document.getElementById('email').value.trim();
        if (!email) {
            this.showFieldError('email', 'Email address is required');
            isValid = false;
        } else if (!this.isValidEmail(email)) {
            this.showFieldError('email', 'Please enter a valid email address');
            isValid = false;
        } else if (email.length > 255) {
            this.showFieldError('email', 'Email address must be 255 characters or less');
            isValid = false;
        }

        return isValid;
    }

    /**
     * Validate individual field
     */
    validateField(input) {
        const value = input.value.trim();
        let isValid = true;

        switch (input.id) {
            case 'firstName':
                if (!value) {
                    this.showFieldError('firstName', 'First name is required');
                    isValid = false;
                } else if (value.length > 50) {
                    this.showFieldError('firstName', 'First name must be 50 characters or less');
                    isValid = false;
                }
                break;
                
            case 'lastName':
                if (!value) {
                    this.showFieldError('lastName', 'Last name is required');
                    isValid = false;
                } else if (value.length > 50) {
                    this.showFieldError('lastName', 'Last name must be 50 characters or less');
                    isValid = false;
                }
                break;
                
            case 'email':
                if (!value) {
                    this.showFieldError('email', 'Email address is required');
                    isValid = false;
                } else if (!this.isValidEmail(value)) {
                    this.showFieldError('email', 'Please enter a valid email address');
                    isValid = false;
                } else if (value.length > 255) {
                    this.showFieldError('email', 'Email address must be 255 characters or less');
                    isValid = false;
                }
                break;
        }

        return isValid;
    }

    /**
     * Check if email is valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Show field error
     */
    showFieldError(fieldId, message) {
        const errorElement = document.getElementById(`${fieldId}-error`);
        const inputElement = document.getElementById(fieldId);
        
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        if (inputElement) {
            inputElement.classList.add('error');
        }
    }

    /**
     * Clear field error
     */
    clearFieldError(fieldId) {
        const errorElement = document.getElementById(`${fieldId}-error`);
        const inputElement = document.getElementById(fieldId);
        
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
        
        if (inputElement) {
            inputElement.classList.remove('error');
        }
    }

    /**
     * Set up modal handlers
     */
    setupModalHandlers() {
        // Password modal handlers would go here
        // Delete modal handlers would go here
        // Implementation abbreviated for space
    }

    /**
     * Show password modal
     */
    showPasswordModal() {
        // Implementation for password change modal
    }

    /**
     * Show delete modal
     */
    showDeleteModal() {
        // Implementation for account deletion modal
    }

    /**
     * Set loading state
     */
    setLoading(loading) {
        this.isLoading = loading;
        const saveButton = document.getElementById('save-button');
        
        if (saveButton) {
            if (loading) {
                saveButton.textContent = 'Saving...';
                saveButton.disabled = true;
            } else {
                saveButton.textContent = 'Save Changes';
                this.updateSaveButtonState();
            }
        }
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        const messagesContainer = document.getElementById('form-messages');
        const successMessage = document.getElementById('success-message');
        const messageText = successMessage.querySelector('.message-text');
        
        if (messagesContainer && successMessage && messageText) {
            messageText.textContent = message;
            messagesContainer.classList.remove('hidden');
            successMessage.classList.remove('hidden');
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                successMessage.classList.add('hidden');
                if (!document.querySelector('#error-message:not(.hidden)')) {
                    messagesContainer.classList.add('hidden');
                }
            }, 5000);
        }
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        const messagesContainer = document.getElementById('form-messages');
        const errorMessage = document.getElementById('error-message');
        const messageText = errorMessage.querySelector('.message-text');
        
        if (messagesContainer && errorMessage && messageText) {
            messageText.textContent = message;
            messagesContainer.classList.remove('hidden');
            errorMessage.classList.remove('hidden');
        }
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        const messagesContainer = document.getElementById('form-messages');
        const successMessage = document.getElementById('success-message');
        const errorMessage = document.getElementById('error-message');
        
        if (successMessage) successMessage.classList.add('hidden');
        if (errorMessage) errorMessage.classList.add('hidden');
        if (messagesContainer) messagesContainer.classList.add('hidden');
    }

    /**
     * Show profile content
     */
    showProfileContent() {
        document.getElementById('profile-loading').classList.add('hidden');
        document.getElementById('profile-error').classList.add('hidden');
        document.getElementById('profile-content').classList.remove('hidden');
    }

    /**
     * Show error state
     */
    showError(message) {
        document.getElementById('profile-loading').classList.add('hidden');
        document.getElementById('profile-content').classList.add('hidden');
        document.getElementById('profile-error').classList.remove('hidden');
        
        const errorMessage = document.getElementById('profile-error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }
}

// Initialize profile manager when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const profileManager = new ProfileManager();
    await profileManager.initialize();
});