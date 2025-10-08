/**
 * Progress Dashboard Controller
 * Orchestrates data fetching, chart rendering, and UI updates
 * Main entry point for the new progress dashboard
 */

import progressData from './progressData.js';
import progressCopy from './progressCopy.js';
import progressCharts from './progressCharts.js';

class ProgressDashboard {
    constructor() {
        this.userId = null;
        this.timeWindow = 30; // Default to 30 days
        this.compareMode = false;
        this.loading = false;
    }

    /**
     * Initialize the dashboard
     * @param {string} userId
     */
    async initialize(userId) {
        this.userId = userId;
        this.setupEventListeners();
        await this.loadAllData();
    }

    /**
     * Setup event listeners for filters and controls
     */
    setupEventListeners() {
        // Time window selector
        const timeWindowButtons = document.querySelectorAll('[data-time-window]');
        timeWindowButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const window = parseInt(e.target.dataset.timeWindow);
                this.setTimeWindow(window);
            });
        });

        // Compare toggle
        const compareToggle = document.getElementById('compare-toggle');
        if (compareToggle) {
            compareToggle.addEventListener('change', (e) => {
                this.compareMode = e.target.checked;
                this.updateCompareMode();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('progress-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadAllData();
            });
        }
    }

    /**
     * Set time window and reload data
     * @param {number} days
     */
    async setTimeWindow(days) {
        this.timeWindow = days;

        // Update button states
        document.querySelectorAll('[data-time-window]').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.timeWindow) === days);
        });

        await this.loadAllData();
    }

    /**
     * Toggle compare mode display
     */
    updateCompareMode() {
        const deltaElements = document.querySelectorAll('.kpi-delta');
        deltaElements.forEach(el => {
            el.style.display = this.compareMode ? 'inline' : 'none';
        });
    }

    /**
     * Load all dashboard data
     */
    async loadAllData() {
        if (this.loading) return;

        this.loading = true;
        this.showLoadingState();

        try {
            // Load all data in parallel
            const [
                retention,
                streak,
                responseTime,
                stability,
                dueTomorrow,
                velocity,
                retentionOverTime,
                streakHeatmap,
                dueForecast,
                responseTimeTrend,
                stabilityTrend,
                difficultyAccuracy,
                sessionRatings,
                subjectMastery,
                learningCurve
            ] = await Promise.all([
                progressData.getRetentionRate(this.userId, this.timeWindow >= 30 ? 7 : this.timeWindow),
                progressData.getStreakData(this.userId),
                progressData.getResponseTime(this.userId, this.timeWindow >= 30 ? 7 : this.timeWindow),
                progressData.getStabilityAverage(this.userId, this.timeWindow),
                progressData.getCardsDueTomorrow(this.userId),
                progressData.getStudyVelocity(this.userId),
                progressData.getRetentionOverTime(this.userId, this.timeWindow),
                progressData.getStreakHeatmap(this.userId, 90),
                progressData.getDueForecast(this.userId, 14),
                progressData.getResponseTimeTrend(this.userId, this.timeWindow),
                progressData.getStabilityTrend(this.userId, this.timeWindow),
                progressData.getDifficultyAccuracyBySubject(this.userId, this.timeWindow),
                progressData.getSessionRatings(this.userId, 10),
                progressData.getSubjectMastery(this.userId, this.timeWindow),
                progressData.getLearningCurve(this.userId)
            ]);

            // Update KPI cards
            this.updateKPICards({
                retention,
                streak,
                responseTime,
                stability,
                dueTomorrow,
                velocity
            });

            // Update charts
            this.updateCharts({
                retentionOverTime,
                streakHeatmap,
                dueForecast,
                responseTimeTrend,
                stabilityTrend,
                difficultyAccuracy,
                sessionRatings,
                subjectMastery,
                learningCurve
            });

            this.showDashboardContent();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showErrorState(error.message);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Update KPI cards with data
     * @param {Object} data
     */
    updateKPICards(data) {
        // Retention
        const retentionValue = document.getElementById('kpi-retention-value');
        const retentionCopy = document.getElementById('kpi-retention-copy');
        const retentionDelta = document.getElementById('kpi-retention-delta');
        if (retentionValue) {
            retentionValue.textContent = `${data.retention.current}%`;
            if (retentionCopy) {
                retentionCopy.innerHTML = progressCopy.getRetentionCopy(data.retention.current, data.retention.delta, 7);
            }
            if (retentionDelta) {
                const sign = data.retention.delta > 0 ? '+' : '';
                retentionDelta.textContent = `${sign}${data.retention.delta} pts`;
                retentionDelta.className = `kpi-delta ${data.retention.delta > 0 ? 'positive' : data.retention.delta < 0 ? 'negative' : ''}`;
            }

            // Render sparkline if container exists
            if (data.retention.current > 0) {
                // Create simple trend line from current and previous
                const sparklineValues = [data.retention.previous, data.retention.current];
                progressCharts.renderSparkline('kpi-retention-sparkline', sparklineValues);
            }
        }

        // Streak
        const streakValue = document.getElementById('kpi-streak-value');
        const streakCopy = document.getElementById('kpi-streak-copy');
        if (streakValue) {
            streakValue.textContent = data.streak.streak;
            if (streakCopy) {
                streakCopy.innerHTML = progressCopy.getStreakCopy(data.streak.streak);
            }
        }

        // Response Time
        const responseTimeValue = document.getElementById('kpi-response-time-value');
        const responseTimeCopy = document.getElementById('kpi-response-time-copy');
        const responseTimeDelta = document.getElementById('kpi-response-time-delta');
        if (responseTimeValue) {
            responseTimeValue.textContent = `${data.responseTime.current}s`;
            if (responseTimeCopy) {
                responseTimeCopy.innerHTML = progressCopy.getResponseTimeCopy(data.responseTime.current, data.responseTime.delta, 7);
            }
            if (responseTimeDelta) {
                const sign = data.responseTime.delta > 0 ? '+' : '';
                responseTimeDelta.textContent = `${sign}${data.responseTime.delta}s`;
                responseTimeDelta.className = `kpi-delta ${data.responseTime.delta < 0 ? 'positive' : data.responseTime.delta > 0 ? 'negative' : ''}`;
            }
        }

        // Stability
        const stabilityValue = document.getElementById('kpi-stability-value');
        const stabilityCopy = document.getElementById('kpi-stability-copy');
        const stabilityDelta = document.getElementById('kpi-stability-delta');
        if (stabilityValue) {
            stabilityValue.textContent = `${data.stability.current}d`;
            if (stabilityCopy) {
                stabilityCopy.innerHTML = progressCopy.getStabilityCopy(data.stability.current, data.stability.previous, data.stability.delta);
            }
            if (stabilityDelta) {
                const sign = data.stability.delta > 0 ? '+' : '';
                stabilityDelta.textContent = `${sign}${data.stability.delta}d`;
                stabilityDelta.className = `kpi-delta ${data.stability.delta > 0 ? 'positive' : data.stability.delta < 0 ? 'negative' : ''}`;
            }
        }

        // Due Tomorrow
        const dueTomorrowValue = document.getElementById('kpi-due-tomorrow-value');
        const dueTomorrowCopy = document.getElementById('kpi-due-tomorrow-copy');
        if (dueTomorrowValue) {
            dueTomorrowValue.textContent = data.dueTomorrow.count;
            if (dueTomorrowCopy) {
                dueTomorrowCopy.innerHTML = progressCopy.getDueTomorrowCopy(data.dueTomorrow.count, data.dueTomorrow.estimatedMinutes);
            }
        }

        // Study Velocity
        const velocityValue = document.getElementById('kpi-velocity-value');
        const velocityCopy = document.getElementById('kpi-velocity-copy');
        const velocityDelta = document.getElementById('kpi-velocity-delta');
        if (velocityValue) {
            velocityValue.textContent = data.velocity.current;

            if (velocityDelta) {
                const sign = data.velocity.delta > 0 ? '+' : '';
                velocityDelta.textContent = `${sign}${data.velocity.delta}`;
                velocityDelta.className = `kpi-delta ${data.velocity.delta > 0 ? 'positive' : data.velocity.delta < 0 ? 'negative' : ''}`;
            }

            if (velocityCopy) {
                velocityCopy.innerHTML = progressCopy.getStudyVelocityCopy(data.velocity.current, data.velocity.delta);
            }
        }
    }

    /**
     * Update all charts with data
     * @param {Object} data
     */
    updateCharts(data) {
        // Retention over time
        const retentionChartCopy = document.getElementById('retention-chart-copy');
        if (retentionChartCopy) {
            retentionChartCopy.innerHTML = progressCopy.getRetentionTrendCopy(data.retentionOverTime, this.timeWindow);
        }
        progressCharts.renderRetentionChart('retention-chart', data.retentionOverTime, this.timeWindow);

        // Streak heatmap
        progressCharts.renderStreakHeatmap('streak-heatmap', data.streakHeatmap);

        // Due forecast
        const dueForecastCopy = document.getElementById('due-forecast-copy');
        if (dueForecastCopy) {
            dueForecastCopy.innerHTML = progressCopy.getDueForecastCopy(data.dueForecast, 7);
        }
        progressCharts.renderDueForecastChart('due-forecast-chart', data.dueForecast);

        // Response time trend
        progressCharts.renderResponseTimeChart('response-time-chart', data.responseTimeTrend);

        // Stability trend
        progressCharts.renderStabilityChart('stability-chart', data.stabilityTrend);

        // Difficulty vs Accuracy
        const focusCopy = document.getElementById('focus-copy');
        if (focusCopy) {
            focusCopy.innerHTML = progressCopy.getFocusCopy(data.difficultyAccuracy);
        }
        progressCharts.renderDifficultyAccuracyChart('difficulty-accuracy-chart', data.difficultyAccuracy);

        // Session ratings
        if (data.sessionRatings && data.sessionRatings.length > 0) {
            const latestSession = data.sessionRatings[data.sessionRatings.length - 1];
            const sessionRatingCopy = document.getElementById('session-rating-copy');
            if (sessionRatingCopy) {
                sessionRatingCopy.innerHTML = progressCopy.getSessionRatingCopy(latestSession.percentGoodEasy);
            }
        }
        progressCharts.renderSessionRatingsChart('session-ratings-chart', data.sessionRatings);

        // Subject mastery
        progressCharts.renderSubjectMasteryChart('subject-mastery-chart', data.subjectMastery);

        // Learning curve
        const learningCurveCopy = document.getElementById('learning-curve-copy');
        if (learningCurveCopy) {
            learningCurveCopy.innerHTML = progressCopy.getLearningCurveCopy(data.learningCurve);
        }
        progressCharts.renderLearningCurveChart('learning-curve-chart', data.learningCurve);
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        const loading = document.getElementById('progress-loading');
        const content = document.getElementById('progress-content');
        const error = document.getElementById('progress-error');

        if (loading) loading.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        if (error) error.classList.add('hidden');
    }

    /**
     * Show dashboard content
     */
    showDashboardContent() {
        const loading = document.getElementById('progress-loading');
        const content = document.getElementById('progress-content');
        const error = document.getElementById('progress-error');

        if (loading) loading.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        if (error) error.classList.add('hidden');
    }

    /**
     * Show error state
     * @param {string} message
     */
    showErrorState(message) {
        const loading = document.getElementById('progress-loading');
        const content = document.getElementById('progress-content');
        const error = document.getElementById('progress-error');
        const errorMsg = document.getElementById('progress-error-message');

        if (loading) loading.classList.add('hidden');
        if (content) content.classList.add('hidden');
        if (error) error.classList.remove('hidden');
        if (errorMsg) errorMsg.textContent = message || 'Failed to load progress data.';
    }
}

// Export singleton instance
const dashboardInstance = new ProgressDashboard();
export default dashboardInstance;
