// loadingMessages.js - Service for managing dynamic loading messages with caching

import { getSupabaseClient } from './supabase-client.js';

class LoadingMessagesService {
    constructor() {
        this.cache = {
            messages: [],
            lastFetched: null,
            cacheTimeout: 5 * 60 * 1000, // 5 minutes
            fallbackMessage: 'Generating your flashcards...'
        };
        
        // Initialize cache on startup
        this.initializeCache();
    }

    /**
     * Initialize the message cache
     */
    async initializeCache() {
        try {
            await this.refreshCache();
            console.log('Loading messages cache initialized');
        } catch (error) {
            console.warn('Failed to initialize loading messages cache:', error);
            // Continue with fallback message
        }
    }

    /**
     * Refresh the message cache from database
     */
    async refreshCache() {
        try {
            console.log('Refreshing loading messages cache...');
            const supabase = await getSupabaseClient();
            
            const { data: messages, error } = await supabase
                .from('loading_messages')
                .select('message, weight')
                .eq('is_active', true)
                .order('id');

            if (error) {
                console.error('Database error fetching loading messages:', error);
                throw error;
            }

            // Update cache
            this.cache.messages = messages || [];
            this.cache.lastFetched = Date.now();
            
            console.log(`Loaded ${this.cache.messages.length} loading messages into cache`);
            
        } catch (error) {
            console.error('Failed to refresh loading messages cache:', error);
            throw error;
        }
    }

    /**
     * Check if cache needs refresh
     */
    needsCacheRefresh() {
        if (!this.cache.lastFetched) return true;
        return (Date.now() - this.cache.lastFetched) > this.cache.cacheTimeout;
    }

    /**
     * Get weighted random message from cache
     */
    getRandomMessageFromCache() {
        if (!this.cache.messages || this.cache.messages.length === 0) {
            return this.cache.fallbackMessage;
        }

        // Calculate total weight
        const totalWeight = this.cache.messages.reduce((sum, msg) => sum + (msg.weight || 1), 0);
        
        if (totalWeight === 0) {
            return this.cache.fallbackMessage;
        }

        // Generate random number between 1 and totalWeight
        const randomThreshold = Math.floor(Math.random() * totalWeight) + 1;
        
        // Find the message that corresponds to this random number
        let cumulativeWeight = 0;
        for (const message of this.cache.messages) {
            cumulativeWeight += (message.weight || 1);
            if (cumulativeWeight >= randomThreshold) {
                return message.message;
            }
        }
        
        // Fallback (should never reach here)
        return this.cache.fallbackMessage;
    }

    /**
     * Get a random loading message (main public method)
     * @param {boolean} forceRefresh - Force cache refresh
     * @returns {Promise<string>} - Loading message
     */
    async getRandomMessage(forceRefresh = false) {
        try {
            // Refresh cache if needed (non-blocking background refresh)
            if (forceRefresh || this.needsCacheRefresh()) {
                // Try to refresh cache, but don't block on it
                this.refreshCache().catch(error => {
                    console.warn('Background cache refresh failed:', error);
                });
            }

            // Return message from current cache
            return this.getRandomMessageFromCache();
            
        } catch (error) {
            console.error('Error getting random loading message:', error);
            return this.cache.fallbackMessage;
        }
    }

    /**
     * Get a random message synchronously (from cache only)
     * @returns {string} - Loading message
     */
    getRandomMessageSync() {
        return this.getRandomMessageFromCache();
    }

    /**
     * Force refresh the cache (for manual refresh)
     */
    async forceRefresh() {
        try {
            await this.refreshCache();
            return true;
        } catch (error) {
            console.error('Failed to force refresh loading messages:', error);
            return false;
        }
    }

    /**
     * Get cache status (for debugging)
     */
    getCacheStatus() {
        return {
            messageCount: this.cache.messages.length,
            lastFetched: this.cache.lastFetched,
            needsRefresh: this.needsCacheRefresh(),
            cacheAge: this.cache.lastFetched ? Date.now() - this.cache.lastFetched : null
        };
    }

    /**
     * Clear cache (for testing)
     */
    clearCache() {
        this.cache.messages = [];
        this.cache.lastFetched = null;
    }

    /**
     * Use database function for server-side weighted selection (alternative method)
     */
    async getRandomMessageFromDatabase() {
        try {
            const supabase = await getSupabaseClient();
            
            const { data, error } = await supabase
                .rpc('get_random_loading_message');

            if (error) {
                throw error;
            }

            return data || this.cache.fallbackMessage;
            
        } catch (error) {
            console.error('Failed to get random message from database:', error);
            return this.cache.fallbackMessage;
        }
    }
}

// Export singleton instance
export default new LoadingMessagesService();