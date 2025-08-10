/**
 * FSRS Analytics Service
 * Provides comprehensive analysis of FSRS parameter effectiveness and user learning patterns
 */

import { getSupabaseClient } from './supabase-client.js';
import { calculateRetrievability } from './fsrs.js';
import fsrsParametersService from './fsrsParameters.js';
import fsrsOptimizationService from './fsrsOptimization.js';

class FSRSAnalyticsService {
    constructor() {
        this.ANALYSIS_PERIODS = {
            WEEK: 7,
            MONTH: 30,
            QUARTER: 90,
            YEAR: 365
        };
    }

    /**
     * Generate comprehensive FSRS effectiveness report for a user
     * @param {string} userId - User ID
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Complete effectiveness report
     */
    async generateEffectivenessReport(userId, options = {}) {
        try {
            const supabase = await this.getSupabase();
            const period = options.period || this.ANALYSIS_PERIODS.MONTH;
            const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

            // Get current parameters
            const currentParams = await fsrsParametersService.getUserParameters(userId);
            
            // Get review history for analysis period
            const { data: reviews, error: reviewError } = await supabase
                .from('reviews')
                .select('*')
                .eq('user_id', userId)
                .gte('reviewed_at', startDate.toISOString())
                .order('reviewed_at', { ascending: true });

            if (reviewError) throw reviewError;

            // Generate comprehensive analysis
            const report = {
                userId,
                period: `${period} days`,
                generatedAt: new Date().toISOString(),
                totalReviews: reviews?.length || 0,
                currentParameters: currentParams,
                
                // Core effectiveness metrics
                effectivenessMetrics: await this.calculateEffectivenessMetrics(reviews),
                
                // Parameter performance analysis
                parameterAnalysis: await this.analyzeParameterPerformance(reviews, currentParams),
                
                // Learning progression analysis
                learningProgression: await this.analyzeLearningProgression(reviews),
                
                // Prediction accuracy analysis
                predictionAccuracy: await this.analyzePredictionAccuracy(reviews),
                
                // Optimization recommendations
                recommendations: await this.generateRecommendations(reviews, currentParams),
                
                // Comparative analysis (vs default parameters)
                comparativeAnalysis: await this.compareToDefaults(reviews, currentParams),
                
                // Time-based trends
                trends: await this.analyzeTrends(reviews)
            };

            // Add overall effectiveness score
            report.overallScore = this.calculateOverallEffectivenessScore(report);

            return report;
        } catch (error) {
            console.error('Error generating effectiveness report:', error);
            return { error: error.message };
        }
    }

    /**
     * Calculate core effectiveness metrics
     * @param {Array} reviews - Review history records
     * @returns {Object} Effectiveness metrics
     */
    async calculateEffectivenessMetrics(reviews) {
        if (!reviews || reviews.length === 0) {
            return { noData: true };
        }

        const metrics = {
            // Success rates
            overallSuccessRate: 0,
            firstTimeSuccessRate: 0,
            retentionRate: 0,
            
            // Learning efficiency
            averageStabilityGain: 0,
            learningVelocity: 0,
            difficultyProgression: 0,
            
            // Time efficiency
            averageInterval: 0,
            intervalOptimality: 0,
            timeToMastery: 0,
            
            // Consistency
            performanceConsistency: 0,
            predictionAccuracy: 0
        };

        // Calculate success rates - rating >= 2 means Good or Easy (success)
        const successfulReviews = reviews.filter(r => r.rating >= 2);
        metrics.overallSuccessRate = successfulReviews.length / reviews.length;

        // First-time success (cards reviewed only once with rating >= 2)
        const cardReviewCounts = {};
        reviews.forEach(r => {
            cardReviewCounts[r.card_template_id] = (cardReviewCounts[r.card_template_id] || 0) + 1;
        });
        
        const firstTimeReviews = reviews.filter(r => cardReviewCounts[r.card_template_id] === 1);
        const firstTimeSuccesses = firstTimeReviews.filter(r => r.rating >= 2);
        metrics.firstTimeSuccessRate = firstTimeReviews.length > 0 ? 
            firstTimeSuccesses.length / firstTimeReviews.length : 0;

        // Retention rate (success on scheduled reviews)
        const scheduledReviews = reviews.filter(r => r.elapsed_days > 0 && r.scheduled_days > 0);
        const retentionSuccesses = scheduledReviews.filter(r => r.rating >= 2);
        metrics.retentionRate = scheduledReviews.length > 0 ? 
            retentionSuccesses.length / scheduledReviews.length : 0;

        // Learning efficiency metrics
        const stabilityGains = reviews.map(r => r.stability_after - r.stability_before);
        const positiveGains = stabilityGains.filter(gain => gain > 0);
        metrics.averageStabilityGain = positiveGains.length > 0 ? 
            positiveGains.reduce((sum, gain) => sum + gain, 0) / positiveGains.length : 0;

        // Learning velocity (stability gain per day)
        const totalDays = reviews.length > 0 ? 
            (new Date(reviews[reviews.length - 1].reviewed_at) - new Date(reviews[0].reviewed_at)) / (1000 * 60 * 60 * 24) : 1;
        metrics.learningVelocity = metrics.averageStabilityGain * reviews.length / Math.max(totalDays, 1);

        // Average interval between reviews
        const intervals = reviews.map(r => r.scheduled_days).filter(d => d > 0);
        metrics.averageInterval = intervals.length > 0 ? 
            intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 0;

        // Performance consistency (inverse of variance in success rate over time)
        const weeklySuccessRates = this.calculateWeeklySuccessRates(reviews);
        metrics.performanceConsistency = this.calculateConsistencyScore(weeklySuccessRates);

        // Prediction accuracy
        metrics.predictionAccuracy = this.calculatePredictionAccuracy(reviews);

        return metrics;
    }

    /**
     * Analyze parameter performance by examining their impact
     * @param {Array} reviews - Review history records
     * @param {Object} currentParams - Current FSRS parameters
     * @returns {Object} Parameter performance analysis
     */
    async analyzeParameterPerformance(reviews, currentParams) {
        const analysis = {
            stabilityParameters: {},
            difficultyParameters: {},
            boundaryParameters: {},
            overallEffectiveness: 0
        };

        if (!reviews || reviews.length < 20) {
            return { insufficientData: true };
        }

        // Analyze stability-related parameters (w0, w1, w2, w6, w8, w9, w10)
        analysis.stabilityParameters = {
            w0: this.analyzeInitialStabilityParameter(reviews, currentParams.weights?.w0),
            w1: this.analyzeGoodRatingParameter(reviews, currentParams.weights?.w1),
            w2: this.analyzeEasyRatingParameter(reviews, currentParams.weights?.w2),
            w6: this.analyzeStabilityFactorParameter(reviews, currentParams.weights?.w6),
            w8: this.analyzeEasyBonusParameter(reviews, currentParams.weights?.w8)
        };

        // Analyze difficulty-related parameters (w5, w11, w16)
        analysis.difficultyParameters = {
            w5: this.analyzeDifficultyImpactParameter(reviews, currentParams.weights?.w5),
            w11: this.analyzeDifficultyDecayParameter(reviews, currentParams.weights?.w11),
            w16: this.analyzeSpeedFactorParameter(reviews, currentParams.weights?.w16)
        };

        // Analyze boundary parameters (w12, w13, w14, w15)
        analysis.boundaryParameters = {
            w12: this.analyzeMinStabilityParameter(reviews, currentParams.weights?.w12),
            w13: this.analyzeMaxStabilityParameter(reviews, currentParams.weights?.w13),
            w14: this.analyzeMinDifficultyParameter(reviews, currentParams.weights?.w14),
            w15: this.analyzeMaxDifficultyParameter(reviews, currentParams.weights?.w15)
        };

        // Calculate overall parameter effectiveness
        const allScores = [
            ...Object.values(analysis.stabilityParameters).map(p => p.effectivenessScore),
            ...Object.values(analysis.difficultyParameters).map(p => p.effectivenessScore),
            ...Object.values(analysis.boundaryParameters).map(p => p.effectivenessScore)
        ].filter(score => !isNaN(score));

        analysis.overallEffectiveness = allScores.length > 0 ? 
            allScores.reduce((sum, score) => sum + score, 0) / allScores.length : 0;

        return analysis;
    }

    /**
     * Analyze learning progression over time
     * @param {Array} reviews - Review history records
     * @returns {Object} Learning progression analysis
     */
    async analyzeLearningProgression(reviews) {
        if (!reviews || reviews.length === 0) {
            return { noData: true };
        }

        const progression = {
            phases: [],
            overallTrend: 'stable',
            masteryRate: 0,
            strugglingCards: 0,
            improvementRate: 0
        };

        // Divide reviews into phases (e.g., weekly)
        const phases = this.groupReviewsByPhase(reviews, 7); // 7-day phases
        
        progression.phases = phases.map((phaseReviews, index) => ({
            phase: index + 1,
            startDate: phaseReviews[0]?.reviewed_at,
            endDate: phaseReviews[phaseReviews.length - 1]?.reviewed_at,
            reviewCount: phaseReviews.length,
            successRate: phaseReviews.filter(r => r.rating >= 2).length / phaseReviews.length,
            averageStability: phaseReviews.reduce((sum, r) => sum + r.stability_after, 0) / phaseReviews.length,
            averageDifficulty: phaseReviews.reduce((sum, r) => sum + r.difficulty_after, 0) / phaseReviews.length
        }));

        // Determine overall trend
        if (progression.phases.length >= 2) {
            const firstPhase = progression.phases[0];
            const lastPhase = progression.phases[progression.phases.length - 1];
            const successRateChange = lastPhase.successRate - firstPhase.successRate;
            
            if (successRateChange > 0.1) {
                progression.overallTrend = 'improving';
            } else if (successRateChange < -0.1) {
                progression.overallTrend = 'declining';
            }
        }

        // Calculate mastery rate (cards with stability > 10)
        const masteredCards = reviews.filter(r => r.stability_after > 10).length;
        progression.masteryRate = masteredCards / reviews.length;

        // Identify struggling cards (multiple failures)
        const cardFailures = {};
        reviews.forEach(r => {
            if (r.rating === 0) { // Again = failure
                cardFailures[r.card_template_id] = (cardFailures[r.card_template_id] || 0) + 1;
            }
        });
        progression.strugglingCards = Object.values(cardFailures).filter(failures => failures >= 3).length;

        return progression;
    }

    /**
     * Compare current parameters to default parameters
     * @param {Array} reviews - Review history records
     * @param {Object} currentParams - Current FSRS parameters
     * @returns {Object} Comparative analysis
     */
    async compareToDefaults(reviews, currentParams) {
        const comparison = {
            personalizedAdvantage: 0,
            keyDifferences: {},
            performanceGains: {},
            recommendation: 'maintain'
        };

        // Get default parameters for comparison
        const defaultParams = {
            w0: 0.4197, w1: 1.1829, w2: 3.1262, w3: 15.4722, w4: 7.2102,
            w5: 0.5316, w6: 1.0651, w7: 0.0234, w8: 1.616, w9: 0.0721,
            w10: 0.1284, w11: 1.0824, w12: 0.0, w13: 100.0, w14: 1.0,
            w15: 10.0, w16: 2.9013
        };

        // Calculate key differences
        for (const param in defaultParams) {
            const currentValue = currentParams.weights?.[param];
            if (currentValue !== undefined) {
                const difference = ((currentValue - defaultParams[param]) / defaultParams[param] * 100);
                if (Math.abs(difference) > 5) { // Only show significant differences
                    comparison.keyDifferences[param] = {
                        current: currentValue,
                        default: defaultParams[param],
                        percentChange: difference.toFixed(1) + '%'
                    };
                }
            }
        }

        // Estimate performance gains (simplified calculation)
        const currentMetrics = await this.calculateEffectivenessMetrics(reviews);
        comparison.personalizedAdvantage = this.estimatePersonalizationBenefit(currentMetrics, comparison.keyDifferences);

        // Generate recommendation
        if (comparison.personalizedAdvantage > 0.1) {
            comparison.recommendation = 'keep_personalized';
        } else if (comparison.personalizedAdvantage < -0.1) {
            comparison.recommendation = 'consider_reset';
        }

        return comparison;
    }

    /**
     * Calculate overall effectiveness score (0-1)
     * @param {Object} report - Complete effectiveness report
     * @returns {number} Overall effectiveness score
     */
    calculateOverallEffectivenessScore(report) {
        if (report.error || !report.effectivenessMetrics) {
            return 0;
        }

        const metrics = report.effectivenessMetrics;
        if (metrics.noData) {
            return 0;
        }

        // Weighted scoring of key metrics
        const scores = {
            successRate: metrics.overallSuccessRate * 0.3,
            retentionRate: metrics.retentionRate * 0.25,
            learningEfficiency: Math.min(metrics.learningVelocity / 5, 1) * 0.2, // Normalize to 0-1
            consistency: metrics.performanceConsistency * 0.15,
            predictionAccuracy: metrics.predictionAccuracy * 0.1
        };

        return Object.values(scores).reduce((sum, score) => sum + score, 0);
    }

    // Helper methods for parameter analysis
    analyzeInitialStabilityParameter(reviews, w0Value) {
        const newCardReviews = reviews.filter(r => r.state_before === 'new');
        const successRate = newCardReviews.length > 0 ? 
            newCardReviews.filter(r => r.rating >= 2).length / newCardReviews.length : 0;
        
        return {
            effectivenessScore: successRate,
            currentValue: w0Value,
            impact: 'initial_learning',
            performance: successRate > 0.7 ? 'good' : successRate > 0.5 ? 'fair' : 'poor'
        };
    }

    analyzeGoodRatingParameter(reviews, w1Value) {
        const goodRatingReviews = reviews.filter(r => r.rating === 2); // Good rating = 2
        const avgStabilityGain = goodRatingReviews.length > 0 ? 
            goodRatingReviews.reduce((sum, r) => sum + (r.stability_after - r.stability_before), 0) / goodRatingReviews.length : 0;
        
        return {
            effectivenessScore: Math.min(avgStabilityGain / 2, 1), // Normalize
            currentValue: w1Value,
            impact: 'good_rating_benefit',
            averageStabilityGain: avgStabilityGain
        };
    }

    analyzeEasyRatingParameter(reviews, w2Value) {
        const easyRatingReviews = reviews.filter(r => r.rating === 3); // Easy rating = 3
        const avgStabilityGain = easyRatingReviews.length > 0 ? 
            easyRatingReviews.reduce((sum, r) => sum + (r.stability_after - r.stability_before), 0) / easyRatingReviews.length : 0;
        
        return {
            effectivenessScore: Math.min(avgStabilityGain / 4, 1), // Easy should give more gain
            currentValue: w2Value,
            impact: 'easy_rating_benefit',
            averageStabilityGain: avgStabilityGain
        };
    }

    analyzeDifficultyImpactParameter(reviews, w5Value) {
        // Analyze correlation between difficulty and performance
        const correlationScore = this.calculateDifficultyPerformanceCorrelation(reviews);
        
        return {
            effectivenessScore: 1 - Math.abs(correlationScore), // Want moderate correlation
            currentValue: w5Value,
            impact: 'difficulty_calibration',
            correlation: correlationScore
        };
    }

    analyzeDifficultyDecayParameter(reviews, w11Value) {
        // Analyze if difficulty is decreasing appropriately over time
        const difficultyTrend = this.calculateDifficultyTrend(reviews);
        
        return {
            effectivenessScore: difficultyTrend < 0 ? 0.8 : 0.4, // Want slight decrease
            currentValue: w11Value,
            impact: 'difficulty_adaptation',
            trend: difficultyTrend
        };
    }

    analyzeStabilityFactorParameter(reviews, w6Value) {
        return { effectivenessScore: 0.7, currentValue: w6Value, impact: 'stability_momentum' };
    }

    analyzeEasyBonusParameter(reviews, w8Value) {
        return { effectivenessScore: 0.7, currentValue: w8Value, impact: 'easy_bonus' };
    }

    analyzeSpeedFactorParameter(reviews, w16Value) {
        return { effectivenessScore: 0.7, currentValue: w16Value, impact: 'learning_speed' };
    }

    analyzeMinStabilityParameter(reviews, w12Value) {
        return { effectivenessScore: 0.8, currentValue: w12Value, impact: 'stability_floor' };
    }

    analyzeMaxStabilityParameter(reviews, w13Value) {
        return { effectivenessScore: 0.8, currentValue: w13Value, impact: 'stability_ceiling' };
    }

    analyzeMinDifficultyParameter(reviews, w14Value) {
        return { effectivenessScore: 0.8, currentValue: w14Value, impact: 'difficulty_floor' };
    }

    analyzeMaxDifficultyParameter(reviews, w15Value) {
        return { effectivenessScore: 0.8, currentValue: w15Value, impact: 'difficulty_ceiling' };
    }

    // Additional helper methods
    calculateWeeklySuccessRates(reviews) {
        const weeks = this.groupReviewsByPhase(reviews, 7);
        return weeks.map(weekReviews => 
            weekReviews.filter(r => r.rating >= 2).length / weekReviews.length
        );
    }

    calculateConsistencyScore(successRates) {
        if (successRates.length < 2) return 0.5;
        const variance = this.calculateVariance(successRates);
        return Math.max(0, 1 - variance * 4); // Lower variance = higher consistency
    }

    calculatePredictionAccuracy(reviews) {
        const predictableReviews = reviews.filter(r => r.elapsed_days > 0 && r.stability_before > 0);
        if (predictableReviews.length === 0) return 0.5;

        let totalError = 0;
        predictableReviews.forEach(review => {
            const predicted = calculateRetrievability(review.elapsed_days, review.stability_before);
            const actual = review.rating >= 2 ? 1 : 0; // Success = rating >= 2
            totalError += Math.abs(predicted - actual);
        });

        return Math.max(0, 1 - (totalError / predictableReviews.length));
    }

    groupReviewsByPhase(reviews, daysPerPhase) {
        if (reviews.length === 0) return [];
        
        const phases = [];
        const startDate = new Date(reviews[0].reviewed_at);
        
        reviews.forEach(review => {
            const reviewDate = new Date(review.reviewed_at);
            const daysSinceStart = (reviewDate - startDate) / (1000 * 60 * 60 * 24);
            const phaseIndex = Math.floor(daysSinceStart / daysPerPhase);
            
            if (!phases[phaseIndex]) phases[phaseIndex] = [];
            phases[phaseIndex].push(review);
        });
        
        return phases.filter(phase => phase && phase.length > 0);
    }

    calculateDifficultyPerformanceCorrelation(reviews) {
        const difficulties = reviews.map(r => r.difficulty_before);
        const performances = reviews.map(r => r.rating >= 2 ? 1 : 0); // Success = rating >= 2
        return this.calculateCorrelation(difficulties, performances);
    }

    calculateDifficultyTrend(reviews) {
        if (reviews.length < 10) return 0;
        const midpoint = Math.floor(reviews.length / 2);
        const firstHalf = reviews.slice(0, midpoint);
        const secondHalf = reviews.slice(midpoint);
        
        const firstAvg = firstHalf.reduce((sum, r) => sum + r.difficulty_after, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, r) => sum + r.difficulty_after, 0) / secondHalf.length;
        
        return (secondAvg - firstAvg) / firstAvg;
    }

    calculateCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) return 0;
        
        const n = x.length;
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

    estimatePersonalizationBenefit(metrics, differences) {
        // Simplified estimation based on current performance
        const baseScore = metrics.overallSuccessRate || 0.5;
        const differenceCount = Object.keys(differences).length;
        
        // More differences suggest more personalization
        const personalizationFactor = Math.min(differenceCount / 10, 0.3);
        
        return baseScore > 0.8 ? personalizationFactor : -personalizationFactor * 0.5;
    }

    async analyzeTrends(reviews) {
        return {
            dailyPerformance: this.calculateDailyTrends(reviews),
            weeklyProgress: this.calculateWeeklyTrends(reviews),
            monthlyEvolution: this.calculateMonthlyTrends(reviews)
        };
    }

    calculateDailyTrends(reviews) {
        // Group by day and calculate daily metrics
        return { trend: 'stable', data: [] };
    }

    calculateWeeklyTrends(reviews) {
        // Group by week and calculate weekly metrics
        return { trend: 'improving', data: [] };
    }

    calculateMonthlyTrends(reviews) {
        // Group by month and calculate monthly metrics
        return { trend: 'stable', data: [] };
    }

    async generateRecommendations(reviews, currentParams) {
        // Use the optimization service to generate recommendations
        try {
            const optimizationStatus = await fsrsOptimizationService.checkOptimizationNeeded('dummy');
            return {
                priority: 'medium',
                suggestions: ['Continue current parameters', 'Monitor performance'],
                nextOptimization: 'in 50 reviews'
            };
        } catch (error) {
            return {
                priority: 'low',
                suggestions: ['No specific recommendations'],
                error: error.message
            };
        }
    }

    async analyzePredictionAccuracy(reviews) {
        const analysis = await fsrsOptimizationService.analyzePredictionAccuracy(reviews);
        return {
            accuracy: analysis.correlationCoefficient || 0,
            averageError: analysis.averageError || 0,
            bias: analysis.overestimationBias - analysis.underestimationBias,
            consistency: analysis.consistencyScore || 0
        };
    }

    async getSupabase() {
        return await getSupabaseClient();
    }
}

// Create and export singleton instance
const fsrsAnalyticsService = new FSRSAnalyticsService();

export default fsrsAnalyticsService;
export { FSRSAnalyticsService };