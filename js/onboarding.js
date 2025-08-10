// Auto-Advancing Slide Animation with Fade Transitions
class SlideAnimation {
    constructor() {
        this.currentSlide = 0;
        this.slideInterval = null;
        this.isInitialized = false;
        this.messageDuration = 4000; // 4 seconds for message display
        this.fadeDuration = 1000; // 1 second for fade to black
        this.totalCycleDuration = this.messageDuration + this.fadeDuration; // 5 seconds total
        this.isFading = false;
        
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        try {
            this.setupElements();
            this.startSlideshow();
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize slide animation:', error);
        }
    }
    
    setupElements() {
        // Get animation elements
        this.revealTexts = document.querySelectorAll('.reveal-text');
        this.animationContent = document.querySelector('.animation-content');
        
        console.log('Found', this.revealTexts.length, 'text elements');
        console.log('Animation content:', this.animationContent);
        
        if (!this.revealTexts.length) {
            throw new Error('No reveal text elements found');
        }
        
        // Initially show only the first slide
        this.revealTexts.forEach((text, index) => {
            if (index === 0) {
                text.classList.add('visible');
            } else {
                text.classList.remove('visible');
            }
        });
    }
    
    startSlideshow() {
        // Start the slide advancement timer (5 second cycles)
        this.slideInterval = setInterval(() => {
            this.nextSlide();
        }, this.totalCycleDuration);
        
        // Start the fade sequence after 4 seconds
        this.scheduleFadeSequence();
    }
    
    scheduleFadeSequence() {
        // Schedule the fade sequence for each slide
        setTimeout(() => {
            this.executeTransition();
        }, this.messageDuration);
    }
    
    executeTransition() {
        if (this.currentSlide >= this.revealTexts.length - 1) {
            // Don't fade if we're on the last message
            return;
        }
        
        this.isFading = true;
        
        // Step 1: Fade current text out (0.6s)
        if (this.revealTexts[this.currentSlide]) {
            this.revealTexts[this.currentSlide].classList.add('fading');
        }
        
        // Step 2: Add black overlay at same time as text fade
        if (this.animationContent) {
            this.animationContent.classList.add('fade-to-black');
        }
        
        // Step 3: After text finishes fading, hide it completely
        setTimeout(() => {
            // Hide current slide completely
            if (this.revealTexts[this.currentSlide]) {
                this.revealTexts[this.currentSlide].classList.remove('visible', 'fading');
            }
        }, 600);
        
        // Step 4: After total fade duration, remove black overlay and show next text
        setTimeout(() => {
            // Remove fade overlay
            if (this.animationContent) {
                this.animationContent.classList.remove('fade-to-black');
            }
            this.isFading = false;
        }, this.fadeDuration);
        
        // Schedule next transition if not on second-to-last slide
        if (this.currentSlide < this.revealTexts.length - 2) {
            setTimeout(() => {
                this.executeTransition();
            }, this.totalCycleDuration);
        }
    }
    
    nextSlide() {
        // Don't advance if we're on the last slide
        if (this.currentSlide >= this.revealTexts.length - 1) {
            // Stop the slideshow - clear intervals but keep last message visible
            this.destroy();
            return;
        }
        
        // Hide current slide
        if (this.revealTexts[this.currentSlide]) {
            this.revealTexts[this.currentSlide].classList.remove('visible');
        }
        
        // Advance to next slide
        this.currentSlide = this.currentSlide + 1;
        
        // Show new slide
        if (this.revealTexts[this.currentSlide]) {
            this.revealTexts[this.currentSlide].classList.add('visible');
        }
    }
    
    // Public methods
    destroy() {
        // Clear intervals but keep the animation elements intact
        if (this.slideInterval) {
            clearInterval(this.slideInterval);
            this.slideInterval = null;
        }
    }
    
    pause() {
        if (this.slideInterval) {
            clearInterval(this.slideInterval);
            this.slideInterval = null;
        }
    }
    
    resume() {
        if (this.isInitialized && !this.slideInterval && this.currentSlide < this.revealTexts.length - 1) {
            this.startSlideshow();
        }
    }
    
    reset() {
        // Reset to first slide
        this.currentSlide = 0;
        this.isFading = false;
        
        // Remove fade overlay
        if (this.animationContent) {
            this.animationContent.classList.remove('fade-to-black');
        }
        
        // Hide all text elements except first
        this.revealTexts.forEach((text, index) => {
            if (index === 0) {
                text.classList.add('visible');
            } else {
                text.classList.remove('visible');
            }
        });
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the login page and have the animation elements
    if (window.location.pathname.includes('login.html') && 
        document.querySelector('.animation-content')) {
        
        window.slideAnimation = new SlideAnimation();
    }
});

// Export for manual initialization if needed
export default SlideAnimation;