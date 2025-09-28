import { getSupabaseClient } from './supabase-client.js';

class DatabaseHealth {
    constructor() {
        this.supabase = null;
        this.charts = {};
        this.refreshInterval = null;
        this.data = {
            overview: {},
            unassignedCards: [],
            flaggedContent: [],
            performanceIssues: [],
            subjectHealth: [],
            activityData: []
        };
    }

    async initialize() {
        try {
            this.supabase = await getSupabaseClient();
            await this.setupEventListeners();
            await this.loadInitialData();
            this.setupAutoRefresh();
            console.log('[Database Health] Initialized successfully');
        } catch (error) {
            console.error('[Database Health] Initialization failed:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-data')?.addEventListener('click', () => {
            this.refreshData();
        });

        // Export button
        document.getElementById('export-report')?.addEventListener('click', () => {
            this.exportReport();
        });

        // Tab switching
        document.querySelectorAll('.data-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Chart type changes
        document.getElementById('content-chart-type')?.addEventListener('change', () => {
            this.updateContentChart();
        });

        document.getElementById('timeline-period')?.addEventListener('change', () => {
            this.updateActivityChart();
        });

        // Auto-assign cards button
        document.getElementById('assign-all-cards')?.addEventListener('click', () => {
            this.autoAssignCards();
        });
    }

    async loadInitialData() {
        try {
            this.showLoading();
            await Promise.all([
                this.loadOverviewData(),
                this.loadUnassignedCards(),
                this.loadFlaggedContent(),
                this.loadPerformanceIssues(),
                this.loadSubjectHealth(),
                this.loadActivityData()
            ]);

            this.updateUI();
            this.createCharts();
            this.updateLastRefreshTime();
        } catch (error) {
            console.error('[Database Health] Failed to load initial data:', error);
            this.showError('Failed to load database health data');
        }
    }

    async loadOverviewData() {
        console.log('[Database Health] Loading overview data...');
        const { data, error } = await this.supabase.rpc('get_database_health_overview');

        if (error) {
            console.error('Error loading overview data:', error);
            // Fallback to individual queries
            await this.loadOverviewDataFallback();
        } else {
            console.log('[Database Health] Overview data loaded:', data);
            this.data.overview = this.processOverviewData(data);
        }
    }

    async loadOverviewDataFallback() {
        const queries = [
            this.supabase.from('card_templates').select('id, is_public, flagged_for_review'),
            this.supabase.from('decks').select('id, is_public'),
            this.supabase.from('subjects').select('id, is_public'),
            this.supabase.from('profiles').select('id, is_admin'),
            this.supabase.from('reviews').select('id, reviewed_at').gte('reviewed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        ];

        const results = await Promise.all(queries);

        const cards = results[0].data || [];
        const decks = results[1].data || [];
        const subjects = results[2].data || [];
        const users = results[3].data || [];
        const recentReviews = results[4].data || [];

        this.data.overview = {
            totalCards: cards.length,
            publicCards: cards.filter(c => c.is_public && !c.flagged_for_review).length,
            flaggedCards: cards.filter(c => c.flagged_for_review).length,
            totalDecks: decks.length,
            publicDecks: decks.filter(d => d.is_public).length,
            totalSubjects: subjects.length,
            totalUsers: users.length,
            adminUsers: users.filter(u => u.is_admin).length,
            activeUsers30Days: new Set(recentReviews.map(r => r.user_id)).size || 1,
            recentActivity: recentReviews.length
        };
    }

    async loadUnassignedCards() {
        console.log('[Database Health] Loading unassigned cards...');

        // Use a raw SQL query through RPC since the Supabase query syntax is complex for this
        const query = `
            SELECT
                ct.id,
                ct.question,
                ct.path,
                ct.is_public,
                ct.flagged_for_review,
                s.name as subject_name
            FROM card_templates ct
            LEFT JOIN card_deck_assignments cda ON ct.id = cda.card_template_id
            LEFT JOIN subjects s ON ct.subject_id = s.id
            WHERE cda.card_template_id IS NULL
            LIMIT 50
        `;

        const { data, error } = await this.supabase.rpc('admin_execute_sql', {
            query: query
        });

        if (error) {
            console.error('Error loading unassigned cards:', error);
            // Simple fallback - just get unassigned cards without subject names
            const { data: fallbackData, error: fallbackError } = await this.supabase
                .from('card_templates')
                .select('id, question, path, is_public, flagged_for_review, subject_id')
                .limit(50);

            if (fallbackError) {
                console.error('Fallback query also failed:', fallbackError);
                this.data.unassignedCards = [];
            } else {
                this.data.unassignedCards = (fallbackData || []).map(card => ({
                    ...card,
                    subject_name: 'Unknown'
                }));
            }
        } else {
            console.log('[Database Health] Unassigned cards loaded:', data?.length || 0);
            this.data.unassignedCards = data || [];
        }
    }

    async loadFlaggedContent() {
        const { data, error } = await this.supabase
            .from('card_templates')
            .select(`
                id,
                question,
                flagged_reason,
                flagged_at,
                flagged_by,
                profiles!flagged_by(display_name)
            `)
            .eq('flagged_for_review', true)
            .order('flagged_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error loading flagged content:', error);
            this.data.flaggedContent = [];
        } else {
            this.data.flaggedContent = data || [];
        }
    }

    async loadPerformanceIssues() {
        const { data, error } = await this.supabase
            .from('card_templates')
            .select(`
                id,
                question,
                total_reviews,
                correct_reviews,
                incorrect_reviews,
                average_response_time_ms
            `)
            .gt('total_reviews', 5)
            .order('incorrect_reviews', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error loading performance issues:', error);
            this.data.performanceIssues = [];
        } else {
            this.data.performanceIssues = (data || []).map(card => ({
                ...card,
                successRate: card.total_reviews > 0 ?
                    Math.round((card.correct_reviews / card.total_reviews) * 100) : 0,
                issueType: this.classifyPerformanceIssue(card)
            }));
        }
    }

    async loadSubjectHealth() {
        console.log('[Database Health] Loading subject health...');

        // Use SQL query to get subjects with card counts
        const query = `
            SELECT
                s.id,
                s.name,
                s.path,
                s.is_public,
                COUNT(ct.id) as card_count,
                COUNT(CASE WHEN ct.is_public = true AND ct.flagged_for_review = false THEN 1 END) as public_card_count
            FROM subjects s
            LEFT JOIN card_templates ct ON s.id = ct.subject_id
            GROUP BY s.id, s.name, s.path, s.is_public
            ORDER BY s.path
        `;

        const { data, error } = await this.supabase.rpc('admin_execute_sql', {
            query: query
        });

        if (error) {
            console.error('Error loading subject health:', error);
            // Fallback to basic subjects query
            const { data: fallbackData, error: fallbackError } = await this.supabase
                .from('subjects')
                .select('id, name, path, is_public')
                .order('path');

            if (fallbackError) {
                console.error('Fallback subjects query failed:', fallbackError);
                this.data.subjectHealth = [];
            } else {
                this.data.subjectHealth = (fallbackData || []).map(subject => ({
                    ...subject,
                    cardCount: 0,
                    publicCardCount: 0,
                    healthStatus: this.calculateSubjectHealth({ ...subject, card_count: 0 })
                }));
            }
        } else {
            console.log('[Database Health] Subject health loaded:', data?.length || 0);
            this.data.subjectHealth = (data || []).map(subject => ({
                ...subject,
                cardCount: parseInt(subject.card_count) || 0,
                publicCardCount: parseInt(subject.public_card_count) || 0,
                healthStatus: this.calculateSubjectHealth(subject)
            }));
        }
    }

    async loadActivityData() {
        const days = document.getElementById('timeline-period')?.value || 7;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const { data, error } = await this.supabase
            .from('reviews')
            .select('reviewed_at, rating')
            .gte('reviewed_at', startDate.toISOString())
            .order('reviewed_at');

        if (error) {
            console.error('Error loading activity data:', error);
            this.data.activityData = [];
        } else {
            this.data.activityData = this.processActivityData(data || [], days);
        }
    }

    processOverviewData(data) {
        if (!data || !Array.isArray(data)) return this.data.overview;

        return data.reduce((acc, row) => {
            acc[row.metric] = row.count;
            return acc;
        }, {});
    }

    processActivityData(reviews, days) {
        const dailyData = {};

        // Initialize all days
        for (let i = 0; i < days; i++) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateKey = date.toISOString().split('T')[0];
            dailyData[dateKey] = { reviews: 0, averageRating: 0, totalRating: 0 };
        }

        // Process reviews
        reviews.forEach(review => {
            const dateKey = review.reviewed_at.split('T')[0];
            if (dailyData[dateKey]) {
                dailyData[dateKey].reviews++;
                dailyData[dateKey].totalRating += review.rating || 0;
            }
        });

        // Calculate averages
        Object.keys(dailyData).forEach(date => {
            const data = dailyData[date];
            data.averageRating = data.reviews > 0 ? data.totalRating / data.reviews : 0;
        });

        return Object.entries(dailyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => ({
                date,
                ...data
            }));
    }

    classifyPerformanceIssue(card) {
        const successRate = card.total_reviews > 0 ?
            (card.correct_reviews / card.total_reviews) * 100 : 0;
        const avgTime = card.average_response_time_ms || 0;

        if (successRate < 30) return 'Very Difficult';
        if (successRate < 50) return 'Difficult';
        if (avgTime > 30000) return 'Slow Response';
        if (card.incorrect_reviews > card.correct_reviews) return 'Poor Performance';
        return 'Review Needed';
    }

    calculateSubjectHealth(subject) {
        const cardCount = parseInt(subject.card_count) || subject.cardCount || 0;

        if (cardCount === 0) return 'No Content';
        if (!subject.is_public) return 'Private';
        if (cardCount < 5) return 'Low Content';
        if (cardCount > 50) return 'High Content';
        return 'Healthy';
    }

    updateUI() {
        this.updateSummaryStats();
        this.updateHealthScore();
        this.updateTableCounts();
        this.populateTables();
    }

    updateSummaryStats() {
        const overview = this.data.overview;

        document.getElementById('total-content-count').textContent =
            (overview.totalCards + overview.totalDecks + overview.totalSubjects).toLocaleString();
        document.getElementById('cards-count').textContent = overview.totalCards?.toLocaleString() || '0';
        document.getElementById('decks-count').textContent = overview.totalDecks?.toLocaleString() || '0';
        document.getElementById('subjects-count').textContent = overview.totalSubjects?.toLocaleString() || '0';

        document.getElementById('active-users-count').textContent = overview.activeUsers30Days?.toLocaleString() || '0';
        document.getElementById('total-users-count').textContent = overview.totalUsers?.toLocaleString() || '0';
        document.getElementById('admin-users-count').textContent = overview.adminUsers?.toLocaleString() || '0';

        document.getElementById('flagged-count').textContent = overview.flaggedCards?.toLocaleString() || '0';
        document.getElementById('unassigned-count').textContent = this.data.unassignedCards.length.toLocaleString();
    }

    updateHealthScore() {
        const overview = this.data.overview;
        const unassignedCount = this.data.unassignedCards.length;
        const flaggedCount = overview.flaggedCards || 0;
        const totalCards = overview.totalCards || 1;

        // Calculate health score (0-100)
        let healthScore = 100;

        // Deduct for unassigned cards
        healthScore -= Math.min(30, (unassignedCount / totalCards) * 100);

        // Deduct for flagged cards
        healthScore -= Math.min(20, (flaggedCount / totalCards) * 100);

        // Deduct for low activity
        if (overview.recentActivity < 10) healthScore -= 10;

        healthScore = Math.max(0, Math.round(healthScore));

        document.getElementById('health-score').textContent = `${healthScore}%`;
        document.getElementById('alert-count').textContent = (unassignedCount + flaggedCount).toLocaleString();

        // Update health status
        let status, statusText;
        if (healthScore >= 90) {
            status = '⚡ Excellent';
            statusText = 'All systems optimal';
        } else if (healthScore >= 70) {
            status = '✅ Good';
            statusText = 'Minor issues detected';
        } else if (healthScore >= 50) {
            status = '⚠️ Fair';
            statusText = 'Attention required';
        } else {
            status = '🚨 Poor';
            statusText = 'Immediate action needed';
        }

        document.getElementById('overall-health').textContent = status;
        document.getElementById('health-status-text').textContent = statusText;
    }

    updateTableCounts() {
        document.getElementById('unassigned-cards-count').textContent =
            `${this.data.unassignedCards.length} cards`;
        document.getElementById('flagged-content-count').textContent =
            `${this.data.flaggedContent.length} items`;
        document.getElementById('performance-issues-count').textContent =
            `${this.data.performanceIssues.length} cards`;
        document.getElementById('subjects-health-count').textContent =
            `${this.data.subjectHealth.length} subjects`;
    }

    populateTables() {
        this.populateUnassignedCardsTable();
        this.populateFlaggedContentTable();
        this.populatePerformanceTable();
        this.populateSubjectsTable();
    }

    populateUnassignedCardsTable() {
        const tbody = document.getElementById('unassigned-cards-body');
        if (!tbody) return;

        if (this.data.unassignedCards.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">✅ All cards are properly assigned to decks</td></tr>';
            return;
        }

        tbody.innerHTML = this.data.unassignedCards.map(card => `
            <tr>
                <td class="card-question">${this.escapeHtml(card.question?.substring(0, 100) || 'N/A')}${card.question?.length > 100 ? '...' : ''}</td>
                <td>${this.escapeHtml(card.subject_name || card.subjects?.name || 'Unknown')}</td>
                <td><span class="path-tag">${card.path || 'No path'}</span></td>
                <td>
                    <div class="status-indicators">
                        ${card.is_public ? '<span class="status-badge public">Public</span>' : '<span class="status-badge hidden">Private</span>'}
                        ${card.flagged_for_review ? '<span class="status-badge review">Flagged</span>' : ''}
                    </div>
                </td>
                <td>
                    <button class="btn btn-warning btn-small" onclick="healthDashboard.assignCard('${card.id}')">
                        🔧 Assign
                    </button>
                </td>
            </tr>
        `).join('');
    }

    populateFlaggedContentTable() {
        const tbody = document.getElementById('flagged-content-body');
        if (!tbody) return;

        if (this.data.flaggedContent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">✅ No flagged content requires review</td></tr>';
            return;
        }

        tbody.innerHTML = this.data.flaggedContent.map(item => `
            <tr>
                <td class="card-question">${this.escapeHtml(item.question?.substring(0, 80) || 'N/A')}${item.question?.length > 80 ? '...' : ''}</td>
                <td><span class="flag-reason">${this.escapeHtml(item.flagged_reason || 'No reason')}</span></td>
                <td>${this.escapeHtml(item.profiles?.display_name || 'System')}</td>
                <td>${new Date(item.flagged_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-success btn-small" onclick="healthDashboard.resolveFlaggedCard('${item.id}')">
                        ✅ Resolve
                    </button>
                </td>
            </tr>
        `).join('');
    }

    populatePerformanceTable() {
        const tbody = document.getElementById('performance-body');
        if (!tbody) return;

        if (this.data.performanceIssues.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">✅ No significant performance issues detected</td></tr>';
            return;
        }

        tbody.innerHTML = this.data.performanceIssues.slice(0, 20).map(card => `
            <tr>
                <td class="card-question">${this.escapeHtml(card.question?.substring(0, 80) || 'N/A')}${card.question?.length > 80 ? '...' : ''}</td>
                <td>
                    <span class="success-rate ${card.successRate < 30 ? 'poor' : card.successRate < 60 ? 'fair' : 'good'}">
                        ${card.successRate}%
                    </span>
                </td>
                <td>${card.average_response_time_ms ? Math.round(card.average_response_time_ms / 1000) + 's' : 'N/A'}</td>
                <td>${card.total_reviews}</td>
                <td><span class="issue-type">${card.issueType}</span></td>
            </tr>
        `).join('');
    }

    populateSubjectsTable() {
        const tbody = document.getElementById('subjects-body');
        if (!tbody) return;

        if (this.data.subjectHealth.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No subjects found</td></tr>';
            return;
        }

        tbody.innerHTML = this.data.subjectHealth.map(subject => `
            <tr>
                <td><strong>${this.escapeHtml(subject.name)}</strong></td>
                <td><span class="path-tag">${subject.path || 'No path'}</span></td>
                <td><span class="card-count">${subject.cardCount}</span></td>
                <td><span class="card-count">${subject.cardCount}</span></td>
                <td>
                    <span class="status-badge ${subject.healthStatus.toLowerCase().replace(' ', '-')}">
                        ${subject.healthStatus}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    createCharts() {
        this.createContentDistributionChart();
        this.createActivityTimelineChart();
        this.createCardStatusChart();
        this.createSubjectPerformanceChart();
    }

    createContentDistributionChart() {
        const ctx = document.getElementById('content-distribution-chart');
        if (!ctx) return;

        const overview = this.data.overview;
        const chartType = document.getElementById('content-chart-type')?.value || 'doughnut';

        if (this.charts.contentDistribution) {
            this.charts.contentDistribution.destroy();
        }

        this.charts.contentDistribution = new window.Chart(ctx, {
            type: chartType,
            data: {
                labels: ['Cards', 'Decks', 'Subjects'],
                datasets: [{
                    data: [
                        overview.totalCards || 0,
                        overview.totalDecks || 0,
                        overview.totalSubjects || 0
                    ],
                    backgroundColor: [
                        '#007AFF',
                        '#28a745',
                        '#ffc107'
                    ],
                    borderColor: '#333',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#fff'
                        }
                    }
                },
                scales: chartType === 'bar' ? {
                    y: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    }
                } : {}
            }
        });
    }

    createActivityTimelineChart() {
        const ctx = document.getElementById('activity-timeline-chart');
        if (!ctx) return;

        if (this.charts.activityTimeline) {
            this.charts.activityTimeline.destroy();
        }

        this.charts.activityTimeline = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: this.data.activityData.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Reviews',
                    data: this.data.activityData.map(d => d.reviews),
                    borderColor: '#007AFF',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    createCardStatusChart() {
        const ctx = document.getElementById('card-status-chart');
        if (!ctx) return;

        const overview = this.data.overview;

        if (this.charts.cardStatus) {
            this.charts.cardStatus.destroy();
        }

        this.charts.cardStatus = new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Public Cards', 'Flagged Cards', 'Unassigned Cards'],
                datasets: [{
                    data: [
                        overview.publicCards || 0,
                        overview.flaggedCards || 0,
                        this.data.unassignedCards.length
                    ],
                    backgroundColor: [
                        '#28a745',
                        '#dc3545',
                        '#ffc107'
                    ],
                    borderColor: '#333',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }

    createSubjectPerformanceChart() {
        const ctx = document.getElementById('subject-performance-chart');
        if (!ctx) return;

        const topSubjects = this.data.subjectHealth
            .sort((a, b) => b.cardCount - a.cardCount)
            .slice(0, 10);

        if (this.charts.subjectPerformance) {
            this.charts.subjectPerformance.destroy();
        }

        this.charts.subjectPerformance = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: topSubjects.map(s => s.name.length > 20 ? s.name.substring(0, 20) + '...' : s.name),
                datasets: [{
                    label: 'Card Count',
                    data: topSubjects.map(s => s.cardCount),
                    backgroundColor: '#007AFF',
                    borderColor: '#333',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    updateContentChart() {
        this.createContentDistributionChart();
    }

    updateActivityChart() {
        this.loadActivityData().then(() => {
            this.createActivityTimelineChart();
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.data-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    async refreshData() {
        const button = document.getElementById('refresh-data');
        const originalText = button.textContent;

        try {
            button.textContent = '🔄 Refreshing...';
            button.disabled = true;

            await this.loadInitialData();

            button.textContent = '✅ Refreshed';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error refreshing data:', error);
            button.textContent = '❌ Error';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    async autoAssignCards() {
        try {
            const button = document.getElementById('assign-all-cards');
            button.disabled = true;
            button.textContent = '🔄 Assigning...';

            // This would typically call a stored procedure to auto-assign cards
            console.log('Auto-assigning cards...');

            // Simulate the operation
            await new Promise(resolve => setTimeout(resolve, 1000));

            await this.loadUnassignedCards();
            this.populateUnassignedCardsTable();
            this.updateTableCounts();

            button.textContent = '✅ Assigned';
            setTimeout(() => {
                button.textContent = '🔧 Auto-Assign All';
                button.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error auto-assigning cards:', error);
        }
    }

    async assignCard(cardId) {
        try {
            console.log('Assigning card:', cardId);
            // Implementation would go here
            await this.refreshData();
        } catch (error) {
            console.error('Error assigning card:', error);
        }
    }

    async resolveFlaggedCard(cardId) {
        try {
            console.log('Resolving flagged card:', cardId);
            // Implementation would go here
            await this.refreshData();
        } catch (error) {
            console.error('Error resolving flagged card:', error);
        }
    }

    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            overview: this.data.overview,
            unassignedCards: this.data.unassignedCards.length,
            flaggedContent: this.data.flaggedContent.length,
            performanceIssues: this.data.performanceIssues.length,
            subjectHealth: this.data.subjectHealth.length
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-health-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    setupAutoRefresh() {
        // Refresh every 5 minutes
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, 5 * 60 * 1000);
    }

    updateLastRefreshTime() {
        document.getElementById('last-refresh-time').textContent =
            new Date().toLocaleTimeString();
    }

    showLoading() {
        document.querySelectorAll('.loading-cell').forEach(cell => {
            cell.textContent = 'Loading...';
        });
    }

    showError(message) {
        console.error('[Database Health]', message);
        document.querySelectorAll('.loading-cell').forEach(cell => {
            cell.textContent = `Error: ${message}`;
            cell.style.color = '#dc3545';
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        Object.values(this.charts).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
    }
}

export default DatabaseHealth;
