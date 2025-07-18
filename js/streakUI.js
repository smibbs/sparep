/**
 * Streak UI Components
 * Handles display of card review milestone notifications based on total daily cards
 */

import database from './database.js';

class StreakUI {
    constructor() {
        this.milestones = [10, 25, 50, 100, 200];
        this.achievedMilestones = new Set();
        this.notificationTimeout = null;
        this.currentUserId = null;
    }

    /**
     * Initialize the streak UI
     * @param {string} userId - Current user ID
     */
    async initialize(userId) {
        this.currentUserId = userId;
        // Load today's achieved milestones from localStorage
        this.loadTodaysAchievedMilestones();
    }

    /**
     * Track a card review and check for milestones
     */
    async trackCardReview() {
        if (!this.currentUserId) {
            console.warn('StreakUI: User ID not set, cannot track card review');
            return;
        }
        
        try {
            // Get current total reviews today from database
            const totalReviewsToday = await database.getCurrentReviewsToday(this.currentUserId);
            
            // Check if we've reached a milestone
            const currentMilestone = this.milestones.find(milestone => 
                milestone === totalReviewsToday && 
                !this.achievedMilestones.has(milestone)
            );
            
            if (currentMilestone) {
                this.achievedMilestones.add(currentMilestone);
                this.saveTodaysAchievedMilestones();
                this.showMilestoneNotification(currentMilestone);
            }
        } catch (error) {
            console.error('StreakUI: Error tracking card review:', error);
            // Don't let streak tracking errors break the session
        }
    }

    /**
     * Get current cards reviewed count for today
     * @returns {Promise<number>} Current total reviews today
     */
    async getCardsReviewedCount() {
        if (!this.currentUserId) {
            return 0;
        }
        try {
            return await database.getCurrentReviewsToday(this.currentUserId);
        } catch (error) {
            console.error('StreakUI: Error getting cards reviewed count:', error);
            return 0;
        }
    }

    /**
     * Check if it's a new day and reset daily achievements if needed
     */
    checkAndResetDailyAchievements() {
        const today = new Date().toISOString().split('T')[0];
        const lastResetDate = localStorage.getItem('streakUI_lastResetDate');
        
        if (lastResetDate !== today) {
            this.achievedMilestones.clear();
            localStorage.setItem('streakUI_lastResetDate', today);
            localStorage.removeItem('streakUI_achievedMilestones');
        }
    }

    /**
     * Load today's achieved milestones from localStorage
     */
    loadTodaysAchievedMilestones() {
        this.checkAndResetDailyAchievements();
        
        const stored = localStorage.getItem('streakUI_achievedMilestones');
        if (stored) {
            try {
                const achievements = JSON.parse(stored);
                this.achievedMilestones = new Set(achievements);
            } catch (error) {
                console.warn('Error loading achieved milestones:', error);
                this.achievedMilestones = new Set();
            }
        }
    }

    /**
     * Save today's achieved milestones to localStorage
     */
    saveTodaysAchievedMilestones() {
        const achievements = Array.from(this.achievedMilestones);
        localStorage.setItem('streakUI_achievedMilestones', JSON.stringify(achievements));
    }

    /**
     * Get milestone message based on cards reviewed today
     */
    getMilestoneMessage(cardsReviewed) {
        const messages = {
            10: "Great start! You've reviewed 10 cards today!",
            25: "Nice work! 25 cards reviewed today!",
            50: "Excellent! You've reviewed 50 cards today!",
            100: "Amazing! 100 cards reviewed today!",
            200: "Outstanding! You've reviewed 200 cards today!"
        };
        return messages[cardsReviewed] || `Congratulations! You've reviewed ${cardsReviewed} cards today!`;
    }

    /**
     * Show milestone achievement notification
     * @param {number} cardsReviewed - Number of cards reviewed
     */
    showMilestoneNotification(cardsReviewed) {
        // Create bottom notification
        const notification = document.createElement('div');
        notification.className = 'milestone-notification-bottom';
        notification.innerHTML = `
            <div class="milestone-content">
                <div class="milestone-icon">🎉</div>
                <div class="milestone-text">
                    <div class="milestone-title">Milestone Achieved!</div>
                    <div class="milestone-message">${this.getMilestoneMessage(cardsReviewed)}</div>
                </div>
                <div class="milestone-badge">${cardsReviewed}</div>
            </div>
        `;

        document.body.appendChild(notification);

        // Add entrance animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Auto-hide after 4 seconds
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 4000);
    }

    /**
     * Show toast notification
     * @param {string} message - Message to show
     * @param {string} type - Type of toast (success, error, info)
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Create global instance
const streakUI = new StreakUI();

export default streakUI;
export { StreakUI };