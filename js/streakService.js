/**
 * Streak Service
 * Handles streak tracking, milestone detection, and reward management
 */

class StreakService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiration = 5 * 60 * 1000; // 5 minutes
        // Note: This service is now primarily for dashboard day streak display
        // Card review milestones are handled in streakUI.js
    }

    /**
     * Get Supabase client instance
     * @returns {Promise<Object>} Supabase client
     */
    async getSupabase() {
        try {
            if (typeof window !== 'undefined' && window.supabaseClient) {
                return window.supabaseClient;
            }
            
            const { getSupabaseClient } = await import('./supabase-client.js');
            const client = await getSupabaseClient();
            
            if (!client) {
                throw new Error('Failed to initialize Supabase client');
            }
            
            return client;
        } catch (error) {
            console.error('Error getting Supabase client:', error);
            throw new Error('Failed to connect to database');
        }
    }

    /**
     * Update user streak after completing reviews
     * @param {string} userId - User ID
     * @param {Date} reviewDate - Date of reviews (defaults to today)
     * @returns {Promise<Object>} Streak update result
     */
    async updateUserStreak(userId, reviewDate = new Date()) {
        try {
            const supabase = await this.getSupabase();
            const dateString = reviewDate.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Call the database function to update streak
            const { data, error } = await supabase.rpc('update_user_streak', {
                p_user_id: userId,
                p_review_date: dateString
            });

            if (error) throw error;

            const result = data[0] || { current_streak: 0, is_new_milestone: false, milestone_days: 0 };
            
            // Clear cache to force refresh
            this.cache.delete(`streak_${userId}`);
            this.cache.delete(`rewards_${userId}`);
            
            return {
                currentStreak: result.current_streak,
                isNewMilestone: result.is_new_milestone,
                milestoneDays: result.milestone_days,
                success: true
            };
        } catch (error) {
            console.error('Error updating user streak:', error);
            return {
                currentStreak: 0,
                isNewMilestone: false,
                milestoneDays: 0,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get current streak information for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Streak information
     */
    async getUserStreakInfo(userId) {
        try {
            const cacheKey = `streak_${userId}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
                return cached.data;
            }

            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('user_profiles')
                .select('current_daily_streak, longest_daily_streak, last_streak_date')
                .eq('id', userId)
                .single();

            if (error) throw error;

            const streakInfo = {
                currentStreak: data?.current_daily_streak || 0,
                longestStreak: data?.longest_daily_streak || 0,
                lastStreakDate: data?.last_streak_date,
                isStreakActive: this.isStreakActive(data?.last_streak_date)
            };

            // Cache the result
            this.cache.set(cacheKey, {
                data: streakInfo,
                timestamp: Date.now()
            });

            return streakInfo;
        } catch (error) {
            console.error('Error getting user streak info:', error);
            return {
                currentStreak: 0,
                longestStreak: 0,
                lastStreakDate: null,
                isStreakActive: false
            };
        }
    }

    /**
     * Check if a streak is still active based on last streak date
     * @param {string} lastStreakDate - Last streak date (YYYY-MM-DD)
     * @returns {boolean} Whether streak is still active
     */
    isStreakActive(lastStreakDate) {
        if (!lastStreakDate) return false;
        
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const lastDate = new Date(lastStreakDate);
        const todayString = today.toISOString().split('T')[0];
        const yesterdayString = yesterday.toISOString().split('T')[0];
        const lastDateString = lastDate.toISOString().split('T')[0];
        
        // Streak is active if last streak date is today or yesterday
        return lastDateString === todayString || lastDateString === yesterdayString;
    }

    /**
     * Get unclaimed streak rewards for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of unclaimed rewards
     */
    async getUnclaimedRewards(userId) {
        try {
            const cacheKey = `rewards_${userId}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
                return cached.data;
            }

            const supabase = await this.getSupabase();
            const { data, error } = await supabase.rpc('get_unclaimed_streak_rewards', {
                p_user_id: userId
            });

            if (error) throw error;

            const rewards = (data || []).map(reward => ({
                milestoneDays: reward.milestone_days,
                rewardType: reward.reward_type,
                rewardTitle: reward.reward_title,
                rewardDescription: reward.reward_description,
                rewardValue: reward.reward_value,
                achievedAt: reward.achieved_at
            }));

            // Cache the result
            this.cache.set(cacheKey, {
                data: rewards,
                timestamp: Date.now()
            });

            return rewards;
        } catch (error) {
            console.error('Error getting unclaimed rewards:', error);
            return [];
        }
    }

    /**
     * Claim a streak milestone reward
     * @param {string} userId - User ID
     * @param {number} milestoneDays - Milestone days to claim
     * @returns {Promise<boolean>} Success status
     */
    async claimReward(userId, milestoneDays) {
        try {
            const supabase = await this.getSupabase();
            const { data, error } = await supabase.rpc('claim_streak_reward', {
                p_user_id: userId,
                p_milestone_days: milestoneDays
            });

            if (error) throw error;

            // Clear cache to force refresh
            this.cache.delete(`rewards_${userId}`);
            
            return data === true;
        } catch (error) {
            console.error('Error claiming reward:', error);
            return false;
        }
    }

    /**
     * Get all available streak reward configurations
     * @returns {Promise<Array>} Array of reward configurations
     */
    async getRewardConfigs() {
        try {
            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('streak_reward_configs')
                .select('*')
                .eq('is_active', true)
                .order('milestone_days', { ascending: true });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error getting reward configs:', error);
            return [];
        }
    }

    /**
     * Get streak statistics for analytics
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Streak statistics
     */
    async getStreakStats(userId) {
        try {
            const supabase = await this.getSupabase();
            
            // Get streak history for the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: history, error } = await supabase
                .from('user_streak_history')
                .select('streak_date, cards_reviewed, streak_day_number, is_streak_break')
                .eq('user_id', userId)
                .gte('streak_date', thirtyDaysAgo.toISOString().split('T')[0])
                .order('streak_date', { ascending: false });

            if (error) throw error;

            // Get milestone achievements
            const { data: milestones, error: milestonesError } = await supabase
                .from('user_streak_milestones')
                .select('milestone_days, achieved_at, reward_claimed')
                .eq('user_id', userId)
                .order('milestone_days', { ascending: false });

            if (milestonesError) throw milestonesError;

            return {
                recentHistory: history || [],
                milestones: milestones || [],
                totalMilestones: (milestones || []).length,
                unclaimedMilestones: (milestones || []).filter(m => !m.reward_claimed).length
            };
        } catch (error) {
            console.error('Error getting streak stats:', error);
            return {
                recentHistory: [],
                milestones: [],
                totalMilestones: 0,
                unclaimedMilestones: 0
            };
        }
    }

    /**
     * Get next milestone information
     * @param {number} currentStreak - Current streak days
     * @returns {Promise<Object>} Next milestone info
     */
    async getNextMilestone(currentStreak) {
        try {
            const configs = await this.getRewardConfigs();
            const nextMilestone = configs.find(config => config.milestone_days > currentStreak);
            
            if (!nextMilestone) {
                return null; // No more milestones
            }
            
            return {
                milestoneDays: nextMilestone.milestone_days,
                rewardType: nextMilestone.reward_type,
                rewardTitle: nextMilestone.reward_title,
                rewardDescription: nextMilestone.reward_description,
                daysRemaining: nextMilestone.milestone_days - currentStreak,
                progress: currentStreak / nextMilestone.milestone_days
            };
        } catch (error) {
            console.error('Error getting next milestone:', error);
            return null;
        }
    }

    /**
     * Clear all caches (useful for testing or when data changes)
     */
    clearCache() {
        this.cache.clear();
    }
}

// Export singleton instance
const streakService = new StreakService();
export default streakService;
export { StreakService };