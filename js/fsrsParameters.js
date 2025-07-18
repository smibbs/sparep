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
            // FSRS algorithm weights (w0-w18)
            w0: 0.4197,    // Initial stability for new cards
            w1: 1.1829,    // Stability increase factor for Good rating  
            w2: 3.1262,    // Stability increase factor for Easy rating
            w3: 15.4722,   // Stability decrease factor for Hard rating
            w4: 7.2102,    // Stability decrease factor for Again rating
            w5: 0.5316,    // Impact of card difficulty on stability
            w6: 1.0651,    // Difficulty adjustment factor
            w7: 0.0234,    // Impact of elapsed time since last review
            w8: 1.616,     // Stability increase exponential factor
            w9: 0.0721,    // Stability power factor
            w10: 0.1284,   // Retrievability impact factor
            w11: 1.0824,   // Failure stability multiplier
            w12: 0.0,      // Minimum allowed stability value
            w13: 100.0,    // Maximum allowed stability value
            w14: 1.0,      // Minimum allowed difficulty value
            w15: 10.0,     // Maximum allowed difficulty value / Hard rating multiplier
            w16: 2.9013,   // Easy rating multiplier
            w17: 0.0,      // Reserved for future use
            w18: 0.0,      // Reserved for future use
            
            // Learning configuration
            learning_steps_minutes: [1, 10],
            graduating_interval_days: 1,
            easy_interval_days: 4,
            maximum_interval_days: 36500, // ~100 years
            minimum_interval_days: 1,
            desired_retention: 0.9, // Target retention rate
            
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
        
        // Define reasonable bounds for FSRS weights (allowing negative values)
        const weightBounds = {
            w0: { min: -10.0, max: 10.0 },
            w1: { min: -10.0, max: 10.0 },
            w2: { min: -10.0, max: 10.0 },
            w3: { min: -50.0, max: 50.0 },
            w4: { min: -50.0, max: 50.0 },
            w5: { min: -5.0, max: 5.0 },
            w6: { min: -5.0, max: 5.0 },
            w7: { min: -1.0, max: 1.0 },
            w8: { min: -10.0, max: 10.0 },
            w9: { min: -1.0, max: 1.0 },
            w10: { min: -1.0, max: 1.0 },
            w11: { min: -5.0, max: 5.0 },
            w12: { min: 0.0, max: 1.0 },      // Min stability must be non-negative
            w13: { min: 1.0, max: 1000.0 },  // Max stability must be reasonable
            w14: { min: 0.1, max: 20.0 },    // Min difficulty must be positive
            w15: { min: 1.0, max: 100.0 },   // Max difficulty must be reasonable
            w16: { min: -10.0, max: 10.0 }
        };
        
        // Check FSRS weights (w0-w16)
        for (let i = 0; i <= 16; i++) {
            const weight = params[`w${i}`];
            const bounds = weightBounds[`w${i}`];
            
            if (typeof weight !== 'number' || isNaN(weight)) {
                errors.push(`w${i} must be a valid number`);
            } else if (weight < bounds.min || weight > bounds.max) {
                errors.push(`w${i} must be between ${bounds.min} and ${bounds.max}, got ${weight}`);
            }
        }
        
        // Check boundary constraints
        if (params.w12 >= params.w13) {
            errors.push('Minimum stability (w12) must be less than maximum stability (w13)');
        }
        
        if (params.w14 >= params.w15) {
            errors.push('Minimum difficulty (w14) must be less than maximum difficulty (w15)');
        }
        
        // Check intervals
        if (params.minimum_interval_days >= params.maximum_interval_days) {
            errors.push('Minimum interval must be less than maximum interval');
        }
        
        if (params.minimum_interval_days < 1 || params.maximum_interval_days > 36500) {
            errors.push('Interval days must be between 1 and 36500');
        }
        
        // Check daily limits
        if (params.new_cards_per_day < 0 || params.reviews_per_day < 0) {
            errors.push('Daily limits must be non-negative');
        }
        
        // Check learning steps
        if (!Array.isArray(params.learning_steps_minutes) || params.learning_steps_minutes.length === 0) {
            errors.push('Learning steps must be a non-empty array');
        }
        
        // Check other constraints
        if (params.graduating_interval_days < 1 || params.easy_interval_days < 1) {
            errors.push('Graduating and easy intervals must be at least 1 day');
        }
        
        if (params.lapse_multiplier < 0.1 || params.lapse_multiplier > 2.0) {
            errors.push('Lapse multiplier must be between 0.1 and 2.0');
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