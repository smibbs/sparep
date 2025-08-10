/**
 * FSRS Scheduler Service
 * Handles scheduled optimization tasks and batch operations for FSRS parameter tuning
 */

import { getSupabaseClient } from './supabase-client.js';
import fsrsOptimizationService from './fsrsOptimization.js';
import fsrsAnalyticsService from './fsrsAnalytics.js';
import fsrsParametersService from './fsrsParameters.js';

class FSRSSchedulerService {
    constructor() {
        this.batchSize = 10; // Process users in batches
        this.isRunning = false;
        this.currentJob = null;
        
        // Scheduling intervals
        this.SCHEDULER_INTERVALS = {
            DAILY: 24 * 60 * 60 * 1000,    // 24 hours
            WEEKLY: 7 * 24 * 60 * 60 * 1000, // 7 days
            MONTHLY: 30 * 24 * 60 * 60 * 1000 // 30 days
        };
    }

    /**
     * Run optimization check for all users who might need it
     * @param {Object} options - Scheduling options
     * @returns {Promise<Object>} Batch optimization results
     */
    async runScheduledOptimization(options = {}) {
        if (this.isRunning) {
            return { 
                success: false, 
                reason: 'Optimization already running',
                currentJob: this.currentJob 
            };
        }

        try {
            this.isRunning = true;
            this.currentJob = {
                startTime: new Date(),
                type: 'scheduled_optimization',
                status: 'running',
                progress: { processed: 0, total: 0, optimized: 0, skipped: 0, errors: 0 }
            };


            // Get users who might need optimization
            const candidateUsers = await this.getCandidateUsers(options);
            this.currentJob.progress.total = candidateUsers.length;


            const results = {
                success: true,
                totalUsers: candidateUsers.length,
                processedUsers: 0,
                optimizedUsers: 0,
                skippedUsers: 0,
                errorUsers: 0,
                details: [],
                startTime: this.currentJob.startTime,
                endTime: null,
                duration: null
            };

            // Process users in batches
            for (let i = 0; i < candidateUsers.length; i += this.batchSize) {
                const batch = candidateUsers.slice(i, i + this.batchSize);
                const batchResults = await this.processBatch(batch);
                
                // Update results
                results.optimizedUsers += batchResults.optimized;
                results.skippedUsers += batchResults.skipped;
                results.errorUsers += batchResults.errors;
                results.processedUsers += batch.length;
                results.details.push(...batchResults.details);

                // Update job progress
                this.currentJob.progress.processed = results.processedUsers;
                this.currentJob.progress.optimized = results.optimizedUsers;
                this.currentJob.progress.skipped = results.skippedUsers;
                this.currentJob.progress.errors = results.errorUsers;


                // Small delay between batches to avoid overwhelming the system
                if (i + this.batchSize < candidateUsers.length) {
                    await this.delay(1000);
                }
            }

            results.endTime = new Date();
            results.duration = results.endTime - results.startTime;


            // Log summary
            await this.logScheduledOptimization(results);

            return results;
        } catch (error) {
            console.error('❌ Scheduled optimization failed:', error);
            return {
                success: false,
                error: error.message,
                partialResults: this.currentJob?.progress
            };
        } finally {
            this.isRunning = false;
            this.currentJob = null;
        }
    }

    /**
     * Get users who are candidates for optimization
     * @param {Object} options - Selection criteria
     * @returns {Promise<Array>} List of user IDs
     */
    async getCandidateUsers(options = {}) {
        try {
            const supabase = await this.getSupabase();
            
            // Get all users with FSRS parameters
            const { data: users, error: usersError } = await supabase
                .from('fsrs_params')
                .select('user_id, updated_at')
                .order('updated_at', { ascending: true });

            if (usersError) throw usersError;

            const candidates = [];
            const minReviews = options.minReviews || 50;
            const maxDaysSinceUpdate = options.maxDaysSinceUpdate || 30;

            for (const user of users) {
                try {
                    // Check if user needs optimization
                    const optimizationStatus = await fsrsOptimizationService.checkOptimizationNeeded(user.user_id);
                    
                    if (optimizationStatus.shouldOptimize) {
                        // Additional filters
                        if (optimizationStatus.totalReviews >= minReviews) {
                            candidates.push({
                                userId: user.user_id,
                                totalReviews: optimizationStatus.totalReviews,
                                daysSinceUpdate: optimizationStatus.daysSinceUpdate,
                                reason: optimizationStatus.reason,
                                priority: this.calculateOptimizationPriority(optimizationStatus)
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to check optimization for user ${user.user_id}:`, error.message);
                }
            }

            // Sort by priority (highest first)
            candidates.sort((a, b) => b.priority - a.priority);

            return candidates;
        } catch (error) {
            console.error('Error getting candidate users:', error);
            return [];
        }
    }

    /**
     * Process a batch of users for optimization
     * @param {Array} batch - Batch of user objects
     * @returns {Promise<Object>} Batch processing results
     */
    async processBatch(batch) {
        const results = {
            optimized: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        const batchPromises = batch.map(async (userInfo) => {
            try {
                
                const optimizationResult = await fsrsOptimizationService.optimizeUserParameters(
                    userInfo.userId, 
                    { conservative: true, scheduledOptimization: true }
                );

                if (optimizationResult.success) {
                    results.optimized++;
                    results.details.push({
                        userId: userInfo.userId,
                        status: 'optimized',
                        reviewsAnalyzed: optimizationResult.reviewsAnalyzed,
                        confidence: optimizationResult.confidence,
                        improvements: optimizationResult.improvements
                    });
                } else {
                    results.skipped++;
                    results.details.push({
                        userId: userInfo.userId,
                        status: 'skipped',
                        reason: optimizationResult.reason
                    });
                }
            } catch (error) {
                results.errors++;
                results.details.push({
                    userId: userInfo.userId,
                    status: 'error',
                    error: error.message
                });
                console.error(`❌ Error optimizing user ${userInfo.userId}:`, error.message);
            }
        });

        await Promise.all(batchPromises);
        return results;
    }

    /**
     * Generate comprehensive analytics report for all users
     * @param {Object} options - Report options
     * @returns {Promise<Object>} System-wide analytics report
     */
    async generateSystemAnalytics(options = {}) {
        try {
            
            const supabase = await this.getSupabase();
            
            // Get all users with parameters
            const { data: users, error: usersError } = await supabase
                .from('fsrs_params')
                .select('user_id')
                .limit(options.maxUsers || 100);

            if (usersError) throw usersError;

            const systemReport = {
                generatedAt: new Date().toISOString(),
                totalUsers: users.length,
                userReports: [],
                aggregateMetrics: {},
                recommendations: [],
                trends: {}
            };

            // Generate reports for each user (in batches)
            
            for (let i = 0; i < users.length; i += this.batchSize) {
                const batch = users.slice(i, i + this.batchSize);
                
                const batchReports = await Promise.allSettled(
                    batch.map(user => 
                        fsrsAnalyticsService.generateEffectivenessReport(user.user_id, options)
                    )
                );

                batchReports.forEach((result, index) => {
                    if (result.status === 'fulfilled' && !result.value.error) {
                        systemReport.userReports.push(result.value);
                    } else {
                        console.warn(`Failed to generate report for user ${batch[index].user_id}`);
                    }
                });

            }

            // Calculate aggregate metrics
            systemReport.aggregateMetrics = this.calculateAggregateMetrics(systemReport.userReports);
            
            // Generate system-wide recommendations
            systemReport.recommendations = this.generateSystemRecommendations(systemReport.aggregateMetrics);
            
            // Analyze trends
            systemReport.trends = this.analyzeSystemTrends(systemReport.userReports);

            
            return systemReport;
        } catch (error) {
            console.error('Error generating system analytics:', error);
            return { error: error.message };
        }
    }

    /**
     * Initialize automatic scheduler (for future implementation)
     * @param {Object} config - Scheduler configuration
     */
    initializeScheduler(config = {}) {
        
        // In a production environment, this would set up:
        // - Cron jobs for regular optimization checks
        // - Event-driven optimization triggers
        // - Background job queues
        // - Monitoring and alerting
        
        return {
            initialized: true,
            config,
            note: 'Manual scheduling - implement server-side automation for production'
        };
    }

    /**
     * Get current optimization status for admin dashboard
     * @returns {Object} Current status and statistics
     */
    getOptimizationStatus() {
        return {
            isRunning: this.isRunning,
            currentJob: this.currentJob,
            lastRun: this.lastScheduledRun,
            nextScheduledRun: this.nextScheduledRun,
            statistics: {
                totalOptimizations: this.totalOptimizations || 0,
                successfulOptimizations: this.successfulOptimizations || 0,
                averageOptimizationTime: this.averageOptimizationTime || 0
            }
        };
    }

    // Helper methods
    calculateOptimizationPriority(optimizationStatus) {
        let priority = 0;
        
        // More reviews = higher priority
        priority += Math.min(optimizationStatus.totalReviews / 100, 5);
        
        // More days since update = higher priority
        priority += Math.min(optimizationStatus.daysSinceUpdate / 10, 3);
        
        // Milestone reviews = highest priority
        if ([100, 250, 500, 1000].includes(optimizationStatus.totalReviews)) {
            priority += 10;
        }
        
        return priority;
    }

    calculateAggregateMetrics(userReports) {
        if (userReports.length === 0) return {};

        const validReports = userReports.filter(r => r.effectivenessMetrics && !r.effectivenessMetrics.noData);
        if (validReports.length === 0) return { noData: true };

        const metrics = {
            totalUsers: validReports.length,
            averageEffectiveness: 0,
            averageSuccessRate: 0,
            averageRetentionRate: 0,
            averageLearningVelocity: 0,
            parameterDistribution: {},
            performanceDistribution: {
                excellent: 0, // >0.9
                good: 0,      // 0.8-0.9
                fair: 0,      // 0.6-0.8
                poor: 0       // <0.6
            }
        };

        // Calculate averages
        metrics.averageEffectiveness = validReports.reduce((sum, r) => sum + r.overallScore, 0) / validReports.length;
        metrics.averageSuccessRate = validReports.reduce((sum, r) => sum + (r.effectivenessMetrics.overallSuccessRate || 0), 0) / validReports.length;
        metrics.averageRetentionRate = validReports.reduce((sum, r) => sum + (r.effectivenessMetrics.retentionRate || 0), 0) / validReports.length;
        metrics.averageLearningVelocity = validReports.reduce((sum, r) => sum + (r.effectivenessMetrics.learningVelocity || 0), 0) / validReports.length;

        // Performance distribution
        validReports.forEach(report => {
            const score = report.overallScore;
            if (score >= 0.9) metrics.performanceDistribution.excellent++;
            else if (score >= 0.8) metrics.performanceDistribution.good++;
            else if (score >= 0.6) metrics.performanceDistribution.fair++;
            else metrics.performanceDistribution.poor++;
        });

        return metrics;
    }

    generateSystemRecommendations(aggregateMetrics) {
        const recommendations = [];

        if (aggregateMetrics.averageEffectiveness < 0.7) {
            recommendations.push({
                type: 'system',
                priority: 'high',
                title: 'Overall effectiveness below target',
                description: 'Consider reviewing default parameters or optimization algorithms',
                action: 'review_defaults'
            });
        }

        if (aggregateMetrics.performanceDistribution.poor > aggregateMetrics.totalUsers * 0.2) {
            recommendations.push({
                type: 'optimization',
                priority: 'medium',
                title: 'High number of poorly performing users',
                description: 'Consider more aggressive optimization or parameter reset for struggling users',
                action: 'aggressive_optimization'
            });
        }

        return recommendations;
    }

    analyzeSystemTrends(userReports) {
        return {
            overallTrend: 'stable',
            improvingUsers: userReports.filter(r => r.learningProgression?.overallTrend === 'improving').length,
            decliningUsers: userReports.filter(r => r.learningProgression?.overallTrend === 'declining').length,
            stableUsers: userReports.filter(r => r.learningProgression?.overallTrend === 'stable').length
        };
    }

    async logScheduledOptimization(results) {
        // Log optimization results for tracking and analysis

        // In production, store this in a dedicated logging table
        // for historical tracking and optimization effectiveness analysis
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getSupabase() {
        return await getSupabaseClient();
    }
}

// Create and export singleton instance
const fsrsSchedulerService = new FSRSSchedulerService();

export default fsrsSchedulerService;
export { FSRSSchedulerService };