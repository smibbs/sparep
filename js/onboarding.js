// Simple Scroll-Triggered Text Animation
class SimpleTextAnimation {
    constructor() {
        this.scrollProgress = 0;
        this.isInitialized = false;
        
        // Text reveal thresholds for 6 messages (first message shows at 0%)
        this.revealThresholds = [0.0, 0.2, 0.35, 0.5, 0.65, 0.8];
        
        // Throttled scroll handler for performance
        this.handleScroll = this.throttle(this.onScroll.bind(this), 16); // ~60fps
        
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        try {
            this.setupElements();
            this.bindEvents();
            this.updateAnimation();
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize text animation:', error);
        }
    }
    
    setupElements() {
        // Get animation elements
        this.revealTexts = document.querySelectorAll('.reveal-text');
        this.scrollIndicator = document.querySelector('.scroll-indicator');
        this.progressBar = document.querySelector('.scroll-progress-bar');
        this.scrollDriver = document.querySelector('.scroll-driver');
        
        if (!this.scrollDriver) {
            throw new Error('Scroll driver element not found');
        }
        
        // Initially hide all text elements except the first one
        this.revealTexts.forEach((text, index) => {
            if (index === 0) {
                text.classList.add('visible');
            } else {
                text.classList.remove('visible');
            }
        });
    }
    
    bindEvents() {
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.throttle(() => {
            this.calculateScrollProgress();
            this.updateAnimation();
        }, 250));
    }
    
    onScroll() {
        this.calculateScrollProgress();
        this.updateAnimation();
        this.updateProgressBar();
    }
    
    calculateScrollProgress() {
        const scrollDriverHeight = this.scrollDriver.offsetHeight;
        const viewportHeight = window.innerHeight;
        const scrollableDistance = scrollDriverHeight - viewportHeight;
        
        if (scrollableDistance <= 0) {
            this.scrollProgress = 0;
            return;
        }
        
        const scrolled = window.pageYOffset || document.documentElement.scrollTop;
        this.scrollProgress = Math.min(1, Math.max(0, scrolled / scrollableDistance));
    }
    
    updateAnimation() {
        // Determine which text should be active based on scroll progress
        let activeTextIndex = -1;
        
        for (let i = 0; i < this.revealThresholds.length; i++) {
            const currentThreshold = this.revealThresholds[i];
            const nextThreshold = this.revealThresholds[i + 1] || 1.0;
            
            if (this.scrollProgress >= currentThreshold && this.scrollProgress < nextThreshold) {
                activeTextIndex = i;
                break;
            }
        }
        
        // Special case: if we've reached the last threshold, keep the last message visible
        const lastMessageIndex = this.revealThresholds.length - 1;
        if (this.scrollProgress >= this.revealThresholds[lastMessageIndex]) {
            activeTextIndex = lastMessageIndex;
        }
        
        // Show only the active text, hide all others
        this.revealTexts.forEach((textElement, index) => {
            if (index === activeTextIndex) {
                textElement.classList.add('visible');
            } else {
                textElement.classList.remove('visible');
            }
        });
        
        // Hide scroll indicator only when reaching the last message (80% or more)
        if (this.scrollProgress >= 0.8 && this.scrollIndicator) {
            this.scrollIndicator.classList.add('hidden');
        } else if (this.scrollProgress < 0.8 && this.scrollIndicator) {
            this.scrollIndicator.classList.remove('hidden');
        }
    }
    
    updateProgressBar() {
        if (this.progressBar) {
            this.progressBar.style.width = `${this.scrollProgress * 100}%`;
        }
    }
    
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Public methods
    destroy() {
        if (!this.isInitialized) return;
        
        window.removeEventListener('scroll', this.handleScroll);
        this.isInitialized = false;
    }
    
    reset() {
        // Reset all animations and states
        this.scrollProgress = 0;
        
        // Hide all text elements
        this.revealTexts.forEach(text => {
            text.classList.remove('visible');
        });
        
        // Show scroll indicator
        if (this.scrollIndicator) {
            this.scrollIndicator.classList.remove('hidden');
        }
        
        // Reset progress bar
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the login page and have the animation elements
    if (window.location.pathname.includes('login.html') && 
        document.querySelector('.animation-content')) {
        
        window.simpleTextAnimation = new SimpleTextAnimation();
    }
});

// Export for manual initialization if needed
export default SimpleTextAnimation;