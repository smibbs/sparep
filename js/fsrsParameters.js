/**
 * FSRS Parameters Service
 * Manages loading, caching, and updating of user-specific FSRS algorithm parameters
 */

class FSRSParametersService {
    constructor() {
        // In-memory cache for FSRS parameters
        this.cache = new Map();
        
        // Cache expiration time (30 minutes)
        this.cacheExpiration = 30 * 60 * 1000;
        
        // Default FSRS parameters based on FSRS research
        this.defaultParams = {
            // FSRS algorithm weights (w0-w16)
            w0: 0.4197,    // Initial stability for new cards
            w1: 1.1829,    // Stability increase factor for Good rating  
            w2: 3.1262,    // Stability increase factor for Easy rating
            w3: 15.4722,   // Stability decrease factor for Hard rating
            w4: 7.2102,    // Stability decrease factor for Again rating
            w5: 0.5316,    // Impact of card difficulty on stability
            w6: 1.0651,    // Impact of previous stability
            w7: 0.0234,    // Impact of elapsed time since last review
            w8: 1.616,     // Bonus factor for Easy ratings
            w9: 0.0721,    // Penalty factor for Hard ratings
            w10: 0.1284,   // Penalty factor for Again ratings
            w11: 1.0824,   // Rate at which difficulty decays
            w12: 0.0,      // Minimum allowed stability value
            w13: 100.0,    // Maximum allowed stability value
            w14: 1.0,      // Minimum allowed difficulty value
            w15: 10.0,     // Maximum allowed difficulty value
            w16: 2.9013,   // Factor for speed-focused learning
            
            // Learning configuration
            learning_steps_minutes: [1, 10],
            graduating_interval_days: 1,
            easy_interval_days: 4,
            maximum_interval_days: 36500, // ~100 years
            minimum_interval_days: 1,
            
            // Daily limits
            new_cards_per_day: 20,
            reviews_per_day: 200,
            
            // Relearning configuration
            relearning_steps_minutes: [10],
            minimum_relearning_interval_days: 1,
            
            // Lapse configuration
            lapse_minimum_interval_days: 1,
            lapse_multiplier: 0.5
        };
    }

    /**
     * Get FSRS parameters for a user with caching
     * @param {string} userId - User ID
     * @returns {Promise<Object>} FSRS parameters object
     */
    async getUserParameters(userId) {
        try {
            // Check cache first
            const cached = this.cache.get(userId);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
                return cached.params;
            }

            // Load from database
            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('fsrs_parameters')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No parameters found, create defaults
                    return await this.createDefaultParameters(userId);
                }
                throw error;
            }

            // Cache the result
            const params = this.formatParameters(data);
            this.cache.set(userId, {
                params,
                timestamp: Date.now()
            });

            return params;
        } catch (error) {
            console.error('Error loading FSRS parameters:', error);
            // Return defaults as fallback
            return { ...this.defaultParams };
        }
    }

    /**
     * Create default FSRS parameters for a new user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Created FSRS parameters
     */
    async createDefaultParameters(userId) {
        try {
            const supabase = await this.getSupabase();
            
            // Insert default parameters
            const { data, error } = await supabase
                .from('fsrs_parameters')
                .insert({
                    user_id: userId,
                    ...this.defaultParams
                })
                .select()
                .single();

            if (error) throw error;

            // Cache the new parameters
            const params = this.formatParameters(data);
            this.cache.set(userId, {
                params,
                timestamp: Date.now()
            });

            return params;
        } catch (error) {
            console.error('Error creating default FSRS parameters:', error);
            // Return defaults without saving if database operation fails
            return { ...this.defaultParams };
        }
    }

    /**
     * Update FSRS parameters for a user
     * @param {string} userId - User ID
     * @param {Object} updates - Parameter updates
     * @returns {Promise<Object>} Updated parameters
     */
    async updateParameters(userId, updates) {
        try {
            const supabase = await this.getSupabase();
            
            const { data, error } = await supabase
                .from('fsrs_parameters')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select()
                .single();

            if (error) throw error;

            // Update cache
            const params = this.formatParameters(data);
            this.cache.set(userId, {
                params,
                timestamp: Date.now()
            });

            return params;
        } catch (error) {
            console.error('Error updating FSRS parameters:', error);
            throw error;
        }
    }

    /**
     * Clear cache for a user (useful after parameter updates)
     * @param {string} userId - User ID
     */
    clearCache(userId) {
        this.cache.delete(userId);
    }

    /**
     * Clear all cached parameters
     */
    clearAllCache() {
        this.cache.clear();
    }

    /**
     * Format database parameters into a clean object
     * @param {Object} dbParams - Raw parameters from database
     * @returns {Object} Formatted parameters
     */
    formatParameters(dbParams) {
        return {
            // FSRS weights
            w0: dbParams.w0,
            w1: dbParams.w1,
            w2: dbParams.w2,
            w3: dbParams.w3,
            w4: dbParams.w4,
            w5: dbParams.w5,
            w6: dbParams.w6,
            w7: dbParams.w7,
            w8: dbParams.w8,
            w9: dbParams.w9,
            w10: dbParams.w10,
            w11: dbParams.w11,
            w12: dbParams.w12,
            w13: dbParams.w13,
            w14: dbParams.w14,
            w15: dbParams.w15,
            w16: dbParams.w16,
            
            // Learning configuration
            learning_steps_minutes: dbParams.learning_steps_minutes,
            graduating_interval_days: dbParams.graduating_interval_days,
            easy_interval_days: dbParams.easy_interval_days,
            maximum_interval_days: dbParams.maximum_interval_days,
            minimum_interval_days: dbParams.minimum_interval_days,
            
            // Daily limits
            new_cards_per_day: dbParams.new_cards_per_day,
            reviews_per_day: dbParams.reviews_per_day,
            
            // Relearning configuration
            relearning_steps_minutes: dbParams.relearning_steps_minutes,
            minimum_relearning_interval_days: dbParams.minimum_relearning_interval_days,
            
            // Lapse configuration
            lapse_minimum_interval_days: dbParams.lapse_minimum_interval_days,
            lapse_multiplier: dbParams.lapse_multiplier
        };
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
            
            // Import and initialize Supabase client if not available globally
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
     * Validate FSRS parameters
     * @param {Object} params - Parameters to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateParameters(params) {
        const errors = [];
        
        // Check FSRS weights (w0-w16)
        for (let i = 0; i <= 16; i++) {
            const weight = params[`w${i}`];
            if (typeof weight !== 'number' || isNaN(weight)) {
                errors.push(`w${i} must be a valid number`);
            }
        }
        
        // Check intervals
        if (params.minimum_interval_days >= params.maximum_interval_days) {
            errors.push('Minimum interval must be less than maximum interval');
        }
        
        // Check daily limits
        if (params.new_cards_per_day < 0 || params.reviews_per_day < 0) {
            errors.push('Daily limits must be non-negative');
        }
        
        // Check learning steps
        if (!Array.isArray(params.learning_steps_minutes) || params.learning_steps_minutes.length === 0) {
            errors.push('Learning steps must be a non-empty array');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// Create and export singleton instance
const fsrsParametersService = new FSRSParametersService();

export default fsrsParametersService;
export { FSRSParametersService };