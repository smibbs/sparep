import { getSupabaseClient } from './supabase-client.js';

class AdminService {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.initialize();
    }

    async initialize() {
        try {
            await this.supabasePromise;
            this.setupAdminInterface();
        } catch (error) {
            console.error('Failed to initialize AdminService:', error);
        }
    }

    async getSupabase() {
        return await this.supabasePromise;
    }

    setupAdminInterface() {
        // Only show admin interface if user is admin
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
        // Create admin panel if it doesn't exist
        if (!document.getElementById('admin-panel')) {
            const adminPanel = document.createElement('div');
            adminPanel.id = 'admin-panel';
            adminPanel.innerHTML = `
                <div class="admin-header">
                    <h2>Admin Panel</h2>
                    <button id="toggle-admin-panel" class="btn btn-secondary">Hide</button>
                </div>
                <div class="admin-content">
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
            `;
            adminPanel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 80vh;
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
                    }
                    .btn-primary {
                        background-color: #007bff;
                        color: white;
                    }
                    .btn-primary:hover {
                        background-color: #0056b3;
                    }
                    .btn-secondary {
                        background-color: #6c757d;
                        color: white;
                    }
                    .btn-secondary:hover {
                        background-color: #545b62;
                    }
                    .btn-danger {
                        background-color: #dc3545;
                        color: white;
                    }
                    .btn-danger:hover {
                        background-color: #c82333;
                    }
                    .btn-success {
                        background-color: #28a745;
                        color: white;
                    }
                    .btn-success:hover {
                        background-color: #1e7e34;
                    }
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
                    }
                    .hidden {
                        display: none !important;
                    }
                `;
                document.head.appendChild(styles);
            }
        }
    }

    setupEventListeners() {
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

        document.getElementById('refresh-flagged')?.addEventListener('click', () => {
            this.loadFlaggedCards();
        });

        document.getElementById('search-cards')?.addEventListener('click', () => {
            this.searchCards();
        });

        document.getElementById('update-user-tier')?.addEventListener('click', () => {
            this.updateUserTier();
        });
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
}

// Initialize admin service
const adminService = new AdminService();

// Make it globally available for onclick handlers
window.adminService = adminService;

export default AdminService;