/**
 * Streak UI Components
 * Handles display of card review milestone notifications
 */

class StreakUI {
    constructor() {
        this.cardsReviewedInSession = 0;
        this.milestones = [5, 10, 25, 50, 100];
        this.achievedMilestones = new Set();
        this.notificationTimeout = null;
    }

    /**
     * Initialize the streak UI
     */
    async initialize() {
        // Reset session counters
        this.cardsReviewedInSession = 0;
        this.achievedMilestones.clear();
    }

    /**
     * Track a card review and check for milestones
     */
    trackCardReview() {
        this.cardsReviewedInSession++;
        
        // Check if we've reached a milestone
        const currentMilestone = this.milestones.find(milestone => 
            milestone === this.cardsReviewedInSession && 
            !this.achievedMilestones.has(milestone)
        );
        
        if (currentMilestone) {
            this.achievedMilestones.add(currentMilestone);
            this.showMilestoneNotification(currentMilestone);
        }
    }

    /**
     * Get current cards reviewed count
     */
    getCardsReviewedCount() {
        return this.cardsReviewedInSession;
    }

    /**
     * Reset session counters (call at start of new session)
     */
    resetSession() {
        this.cardsReviewedInSession = 0;
        this.achievedMilestones.clear();
    }

    /**
     * Get milestone message based on cards reviewed
     */
    getMilestoneMessage(cardsReviewed) {
        const messages = {
            5: "Great start! You've reviewed 5 cards!",
            10: "Nice work! 10 cards reviewed!",
            25: "Excellent! You've reviewed 25 cards!",
            50: "Amazing! 50 cards reviewed!",
            100: "Outstanding! You've reviewed 100 cards!"
        };
        return messages[cardsReviewed] || `Congratulations! You've reviewed ${cardsReviewed} cards!`;
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