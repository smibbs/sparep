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
        
        // Default FSRS parameters based on modern FSRS research
        this.defaultParams = {
            // FSRS algorithm weights (w0-w18) - stored in JSONB
            weights: {
                w0: 0.4872, w1: 1.4003, w2: 3.1145, w3: 15.69, w4: 7.1434,
                w5: 0.6477, w6: 1.0007, w7: 0.0674, w8: 1.6597, w9: 0.1712,
                w10: 1.1178, w11: 2.0225, w12: 0.0904, w13: 0.3025, w14: 2.1214,
                w15: 0.2498, w16: 2.9466, w17: 0.4891, w18: 0.6468
            },
            
            // Learning configuration
            learning_steps_minutes: [1, 10],
            graduating_interval_days: 1,
            easy_interval_days: 4,
            maximum_interval_days: 36500, // ~100 years
            minimum_interval_days: 1,
            desired_retention: 0.9, // Target retention rate
            
            // Daily limits (overrides for profile defaults)
            new_cards_per_day: null,  // NULL = inherit from profile
            reviews_per_day: null,    // NULL = inherit from profile
            
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

            // Load from database with JSONB weights
            const supabase = await this.getSupabase();
            const { data, error } = await supabase
                .from('fsrs_params')
                .select('weights, desired_retention, learning_steps_minutes, graduating_interval_days, easy_interval_days, maximum_interval_days, minimum_interval_days, new_cards_per_day, reviews_per_day, relearning_steps_minutes, minimum_relearning_interval_days, lapse_minimum_interval_days, lapse_multiplier, created_at, updated_at')
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
            
            // Insert default parameters with JSONB weights
            const { data, error } = await supabase
                .from('fsrs_params')
                .insert({
                    user_id: userId,
                    weights: this.defaultParams.weights,  // JSONB field
                    learning_steps_minutes: this.defaultParams.learning_steps_minutes,
                    graduating_interval_days: this.defaultParams.graduating_interval_days,
                    easy_interval_days: this.defaultParams.easy_interval_days,
                    maximum_interval_days: this.defaultParams.maximum_interval_days,
                    minimum_interval_days: this.defaultParams.minimum_interval_days,
                    desired_retention: this.defaultParams.desired_retention,
                    new_cards_per_day: this.defaultParams.new_cards_per_day,
                    reviews_per_day: this.defaultParams.reviews_per_day,
                    relearning_steps_minutes: this.defaultParams.relearning_steps_minutes,
                    minimum_relearning_interval_days: this.defaultParams.minimum_relearning_interval_days,
                    lapse_minimum_interval_days: this.defaultParams.lapse_minimum_interval_days,
                    lapse_multiplier: this.defaultParams.lapse_multiplier
                })
                .select('weights, desired_retention, learning_steps_minutes, graduating_interval_days, easy_interval_days, maximum_interval_days, minimum_interval_days, new_cards_per_day, reviews_per_day, relearning_steps_minutes, minimum_relearning_interval_days, lapse_minimum_interval_days, lapse_multiplier, created_at, updated_at')
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
                .from('fsrs_params')
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
        // Extract JSONB weights and merge with other parameters
        const weights = dbParams.weights || {};
        return {
            // FSRS weights (w0-w18) from JSONB
            w0: weights.w0 || 0.4872, w1: weights.w1 || 1.4003, w2: weights.w2 || 3.1145,
            w3: weights.w3 || 15.69, w4: weights.w4 || 7.1434, w5: weights.w5 || 0.6477,
            w6: weights.w6 || 1.0007, w7: weights.w7 || 0.0674, w8: weights.w8 || 1.6597,
            w9: weights.w9 || 0.1712, w10: weights.w10 || 1.1178, w11: weights.w11 || 2.0225,
            w12: weights.w12 || 0.0904, w13: weights.w13 || 0.3025, w14: weights.w14 || 2.1214,
            w15: weights.w15 || 0.2498, w16: weights.w16 || 2.9466, w17: weights.w17 || 0.4891,
            w18: weights.w18 || 0.6468,
            
            // Learning configuration
            learning_steps_minutes: dbParams.learning_steps_minutes || [1, 10],
            graduating_interval_days: dbParams.graduating_interval_days || 1,
            easy_interval_days: dbParams.easy_interval_days || 4,
            maximum_interval_days: dbParams.maximum_interval_days || 36500,
            minimum_interval_days: dbParams.minimum_interval_days || 1,
            desired_retention: dbParams.desired_retention || 0.9,
            
            // Daily limits (nullable overrides)
            new_cards_per_day: dbParams.new_cards_per_day,
            reviews_per_day: dbParams.reviews_per_day,
            
            // Relearning configuration
            relearning_steps_minutes: dbParams.relearning_steps_minutes || [10],
            minimum_relearning_interval_days: dbParams.minimum_relearning_interval_days || 1,
            
            // Lapse configuration
            lapse_minimum_interval_days: dbParams.lapse_minimum_interval_days || 1,
            lapse_multiplier: dbParams.lapse_multiplier || 0.5
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