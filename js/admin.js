import { getSupabaseClient } from './supabase-client.js';
import NavigationController from './navigation.js';
import auth from './auth.js';

class AdminService {
    constructor(autoInitialize = true) {
        this.supabasePromise = getSupabaseClient();
        
        if (autoInitialize) {
            this.initialize();
        }
    }

    async initialize() {
        try {
            await this.supabasePromise;
            
            // Initialize navigation controller
            this.navigationController = new NavigationController();
            
            this.setupAdminInterface();
        } catch (error) {
            console.error('Failed to initialize AdminService:', error);
        }
    }

    // New method for standalone admin page initialization
    async initializeAsStandalone() {
        try {
            await this.supabasePromise;
            
            // Initialize navigation controller
            this.navigationController = new NavigationController();
            
            this.setupEventListeners();
            this.loadSubjects();
            this.loadSubjectsForManagement();
            this.loadAnalytics();
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

    /**
     * Check admin access (CLIENT-SIDE ONLY - FOR UI DISPLAY)
     * 
     * ⚠️  SECURITY WARNING: This is a client-side check for UI optimization only.
     *     For security-sensitive operations, use verifyAdminAccessSecure() instead.
     */
    async checkAdminAccess() {
        try {
            const supabase = await this.getSupabase();
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) return false;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('user_tier, is_admin')
                .eq('id', user.id)
                .single();

            if (profileError) return false;

            return profile?.is_admin === true;
        } catch (error) {
            console.error('Error checking admin access:', error);
            return false;
        }
    }

    /**
     * Verify admin access with server-side validation (SECURE)
     * 
     * ✅ SECURE: This method performs server-side verification using database functions
     *    that enforce proper RLS policies and server-side authentication.
     * 
     * Use this for all security-sensitive admin operations.
     */
    async verifyAdminAccessSecure() {
        try {
            // Use the auth service's secure verification method
            return await auth.verifyAdminAccess();
        } catch (error) {
            console.error('Secure admin verification failed:', error);
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
                        <div class="analytics-header">
                            <h3>Card Analytics</h3>
                            <div class="analytics-controls">
                                <select id="subject-filter" class="form-select">
                                    <option value="">All Subjects</option>
                                </select>
                                <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
                                <button id="export-csv" class="btn btn-success">Export CSV</button>
                            </div>
                        </div>
                        
                        <!-- Summary Stats -->
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
                        
                        <!-- Analytics Table -->
                        <div id="analytics-table" class="analytics-table-container"></div>
                    </div>
                    
                    <!-- Management Section -->
                    <div id="management-section" class="admin-main-section hidden">
                        <div class="admin-section">
                            <h3>Flagged Cards</h3>
                            <div id="flagged-cards-list"></div>
                            <button id="refresh-flagged" class="btn btn-primary">Refresh</button>
                        </div>
                        <div class="admin-section">
                            <h3>Deck Management</h3>
                            <div class="form-group">
                                <input type="text" id="deck-search" placeholder="Search decks..." class="form-input">
                                <button id="search-decks" class="btn btn-primary">Search</button>
                                <button id="view-all-decks" class="btn btn-secondary">View All</button>
                            </div>
                            <div id="deck-list" class="deck-list-container"></div>
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
                    .analytics-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #e9ecef;
                    }
                    .analytics-header h3 {
                        margin: 0;
                        color: #007bff;
                        font-size: 18px;
                    }
                    .analytics-controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
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

        // Analytics actions
        document.getElementById('apply-filters')?.addEventListener('click', () => {
            this.loadAnalytics();
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

        // Deck management actions
        document.getElementById('search-decks')?.addEventListener('click', () => {
            this.searchDecks();
        });

        document.getElementById('view-all-decks')?.addEventListener('click', () => {
            this.loadAllDecks();
        });

        // Subject management actions
        document.getElementById('refresh-subjects')?.addEventListener('click', () => {
            this.loadSubjectsForManagement();
        });

        document.getElementById('search-subjects')?.addEventListener('click', () => {
            this.searchSubjects();
        });

        document.getElementById('enable-selected')?.addEventListener('click', () => {
            this.bulkToggleSubjects(true);
        });

        document.getElementById('disable-selected')?.addEventListener('click', () => {
            this.bulkToggleSubjects(false);
        });


        // Initialize analytics
        this.loadSubjects();
        this.loadAnalytics();

        // Only load deck overview if container exists
        if (document.getElementById('deck-list')) {
            this.loadAllDecks();
        }
    }

    async loadFlaggedCards() {
        try {
            const supabase = await this.getSupabase();
            
            // Get admin-flagged cards with new fields
            const { data: adminFlagged, error: adminError } = await supabase
                .from('card_templates')
                .select('id, question, answer, subsection, tags, flagged_reason, flagged_at, flagged_by, total_reviews, correct_reviews, incorrect_reviews')
                .eq('flagged_for_review', true)
                .order('flagged_at', { ascending: false });

            if (adminError) throw adminError;

            // Get user-flagged cards with detailed information
            const { data: userFlagged, error: userError } = await supabase
                .from('user_card_flags')
                .select(`
                    id,
                    card_template_id,
                    reason,
                    comment,
                    created_at,
                    card_templates!inner (
                        id,
                        question,
                        answer,
                        subsection,
                        tags
                    )
                `)
                .is('resolved_at', null)
                .order('created_at', { ascending: false });

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
                        <p><strong>Question:</strong> ${this.escapeHtml(card.question)}</p>
                        <p><strong>Answer:</strong> ${this.escapeHtml(card.answer)}</p>
                        ${card.subsection ? `<p><strong>Section:</strong> ${this.escapeHtml(card.subsection)}</p>` : ''}
                        ${card.tags && card.tags.length > 0 ? `<p><strong>Tags:</strong> ${card.tags.map(t => this.escapeHtml(t)).join(', ')}</p>` : ''}
                        <p><strong>Reviews:</strong> Total: ${card.total_reviews || 0}, Correct: ${card.correct_reviews || 0}, Incorrect: ${card.incorrect_reviews || 0}</p>
                        <p><strong>Flagged:</strong> ${new Date(card.flagged_at).toLocaleString()}</p>
                        <p><strong>Reason:</strong> ${this.escapeHtml(card.flagged_reason || 'No reason provided')}</p>
                        <div class="card-actions">
                            <button class="btn btn-success" onclick="adminService.unflagCard('${card.id}')">Approve</button>
                            <button class="btn btn-danger" onclick="adminService.deleteCard('${card.id}')">Delete</button>
                        </div>
                    </div>
                `).join('');
            }

            // User flagged section - group by card template
            if (userFlagged && userFlagged.length > 0) {
                // Group flags by card template ID
                const groupedFlags = userFlagged.reduce((acc, flag) => {
                    const cardId = flag.card_template_id;
                    if (!acc[cardId]) {
                        acc[cardId] = {
                            card: flag.card_templates,
                            flags: []
                        };
                    }
                    acc[cardId].flags.push(flag);
                    return acc;
                }, {});

                html += '<h3>User Reported Cards</h3>';
                Object.entries(groupedFlags).forEach(([cardId, data]) => {
                    const card = data.card;
                    const flags = data.flags;
                    const reasons = [...new Set(flags.map(f => f.reason))];
                    const comments = flags.filter(f => f.comment && f.comment.trim()).map(f => f.comment);
                    const latestFlag = flags.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    
                    html += `
                        <div class="flagged-card user-flagged">
                            <h4>Card ID: ${cardId}</h4>
                            <p><strong>Question:</strong> ${this.escapeHtml(card.question)}</p>
                            <p><strong>Answer:</strong> ${this.escapeHtml(card.answer)}</p>
                            ${card.subsection ? `<p><strong>Section:</strong> ${this.escapeHtml(card.subsection)}</p>` : ''}
                            ${card.tags && card.tags.length > 0 ? `<p><strong>Tags:</strong> ${card.tags.map(t => this.escapeHtml(t)).join(', ')}</p>` : ''}
                            <p><strong>Reports:</strong> ${flags.length}</p>
                            <p><strong>Latest Report:</strong> ${new Date(latestFlag.created_at).toLocaleString()}</p>
                            <p><strong>Reasons:</strong> ${reasons.map(r => this.escapeHtml(r)).join(', ')}</p>
                            ${comments.length > 0 ? 
                                `<p><strong>Comments:</strong> ${comments.map(c => this.escapeHtml(c)).join('; ')}</p>` : ''
                            }
                            <div class="card-actions">
                                <button class="btn btn-secondary" onclick="adminService.resolveUserFlags('${cardId}', 'dismissed')">Dismiss Reports</button>
                                <button class="btn btn-warning" onclick="adminService.resolveUserFlags('${cardId}', 'card_updated')">Mark as Fixed</button>
                                <button class="btn btn-danger" onclick="adminService.resolveUserFlags('${cardId}', 'card_removed')">Remove Card</button>
                            </div>
                        </div>
                    `;
                });
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
            // SECURITY: Verify admin access server-side before critical operation
            const isAdminVerified = await this.verifyAdminAccessSecure();
            if (!isAdminVerified) {
                alert('Admin verification failed. Please refresh the page and try again.');
                return;
            }

            const supabase = await this.getSupabase();
            const { error } = await supabase
                .from('card_templates')
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
            // SECURITY: Verify admin access server-side before critical operation
            const isAdminVerified = await this.verifyAdminAccessSecure();
            if (!isAdminVerified) {
                alert('Admin verification failed. Please refresh the page and try again.');
                return;
            }

            const supabase = await this.getSupabase();
            const { error } = await supabase
                .from('card_templates')
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
            
            // Get all unresolved flags for this card with user info
            const { data: flags, error: flagsError } = await supabase
                .from('user_card_flags')
                .select('id, user_id, reason, comment, created_at')
                .eq('card_template_id', cardId)
                .is('resolved_at', null);

            if (flagsError) throw flagsError;

            if (!flags || flags.length === 0) {
                alert('No unresolved flags found for this card');
                return;
            }

            // Get current user for resolution tracking
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Authentication failed');

            // Resolve all flags using the new user flag resolution function
            const resolvePromises = flags.map(flag => 
                supabase.rpc('resolve_user_card_flag', {
                    p_flag_id: flag.id,
                    p_admin_id: user.id,
                    p_resolution_action: resolutionAction,
                    p_resolution_comment: `Admin resolved via bulk action: ${resolutionAction}`
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
                    .from('card_templates')
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
                .from('card_templates')
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
                .from('card_templates')
                .select('id, question, answer, subsection, tags, flagged_for_review, total_reviews, correct_reviews, incorrect_reviews, user_flag_count')
                .or(`question.ilike.%${searchTerm}%,answer.ilike.%${searchTerm}%,tags.cs.{${searchTerm}}`)
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
                    <p><strong>Question:</strong> ${this.escapeHtml(card.question)}</p>
                    <p><strong>Answer:</strong> ${this.escapeHtml(card.answer)}</p>
                    ${card.subsection ? `<p><strong>Section:</strong> ${this.escapeHtml(card.subsection)}</p>` : ''}
                    ${card.tags && card.tags.length > 0 ? `<p><strong>Tags:</strong> ${card.tags.map(t => this.escapeHtml(t)).join(', ')}</p>` : ''}
                    <p><strong>Reviews:</strong> Total: ${card.total_reviews || 0}, User Flags: ${card.user_flag_count || 0}</p>
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
                .from('profiles')
                .update({ 
                    user_tier: tier,
                    is_admin: tier === 'admin'
                })
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

    // Combined analytics loading function
    async loadAnalytics() {
        try {
            const supabase = await this.getSupabase();
            const subjectId = document.getElementById('subject-filter')?.value || null;


            // Load basic cards data with review statistics using new schema
            let basicQuery = supabase
                .from('card_templates')
                .select(`
                    id, question, answer, subject_id, subsection, tags,
                    total_reviews, correct_reviews, incorrect_reviews, 
                    average_response_time_ms, user_flag_count, flagged_for_review,
                    subjects:subject_id(name)
                `);

            if (subjectId) {
                basicQuery = basicQuery.eq('subject_id', subjectId);
            }
            
            const { data: basicCards, error: basicError } = await basicQuery
                .order('total_reviews', { ascending: false })
                .limit(100);

            if (basicError) throw basicError;

            if (!basicCards || basicCards.length === 0) {
                document.getElementById('analytics-table').innerHTML = '<p class="text-muted text-center">No cards found matching the current filters.</p>';
                this.updateSummaryStats([], 0);
                return;
            }

            // Process the data with new structure
            const processedData = this.processAnalyticsData(basicCards);
            
            // Get review statistics from reviews table
            const { data: reviewStats } = await supabase
                .from('reviews')
                .select('card_template_id, rating')
                .in('card_template_id', basicCards.map(c => c.id));
            
            // Calculate failed attempts (ratings of 0 = Again in new 0-3 scale)
            const failedAttempts = reviewStats?.filter(r => r.rating === 0).length || 0;
            const totalAttempts = reviewStats?.length || 0;
            const avgFailedAttempts = totalAttempts > 0 ? Math.round((failedAttempts / totalAttempts) * 100) / 100 : 0;
            
            // Update the interface
            this.updateSummaryStats(processedData, avgFailedAttempts);
            this.displayAnalyticsTable(processedData);

        } catch (error) {
            console.error('Error loading analytics:', error);
            document.getElementById('analytics-table').innerHTML = `<div class="alert alert-danger">Error loading analytics: ${error.message}</div>`;
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

    // Subject Management Functions
    async loadSubjectsForManagement() {
        try {
            const supabase = await this.getSupabase();
            
            // Get subjects with card count statistics
            const { data: subjects, error } = await supabase
                .from('subjects')
                .select(`
                    id,
                    name,
                    description,
                    is_active,
                    created_at,
                    creator_id,
                    is_public
                `)
                .order('name');

            if (error) throw error;

            // Get card counts for each subject
            const { data: cardCounts, error: countError } = await supabase
                .from('card_templates')
                .select('subject_id')
                .not('subject_id', 'is', null);

            if (countError) throw countError;

            // Count cards per subject
            const cardCountMap = {};
            cardCounts?.forEach(card => {
                cardCountMap[card.subject_id] = (cardCountMap[card.subject_id] || 0) + 1;
            });

            // Add card counts to subjects
            const subjectsWithCounts = subjects?.map(subject => ({
                ...subject,
                card_count: cardCountMap[subject.id] || 0
            }));

            this.displaySubjectsTable(subjectsWithCounts || []);
        } catch (error) {
            console.error('Error loading subjects for management:', error);
            this.showError('Failed to load subjects');
        } finally {
            document.getElementById('subjects-loading').style.display = 'none';
        }
    }

    displaySubjectsTable(subjects) {
        const container = document.getElementById('subjects-table');
        if (!container) return;

        if (subjects.length === 0) {
            container.innerHTML = '<p class="no-data">No subjects found</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'admin-table subjects-table';
        
        // Create header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th><input type="checkbox" id="select-all-subjects"></th>
                <th>Name</th>
                <th>Status</th>
                <th>Cards</th>
                <th>Public</th>
                <th>Created</th>
                <th>Actions</th>
            </tr>
        `;
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        subjects.forEach(subject => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="subject-checkbox" data-subject-id="${subject.id}"></td>
                <td>
                    <div class="subject-info">
                        <strong>${this.escapeHtml(subject.name)}</strong>
                        ${subject.description ? `<br><small class="text-muted">${this.escapeHtml(subject.description)}</small>` : ''}
                    </div>
                </td>
                <td>
                    <span class="status-badge ${subject.is_active ? 'status-active' : 'status-inactive'}">
                        ${subject.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>${subject.card_count}</td>
                <td>${subject.is_public ? 'Yes' : 'No'}</td>
                <td>${new Date(subject.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm toggle-subject-btn ${subject.is_active ? 'btn-warning' : 'btn-success'}" 
                            data-subject-id="${subject.id}" 
                            data-new-status="${!subject.is_active}">
                        ${subject.is_active ? 'Disable' : 'Enable'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.innerHTML = '';
        container.appendChild(table);

        // Set up select all functionality
        this.setupSubjectSelection();
        
        // Set up toggle button event listeners
        this.setupToggleButtons();
    }

    setupSubjectSelection() {
        const selectAll = document.getElementById('select-all-subjects');
        const checkboxes = document.querySelectorAll('.subject-checkbox');
        const enableBtn = document.getElementById('enable-selected');
        const disableBtn = document.getElementById('disable-selected');

        if (selectAll) {
            selectAll.addEventListener('change', () => {
                checkboxes.forEach(cb => cb.checked = selectAll.checked);
                this.updateBulkActionButtons();
            });
        }

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
                const noneChecked = Array.from(checkboxes).every(checkbox => !checkbox.checked);
                
                if (selectAll) {
                    selectAll.indeterminate = !allChecked && !noneChecked;
                    selectAll.checked = allChecked;
                }
                
                this.updateBulkActionButtons();
            });
        });
    }

    updateBulkActionButtons() {
        const checkedBoxes = document.querySelectorAll('.subject-checkbox:checked');
        const enableBtn = document.getElementById('enable-selected');
        const disableBtn = document.getElementById('disable-selected');
        
        const hasSelection = checkedBoxes.length > 0;
        
        if (enableBtn) enableBtn.disabled = !hasSelection;
        if (disableBtn) disableBtn.disabled = !hasSelection;
    }

    setupToggleButtons() {
        const toggleButtons = document.querySelectorAll('.toggle-subject-btn');
        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const subjectId = button.dataset.subjectId;
                const newStatus = button.dataset.newStatus === 'true';
                this.toggleSubjectStatus(subjectId, newStatus);
            });
        });
    }

    async toggleSubjectStatus(subjectId, newStatus) {
        try {
            const supabase = await this.getSupabase();
            
            // First check if user is admin
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError) {
                console.error('Auth error:', userError);
                throw new Error('Authentication failed');
            }

            if (!user) {
                throw new Error('User not authenticated');
            }

            // Verify admin access
            const isAdmin = await this.checkAdminAccess();
            if (!isAdmin) {
                throw new Error('Admin access required');
            }

            
            // First, let's verify the subject exists
            const { data: existingSubject, error: selectError } = await supabase
                .from('subjects')
                .select('id, name, is_active')
                .eq('id', subjectId)
                .single();

            if (selectError) {
                console.error('Error finding subject:', selectError);
                throw new Error(`Subject not found: ${selectError.message}`);
            }


            // Update subject status directly (admin has access via RLS)
            const { data, error } = await supabase
                .from('subjects')
                .update({ is_active: newStatus })
                .eq('id', subjectId)
                .select();

            if (error) {
                console.error('Supabase RPC error:', error);
                throw new Error(`Database error: ${error.message}`);
            }


            if (!data) {
                throw new Error('No data returned from update operation');
            }

            this.showSuccess(`Subject "${existingSubject.name}" ${newStatus ? 'enabled' : 'disabled'} successfully`);
            this.loadSubjectsForManagement(); // Refresh the table
            
            // Clear any cached sessions to ensure changes take effect immediately
            this.clearUserSessions();
        } catch (error) {
            console.error('Error toggling subject status:', error);
            this.showError(`Failed to update subject status: ${error.message}`);
        }
    }

    async bulkToggleSubjects(newStatus) {
        const checkedBoxes = document.querySelectorAll('.subject-checkbox:checked');
        const subjectIds = Array.from(checkedBoxes).map(cb => cb.dataset.subjectId);
        
        if (subjectIds.length === 0) return;

        const action = newStatus ? 'enable' : 'disable';
        const confirmed = confirm(`Are you sure you want to ${action} ${subjectIds.length} subject(s)?`);
        
        if (!confirmed) return;

        try {
            const supabase = await this.getSupabase();
            
            const { data, error } = await supabase
                .from('subjects')
                .update({ is_active: newStatus })
                .in('id', subjectIds)
                .select();

            if (error) {
                console.error('Bulk update error:', error);
                throw error;
            }

            
            const updatedCount = data?.updated_count || 0;
            this.showSuccess(`${updatedCount} subject(s) ${action}d successfully`);
            this.loadSubjectsForManagement(); // Refresh the table
            
            // Clear any cached sessions to ensure changes take effect immediately
            this.clearUserSessions();
        } catch (error) {
            console.error('Error bulk updating subjects:', error);
            this.showError(`Failed to update subjects: ${error.message}`);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSuccess(message) {
        // Simple success notification - could be enhanced with a proper notification system
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showError(message) {
        // Simple error notification - could be enhanced with a proper notification system
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    // Clear user sessions to ensure subject changes take effect immediately
    clearUserSessions() {
        try {
            // Clear the current user's session if they have one
            sessionStorage.removeItem('flashcard_session');
            
            // Also clear any other session-related data
            const sessionKeys = ['flashcard_session', 'session_data', 'current_session'];
            sessionKeys.forEach(key => {
                sessionStorage.removeItem(key);
                localStorage.removeItem(key); // Also clear localStorage just in case
            });
            
            
            // Show a notification that users should refresh their study sessions
            this.showInfo('Subject changes applied. Users should refresh their study sessions to see changes.');
        } catch (error) {
            console.error('Error clearing user sessions:', error);
        }
    }

    showInfo(message) {
        // Simple info notification
        const notification = document.createElement('div');
        notification.className = 'notification info';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #17a2b8;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }


    // Deck Management Functions
    async loadAllDecks() {
        try {
            const supabase = await this.getSupabase();
            
            // Get all decks with user information and card counts
            const { data: decks, error: decksError } = await supabase
                .from('decks')
                .select(`
                    id,
                    name,
                    description,
                    user_id,
                    daily_new_cards_limit,
                    daily_review_limit,
                    desired_retention,
                    is_active,
                    created_at,
                    profiles!inner(email, display_name)
                `)
                .order('created_at', { ascending: false })
                .limit(50);

            if (decksError) throw decksError;

            // Get card counts for each deck
            const deckIds = decks?.map(d => d.id) || [];

            // If there are no decks, display an empty list and exit early
            if (deckIds.length === 0) {
                this.displayDecks([], 'All Active Decks');
                this.showInfo('No decks found');
                return;
            }

            const { data: cardCounts, error: countError } = await supabase
                .from('user_cards')
                .select('deck_id')
                .in('deck_id', deckIds);

            if (countError) throw countError;

            // Count cards per deck
            const cardCountMap = {};
            cardCounts?.forEach(card => {
                cardCountMap[card.deck_id] = (cardCountMap[card.deck_id] || 0) + 1;
            });

            // Add card counts to decks
            const decksWithCounts = decks?.map(deck => ({
                ...deck,
                card_count: cardCountMap[deck.id] || 0
            }));

            this.displayDecks(decksWithCounts || [], 'All Active Decks');
        } catch (error) {
            console.error('Error loading all decks:', error);
            this.showError('Failed to load decks');
        }
    }

    async searchDecks() {
        const searchTerm = document.getElementById('deck-search')?.value?.trim();
        if (!searchTerm) {
            this.loadAllDecks();
            return;
        }

        try {
            const supabase = await this.getSupabase();
            
            // Search decks by name or description
            const { data: decks, error: decksError } = await supabase
                .from('decks')
                .select(`
                    id,
                    name,
                    description,
                    user_id,
                    daily_new_cards_limit,
                    daily_review_limit,
                    desired_retention,
                    is_active,
                    created_at,
                    profiles!inner(email, display_name)
                `)
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (decksError) throw decksError;

            // Get card counts for filtered decks
            const deckIds = decks?.map(d => d.id) || [];
            let cardCountMap = {};
            
            if (deckIds.length > 0) {
                const { data: cardCounts, error: countError } = await supabase
                    .from('user_cards')
                    .select('deck_id')
                    .in('deck_id', deckIds);

                if (countError) throw countError;

                cardCounts?.forEach(card => {
                    cardCountMap[card.deck_id] = (cardCountMap[card.deck_id] || 0) + 1;
                });
            }

            // Add card counts to decks
            const decksWithCounts = decks?.map(deck => ({
                ...deck,
                card_count: cardCountMap[deck.id] || 0
            }));

            this.displayDecks(decksWithCounts || [], `Search Results for "${searchTerm}"`);
        } catch (error) {
            console.error('Error searching decks:', error);
            this.showError('Failed to search decks');
        }
    }

    displayDecks(decks, title = 'Decks') {
        const container = document.getElementById('deck-list');
        if (!container) return;

        if (decks.length === 0) {
            container.innerHTML = `<p class="text-muted">No decks found.</p>`;
            return;
        }

        let html = `<h4>${title} (${decks.length})</h4>`;
        html += '<div class="deck-grid">';
        
        decks.forEach(deck => {
            const retentionDisplay = deck.desired_retention ? 
                `${Math.round(deck.desired_retention * 100)}%` : 'Default';
            
            html += `
                <div class="deck-card ${!deck.is_active ? 'inactive' : ''}">
                    <div class="deck-header">
                        <h5>${this.escapeHtml(deck.name)}</h5>
                        <span class="deck-status ${deck.is_active ? 'active' : 'inactive'}">
                            ${deck.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    ${deck.description ? `<p class="deck-description">${this.escapeHtml(deck.description)}</p>` : ''}
                    <div class="deck-stats">
                        <div class="stat-item">
                            <label>Cards:</label>
                            <span>${deck.card_count}</span>
                        </div>
                        <div class="stat-item">
                            <label>Owner:</label>
                            <span>${this.escapeHtml(deck.profiles.display_name || deck.profiles.email)}</span>
                        </div>
                        <div class="stat-item">
                            <label>Retention Goal:</label>
                            <span>${retentionDisplay}</span>
                        </div>
                        <div class="stat-item">
                            <label>New Cards/Day:</label>
                            <span>${deck.daily_new_cards_limit || 'Default'}</span>
                        </div>
                        <div class="stat-item">
                            <label>Reviews/Day:</label>
                            <span>${deck.daily_review_limit || 'Default'}</span>
                        </div>
                        <div class="stat-item">
                            <label>Created:</label>
                            <span>${new Date(deck.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="deck-actions">
                        <button class="btn btn-sm ${deck.is_active ? 'btn-warning' : 'btn-success'}" 
                                onclick="adminService.toggleDeckStatus('${deck.id}', ${!deck.is_active})">
                            ${deck.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button class="btn btn-sm btn-info" 
                                onclick="adminService.viewDeckDetails('${deck.id}')">
                            View Details
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    async toggleDeckStatus(deckId, newStatus) {
        try {
            const supabase = await this.getSupabase();
            
            // Verify admin access
            const isAdmin = await this.verifyAdminAccessSecure();
            if (!isAdmin) {
                this.showError('Admin access required');
                return;
            }

            const { error } = await supabase
                .from('decks')
                .update({ is_active: newStatus })
                .eq('id', deckId);

            if (error) throw error;

            this.showSuccess(`Deck ${newStatus ? 'activated' : 'deactivated'} successfully`);
            
            // Refresh the deck list
            const searchTerm = document.getElementById('deck-search')?.value?.trim();
            if (searchTerm) {
                this.searchDecks();
            } else {
                this.loadAllDecks();
            }
        } catch (error) {
            console.error('Error toggling deck status:', error);
            this.showError(`Failed to update deck: ${error.message}`);
        }
    }

    async viewDeckDetails(deckId) {
        try {
            const supabase = await this.getSupabase();
            
            // Get detailed deck information
            const { data: deck, error: deckError } = await supabase
                .from('decks')
                .select(`
                    *,
                    profiles!inner(email, display_name, user_tier)
                `)
                .eq('id', deckId)
                .single();

            if (deckError) throw deckError;

            // Get card counts by state using optimized view
            const { data: cardStats, error: statsError } = await supabase
                .from('v_due_counts_by_deck')
                .select('*')
                .eq('deck_id', deckId)
                .single();

            if (statsError) {
                console.warn('Could not load card stats:', statsError);
            }

            // Display deck details in a modal-like overlay
            this.showDeckDetailsModal(deck, cardStats);
        } catch (error) {
            console.error('Error loading deck details:', error);
            this.showError('Failed to load deck details');
        }
    }

    showDeckDetailsModal(deck, cardStats) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'deck-details-modal';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${this.escapeHtml(deck.name)} - Deck Details</h3>
                    <button class="modal-close" onclick="this.closest('.deck-details-modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="deck-info-grid">
                        <div class="info-section">
                            <h4>Basic Information</h4>
                            <p><strong>Owner:</strong> ${this.escapeHtml(deck.profiles.display_name || deck.profiles.email)}</p>
                            <p><strong>Owner Tier:</strong> ${deck.profiles.user_tier}</p>
                            <p><strong>Status:</strong> ${deck.is_active ? 'Active' : 'Inactive'}</p>
                            <p><strong>Created:</strong> ${new Date(deck.created_at).toLocaleString()}</p>
                            ${deck.description ? `<p><strong>Description:</strong> ${this.escapeHtml(deck.description)}</p>` : ''}
                        </div>
                        
                        <div class="info-section">
                            <h4>FSRS Settings</h4>
                            <p><strong>Desired Retention:</strong> ${deck.desired_retention ? `${Math.round(deck.desired_retention * 100)}%` : 'Default'}</p>
                            <p><strong>Daily New Cards Limit:</strong> ${deck.daily_new_cards_limit || 'Default'}</p>
                            <p><strong>Daily Review Limit:</strong> ${deck.daily_review_limit || 'Default'}</p>
                            <p><strong>Learning Steps:</strong> ${deck.learning_steps_minutes ? deck.learning_steps_minutes.join(', ') + ' minutes' : 'Default'}</p>
                            <p><strong>Graduating Interval:</strong> ${deck.graduating_interval_days ? deck.graduating_interval_days + ' days' : 'Default'}</p>
                            <p><strong>Easy Interval:</strong> ${deck.easy_interval_days ? deck.easy_interval_days + ' days' : 'Default'}</p>
                        </div>
                        
                        ${cardStats ? `
                        <div class="info-section">
                            <h4>Card Statistics</h4>
                            <p><strong>Total Cards:</strong> ${cardStats.total_cards}</p>
                            <p><strong>New Cards:</strong> ${cardStats.new_count}</p>
                            <p><strong>Learning:</strong> ${cardStats.learning_count}</p>
                            <p><strong>Review:</strong> ${cardStats.review_count}</p>
                            <p><strong>Due Today:</strong> ${cardStats.total_due_count}</p>
                            <p><strong>Suspended:</strong> ${cardStats.suspended_count}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Add modal styles if not already present
        if (!document.getElementById('deck-modal-styles')) {
            const styles = document.createElement('style');
            styles.id = 'deck-modal-styles';
            styles.textContent = `
                .deck-details-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-backdrop {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    cursor: pointer;
                }
                .modal-content {
                    position: relative;
                    background: white;
                    border-radius: 8px;
                    max-width: 800px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                }
                .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #e9ecef;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h3 {
                    margin: 0;
                    color: #007bff;
                }
                .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #6c757d;
                    padding: 0;
                    line-height: 1;
                }
                .modal-body {
                    padding: 20px;
                }
                .deck-info-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                }
                .info-section h4 {
                    margin-bottom: 10px;
                    color: #495057;
                    border-bottom: 1px solid #e9ecef;
                    padding-bottom: 5px;
                }
                .info-section p {
                    margin: 5px 0;
                }
                .deck-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 15px;
                    margin-top: 15px;
                }
                .deck-card {
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    padding: 15px;
                    background: white;
                    transition: box-shadow 0.2s;
                }
                .deck-card:hover {
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .deck-card.inactive {
                    opacity: 0.7;
                    background: #f8f9fa;
                }
                .deck-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .deck-header h5 {
                    margin: 0;
                    color: #495057;
                }
                .deck-status {
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                }
                .deck-status.active {
                    background: #d4edda;
                    color: #155724;
                }
                .deck-status.inactive {
                    background: #f8d7da;
                    color: #721c24;
                }
                .deck-description {
                    margin: 10px 0;
                    color: #6c757d;
                    font-size: 14px;
                }
                .deck-stats {
                    margin: 15px 0;
                }
                .stat-item {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                    font-size: 13px;
                }
                .stat-item label {
                    font-weight: 500;
                    color: #495057;
                }
                .deck-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                }
                .btn-sm {
                    padding: 4px 8px;
                    font-size: 12px;
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(modal);
    }

    // Migration functionality removed for security
    // Use proper migration tools instead of exec_sql
    async applyMigration(migrationSql) {
        console.warn('Migration functionality disabled for security reasons');
        console.info('Use Supabase CLI or dashboard to apply migrations');
        return false;
    }

    async searchSubjects() {
        const searchTerm = document.getElementById('subject-search')?.value?.trim();
        if (!searchTerm) {
            this.loadSubjectsForManagement();
            return;
        }

        try {
            const supabase = await this.getSupabase();
            
            // Search subjects by name or description
            const { data: subjects, error } = await supabase
                .from('subjects')
                .select(`
                    id,
                    name,
                    description,
                    is_active,
                    created_at,
                    creator_id,
                    is_public
                `)
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
                .order('name');

            if (error) throw error;

            // Get card counts for filtered subjects
            const subjectIds = subjects?.map(s => s.id) || [];
            let cardCountMap = {};
            
            if (subjectIds.length > 0) {
                const { data: cardCounts, error: countError } = await supabase
                    .from('card_templates')
                    .select('subject_id')
                    .in('subject_id', subjectIds);

                if (countError) throw countError;

                cardCounts?.forEach(card => {
                    cardCountMap[card.subject_id] = (cardCountMap[card.subject_id] || 0) + 1;
                });
            }

            // Add card counts to subjects
            const subjectsWithCounts = subjects?.map(subject => ({
                ...subject,
                card_count: cardCountMap[subject.id] || 0
            }));

            this.displaySubjectsTable(subjectsWithCounts || []);
        } catch (error) {
            console.error('Error searching subjects:', error);
            this.showError('Failed to search subjects');
        }
    }

    // Legacy function - redirect to new combined function
    async loadSummaryAnalytics() {
        return this.loadAnalytics();
    }

    // Process analytics data with new database structure
    processAnalyticsData(cards) {
        return cards.map(card => {
            // Use total_reviews from card_templates (aggregated stats)
            const totalReviews = card.total_reviews || 0;
            const incorrectReviews = card.incorrect_reviews || 0;
            const againPercentage = totalReviews > 0 ? Math.round((incorrectReviews / totalReviews) * 100) : 0;
            
            // Simplified problem score: flag count * 10 + again percentage + (flagged ? 50 : 0)
            const problemScore = (card.user_flag_count || 0) * 10 + againPercentage + (card.flagged_for_review ? 50 : 0);
            
            return {
                card_template_id: card.id,
                question: card.question,
                answer: card.answer,
                subsection: card.subsection,
                tags: card.tags || [],
                subject_name: card.subjects?.name || 'Unknown',
                total_reviews: totalReviews,
                again_percentage: againPercentage,
                average_response_time_ms: card.average_response_time_ms || 0,
                user_flag_count: card.user_flag_count || 0,
                flagged_for_review: card.flagged_for_review,
                problem_score: problemScore
            };
        }).sort((a, b) => b.problem_score - a.problem_score); // Sort by problem score descending
    }

    // Update summary statistics
    updateSummaryStats(analytics, avgFailedAttempts = 0) {
        const totalCards = analytics?.length || 0;
        const problemCards = analytics?.filter(card => (card.problem_score || 0) > 30).length || 0;
        const avgResponseTime = analytics?.length > 0 
            ? Math.round(analytics.reduce((sum, card) => sum + (card.average_response_time_ms || 0), 0) / analytics.length)
            : 0;
        const overallAgainPercentage = analytics?.length > 0
            ? Math.round(analytics.reduce((sum, card) => sum + (card.again_percentage || 0), 0) / analytics.length)
            : 0;

        document.getElementById('total-cards-count').textContent = totalCards;
        document.getElementById('problem-cards-count').textContent = problemCards;
        document.getElementById('avg-response-time').textContent = `${avgResponseTime}ms`;
        document.getElementById('overall-again-percentage').textContent = `${overallAgainPercentage}%`;
        document.getElementById('avg-failed-attempts').textContent = avgFailedAttempts || '0';
    }

    // Display analytics table with enhanced columns for new database structure
    displayAnalyticsTable(data) {
        const columns = [
            { key: 'question', label: 'Question', className: 'card-question' },
            { key: 'subject_name', label: 'Subject' },
            { key: 'subsection', label: 'Section', formatter: (val) => val || '-' },
            { key: 'tags', label: 'Tags', formatter: (val) => Array.isArray(val) && val.length > 0 ? val.join(', ') : '-' },
            { key: 'total_reviews', label: 'Reviews' },
            { key: 'again_percentage', label: 'Failed %', formatter: (val) => val ? `${val}%` : '-' },
            { key: 'average_response_time_ms', label: 'Avg Time', formatter: (val) => val ? `${val}ms` : '-' },
            { key: 'user_flag_count', label: 'User Flags' },
            { key: 'problem_score', label: 'Problem Score', className: 'problem-score', formatter: this.formatProblemScore }
        ];

        this.renderSimpleTable('analytics-table', data, columns);
    }

    // Simplified table rendering with basic asc/desc sorting
    renderSimpleTable(containerId, data, columns) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No data available.</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'analytics-table';

        // Create header with simple sorting
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        columns.forEach((col, index) => {
            const th = document.createElement('th');
            th.textContent = col.label;
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                this.sortTable(table, index, col.key);
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
                    const formatted = col.formatter(value);
                    if (typeof formatted === 'object' && formatted.html) {
                        td.innerHTML = formatted.html;
                        if (formatted.className) td.className = formatted.className;
                    } else {
                        td.textContent = formatted;
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

    // Simple table sorting (asc/desc only)
    sortTable(table, columnIndex, sortKey) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // Determine current sort direction
        const currentDirection = table.dataset.sortDirection || 'asc';
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
        table.dataset.sortDirection = newDirection;
        table.dataset.sortColumn = columnIndex;
        
        // Sort rows
        rows.sort((a, b) => {
            const aValue = a.cells[columnIndex].textContent.trim();
            const bValue = b.cells[columnIndex].textContent.trim();
            
            let comparison = 0;
            
            // Try numeric comparison first
            const aNum = parseFloat(aValue.replace(/[^\d.-]/g, ''));
            const bNum = parseFloat(bValue.replace(/[^\d.-]/g, ''));
            
            if (!isNaN(aNum) && !isNaN(bNum)) {
                comparison = aNum - bNum;
            } else {
                comparison = aValue.localeCompare(bValue);
            }
            
            return newDirection === 'desc' ? -comparison : comparison;
        });
        
        // Update table header indicators
        table.querySelectorAll('th').forEach((th, index) => {
            th.textContent = th.textContent.replace(/ [▲▼]/, '');
            if (index === columnIndex) {
                th.textContent += newDirection === 'asc' ? ' ▲' : ' ▼';
            }
        });
        
        // Reorder rows
        rows.forEach(row => tbody.appendChild(row));

    }











    formatProblemScore(score) {
        if (!score) return '-';
        const roundedScore = Math.round(score);
        let className = 'problem-score ';
        if (roundedScore >= 50) className += 'high';
        else if (roundedScore >= 20) className += 'medium';
        else className += 'low';
        
        return {
            html: roundedScore.toString(),
            className: className
        };
    }


    // Simplified export function
    async exportAnalyticsData() {
        try {
            const supabase = await this.getSupabase();
            const subjectId = document.getElementById('subject-filter')?.value || null;
            
            // Get current analytics data
            let query = supabase
                .from('card_templates')
                .select(`
                    id, question, answer, 
                    subjects:subject_id(name),
                    total_reviews, correct_reviews, incorrect_reviews,
                    average_response_time_ms, user_flag_count, flagged_for_review
                `);
                
            if (subjectId) {
                query = query.eq('subject_id', subjectId);
            }
            
            const { data, error } = await query.limit(1000);
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                alert('No data to export.');
                return;
            }
            
            // Prepare CSV data
            const csvData = [];
            csvData.push(['Card ID', 'Question', 'Answer', 'Subject', 'Total Reviews', 'Correct Reviews', 'Incorrect Reviews', 'Avg Response Time (ms)', 'User Flags', 'Admin Flagged']);
            
            data.forEach(card => {
                csvData.push([
                    card.id,
                    `"${card.question.replace(/"/g, '""')}"`, // Escape quotes
                    `"${card.answer.replace(/"/g, '""')}"`,
                    card.subjects?.name || 'Unknown',
                    card.total_reviews || 0,
                    card.correct_reviews || 0,
                    card.incorrect_reviews || 0,
                    card.average_response_time_ms || 0,
                    card.user_flag_count || 0,
                    card.flagged_for_review ? 'Yes' : 'No'
                ]);
            });
            
            // Create and download CSV
            const csvContent = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spaced-rep-cards-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Failed to export data: ' + error.message);
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