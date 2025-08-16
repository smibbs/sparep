/**
 * TimerManager - Tracks active viewing time for flashcard reviews
 * Only counts time when the user is actively viewing the tab/window
 */
class TimerManager {
    constructor() {
        this.startTime = null;
        this.accumulatedTime = 0;
        this.isActive = true;
        this.maxReasonableTime = 5 * 60 * 1000; // 5 minutes max
        this.setupEventListeners();
    }

    /**
     * Start tracking time for a new card
     */
    start() {
        this.reset();
        if (this.isPageVisible() && this.isWindowFocused()) {
            this.startTime = Date.now();
            this.isActive = true;
        } else {
            this.isActive = false;
        }
    }

    /**
     * Stop tracking and return accumulated active time
     * @returns {number|null} Active viewing time in milliseconds, or null if no timing
     */
    stop() {
        if (this.isActive && this.startTime) {
            this.accumulatedTime += Date.now() - this.startTime;
        }
        
        const totalTime = this.accumulatedTime;
        this.reset();
        
        // Return null if time is unreasonable (likely due to timing errors)
        if (totalTime > this.maxReasonableTime || totalTime <= 0) {
            return null;
        }
        
        return totalTime;
    }

    /**
     * Pause timing (when tab becomes hidden or window loses focus)
     */
    pause() {
        if (this.isActive && this.startTime) {
            this.accumulatedTime += Date.now() - this.startTime;
            this.startTime = null;
            this.isActive = false;
        }
    }

    /**
     * Resume timing (when tab becomes visible or window gains focus)
     */
    resume() {
        if (!this.isActive && this.isPageVisible() && this.isWindowFocused()) {
            this.startTime = Date.now();
            this.isActive = true;
        }
    }

    /**
     * Reset all timing data
     */
    reset() {
        this.startTime = null;
        this.accumulatedTime = 0;
        this.isActive = false;
    }

    /**
     * Check if page is visible (not hidden by tab switching)
     */
    isPageVisible() {
        return !document.hidden;
    }

    /**
     * Check if window is focused
     */
    isWindowFocused() {
        return document.hasFocus();
    }

    /**
     * Get current accumulated time (for debugging)
     */
    getCurrentTime() {
        let currentTime = this.accumulatedTime;
        if (this.isActive && this.startTime) {
            currentTime += Date.now() - this.startTime;
        }
        return currentTime;
    }

    /**
     * Setup event listeners for visibility and focus changes
     */
    setupEventListeners() {
        // Handle tab visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });

        // Handle window focus changes
        window.addEventListener('blur', () => {
            this.pause();
        });

        window.addEventListener('focus', () => {
            this.resume();
        });

        // Handle page unload (save any remaining time)
        window.addEventListener('beforeunload', () => {
            if (this.isActive && this.startTime) {
                this.accumulatedTime += Date.now() - this.startTime;
            }
        });
    }

    /**
     * Check if timing is currently active
     */
    isTimingActive() {
        return this.isActive && this.startTime !== null;
    }
}

export default TimerManager;