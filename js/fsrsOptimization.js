/**
 * FSRS Parameter Optimization Service
 * Analyzes user review history and optimizes FSRS parameters for personalized learning
 */

import { getSupabaseClient } from './supabase-client.js';
import { calculateRetrievability, updateStability, updateDifficulty } from './fsrs.js';
import fsrsParametersService from './fsrsParameters.js';

class FSRSOptimizationService {
    constructor() {
        // Minimum reviews required before optimization
        this.MIN_REVIEWS_FOR_OPTIMIZATION = 50;
        
        // Optimization intervals (reviews between optimizations)
        this.OPTIMIZATION_INTERVALS = [100, 250, 500, 1000, 2000];
        
        // Learning rate for gradient descent
        this.LEARNING_RATE = 0.01;
        
        // Maximum parameter change per optimization
        this.MAX_PARAM_CHANGE = 0.1;
    }

    /**
     * Check if a user needs parameter optimization
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Optimization status and recommendation
     */
    async checkOptimizationNeeded(userId) {
        try {
            const supabase = await this.getSupabase();
            
            // Get user's total review count
            const { data: reviewCount, error: countError } = await supabase
                .from('review_history')
                .select('id', { count: 'exact' })
                .eq('user_id', userId);

            if (countError) throw countError;

            const totalReviews = reviewCount?.length || 0;
            
            // Get last parameter update
            const { data: params, error: paramsError } = await supabase
                .from('fsrs_parameters')
                .select('updated_at')
                .eq('user_id', userId)
                .single();

            if (paramsError && paramsError.code !== 'PGRST116') throw paramsError;

            const lastUpdate = params?.updated_at ? new Date(params.updated_at) : new Date(0);
            const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

            // Determine if optimization is needed
            const shouldOptimize = this.shouldOptimizeParameters(totalReviews, daysSinceUpdate);
            
            return {
                totalReviews,
                daysSinceUpdate: Math.round(daysSinceUpdate),
                shouldOptimize,
                nextOptimizationAt: this.getNextOptimizationThreshold(totalReviews),
                reason: this.getOptimizationReason(totalReviews, daysSinceUpdate)
            };
        } catch (error) {
            console.error('Error checking optimization need:', error);
            return { shouldOptimize: false, error: error.message };
        }
    }

    /**
     * Analyze user performance and suggest parameter optimizations
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Performance analysis and optimization suggestions
     */
    async analyzeUserPerformance(userId) {
        try {
            const supabase = await this.getSupabase();
            
            // Get recent review history with sufficient data
            const { data: reviews, error: reviewError } = await supabase
                .from('review_history')
                .select('*')
                .eq('user_id', userId)
                .order('review_date', { ascending: false })
                .limit(500);

            if (reviewError) throw reviewError;
            if (!reviews || reviews.length < this.MIN_REVIEWS_FOR_OPTIMIZATION) {
                return { 
                    canOptimize: false, 
                    reason: `Need at least ${this.MIN_REVIEWS_FOR_OPTIMIZATION} reviews, have ${reviews?.length || 0}`
                };
            }

            // Calculate performance metrics
            const metrics = await this.calculatePerformanceMetrics(reviews);
            
            // Analyze prediction accuracy
            const predictionAnalysis = await this.analyzePredictionAccuracy(reviews);
            
            // Transfer consistency score from prediction analysis to metrics
            metrics.consistencyScore = predictionAnalysis.consistencyScore;
            
            // Calculate parameter effectiveness scores
            const parameterScores = await this.calculateParameterEffectiveness(reviews);
            
            // Generate optimization suggestions
            const suggestions = await this.generateOptimizationSuggestions(metrics, predictionAnalysis, parameterScores);

            return {
                canOptimize: true,
                totalReviews: reviews.length,
                metrics,
                predictionAnalysis,
                parameterScores,
                suggestions,
                confidence: this.calculateOptimizationConfidence(reviews.length, metrics)
            };
        } catch (error) {
            console.error('Error analyzing user performance:', error);
            return { canOptimize: false, error: error.message };
        }
    }

    /**
     * Optimize FSRS parameters for a user based on their review history
     * @param {string} userId - User ID
     * @param {Object} options - Optimization options
     * @returns {Promise<Object>} Optimization results
     */
    async optimizeUserParameters(userId, options = {}) {
        try {
            // Analyze current performance
            const analysis = await this.analyzeUserPerformance(userId);
            if (!analysis.canOptimize) {
                return { success: false, reason: analysis.reason };
            }

            // Get current parameters
            const currentParams = await fsrsParametersService.getUserParameters(userId);
            
            // Apply optimization suggestions
            const optimizedParams = await this.applyOptimizationSuggestions(
                currentParams, 
                analysis.suggestions,
                options
            );

            // Validate optimized parameters
            const validation = fsrsParametersService.validateParameters(optimizedParams);
            if (!validation.isValid) {
                return { 
                    success: false, 
                    reason: 'Optimized parameters failed validation',
                    errors: validation.errors 
                };
            }

            // Update parameters in database
            await fsrsParametersService.updateParameters(userId, optimizedParams);

            // Log optimization history
            await this.logOptimizationHistory(userId, currentParams, optimizedParams, analysis);

            return {
                success: true,
                oldParams: currentParams,
                newParams: optimizedParams,
                improvements: this.calculateImprovements(currentParams, optimizedParams),
                confidence: analysis.confidence,
                reviewsAnalyzed: analysis.totalReviews
            };
        } catch (error) {
            console.error('Error optimizing user parameters:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Calculate comprehensive performance metrics from review history
     * @param {Array} reviews - Review history records
     * @returns {Object} Performance metrics
     */
    calculatePerformanceMetrics(reviews) {
        const metrics = {
            totalReviews: reviews.length,
            correctRate: 0,
            averageResponseTime: 0,
            stabilityTrend: 0,
            difficultyTrend: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
            retentionRate: 0,
            learningEfficiency: 0
        };

        if (reviews.length === 0) return metrics;

        // Calculate basic metrics
        const correctReviews = reviews.filter(r => r.rating >= 3).length;
        metrics.correctRate = correctReviews / reviews.length;
        
        metrics.averageResponseTime = reviews.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / reviews.length;

        // Rating distribution
        reviews.forEach(review => {
            metrics.ratingDistribution[review.rating]++;
        });

        // Calculate trends (comparing first half vs second half of reviews)
        const midpoint = Math.floor(reviews.length / 2);
        const firstHalf = reviews.slice(midpoint);
        const secondHalf = reviews.slice(0, midpoint);

        if (firstHalf.length > 0 && secondHalf.length > 0) {
            const firstStability = firstHalf.reduce((sum, r) => sum + r.stability_after, 0) / firstHalf.length;
            const secondStability = secondHalf.reduce((sum, r) => sum + r.stability_after, 0) / secondHalf.length;
            metrics.stabilityTrend = (secondStability - firstStability) / firstStability;

            const firstDifficulty = firstHalf.reduce((sum, r) => sum + r.difficulty_after, 0) / firstHalf.length;
            const secondDifficulty = secondHalf.reduce((sum, r) => sum + r.difficulty_after, 0) / secondHalf.length;
            metrics.difficultyTrend = (secondDifficulty - firstDifficulty) / firstDifficulty;
        }

        // Calculate retention rate (successful reviews after predicted intervals)
        const retentionSamples = reviews.filter(r => r.elapsed_days > 0 && r.scheduled_days > 0);
        if (retentionSamples.length > 0) {
            const successfulRetentions = retentionSamples.filter(r => r.rating >= 3).length;
            metrics.retentionRate = successfulRetentions / retentionSamples.length;
        }

        // Learning efficiency (stability gain per review)
        if (reviews.length > 1) {
            const stabilityGains = reviews.map(r => r.stability_after - r.stability_before);
            metrics.learningEfficiency = stabilityGains.reduce((sum, gain) => sum + Math.max(0, gain), 0) / reviews.length;
        }

        return metrics;
    }

    /**
     * Analyze how well current parameters predict actual user performance
     * @param {Array} reviews - Review history records
     * @returns {Object} Prediction accuracy analysis
     */
    analyzePredictionAccuracy(reviews) {
        const analysis = {
            averageError: 0,
            correlationCoefficient: 0,
            overestimationBias: 0,
            underestimationBias: 0,
            consistencyScore: 0
        };

        // Filter reviews with meaningful prediction data
        const predictableReviews = reviews.filter(r => 
            r.elapsed_days > 0 && 
            r.stability_before > 0 && 
            r.scheduled_days > 0
        );

        if (predictableReviews.length < 10) return analysis;

        // Calculate predicted vs actual performance
        const predictions = [];
        const actuals = [];

        predictableReviews.forEach(review => {
            // Calculate predicted retrievability using FSRS formula
            const predictedRetrievability = calculateRetrievability(review.elapsed_days, review.stability_before);
            const actualSuccess = review.rating >= 3 ? 1 : 0;
            
            predictions.push(predictedRetrievability);
            actuals.push(actualSuccess);
        });

        // Calculate correlation coefficient
        analysis.correlationCoefficient = this.calculateCorrelation(predictions, actuals);

        // Calculate average prediction error
        const errors = predictions.map((pred, i) => Math.abs(pred - actuals[i]));
        analysis.averageError = errors.reduce((sum, err) => sum + err, 0) / errors.length;

        // Calculate bias (tendency to over/under-estimate)
        const biases = predictions.map((pred, i) => pred - actuals[i]);
        const avgBias = biases.reduce((sum, bias) => sum + bias, 0) / biases.length;
        
        if (avgBias > 0) {
            analysis.overestimationBias = avgBias;
        } else {
            analysis.underestimationBias = Math.abs(avgBias);
        }

        // Calculate consistency score (inverse of error variance)
        const errorVariance = this.calculateVariance(errors);
        analysis.consistencyScore = 1 / (1 + errorVariance);

        return analysis;
    }

    /**
     * Calculate effectiveness scores for each FSRS parameter
     * @param {Array} reviews - Review history records
     * @returns {Object} Parameter effectiveness scores
     */
    calculateParameterEffectiveness(reviews) {
        const scores = {};
        
        // Initialize parameter scores
        for (let i = 0; i <= 16; i++) {
            scores[`w${i}`] = {
                effectiveness: 0.5, // Neutral baseline
                confidence: 0,
                impact: 0,
                suggestion: 'maintain'
            };
        }

        // Analyze stability-related parameters (w0, w1, w2, w3, w4, w6, w8, w9, w10)
        this.analyzeStabilityParameters(reviews, scores);
        
        // Analyze difficulty-related parameters (w5, w11, w16)
        this.analyzeDifficultyParameters(reviews, scores);
        
        // Analyze boundary parameters (w12, w13, w14, w15)
        this.analyzeBoundaryParameters(reviews, scores);

        return scores;
    }

    /**
     * Generate specific optimization suggestions based on analysis
     * @param {Object} metrics - Performance metrics
     * @param {Object} predictionAnalysis - Prediction accuracy analysis
     * @param {Object} parameterScores - Parameter effectiveness scores
     * @returns {Object} Optimization suggestions
     */
    generateOptimizationSuggestions(metrics, predictionAnalysis, parameterScores) {
        const suggestions = {
            priority: 'medium',
            adjustments: {},
            reasoning: [],
            expectedImprovements: []
        };

        // Suggest adjustments based on performance metrics
        if (metrics.correctRate < 0.8) {
            // Low success rate - decrease difficulty
            suggestions.adjustments.w5 = -0.05; // Reduce difficulty impact
            suggestions.adjustments.w11 = 0.02; // Increase difficulty decay
            suggestions.reasoning.push('Low success rate detected - reducing difficulty impact');
            suggestions.expectedImprovements.push('Higher success rate on reviews');
        }

        if (metrics.correctRate > 0.95) {
            // Very high success rate - increase challenge
            suggestions.adjustments.w5 = 0.03; // Increase difficulty impact
            suggestions.adjustments.w8 = -0.1; // Reduce easy bonus
            suggestions.reasoning.push('Very high success rate - increasing challenge');
            suggestions.expectedImprovements.push('More optimal learning intervals');
        }

        // Adjust based on prediction accuracy
        if (predictionAnalysis.overestimationBias > 0.2) {
            // Overestimating performance - be more conservative
            suggestions.adjustments.w1 = -0.05; // Reduce good rating bonus
            suggestions.adjustments.w2 = -0.1; // Reduce easy rating bonus
            suggestions.reasoning.push('Overestimating performance - being more conservative');
        }

        if (predictionAnalysis.underestimationBias > 0.2) {
            // Underestimating performance - be more aggressive
            suggestions.adjustments.w1 = 0.05; // Increase good rating bonus
            suggestions.adjustments.w6 = 0.02; // Increase stability factor
            suggestions.reasoning.push('Underestimating performance - being more aggressive');
        }

        // Adjust based on learning efficiency
        if (metrics.learningEfficiency < 0.1) {
            // Slow learning - boost stability gains
            suggestions.adjustments.w0 = 0.05; // Increase initial stability
            suggestions.adjustments.w1 = 0.08; // Increase good rating bonus
            suggestions.reasoning.push('Slow learning detected - boosting stability gains');
            suggestions.expectedImprovements.push('Faster learning progression');
        }

        // Set priority based on number of issues
        const issueCount = suggestions.reasoning.length;
        if (issueCount >= 3) {
            suggestions.priority = 'high';
        } else if (issueCount <= 1) {
            suggestions.priority = 'low';
        }

        return suggestions;
    }

    /**
     * Apply optimization suggestions to current parameters
     * @param {Object} currentParams - Current FSRS parameters
     * @param {Object} suggestions - Optimization suggestions
     * @param {Object} options - Options for applying suggestions
     * @returns {Object} Optimized parameters
     */
    applyOptimizationSuggestions(currentParams, suggestions, options = {}) {
        const optimizedParams = { ...currentParams };
        const conservativeMode = options.conservative !== false; // Default to conservative

        for (const [param, adjustment] of Object.entries(suggestions.adjustments)) {
            if (optimizedParams.hasOwnProperty(param)) {
                // Apply adjustment with optional scaling
                const scaledAdjustment = conservativeMode ? adjustment * 0.5 : adjustment;
                
                // Ensure adjustment doesn't exceed maximum change
                const clampedAdjustment = Math.max(
                    -this.MAX_PARAM_CHANGE,
                    Math.min(this.MAX_PARAM_CHANGE, scaledAdjustment)
                );
                
                optimizedParams[param] = currentParams[param] + clampedAdjustment;
            }
        }

        return optimizedParams;
    }

    /**
     * Log optimization history for tracking and analysis
     * @param {string} userId - User ID
     * @param {Object} oldParams - Parameters before optimization
     * @param {Object} newParams - Parameters after optimization
     * @param {Object} analysis - Performance analysis that drove optimization
     */
    async logOptimizationHistory(userId, oldParams, newParams, analysis) {
        try {
            // For now, just log to console. In future, store in database table
            console.log('FSRS Optimization Applied:', {
                userId,
                timestamp: new Date().toISOString(),
                reviewsAnalyzed: analysis.totalReviews,
                confidence: analysis.confidence,
                keyChanges: this.summarizeKeyChanges(oldParams, newParams),
                expectedImprovements: analysis.suggestions.expectedImprovements
            });
        } catch (error) {
            console.error('Error logging optimization history:', error);
        }
    }

    // Helper methods
    shouldOptimizeParameters(totalReviews, daysSinceUpdate) {
        return totalReviews >= this.MIN_REVIEWS_FOR_OPTIMIZATION && 
               (this.OPTIMIZATION_INTERVALS.includes(totalReviews) || daysSinceUpdate >= 30);
    }

    getNextOptimizationThreshold(currentReviews) {
        return this.OPTIMIZATION_INTERVALS.find(threshold => threshold > currentReviews) || 
               currentReviews + 500;
    }

    getOptimizationReason(totalReviews, daysSinceUpdate) {
        if (totalReviews < this.MIN_REVIEWS_FOR_OPTIMIZATION) {
            return `Need ${this.MIN_REVIEWS_FOR_OPTIMIZATION - totalReviews} more reviews`;
        }
        if (this.OPTIMIZATION_INTERVALS.includes(totalReviews)) {
            return `Reached ${totalReviews} review milestone`;
        }
        if (daysSinceUpdate >= 30) {
            return `${Math.round(daysSinceUpdate)} days since last optimization`;
        }
        return 'No optimization needed';
    }

    calculateOptimizationConfidence(reviewCount, metrics) {
        const baseConfidence = Math.min(reviewCount / 200, 1); // Max confidence at 200 reviews
        
        // Validate and fallback for data quality metrics
        const retentionRate = (typeof metrics.retentionRate === 'number' && !isNaN(metrics.retentionRate)) 
            ? metrics.retentionRate : 0;
        const consistencyScore = (typeof metrics.consistencyScore === 'number' && !isNaN(metrics.consistencyScore)) 
            ? metrics.consistencyScore : 0;
        
        const dataQuality = (retentionRate + consistencyScore) / 2;
        return (baseConfidence + dataQuality) / 2;
    }

    calculateCorrelation(x, y) {
        const n = x.length;
        if (n === 0) return 0;
        
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    }

    summarizeKeyChanges(oldParams, newParams) {
        const changes = {};
        for (const key in newParams) {
            if (oldParams[key] !== newParams[key] && typeof newParams[key] === 'number') {
                const change = ((newParams[key] - oldParams[key]) / oldParams[key] * 100).toFixed(1);
                if (Math.abs(change) > 1) { // Only show significant changes
                    changes[key] = `${change}%`;
                }
            }
        }
        return changes;
    }

    calculateImprovements(oldParams, newParams) {
        // Calculate expected improvements based on parameter changes
        const improvements = [];
        
        if (newParams.w0 > oldParams.w0) {
            improvements.push('Faster initial learning for new cards');
        }
        if (newParams.w1 > oldParams.w1) {
            improvements.push('Better retention after good reviews');
        }
        if (newParams.w5 < oldParams.w5) {
            improvements.push('Reduced difficulty impact for struggling cards');
        }
        
        return improvements;
    }

    analyzeStabilityParameters(reviews, scores) {
        // Implementation for analyzing stability-related parameters
        // This would involve complex statistical analysis of how parameter changes
        // correlate with learning outcomes
    }

    analyzeDifficultyParameters(reviews, scores) {
        // Implementation for analyzing difficulty-related parameters
    }

    analyzeBoundaryParameters(reviews, scores) {
        // Implementation for analyzing boundary parameters
    }

    async getSupabase() {
        return await getSupabaseClient();
    }
}

// Create and export singleton instance
const fsrsOptimizationService = new FSRSOptimizationService();

export default fsrsOptimizationService;
export { FSRSOptimizationService };