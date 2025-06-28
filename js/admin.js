import { getSupabaseClient } from './supabase-client.js';

class AdminService {
    constructor(autoInitialize = true) {
        this.supabasePromise = getSupabaseClient();
        
        // Sort state tracking
        this.currentSortColumn = null;
        this.sortDirection = null; // 'asc', 'desc', or null
        this.originalData = null; // Store original unsorted data
        
        if (autoInitialize) {
            this.initialize();
        }
    }

    async initialize() {
        try {
            await this.supabasePromise;
            this.setupAdminInterface();
        } catch (error) {
            console.error('Failed to initialize AdminService:', error);
        }
    }

    // New method for standalone admin page initialization
    async initializeAsStandalone() {
        try {
            await this.supabasePromise;
            this.setupEventListeners();
            this.loadSubjects();
            this.loadSummaryAnalytics();
            this.loadFlaggedCards();
        } catch (error) {
            console.error('Failed to initialize standalone AdminService:', error);
        }
    }

    async getSupabase() {
        return await this.supabasePromise;
    }

    setupAdminInterface() {
        // Only show admin interface if user is admin (for overlay mode in main app)
        this.checkAdminAccess().then(isAdmin => {
            if (isAdmin) {
                this.showAdminPanel();
                this.loadFlaggedCards();
                this.setupEventListeners();
            }
        });
    }

    async checkAdminAccess() {
        try {
            const supabase = await this.getSupabase();
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) return false;

            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('user_tier, is_admin')
                .eq('id', user.id)
                .single();

            if (profileError) return false;

            return profile?.user_tier === 'admin' || profile?.is_admin === true;
        } catch (error) {
            console.error('Error checking admin access:', error);
            return false;
        }
    }

    showAdminPanel() {
        // Only create overlay panel if we're not on the standalone admin page
        if (window.location.pathname.includes('admin.html')) {
            // We're on the standalone admin page, don't create overlay
            return;
        }
        
        // Create admin panel if it doesn't exist
        if (!document.getElementById('admin-panel')) {
            const adminPanel = document.createElement('div');
            adminPanel.id = 'admin-panel';
            adminPanel.innerHTML = `
                <div class="admin-header">
                    <h2>Admin Analytics Dashboard</h2>
                    <div class="admin-header-controls">
                        <button id="toggle-analytics" class="btn btn-primary">Analytics</button>
                        <button id="toggle-management" class="btn btn-secondary">Management</button>
                        <button id="toggle-admin-panel" class="btn btn-secondary">Hide</button>
                    </div>
                </div>
                <div class="admin-content">
                    <!-- Analytics Section -->
                    <div id="analytics-section" class="admin-main-section">
                        <div class="analytics-tabs">
                            <button class="analytics-tab active" data-tab="summary">Summary</button>
                            <button class="analytics-tab" data-tab="difficulty">Difficulty</button>
                            <button class="analytics-tab" data-tab="export">Export</button>
                        </div>
                        
                        <!-- Summary Tab -->
                        <div id="summary-tab" class="analytics-tab-content active">
                            <div class="analytics-summary">
                                <div class="summary-stats">
                                    <div class="stat-card">
                                        <h4>Total Cards</h4>
                                        <span id="total-cards-count">-</span>
                                    </div>
                                    <div class="stat-card">
                                        <h4>Problem Cards</h4>
                                        <span id="problem-cards-count">-</span>
                                    </div>
                                    <div class="stat-card">
                                        <h4>Avg Response Time</h4>
                                        <span id="avg-response-time">-</span>
                                    </div>
                                    <div class="stat-card">
                                        <h4>Overall Again %</h4>
                                        <span id="overall-again-percentage">-</span>
                                    </div>
                                    <div class="stat-card">
                                        <h4>Avg Failed Attempts</h4>
                                        <span id="avg-failed-attempts">-</span>
                                    </div>
                                </div>
                                <div class="filters-section">
                                    <select id="subject-filter" class="form-select">
                                        <option value="">All Subjects</option>
                                    </select>
                                    <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
                                </div>
                                <div id="problem-cards-list" class="analytics-table-container"></div>
                            </div>
                        </div>
                        
                        <!-- Difficulty Tab -->
                        <div id="difficulty-tab" class="analytics-tab-content">
                            <div class="tab-header">
                                <h3>Difficulty Consistency Analysis</h3>
                                <div class="difficulty-filters">
                                    <select id="difficulty-classification-filter" class="form-select">
                                        <option value="">All Classifications</option>
                                        <option value="optimal">Optimal</option>
                                        <option value="consistently_hard">Consistently Hard</option>
                                        <option value="highly_variable">Highly Variable</option>
                                        <option value="moderately_variable">Moderately Variable</option>
                                    </select>
                                    <button id="refresh-difficulty" class="btn btn-primary">Refresh</button>
                                </div>
                            </div>
                            <div id="difficulty-analytics" class="analytics-table-container"></div>
                        </div>
                        
                        <!-- Export Tab -->
                        <div id="export-tab" class="analytics-tab-content">
                            <div class="export-section">
                                <h3>Export Analytics Data</h3>
                                <div class="export-options">
                                    <label><input type="checkbox" id="export-summary" checked> Summary Analytics</label>
                                    <label><input type="checkbox" id="export-difficulty" checked> Difficulty Analysis</label>
                                </div>
                                <button id="export-csv" class="btn btn-success">Export to CSV</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Management Section -->
                    <div id="management-section" class="admin-main-section hidden">
                        <div class="admin-section">
                            <h3>Flagged Cards</h3>
                            <div id="flagged-cards-list"></div>
                            <button id="refresh-flagged" class="btn btn-primary">Refresh</button>
                        </div>
                        <div class="admin-section">
                            <h3>Card Management</h3>
                            <div class="form-group">
                                <input type="text" id="card-search" placeholder="Search cards..." class="form-input">
                                <button id="search-cards" class="btn btn-primary">Search</button>
                            </div>
                            <div id="card-search-results"></div>
                        </div>
                        <div class="admin-section">
                            <h3>User Management</h3>
                            <div class="form-group">
                                <input type="email" id="user-email" placeholder="User email..." class="form-input">
                                <select id="user-tier" class="form-select">
                                    <option value="free">Free</option>
                                    <option value="paid">Paid</option>
                                    <option value="admin">Admin</option>
                                </select>
                                <button id="update-user-tier" class="btn btn-primary">Update Tier</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            adminPanel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 800px;
                max-width: 90vw;
                max-height: 85vh;
                overflow-y: auto;
                background: white;
                border: 2px solid #007bff;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                font-family: system-ui, -apple-system, sans-serif;
            `;
            document.body.appendChild(adminPanel);

            // Add CSS styles
            if (!document.getElementById('admin-styles')) {
                const styles = document.createElement('style');
                styles.id = 'admin-styles';
                styles.textContent = `
                    .admin-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #ddd;
                    }
                    .admin-header h2 {
                        margin: 0;
                        color: #007bff;
                    }
                    .admin-header-controls {
                        display: flex;
                        gap: 10px;
                    }
                    .admin-main-section {
                        margin-bottom: 20px;
                    }
                    .admin-section {
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid #eee;
                    }
                    .admin-section:last-child {
                        border-bottom: none;
                    }
                    .admin-section h3 {
                        margin: 0 0 10px 0;
                        color: #333;
                        font-size: 16px;
                    }
                    
                    /* Analytics Styles */
                    .analytics-tabs {
                        display: flex;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #e9ecef;
                    }
                    .analytics-tab {
                        padding: 10px 20px;
                        border: none;
                        background: none;
                        cursor: pointer;
                        font-size: 14px;
                        color: #6c757d;
                        border-bottom: 2px solid transparent;
                        transition: all 0.2s;
                    }
                    .analytics-tab.active {
                        color: #007bff;
                        border-bottom-color: #007bff;
                        font-weight: 600;
                    }
                    .analytics-tab:hover {
                        color: #007bff;
                        background-color: #f8f9fa;
                    }
                    .analytics-tab-content {
                        display: none;
                    }
                    .analytics-tab-content.active {
                        display: block;
                    }
                    
                    /* Summary Stats */
                    .summary-stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }
                    .stat-card {
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 8px;
                        text-align: center;
                        border: 1px solid #e9ecef;
                    }
                    .stat-card h4 {
                        margin: 0 0 5px 0;
                        font-size: 12px;
                        color: #6c757d;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .stat-card span {
                        font-size: 24px;
                        font-weight: bold;
                        color: #007bff;
                    }
                    
                    /* Filters */
                    .filters-section {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 20px;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    .tab-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    .difficulty-filters {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }
                    
                    /* Analytics Tables */
                    .analytics-table-container {
                        max-height: 400px;
                        overflow-y: auto;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                    }
                    .analytics-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    .analytics-table th {
                        background: #f8f9fa;
                        padding: 10px 8px;
                        text-align: left;
                        border-bottom: 1px solid #e9ecef;
                        font-weight: 600;
                        color: #495057;
                        position: sticky;
                        top: 0;
                        z-index: 10;
                    }
                    .analytics-table td {
                        padding: 8px;
                        border-bottom: 1px solid #f8f9fa;
                        vertical-align: top;
                    }
                    .analytics-table tr:hover {
                        background-color: #f8f9fa;
                    }
                    .analytics-table .problem-score {
                        font-weight: bold;
                    }
                    .analytics-table .problem-score.high {
                        color: #dc3545;
                    }
                    .analytics-table .problem-score.medium {
                        color: #ffc107;
                    }
                    .analytics-table .problem-score.low {
                        color: #28a745;
                    }
                    .analytics-table .card-question {
                        max-width: 200px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .analytics-table .classification-optimal {
                        color: #28a745;
                        font-weight: bold;
                    }
                    .analytics-table .classification-hard {
                        color: #dc3545;
                    }
                    .analytics-table .classification-variable {
                        color: #ffc107;
                    }
                    
                    /* Export Section */
                    .export-section {
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }
                    .export-options {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        margin: 15px 0;
                    }
                    .export-options label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                    }
                    
                    /* Form Elements */
                    .form-group {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 10px;
                        flex-wrap: wrap;
                    }
                    .form-input, .form-select {
                        flex: 1;
                        min-width: 120px;
                        padding: 8px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                    }
                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background-color 0.2s;
                        white-space: nowrap;
                    }
                    .btn:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    .btn-primary {
                        background-color: #007bff;
                        color: white;
                    }
                    .btn-primary:hover:not(:disabled) {
                        background-color: #0056b3;
                    }
                    .btn-secondary {
                        background-color: #6c757d;
                        color: white;
                    }
                    .btn-secondary:hover:not(:disabled) {
                        background-color: #545b62;
                    }
                    .btn-danger {
                        background-color: #dc3545;
                        color: white;
                    }
                    .btn-danger:hover:not(:disabled) {
                        background-color: #c82333;
                    }
                    .btn-success {
                        background-color: #28a745;
                        color: white;
                    }
                    .btn-success:hover:not(:disabled) {
                        background-color: #1e7e34;
                    }
                    .btn-warning {
                        background-color: #ffc107;
                        color: #212529;
                    }
                    .btn-warning:hover:not(:disabled) {
                        background-color: #e0a800;
                    }
                    
                    /* Flagged Cards (existing styles) */
                    .flagged-card {
                        background: #fff3cd;
                        border: 1px solid #ffeaa7;
                        border-radius: 4px;
                        padding: 10px;
                        margin-bottom: 10px;
                    }
                    .flagged-card.admin-flagged {
                        background: #f8d7da;
                        border: 1px solid #f1aeb5;
                        border-left: 4px solid #dc3545;
                    }
                    .flagged-card.user-flagged {
                        background: #fff3cd;
                        border: 1px solid #ffeaa7;
                        border-left: 4px solid #ffc107;
                    }
                    .flagged-card h4 {
                        margin: 0 0 5px 0;
                        font-size: 14px;
                        color: #856404;
                    }
                    .flagged-card p {
                        margin: 5px 0;
                        font-size: 12px;
                        color: #666;
                    }
                    .card-actions {
                        margin-top: 10px;
                        display: flex;
                        gap: 5px;
                        flex-wrap: wrap;
                    }
                    
                    /* Utility Classes */
                    .hidden {
                        display: none !important;
                    }
                    .text-center {
                        text-align: center;
                    }
                    .text-muted {
                        color: #6c757d;
                    }
                    .alert {
                        padding: 12px 16px;
                        margin-bottom: 16px;
                        border: 1px solid transparent;
                        border-radius: 4px;
                    }
                    .alert-info {
                        color: #0c5460;
                        background-color: #d1ecf1;
                        border-color: #bee5eb;
                    }
                    .alert-danger {
                        color: #721c24;
                        background-color: #f8d7da;
                        border-color: #f5c6cb;
                    }
                `;
                document.head.appendChild(styles);
            }
        }
    }

    setupEventListeners() {
        // Panel toggle (only for overlay mode)
        document.getElementById('toggle-admin-panel')?.addEventListener('click', () => {
            const content = document.querySelector('#admin-panel .admin-content');
            const button = document.getElementById('toggle-admin-panel');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                button.textContent = 'Hide';
            } else {
                content.style.display = 'none';
                button.textContent = 'Show';
            }
        });

        // Section toggles
        document.getElementById('toggle-analytics')?.addEventListener('click', () => {
            this.showSection('analytics');
        });

        document.getElementById('toggle-management')?.addEventListener('click', () => {
            this.showSection('management');
        });

        // Analytics tabs
        document.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchAnalyticsTab(tab.dataset.tab);
            });
        });

        // Analytics actions
        document.getElementById('apply-filters')?.addEventListener('click', () => {
            this.loadSummaryAnalytics();
        });

        document.getElementById('refresh-difficulty')?.addEventListener('click', () => {
            this.loadDifficultyAnalytics();
        });

        document.getElementById('apply-flagged-filters')?.addEventListener('click', () => {
            this.loadFlaggedCardsAnalytics();
        });

        document.getElementById('export-csv')?.addEventListener('click', () => {
            this.exportAnalyticsData();
        });

        // Management actions (existing)
        document.getElementById('refresh-flagged')?.addEventListener('click', () => {
            this.loadFlaggedCards();
        });

        document.getElementById('search-cards')?.addEventListener('click', () => {
            this.searchCards();
        });

        document.getElementById('update-user-tier')?.addEventListener('click', () => {
            this.updateUserTier();
        });

        // Initialize analytics
        this.loadSubjects();
        this.loadSummaryAnalytics();
    }

    async loadFlaggedCards() {
        try {
            const supabase = await this.getSupabase();
            
            // Get admin-flagged cards
            const { data: adminFlagged, error: adminError } = await supabase
                .from('cards')
                .select('id, question, answer, flagged_reason, flagged_at, flagged_by')
                .eq('flagged_for_review', true)
                .order('flagged_at', { ascending: false });

            if (adminError) throw adminError;

            // Get user-flagged cards
            const { data: userFlagged, error: userError } = await supabase
                .rpc('get_flagged_cards_for_admin');

            if (userError) {
                console.warn('Could not load user-flagged cards:', userError);
            }

            const container = document.getElementById('flagged-cards-list');
            if (!container) return;

            let html = '';

            // Admin flagged section
            if (adminFlagged && adminFlagged.length > 0) {
                html += '<h3>Admin Flagged Cards</h3>';
                html += adminFlagged.map(card => `
                    <div class="flagged-card admin-flagged">
                        <h4>Card ID: ${card.id}</h4>
                        <p><strong>Question:</strong> ${card.question}</p>
                        <p><strong>Answer:</strong> ${card.answer}</p>
                        <p><strong>Flagged:</strong> ${new Date(card.flagged_at).toLocaleString()}</p>
                        <p><strong>Reason:</strong> ${card.flagged_reason || 'No reason provided'}</p>
                        <div class="card-actions">
                            <button class="btn btn-success" onclick="adminService.unflagCard('${card.id}')">Approve</button>
                            <button class="btn btn-danger" onclick="adminService.deleteCard('${card.id}')">Delete</button>
                        </div>
                    </div>
                `).join('');
            }

            // User flagged section
            if (userFlagged && userFlagged.length > 0) {
                html += '<h3>User Reported Cards</h3>';
                html += userFlagged.map(card => `
                    <div class="flagged-card user-flagged">
                        <h4>Card ID: ${card.card_id}</h4>
                        <p><strong>Question:</strong> ${card.question}</p>
                        <p><strong>Answer:</strong> ${card.answer}</p>
                        <p><strong>Reports:</strong> ${card.flag_count}</p>
                        <p><strong>Latest Report:</strong> ${new Date(card.latest_flag_date).toLocaleString()}</p>
                        <p><strong>Reasons:</strong> ${card.flag_reasons.join(', ')}</p>
                        ${card.flag_comments.filter(c => c && c.trim()).length > 0 ? 
                            `<p><strong>Comments:</strong> ${card.flag_comments.filter(c => c && c.trim()).join('; ')}</p>` : ''
                        }
                        <div class="card-actions">
                            <button class="btn btn-secondary" onclick="adminService.resolveUserFlags('${card.card_id}', 'dismissed')">Dismiss Reports</button>
                            <button class="btn btn-warning" onclick="adminService.resolveUserFlags('${card.card_id}', 'card_updated')">Mark as Fixed</button>
                            <button class="btn btn-danger" onclick="adminService.resolveUserFlags('${card.card_id}', 'card_removed')">Remove Card</button>
                        </div>
                    </div>
                `).join('');
            }

            if (!html) {
                container.innerHTML = '<p>No flagged cards found.</p>';
            } else {
                container.innerHTML = html;
            }

        } catch (error) {
            console.error('Error loading flagged cards:', error);
            const container = document.getElementById('flagged-cards-list');
            if (container) {
                container.innerHTML = '<p>Error loading flagged cards.</p>';
            }
        }
    }

    async unflagCard(cardId) {
        try {
            const supabase = await this.getSupabase();
            const { error } = await supabase
                .from('cards')
                .update({
                    flagged_for_review: false,
                    flagged_by: null,
                    flagged_reason: null,
                    flagged_at: null
                })
                .eq('id', cardId);

            if (error) throw error;

            // Refresh the flagged cards list
            this.loadFlaggedCards();
            
        } catch (error) {
            console.error('Error unflagging card:', error);
            alert('Failed to approve card. Please try again.');
        }
    }

    async deleteCard(cardId) {
        if (!confirm('Are you sure you want to delete this card? This action cannot be undone.')) {
            return;
        }

        try {
            const supabase = await this.getSupabase();
            const { error } = await supabase
                .from('cards')
                .delete()
                .eq('id', cardId);

            if (error) throw error;

            // Refresh the flagged cards list
            this.loadFlaggedCards();
            
        } catch (error) {
            console.error('Error deleting card:', error);
            alert('Failed to delete card. Please try again.');
        }
    }

    async resolveUserFlags(cardId, resolutionAction) {
        try {
            const supabase = await this.getSupabase();
            
            // Get all unresolved flags for this card
            const { data: flags, error: flagsError } = await supabase
                .from('user_card_flags')
                .select('id')
                .eq('card_id', cardId)
                .is('resolved_at', null);

            if (flagsError) throw flagsError;

            if (!flags || flags.length === 0) {
                alert('No unresolved flags found for this card');
                return;
            }

            // Resolve all flags
            const resolvePromises = flags.map(flag => 
                supabase.rpc('resolve_card_flag', {
                    p_flag_id: flag.id,
                    p_resolution_action: resolutionAction
                })
            );

            const results = await Promise.all(resolvePromises);
            
            // Check if any failed
            const errors = results.filter(result => result.error);
            if (errors.length > 0) {
                throw new Error(`Failed to resolve ${errors.length} flags`);
            }

            // If action is to remove card, delete it
            if (resolutionAction === 'card_removed') {
                const { error: deleteError } = await supabase
                    .from('cards')
                    .delete()
                    .eq('id', cardId);

                if (deleteError) throw deleteError;
                alert(`Card removed and ${flags.length} reports resolved`);
            } else {
                const actionText = resolutionAction === 'dismissed' ? 'dismissed' : 'marked as fixed';
                alert(`${flags.length} reports ${actionText} successfully`);
            }

            // Refresh the flagged cards list
            this.loadFlaggedCards();

        } catch (error) {
            console.error('Error resolving user flags:', error);
            alert('Failed to resolve flags: ' + (error.message || 'Unknown error'));
        }
    }

    async flagCard(cardId, reason) {
        try {
            const supabase = await this.getSupabase();
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('cards')
                .update({
                    flagged_for_review: true,
                    flagged_by: user.id,
                    flagged_reason: reason,
                    flagged_at: new Date().toISOString()
                })
                .eq('id', cardId);

            if (error) throw error;

            return true;
        } catch (error) {
            console.error('Error flagging card:', error);
            return false;
        }
    }

    async searchCards() {
        const searchTerm = document.getElementById('card-search')?.value?.trim();
        if (!searchTerm) return;

        try {
            const supabase = await this.getSupabase();
            const { data: cards, error } = await supabase
                .from('cards')
                .select('id, question, answer, flagged_for_review')
                .or(`question.ilike.%${searchTerm}%,answer.ilike.%${searchTerm}%`)
                .limit(10);

            if (error) throw error;

            const container = document.getElementById('card-search-results');
            if (!container) return;

            if (!cards || cards.length === 0) {
                container.innerHTML = '<p>No cards found.</p>';
                return;
            }

            container.innerHTML = cards.map(card => `
                <div class="flagged-card">
                    <h4>Card ID: ${card.id}</h4>
                    <p><strong>Question:</strong> ${card.question}</p>
                    <p><strong>Answer:</strong> ${card.answer}</p>
                    <p><strong>Status:</strong> ${card.flagged_for_review ? 'Flagged' : 'Active'}</p>
                    <div class="card-actions">
                        ${!card.flagged_for_review ? 
                            `<button class="btn btn-danger" onclick="adminService.promptFlagCard('${card.id}')">Flag</button>` :
                            `<button class="btn btn-success" onclick="adminService.unflagCard('${card.id}')">Unflag</button>`
                        }
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error searching cards:', error);
            const container = document.getElementById('card-search-results');
            if (container) {
                container.innerHTML = '<p>Error searching cards.</p>';
            }
        }
    }

    promptFlagCard(cardId) {
        const reason = prompt('Enter reason for flagging this card:');
        if (reason !== null) {
            this.flagCard(cardId, reason).then(success => {
                if (success) {
                    this.searchCards(); // Refresh search results
                } else {
                    alert('Failed to flag card. Please try again.');
                }
            });
        }
    }

    async updateUserTier() {
        const email = document.getElementById('user-email')?.value?.trim();
        const tier = document.getElementById('user-tier')?.value;

        if (!email || !tier) {
            alert('Please enter both email and tier.');
            return;
        }

        try {
            const supabase = await this.getSupabase();
            const { error } = await supabase
                .from('user_profiles')
                .update({ user_tier: tier })
                .eq('email', email);

            if (error) throw error;

            alert(`Successfully updated user ${email} to ${tier} tier.`);
            document.getElementById('user-email').value = '';
            
        } catch (error) {
            console.error('Error updating user tier:', error);
            alert('Failed to update user tier. Please check the email and try again.');
        }
    }

    // New Analytics Methods

    showSection(sectionName) {
        const analyticsSection = document.getElementById('analytics-section');
        const managementSection = document.getElementById('management-section');
        const analyticsBtn = document.getElementById('toggle-analytics');
        const managementBtn = document.getElementById('toggle-management');

        if (sectionName === 'analytics') {
            analyticsSection?.classList.remove('hidden');
            managementSection?.classList.add('hidden');
            analyticsBtn?.classList.remove('btn-secondary');
            analyticsBtn?.classList.add('btn-primary');
            managementBtn?.classList.remove('btn-primary');
            managementBtn?.classList.add('btn-secondary');
        } else {
            analyticsSection?.classList.add('hidden');
            managementSection?.classList.remove('hidden');
            managementBtn?.classList.remove('btn-secondary');
            managementBtn?.classList.add('btn-primary');
            analyticsBtn?.classList.remove('btn-primary');
            analyticsBtn?.classList.add('btn-secondary');
        }
    }

    switchAnalyticsTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.analytics-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab content
        const targetContent = document.getElementById(`${tabName}-tab`);
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        
        if (targetContent) targetContent.classList.add('active');
        if (targetTab) targetTab.classList.add('active');

        // Load data for the tab if needed
        switch (tabName) {
            case 'summary':
                this.loadSummaryAnalytics();
                break;
            case 'difficulty':
                this.loadDifficultyAnalytics();
                break;
            case 'flagged':
                this.loadFlaggedCardsAnalytics();
                break;
        }
    }

    async loadSubjects() {
        try {
            const supabase = await this.getSupabase();
            const { data: subjects, error } = await supabase
                .from('subjects')
                .select('id, name')
                .order('name');

            if (error) throw error;

            const subjectFilter = document.getElementById('subject-filter');
            if (subjectFilter && subjects) {
                subjectFilter.innerHTML = '<option value="">All Subjects</option>';
                subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject.id;
                    option.textContent = subject.name;
                    subjectFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading subjects:', error);
        }
    }

    async loadSummaryAnalytics() {
        try {
            const supabase = await this.getSupabase();
            const subjectId = document.getElementById('subject-filter')?.value || null;

            console.log('Loading summary analytics...', { subjectId });

            // Try basic cards data first since it's more reliable
            console.log('Fetching basic cards data...');
            let basicQuery = supabase
                .from('cards')
                .select(`
                    id, question, answer, subject_id, correct_reviews, incorrect_reviews, 
                    average_response_time_ms, user_flag_count, flagged_for_review,
                    subjects:subject_id(name),
                    review_history(rating)
                `);

            if (subjectId) {
                basicQuery = basicQuery.eq('subject_id', subjectId);
            }
            
            const { data: basicCards, error: basicError } = await basicQuery
                .order('total_reviews', { ascending: false })
                .limit(50);

            console.log('Basic cards result:', { data: basicCards, error: basicError });

            if (basicError) {
                console.error('Basic cards query failed:', basicError);
                throw basicError;
            }

            if (!basicCards || basicCards.length === 0) {
                console.log('No cards found with current filters');
                document.getElementById('problem-cards-list').innerHTML = '<p class="text-muted text-center">No cards found matching the current filters.</p>';
                
                // Still show stats even if no cards
                document.getElementById('total-cards-count').textContent = '0';
                document.getElementById('problem-cards-count').textContent = '0';
                document.getElementById('avg-response-time').textContent = '0ms';
                document.getElementById('overall-again-percentage').textContent = '0%';
                document.getElementById('avg-failed-attempts').textContent = '0';
                return;
            }

            // Transform basic data to match expected format
            const transformedData = basicCards.map(card => {
                // Calculate actual review count from review_history
                const actualReviewCount = card.review_history?.length || 0;
                
                // Count rating=1 entries for "again" percentage (matches analytics view logic)
                const againCount = card.review_history?.filter(review => review.rating === 1).length || 0;
                
                return {
                    card_id: card.id,
                    question: card.question,
                    answer: card.answer,
                    subject_id: card.subject_id,
                    subject_name: card.subjects?.name || 'Unknown',
                    total_reviews: actualReviewCount,
                    correct_reviews: card.correct_reviews,
                    incorrect_reviews: card.incorrect_reviews,
                    average_response_time_ms: card.average_response_time_ms,
                    user_flag_count: card.user_flag_count,
                    flagged_for_review: card.flagged_for_review,
                    // Calculate again percentage from actual rating=1 count
                    again_percentage: actualReviewCount > 0 
                        ? Math.round((againCount / actualReviewCount) * 100) 
                        : 0,
                    problem_score: (card.user_flag_count || 0) * 20 + (card.flagged_for_review ? 50 : 0)
                };
            });

            console.log('Transformed data:', transformedData);
            
            // Load failed attempts metric (system average)
            const { data: failedAttemptsData, error: failedAttemptsError } = await supabase
                .rpc('get_failed_attempts_before_good_rating');
            
            console.log('Failed attempts result:', { data: failedAttemptsData, error: failedAttemptsError });
            
            // Load per-card failed attempts data
            const { data: perCardFailedAttemptsData, error: perCardFailedAttemptsError } = await supabase
                .rpc('get_failed_attempts_per_card', {
                    p_subject_id: subjectId,
                    p_min_reviews: 5, // Default minimum reviews for meaningful analysis
                    p_limit: 50
                });
            
            console.log('Per-card failed attempts result:', { data: perCardFailedAttemptsData, error: perCardFailedAttemptsError });
            
            // Merge per-card failed attempts data with transformed data
            if (perCardFailedAttemptsData && !perCardFailedAttemptsError) {
                const failedAttemptsMap = new Map();
                perCardFailedAttemptsData.forEach(card => {
                    failedAttemptsMap.set(card.card_id, card.failed_attempts_before_good);
                });
                
                // Add failed attempts data to each card
                transformedData.forEach(card => {
                    card.failed_attempts_before_good = failedAttemptsMap.get(card.card_id) || 0;
                });
            } else {
                // If per-card data failed to load, set all cards to 0
                transformedData.forEach(card => {
                    card.failed_attempts_before_good = 0;
                });
            }
            
            // Add system average failed attempts to display data
            const avgFailedAttempts = failedAttemptsData && failedAttemptsData.length > 0 
                ? failedAttemptsData[0].avg_failed_attempts_before_good 
                : 0;
            
            this.displaySummaryData(transformedData, true, avgFailedAttempts);

        } catch (error) {
            console.error('Error loading summary analytics:', error);
            const container = document.getElementById('problem-cards-list');
            if (container) {
                container.innerHTML = `<div class="alert alert-danger">Error loading analytics data: ${error.message}</div>`;
            }
            
            // Show error in stats too
            document.getElementById('total-cards-count').textContent = 'Error';
            document.getElementById('problem-cards-count').textContent = 'Error';
            document.getElementById('avg-response-time').textContent = 'Error';
            document.getElementById('overall-again-percentage').textContent = 'Error';
            document.getElementById('avg-failed-attempts').textContent = 'Error';
        }
    }

    displaySummaryData(analytics, isBasicData, avgFailedAttempts = 0) {
        // Update summary stats
        const totalCards = analytics?.length || 0;
        const problemCards = analytics?.filter(card => (card.problem_score || 0) > 30).length || 0;
        const avgResponseTime = analytics?.length > 0 
            ? Math.round(analytics.reduce((sum, card) => sum + (card.average_response_time_ms || 0), 0) / analytics.length)
            : 0;
        const overallAgainPercentage = analytics?.length > 0
            ? Math.round(analytics.reduce((sum, card) => sum + (card.again_percentage || 0), 0) / analytics.length)
            : 0;

        // Calculate relative difficulty score for each card
        if (analytics?.length > 0) {
            analytics.forEach(card => {
                const cardAgainPercentage = card.again_percentage || 0;
                
                if (overallAgainPercentage === 0) {
                    // When deck average is 0, cards with any "again" ratings are relatively difficult
                    card.relative_difficulty_score = cardAgainPercentage > 0 ? 100 : 0;
                } else {
                    // Calculate relative score: ((card_rate - deck_average) / deck_average) * 100
                    card.relative_difficulty_score = Math.round(
                        ((cardAgainPercentage - overallAgainPercentage) / overallAgainPercentage) * 100
                    );
                }
            });
        }

        document.getElementById('total-cards-count').textContent = totalCards;
        document.getElementById('problem-cards-count').textContent = problemCards;
        document.getElementById('avg-response-time').textContent = `${avgResponseTime}ms`;
        document.getElementById('overall-again-percentage').textContent = `${overallAgainPercentage}%`;
        document.getElementById('avg-failed-attempts').textContent = avgFailedAttempts || '0';

        // Show appropriate columns based on data availability
        const columns = [
            { key: 'question', label: 'Question', className: 'card-question' },
            { key: 'subject_name', label: 'Subject' },
            { key: 'total_reviews', label: 'Reviews' },
            { key: 'again_percentage', label: 'Again %', formatter: (val) => val ? `${val}%` : '-' },
            { 
                key: 'relative_difficulty_score', 
                label: 'Relative Difficulty', 
                formatter: (val) => {
                    if (val === undefined || val === null) return '-';
                    const sign = val >= 0 ? '+' : '';
                    const color = val > 50 ? 'red' : val > 20 ? 'orange' : val < -20 ? 'green' : 'black';
                    return {
                        html: `<span style="color: ${color}; font-weight: ${Math.abs(val) > 50 ? 'bold' : 'normal'}">${sign}${val}%</span>`
                    };
                }
            },
            { key: 'failed_attempts_before_good', label: 'Failed Attempts', formatter: (val) => val || '0' }
        ];

        if (!isBasicData) {
            columns.push(
                { key: 'consistency_score', label: 'Consistency', formatter: (val) => val ? Math.round(val) : '-' }
            );
        }

        columns.push(
            { key: 'problem_score', label: 'Problem Score', className: 'problem-score', formatter: this.formatProblemScore }
        );

        // Reset sort state for new data
        this.currentSortColumn = null;
        this.sortDirection = null;
        this.originalData = null;
        
        // Create problem cards table
        this.renderAnalyticsTable('problem-cards-list', analytics, columns);

        if (isBasicData) {
            const container = document.getElementById('problem-cards-list');
            const note = document.createElement('div');
            note.className = 'alert alert-info';
            note.innerHTML = '<strong>Note:</strong> Advanced analytics will appear after users begin reviewing cards with the updated tracking enabled.';
            container.insertBefore(note, container.firstChild);
        }
    }



    async loadDifficultyAnalytics() {
        try {
            const supabase = await this.getSupabase();
            const subjectId = document.getElementById('subject-filter')?.value || null;
            const minReviews = 5; // Default minimum reviews for meaningful analysis
            const classification = document.getElementById('difficulty-classification-filter')?.value || null;

            console.log('Loading difficulty analytics...', { subjectId, minReviews, classification });

            const { data: difficultyData, error } = await supabase
                .rpc('get_difficulty_consistency_analytics', {
                    p_subject_id: subjectId,
                    p_min_reviews: minReviews,
                    p_classification: classification,
                    p_limit: 50
                });

            console.log('Difficulty analytics result:', { data: difficultyData, error });

            if (error) throw error;

            // Reset sort state for new data
            this.currentSortColumn = null;
            this.sortDirection = null;
            this.originalData = null;

            this.renderAnalyticsTable('difficulty-analytics', difficultyData, [
                { key: 'question', label: 'Question', className: 'card-question' },
                { key: 'subject_name', label: 'Subject' },
                { key: 'total_reviews', label: 'Reviews' },
                { key: 'difficulty_classification', label: 'Classification', formatter: this.formatClassification },
                { key: 'avg_rating', label: 'Avg Rating', formatter: (val) => val ? val.toFixed(2) : '-' },
                { key: 'consistency_score', label: 'Consistency', formatter: (val) => val ? Math.round(val) : '-' },
                { key: 'rating_variance', label: 'Variance', formatter: (val) => val ? val.toFixed(2) : '-' }
            ]);

        } catch (error) {
            console.error('Error loading difficulty analytics:', error);
            document.getElementById('difficulty-analytics').innerHTML = `<p class="text-muted">Error loading difficulty data: ${error.message}</p>`;
        }
    }

    async loadFlaggedCardsAnalytics() {
        try {
            const supabase = await this.getSupabase();
            const reasonFilter = document.getElementById('flag-reason-filter')?.value || null;
            const statusFilter = document.getElementById('flag-status-filter')?.value || null;

            console.log('Loading flagged cards analytics...', { reasonFilter, statusFilter });

            // Build the query for flagged cards analytics
            let query = supabase
                .from('user_card_flags')
                .select(`
                    id, reason, comment, created_at, resolved_at, resolution_action,
                    card_id, user_id,
                    cards!inner(id, question, answer, subject_id, subjects!inner(name))
                `);

            // Apply filters
            if (reasonFilter) {
                query = query.eq('reason', reasonFilter);
            }
            
            if (statusFilter === 'resolved') {
                query = query.not('resolved_at', 'is', null);
            } else if (statusFilter === 'unresolved') {
                query = query.is('resolved_at', null);
            }

            const { data: flaggedData, error } = await query
                .order('created_at', { ascending: false })
                .limit(100);

            console.log('Flagged cards result:', { data: flaggedData, error });

            if (error) throw error;

            // Process data for analytics
            const processedData = this.processFlaggedCardsData(flaggedData || []);
            
            // Update summary statistics
            this.updateFlaggedCardsSummary(flaggedData || []);

            // Reset sort state for new data
            this.currentSortColumn = null;
            this.sortDirection = null;
            this.originalData = null;

            // Render the analytics table
            this.renderAnalyticsTable('flagged-cards-analytics', processedData, [
                { key: 'question', label: 'Question', className: 'card-question' },
                { key: 'subject_name', label: 'Subject' },
                { key: 'flag_count', label: 'Total Flags' },
                { key: 'reasons', label: 'Flag Reasons' },
                { key: 'latest_flag_date', label: 'Latest Flag', formatter: (val) => val ? new Date(val).toLocaleDateString() : '-' },
                { key: 'resolved_count', label: 'Resolved' },
                { key: 'unresolved_count', label: 'Unresolved' },
                { key: 'status', label: 'Status', formatter: this.formatFlagStatus }
            ]);

        } catch (error) {
            console.error('Error loading flagged cards analytics:', error);
            document.getElementById('flagged-cards-analytics').innerHTML = `<p class="text-muted">Error loading flagged cards data: ${error.message}</p>`;
        }
    }

    processFlaggedCardsData(flaggedData) {
        // Group flags by card
        const cardMap = new Map();
        
        flaggedData.forEach(flag => {
            const cardId = flag.card_id;
            
            if (!cardMap.has(cardId)) {
                cardMap.set(cardId, {
                    card_id: cardId,
                    question: flag.cards.question,
                    answer: flag.cards.answer,
                    subject_name: flag.cards.subjects.name,
                    flags: [],
                    flag_count: 0,
                    resolved_count: 0,
                    unresolved_count: 0,
                    reasons: new Set(),
                    latest_flag_date: null
                });
            }
            
            const card = cardMap.get(cardId);
            card.flags.push(flag);
            card.flag_count++;
            
            if (flag.resolved_at) {
                card.resolved_count++;
            } else {
                card.unresolved_count++;
            }
            
            card.reasons.add(flag.reason);
            
            if (!card.latest_flag_date || new Date(flag.created_at) > new Date(card.latest_flag_date)) {
                card.latest_flag_date = flag.created_at;
            }
        });
        
        // Convert to array and format
        return Array.from(cardMap.values()).map(card => ({
            ...card,
            reasons: Array.from(card.reasons).join(', '),
            status: card.unresolved_count > 0 ? 'Has Unresolved' : 'All Resolved'
        })).sort((a, b) => b.flag_count - a.flag_count); // Sort by flag count desc
    }

    updateFlaggedCardsSummary(flaggedData) {
        const totalFlags = flaggedData.length;
        const unresolvedFlags = flaggedData.filter(flag => !flag.resolved_at).length;
        const resolvedFlags = totalFlags - unresolvedFlags;
        const resolutionRate = totalFlags > 0 ? Math.round((resolvedFlags / totalFlags) * 100) : 0;
        
        // Count reasons
        const reasonCounts = {};
        flaggedData.forEach(flag => {
            reasonCounts[flag.reason] = (reasonCounts[flag.reason] || 0) + 1;
        });
        
        const mostCommonReason = Object.keys(reasonCounts).length > 0 
            ? Object.keys(reasonCounts).reduce((a, b) => reasonCounts[a] > reasonCounts[b] ? a : b)
            : 'None';
        
        // Update DOM elements
        document.getElementById('total-flagged-count').textContent = totalFlags;
        document.getElementById('unresolved-flagged-count').textContent = unresolvedFlags;
        document.getElementById('most-common-reason').textContent = mostCommonReason;
        document.getElementById('resolution-rate').textContent = `${resolutionRate}%`;
    }

    formatFlagStatus(status) {
        const statusColors = {
            'Has Unresolved': 'color: #dc3545; font-weight: bold;',
            'All Resolved': 'color: #28a745;'
        };
        
        return {
            html: `<span style="${statusColors[status] || ''}">${status}</span>`
        };
    }

    // Sorting functionality
    getSortValue(row, column) {
        let value = row[column.key];
        
        // Handle different data types
        switch (column.key) {
            case 'total_reviews':
            case 'failed_attempts_before_good':
            case 'flag_count':
            case 'resolved_count':
            case 'unresolved_count':
                return typeof value === 'number' ? value : 0;
                
            case 'again_percentage':
                return typeof value === 'number' ? value : 0;
                
            case 'relative_difficulty_score':
                return typeof value === 'number' ? value : 0;
                
            case 'problem_score':
                return typeof value === 'number' ? value : (value === '-' ? -1 : 0);
                
            case 'latest_flag_date':
                return value ? new Date(value).getTime() : 0;
                
            case 'question':
            case 'subject_name':
            case 'reasons':
            case 'status':
                return (value || '').toString().toLowerCase();
                
            default:
                return value || '';
        }
    }

    sortTableData(data, column, direction) {
        if (!data || !column) return data;
        
        return [...data].sort((a, b) => {
            const valueA = this.getSortValue(a, column);
            const valueB = this.getSortValue(b, column);
            
            let comparison = 0;
            
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
            } else {
                comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
            }
            
            return direction === 'desc' ? -comparison : comparison;
        });
    }

    handleColumnSort(containerId, data, columns, columnIndex) {
        const column = columns[columnIndex];
        
        // Determine next sort direction
        let newDirection;
        if (this.currentSortColumn === column.key) {
            // Cycling through: asc -> desc -> original -> asc
            if (this.sortDirection === 'asc') {
                newDirection = 'desc';
            } else if (this.sortDirection === 'desc') {
                newDirection = null; // Return to original
            } else {
                newDirection = 'asc';
            }
        } else {
            newDirection = 'asc';
        }
        
        this.currentSortColumn = newDirection ? column.key : null;
        this.sortDirection = newDirection;
        
        // Sort the data
        const sortedData = newDirection ? 
            this.sortTableData(data, column, newDirection) : 
            this.originalData || data;
        
        // Re-render the table
        this.renderAnalyticsTable(containerId, sortedData, columns);
    }

    renderAnalyticsTable(containerId, data, columns) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No data available with current filters.</p>';
            return;
        }

        // Store original data for reset functionality
        if (!this.originalData) {
            this.originalData = [...data];
        }

        const table = document.createElement('table');
        table.className = 'analytics-table';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        columns.forEach((col, index) => {
            const th = document.createElement('th');
            th.className = 'sortable';
            
            // Add column label
            const labelSpan = document.createElement('span');
            labelSpan.textContent = col.label;
            th.appendChild(labelSpan);
            
            // Add sort arrow
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            
            if (this.currentSortColumn === col.key) {
                th.classList.add('sorted');
                arrow.classList.add('active');
                arrow.textContent = this.sortDirection === 'asc' ? '▲' : '▼';
            } else {
                arrow.textContent = '⚬'; // neutral indicator
            }
            
            th.appendChild(arrow);
            
            // Add click handler
            th.addEventListener('click', () => {
                this.handleColumnSort(containerId, data, columns, index);
            });
            
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        data.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                let value = row[col.key];
                
                if (col.formatter) {
                    if (typeof col.formatter === 'function') {
                        const formatted = col.formatter(value);
                        if (typeof formatted === 'object' && formatted.html) {
                            td.innerHTML = formatted.html;
                            if (formatted.className) td.className = formatted.className;
                        } else {
                            td.textContent = formatted;
                        }
                    } else {
                        td.textContent = col.formatter;
                    }
                } else {
                    td.textContent = value !== null && value !== undefined ? value : '-';
                }
                
                if (col.className) {
                    td.classList.add(col.className);
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        container.innerHTML = '';
        container.appendChild(table);
    }

    formatProblemScore(score) {
        if (!score) return '-';
        const roundedScore = Math.round(score);
        let className = 'problem-score ';
        if (roundedScore >= 50) className += 'high';
        else if (roundedScore >= 25) className += 'medium';
        else className += 'low';
        
        return {
            html: roundedScore.toString(),
            className: className
        };
    }

    formatClassification(classification) {
        if (!classification) return '-';
        let className = '';
        switch (classification) {
            case 'optimal':
                className = 'classification-optimal';
                break;
            case 'consistently_hard':
                className = 'classification-hard';
                break;
            case 'highly_variable':
            case 'moderately_variable':
                className = 'classification-variable';
                break;
        }
        
        return {
            html: classification.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            className: className
        };
    }

    async exportAnalyticsData() {
        try {
            const exportSummary = document.getElementById('export-summary')?.checked;
            const exportDifficulty = document.getElementById('export-difficulty')?.checked;

            if (!exportSummary && !exportDifficulty) {
                alert('Please select at least one data type to export.');
                return;
            }

            const supabase = await this.getSupabase();
            const csvData = [];
            
            if (exportSummary) {
                const { data } = await supabase.from('card_analytics_summary').select('*').limit(1000);
                if (data) {
                    csvData.push(['=== SUMMARY ANALYTICS ===']);
                    csvData.push(Object.keys(data[0]));
                    data.forEach(row => csvData.push(Object.values(row)));
                    csvData.push([]);
                }
            }

            if (exportDifficulty) {
                const { data } = await supabase.from('card_difficulty_consistency').select('*').limit(1000);
                if (data) {
                    csvData.push(['=== DIFFICULTY CONSISTENCY ANALYTICS ===']);
                    csvData.push(Object.keys(data[0]));
                    data.forEach(row => csvData.push(Object.values(row)));
                }
            }

            // Create and download CSV
            const csvContent = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spaced-rep-analytics-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error exporting analytics data:', error);
            alert('Failed to export data. Please try again.');
        }
    }
}

// Only initialize admin service in overlay mode (main app)
if (!window.location.pathname.includes('admin.html')) {
    // Initialize admin service for overlay mode
    const adminService = new AdminService();
    
    // Make it globally available for onclick handlers
    window.adminService = adminService;
}

export default AdminService;