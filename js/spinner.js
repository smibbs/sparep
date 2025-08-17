/**
 * Centralized Spinner System
 * Provides consistent spinner functionality across the application
 */

class SpinnerManager {
    constructor() {
        this.activeSpinners = new Map();
        this.initialized = false;
        this.defaultMessages = {
            loading: 'Loading...',
            saving: 'Saving your progress...',
            uploading: 'Uploading...',
            processing: 'Processing...'
        };
    }

    /**
     * Initialize the spinner system
     */
    init() {
        if (this.initialized) return;
        
        // Ensure CSS is loaded
        this.ensureSpinnerCSS();
        this.initialized = true;
    }

    /**
     * Ensure spinner CSS is loaded
     */
    ensureSpinnerCSS() {
        const existingLink = document.querySelector('link[href*="spinner.css"]');
        if (!existingLink) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/spinner.css?v=' + Date.now();
            document.head.appendChild(link);
        }
    }

    /**
     * Show spinner in a specific container or create overlay
     * @param {string} containerId - ID of container element
     * @param {Object} options - Configuration options
     */
    show(containerId, options = {}) {
        this.init();
        
        const {
            message = this.defaultMessages.loading,
            type = 'loading',
            overlay = true,
            size = 'medium'
        } = options;

        // Prevent duplicate spinners
        if (this.activeSpinners.has(containerId)) {
            this.updateMessage(containerId, message);
            return;
        }

        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Spinner container not found: ${containerId}`);
            return;
        }

        // Create spinner element
        const spinnerElement = this.createSpinnerElement(message, type, size, overlay);
        
        // Store reference
        this.activeSpinners.set(containerId, {
            element: spinnerElement,
            container: container,
            type: type
        });

        // Add to DOM
        if (overlay) {
            container.style.position = 'relative';
            container.appendChild(spinnerElement);
        } else {
            container.innerHTML = '';
            container.appendChild(spinnerElement);
        }

        // Trigger animation
        requestAnimationFrame(() => {
            spinnerElement.classList.add('spinner-visible');
        });
    }

    /**
     * Hide spinner from container
     * @param {string} containerId - ID of container element
     */
    hide(containerId) {
        const spinnerData = this.activeSpinners.get(containerId);
        if (!spinnerData) return;

        const { element, container } = spinnerData;
        
        // Fade out animation
        element.classList.add('spinner-hiding');
        
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            this.activeSpinners.delete(containerId);
        }, 300); // Match CSS transition duration
    }

    /**
     * Update message of existing spinner
     * @param {string} containerId - ID of container element
     * @param {string} message - New message
     */
    updateMessage(containerId, message) {
        const spinnerData = this.activeSpinners.get(containerId);
        if (!spinnerData) return;

        const messageElement = spinnerData.element.querySelector('.spinner-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    /**
     * Check if spinner is active
     * @param {string} containerId - ID of container element
     * @returns {boolean}
     */
    isActive(containerId) {
        return this.activeSpinners.has(containerId);
    }

    /**
     * Hide all active spinners
     */
    hideAll() {
        const containerIds = Array.from(this.activeSpinners.keys());
        containerIds.forEach(id => this.hide(id));
    }

    /**
     * Create spinner DOM element
     * @private
     */
    createSpinnerElement(message, type, size, overlay) {
        const spinner = document.createElement('div');
        spinner.className = `spinner-container ${overlay ? 'spinner-overlay' : ''} spinner-${type} spinner-${size}`;
        
        spinner.innerHTML = `
            <div class="spinner-content">
                <div class="spinner-animation"></div>
                <div class="spinner-message">${message}</div>
            </div>
        `;

        return spinner;
    }

    /**
     * Get spinner state for debugging
     */
    getState() {
        return {
            initialized: this.initialized,
            activeSpinners: Array.from(this.activeSpinners.keys())
        };
    }
}

// Create global instance
const spinnerManager = new SpinnerManager();

// Legacy compatibility functions for existing code
window.showLoading = function(show, message) {
    if (show) {
        spinnerManager.show('loading-state', { 
            message: message || spinnerManager.defaultMessages.loading,
            type: 'loading'
        });
    } else {
        spinnerManager.hide('loading-state');
    }
};

window.hideLoading = function() {
    spinnerManager.hide('loading-state');
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = spinnerManager;
}

// Global access
window.spinnerManager = spinnerManager;