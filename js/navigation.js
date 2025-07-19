/**
 * Navigation Controller for responsive hamburger menu
 * Manages mobile menu state, accessibility, and user interactions
 */
class NavigationController {
    constructor() {
        this.isMenuOpen = false;
        this.hamburgerButton = null;
        this.mobileOverlay = null;
        this.mobileNavigation = null;
        this.desktopNavigation = null;
        this.focusableElements = [];
        this.lastFocusedElement = null;
        
        this.init();
    }

    /**
     * Initialize the navigation controller
     */
    init() {
        this.desktopNavigation = document.querySelector('.navigation');
        if (!this.desktopNavigation) {
            console.warn('Desktop navigation not found');
            return;
        }

        this.createHamburgerButton();
        this.createMobileOverlay();
        this.setupEventListeners();
        this.populateMobileMenu();
    }

    /**
     * Create hamburger menu button
     */
    createHamburgerButton() {
        const headerNav = document.querySelector('.header-nav');
        if (!headerNav) return;

        this.hamburgerButton = document.createElement('button');
        this.hamburgerButton.id = 'hamburger-menu';
        this.hamburgerButton.className = 'hamburger-menu';
        this.hamburgerButton.setAttribute('aria-label', 'Toggle navigation menu');
        this.hamburgerButton.setAttribute('aria-expanded', 'false');
        this.hamburgerButton.setAttribute('aria-controls', 'mobile-menu-overlay');

        // Create hamburger lines
        for (let i = 0; i < 3; i++) {
            const line = document.createElement('span');
            line.className = 'hamburger-line';
            this.hamburgerButton.appendChild(line);
        }

        // Insert before existing navigation
        headerNav.insertBefore(this.hamburgerButton, this.desktopNavigation);
    }

    /**
     * Create mobile menu overlay
     */
    createMobileOverlay() {
        this.mobileOverlay = document.createElement('div');
        this.mobileOverlay.id = 'mobile-menu-overlay';
        this.mobileOverlay.className = 'mobile-menu-overlay';
        this.mobileOverlay.setAttribute('aria-hidden', 'true');

        const mobileContent = document.createElement('div');
        mobileContent.className = 'mobile-menu-content';

        this.mobileNavigation = document.createElement('nav');
        this.mobileNavigation.className = 'mobile-navigation';
        this.mobileNavigation.setAttribute('role', 'navigation');
        this.mobileNavigation.setAttribute('aria-label', 'Mobile navigation');

        mobileContent.appendChild(this.mobileNavigation);
        this.mobileOverlay.appendChild(mobileContent);

        // Add to document body
        document.body.appendChild(this.mobileOverlay);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Hamburger button click
        if (this.hamburgerButton) {
            this.hamburgerButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMenu();
            });
        }

        // Mobile overlay click (backdrop)
        if (this.mobileOverlay) {
            this.mobileOverlay.addEventListener('click', (e) => {
                if (e.target === this.mobileOverlay) {
                    this.closeMenu();
                }
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Focus management
        document.addEventListener('focusin', (e) => {
            this.handleFocusIn(e);
        });
    }

    /**
     * Copy navigation items to mobile menu
     */
    populateMobileMenu() {
        if (!this.mobileNavigation || !this.desktopNavigation) return;

        // Clear existing mobile menu items
        this.mobileNavigation.innerHTML = '';

        // Clone navigation items
        const navItems = this.desktopNavigation.querySelectorAll('.nav-button');
        navItems.forEach(item => {
            const mobileItem = item.cloneNode(true);
            mobileItem.className = 'mobile-nav-button';
            
            // Add click handler to close menu
            mobileItem.addEventListener('click', () => {
                this.closeMenu();
            });

            this.mobileNavigation.appendChild(mobileItem);
        });

        // Update focusable elements
        this.updateFocusableElements();
    }

    /**
     * Update focusable elements in mobile menu
     */
    updateFocusableElements() {
        if (!this.mobileNavigation) return;

        this.focusableElements = this.mobileNavigation.querySelectorAll('.mobile-nav-button');
    }

    /**
     * Toggle mobile menu state
     */
    toggleMenu() {
        if (this.isMenuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    /**
     * Open mobile menu
     */
    openMenu() {
        this.isMenuOpen = true;
        this.lastFocusedElement = document.activeElement;
        
        this.updateMenuState();
        this.trapFocus();
    }

    /**
     * Close mobile menu
     */
    closeMenu() {
        this.isMenuOpen = false;
        this.updateMenuState();
        this.returnFocus();
    }

    /**
     * Update menu state and ARIA attributes
     */
    updateMenuState() {
        if (!this.hamburgerButton || !this.mobileOverlay) return;

        // Update hamburger button
        this.hamburgerButton.setAttribute('aria-expanded', this.isMenuOpen.toString());
        this.hamburgerButton.classList.toggle('active', this.isMenuOpen);

        // Update mobile overlay
        this.mobileOverlay.setAttribute('aria-hidden', (!this.isMenuOpen).toString());
        this.mobileOverlay.classList.toggle('active', this.isMenuOpen);

        // Manage body scroll
        document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    }

    /**
     * Handle keyboard navigation
     */
    handleKeyboardNavigation(event) {
        if (!this.isMenuOpen) return;

        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                this.closeMenu();
                break;
            case 'Tab':
                this.handleTabNavigation(event);
                break;
        }
    }

    /**
     * Handle tab navigation within mobile menu
     */
    handleTabNavigation(event) {
        if (!this.isMenuOpen || this.focusableElements.length === 0) return;

        const firstElement = this.focusableElements[0];
        const lastElement = this.focusableElements[this.focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * Handle focus within mobile menu
     */
    handleFocusIn(event) {
        if (!this.isMenuOpen) return;

        const mobileContent = this.mobileOverlay?.querySelector('.mobile-menu-content');
        if (mobileContent && !mobileContent.contains(event.target)) {
            event.preventDefault();
            if (this.focusableElements.length > 0) {
                this.focusableElements[0].focus();
            }
        }
    }

    /**
     * Trap focus within mobile menu
     */
    trapFocus() {
        if (this.focusableElements.length > 0) {
            this.focusableElements[0].focus();
        }
    }

    /**
     * Return focus to last focused element
     */
    returnFocus() {
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Close menu on desktop breakpoint
        if (window.innerWidth > 768 && this.isMenuOpen) {
            this.closeMenu();
        }
    }

    /**
     * Update admin link visibility in mobile menu
     */
    updateAdminVisibility() {
        const desktopAdminLink = document.getElementById('admin-nav-link');
        const mobileAdminLink = this.mobileNavigation?.querySelector('#admin-nav-link');

        if (desktopAdminLink && mobileAdminLink) {
            const isHidden = desktopAdminLink.classList.contains('hidden');
            mobileAdminLink.classList.toggle('hidden', isHidden);
        }
    }

    /**
     * Refresh mobile menu items (useful when navigation changes)
     */
    refreshMobileMenu() {
        this.populateMobileMenu();
    }

    /**
     * Destroy navigation controller
     */
    destroy() {
        // Remove event listeners
        if (this.hamburgerButton) {
            this.hamburgerButton.removeEventListener('click', this.toggleMenu);
        }

        if (this.mobileOverlay) {
            this.mobileOverlay.removeEventListener('click', this.closeMenu);
            this.mobileOverlay.remove();
        }

        document.removeEventListener('keydown', this.handleKeyboardNavigation);
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('focusin', this.handleFocusIn);

        // Clean up
        this.isMenuOpen = false;
        document.body.style.overflow = '';
    }
}

export default NavigationController;