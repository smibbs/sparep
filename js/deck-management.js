import { getSupabaseClient } from './supabase-client.js';

class DeckManager {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.currentUser = null;
        this.currentSection = 'deck-overview';
        this.selectedPath = null;
        this.selectedDeckId = null;
        this.previewCards = [];
        this.flaggedCards = [];
        this.selectedFlags = new Set();
        this.bulkResolutionAction = null;
    }

    async initialize() {
        try {
            this.supabase = await this.supabasePromise;

            // Get current user
            const { data: { user } } = await this.supabase.auth.getUser();
            this.currentUser = user;

            if (!this.currentUser) {
                throw new Error('No authenticated user');
            }

            this.setupEventListeners();
            await this.loadInitialData();
        } catch (error) {
            console.error('Failed to initialize DeckManager:', error);
            this.showError('Failed to initialize deck management system');
        }
    }

    setupEventListeners() {
        // Section toggle buttons
        document.getElementById('toggle-deck-overview').addEventListener('click', () => this.showSection('deck-overview'));
        document.getElementById('toggle-path-browser').addEventListener('click', () => this.showSection('path-browser'));
        document.getElementById('toggle-content-mgmt').addEventListener('click', () => this.showSection('content-mgmt'));
        document.getElementById('toggle-flagged-mgmt').addEventListener('click', () => this.showSection('flagged-mgmt'));
        document.getElementById('toggle-legacy-tools').addEventListener('click', () => this.showSection('legacy-tools'));

        // Deck overview section
        document.getElementById('apply-deck-filters').addEventListener('click', () => this.applyDeckFilters());
        document.getElementById('deck-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyDeckFilters();
        });

        // Path browser section
        document.getElementById('path-search').addEventListener('input', (e) => this.filterPaths(e.target.value));
        document.getElementById('expand-all-paths').addEventListener('click', () => this.expandAllPaths());
        document.getElementById('collapse-all-paths').addEventListener('click', () => this.collapseAllPaths());

        // Content management section
        document.getElementById('bulk-hide').addEventListener('click', () => this.bulkSetVisibility(false));
        document.getElementById('bulk-show').addEventListener('click', () => this.bulkSetVisibility(true));
        document.getElementById('bulk-toggle').addEventListener('click', () => this.bulkToggleVisibility());

        // Flagged card management section
        document.getElementById('apply-flag-filters').addEventListener('click', () => this.applyFlagFilters());
        document.getElementById('select-all-flags').addEventListener('click', () => this.selectAllFlags());
        document.getElementById('bulk-resolve-dismiss').addEventListener('click', () => this.initiateBulkResolution('dismissed'));
        document.getElementById('bulk-resolve-hide').addEventListener('click', () => this.initiateBulkResolution('card_removed'));
        document.getElementById('bulk-resolve-updated').addEventListener('click', () => this.initiateBulkResolution('card_updated'));

        // Legacy tools section (existing functionality)
        document.getElementById('create-deck').addEventListener('click', () => this.createDeck());
        document.getElementById('clear-form').addEventListener('click', () => this.clearCreateForm());
        document.getElementById('preview-cards').addEventListener('click', () => this.previewCardsByPath());
        document.getElementById('add-cards-to-deck').addEventListener('click', () => this.addCardsToDeck());
        document.getElementById('target-deck').addEventListener('change', (e) => {
            this.selectedDeckId = e.target.value;
            this.toggleAddButton();
        });
        document.getElementById('card-path').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.previewCardsByPath();
        });

        // Modal event listeners
        this.setupModalEventListeners();

        // Global refresh
        document.getElementById('refresh-all').addEventListener('click', () => this.refreshCurrentSection());
    }

    setupModalEventListeners() {
        // Close modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.add('hidden');
            });
        });

        // Flag details modal actions
        document.getElementById('edit-flagged-card').addEventListener('click', () => this.editFlaggedCard());
        document.getElementById('resolve-flag-dismiss').addEventListener('click', () => this.resolveSingleFlag('dismissed'));
        document.getElementById('resolve-flag-hide').addEventListener('click', () => this.resolveSingleFlag('card_removed'));
        document.getElementById('resolve-flag-updated').addEventListener('click', () => this.resolveSingleFlag('card_updated'));

        // Card edit modal actions
        document.getElementById('save-card-changes').addEventListener('click', () => this.saveCardChanges());
        document.getElementById('cancel-card-edit').addEventListener('click', () => {
            document.getElementById('card-edit-modal').classList.add('hidden');
        });

        // Bulk resolution modal actions
        document.getElementById('confirm-bulk-resolution').addEventListener('click', () => this.confirmBulkResolution());
        document.getElementById('cancel-bulk-resolution').addEventListener('click', () => {
            document.getElementById('bulk-resolution-modal').classList.add('hidden');
        });

        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }

    // =====================================================
    // SECTION MANAGEMENT
    // =====================================================

    showSection(sectionName) {
        // Update active button
        document.querySelectorAll('.header-section-toggle .btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`toggle-${sectionName}`).classList.add('active');

        // Hide all sections
        document.querySelectorAll('.admin-main-section').forEach(section => {
            section.classList.add('hidden');
        });

        // Show selected section
        document.getElementById(`${sectionName}-section`).classList.remove('hidden');
        this.currentSection = sectionName;

        // Load section-specific data
        this.loadSectionData(sectionName);
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'deck-overview':
                await this.loadDeckOverview();
                break;
            case 'path-browser':
                await this.loadPathBrowser();
                break;
            case 'content-mgmt':
                this.updateContentManagement();
                break;
            case 'flagged-mgmt':
                await this.loadFlaggedCards();
                await this.loadFlagStatistics();
                break;
            case 'legacy-tools':
                await this.loadLegacyTools();
                break;
        }
    }

    async loadInitialData() {
        // Start with deck overview
        await this.loadDeckOverview();
    }

    async refreshCurrentSection() {
        await this.loadSectionData(this.currentSection);
        this.showSuccess('Data refreshed successfully');
    }

    // =====================================================
    // DECK OVERVIEW SECTION
    // =====================================================

    async loadDeckOverview() {
        try {
            this.setLoading('deck-overview-table', true);

            const { data: decks, error } = await this.supabase.rpc('admin_list_all_decks_with_paths', {
                p_admin_id: this.currentUser.id
            });

            if (error) throw error;

            this.renderDeckOverviewTable(decks);
        } catch (error) {
            console.error('Error loading deck overview:', error);
            this.showError(`Failed to load deck overview: ${error.message}`);
        } finally {
            this.setLoading('deck-overview-table', false);
        }
    }

    renderDeckOverviewTable(decks) {
        const container = document.getElementById('deck-overview-table');

        if (decks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No decks found. Create your first deck using the Legacy Tools section.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Deck Name</th>
                        <th>Source Path</th>
                        <th>Subject</th>
                        <th>Cards</th>
                        <th>Flagged</th>
                        <th>Visibility</th>
                        <th>Managed By</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${decks.map(deck => `
                        <tr data-deck-id="${deck.deck_id}">
                            <td class="deck-name">${deck.deck_name}</td>
                            <td class="deck-path">
                                ${deck.source_path ? `<span class="path-tag">${deck.source_path}</span>` : '-'}
                            </td>
                            <td class="deck-subject">${deck.source_subject_name || '-'}</td>
                            <td class="deck-cards">
                                <span class="card-count">${deck.card_count}</span>
                            </td>
                            <td class="deck-flagged">
                                ${deck.flagged_cards_count > 0 ?
                                    `<span class="flag-count warning">${deck.flagged_cards_count}</span>` :
                                    '<span class="flag-count">0</span>'
                                }
                            </td>
                            <td class="deck-visibility">
                                <span class="visibility-badge ${deck.is_public ? 'public' : 'private'}">
                                    ${deck.is_public ? 'Public' : 'Private'}
                                </span>
                            </td>
                            <td class="deck-managed">${deck.managed_by || 'Manual'}</td>
                            <td class="deck-actions">
                                <button class="btn btn-small" onclick="deckManager.viewDeckHierarchy('${deck.deck_id}')">
                                    View Structure
                                </button>
                                <button class="btn btn-small ${deck.is_public ? 'btn-warning' : 'btn-success'}"
                                        onclick="deckManager.toggleDeckVisibility('${deck.deck_id}', ${!deck.is_public})">
                                    Make ${deck.is_public ? 'Private' : 'Public'}
                                </button>
                                ${deck.flagged_cards_count > 0 ?
                                    `<button class="btn btn-small btn-danger" onclick="deckManager.viewDeckFlags('${deck.deck_id}')">
                                        View Flags
                                    </button>` : ''
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async applyDeckFilters() {
        const searchTerm = document.getElementById('deck-search').value.trim();
        const visibilityFilter = document.getElementById('deck-visibility-filter').value;

        // For now, just reload and filter client-side
        // In production, you might want server-side filtering
        await this.loadDeckOverview();

        if (searchTerm || visibilityFilter) {
            const rows = document.querySelectorAll('#deck-overview-table tbody tr');
            rows.forEach(row => {
                const deckName = row.querySelector('.deck-name').textContent.toLowerCase();
                const isPublic = row.querySelector('.visibility-badge').classList.contains('public');

                let showRow = true;

                if (searchTerm && !deckName.includes(searchTerm.toLowerCase())) {
                    showRow = false;
                }

                if (visibilityFilter === 'public' && !isPublic) {
                    showRow = false;
                }

                if (visibilityFilter === 'private' && isPublic) {
                    showRow = false;
                }

                row.style.display = showRow ? '' : 'none';
            });
        }
    }

    async viewDeckHierarchy(deckId) {
        this.selectedDeckId = deckId;
        this.showSection('path-browser');
        await this.loadDeckHierarchy(deckId);
    }

    async toggleDeckVisibility(deckId, isPublic) {
        try {
            // Note: This would need a new admin function to toggle deck visibility
            // For now, we'll show a message about this functionality
            this.showError('Deck visibility toggle not yet implemented. Use subject/card level controls instead.');
        } catch (error) {
            console.error('Error toggling deck visibility:', error);
            this.showError(`Failed to update deck visibility: ${error.message}`);
        }
    }

    async viewDeckFlags(deckId) {
        // Switch to flagged management section and filter by deck
        this.showSection('flagged-mgmt');
        // Would need to implement deck-specific flag filtering
        this.showInfo('Viewing flags for specific deck - filter functionality to be implemented');
    }

    // =====================================================
    // PATH BROWSER SECTION
    // =====================================================

    async loadPathBrowser() {
        if (!this.selectedDeckId) {
            document.getElementById('path-tree').innerHTML = `
                <div class="empty-state">
                    <p>Select a deck from the Deck Overview to view its path structure</p>
                </div>
            `;
            return;
        }

        await this.loadDeckHierarchy(this.selectedDeckId);
    }

    async loadDeckHierarchy(deckId) {
        try {
            this.setLoading('path-tree', true);

            const { data: hierarchy, error } = await this.supabase.rpc('admin_get_deck_hierarchy', {
                p_admin_id: this.currentUser.id,
                p_deck_id: deckId
            });

            if (error) throw error;

            this.renderPathTree(hierarchy);
        } catch (error) {
            console.error('Error loading deck hierarchy:', error);
            this.showError(`Failed to load deck hierarchy: ${error.message}`);
        } finally {
            this.setLoading('path-tree', false);
        }
    }

    renderPathTree(hierarchy) {
        const container = document.getElementById('path-tree');

        if (hierarchy.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No path structure found for this deck</p>
                </div>
            `;
            return;
        }

        // Build tree structure
        const tree = this.buildTreeStructure(hierarchy);
        container.innerHTML = this.renderTreeNodes(tree);
    }

    buildTreeStructure(hierarchy) {
        const tree = {};

        hierarchy.forEach(item => {
            const pathParts = item.path.split('.');
            let current = tree;

            pathParts.forEach((part, index) => {
                const partialPath = pathParts.slice(0, index + 1).join('.');

                if (!current[part]) {
                    current[part] = {
                        data: hierarchy.find(h => h.path === partialPath) || {
                            path: partialPath,
                            subject_name: `Path ${partialPath}`,
                            card_count: 0,
                            flagged_cards_count: 0,
                            is_public: true
                        },
                        children: {}
                    };
                }
                current = current[part].children;
            });
        });

        return tree;
    }

    renderTreeNodes(tree, level = 0) {
        return Object.entries(tree).map(([key, node]) => {
            const hasChildren = Object.keys(node.children).length > 0;
            const data = node.data;

            return `
                <div class="tree-node" data-level="${level}" data-path="${data.path}">
                    <div class="tree-node-content" onclick="deckManager.selectPath('${data.path}')">
                        ${hasChildren ?
                            `<span class="tree-toggle" onclick="event.stopPropagation(); deckManager.toggleTreeNode(this)">▶</span>` :
                            '<span class="tree-spacer"></span>'
                        }
                        <span class="path-label">${data.path}</span>
                        <span class="subject-name">${data.subject_name}</span>
                        <div class="path-stats">
                            <span class="card-count">${data.card_count} cards</span>
                            ${data.flagged_cards_count > 0 ?
                                `<span class="flag-count warning">${data.flagged_cards_count} flagged</span>` : ''
                            }
                            <span class="visibility-indicator ${data.is_public ? 'public' : 'private'}"
                                  title="${data.is_public ? 'Public' : 'Private'}">
                                ${data.is_public ? '👁' : '🔒'}
                            </span>
                        </div>
                    </div>
                    ${hasChildren ?
                        `<div class="tree-children hidden">${this.renderTreeNodes(node.children, level + 1)}</div>` :
                        ''
                    }
                </div>
            `;
        }).join('');
    }

    toggleTreeNode(toggleElement) {
        const childrenDiv = toggleElement.closest('.tree-node').querySelector('.tree-children');
        const isExpanded = !childrenDiv.classList.contains('hidden');

        if (isExpanded) {
            childrenDiv.classList.add('hidden');
            toggleElement.textContent = '▶';
        } else {
            childrenDiv.classList.remove('hidden');
            toggleElement.textContent = '▼';
        }
    }

    selectPath(path) {
        // Update visual selection
        document.querySelectorAll('.tree-node-content').forEach(node => {
            node.classList.remove('selected');
        });
        document.querySelector(`[data-path="${path}"] .tree-node-content`).classList.add('selected');

        // Update selected path
        this.selectedPath = path;
        document.getElementById('selected-path-display').textContent = path;

        // Update breadcrumb
        this.updatePathBreadcrumb(path);
    }

    updatePathBreadcrumb(path) {
        const breadcrumb = document.getElementById('path-breadcrumb');
        const parts = path.split('.');

        breadcrumb.innerHTML = parts.map((part, index) => {
            const partialPath = parts.slice(0, index + 1).join('.');
            return `
                <span class="breadcrumb-item" onclick="deckManager.selectPath('${partialPath}')">
                    ${part}
                </span>
            `;
        }).join('<span class="breadcrumb-separator">.</span>');
    }

    expandAllPaths() {
        document.querySelectorAll('.tree-children').forEach(children => {
            children.classList.remove('hidden');
        });
        document.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.textContent = '▼';
        });
    }

    collapseAllPaths() {
        document.querySelectorAll('.tree-children').forEach(children => {
            children.classList.add('hidden');
        });
        document.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.textContent = '▶';
        });
    }

    filterPaths(searchTerm) {
        const nodes = document.querySelectorAll('.tree-node');

        if (!searchTerm.trim()) {
            nodes.forEach(node => node.style.display = '');
            return;
        }

        nodes.forEach(node => {
            const path = node.dataset.path;
            const subjectName = node.querySelector('.subject-name').textContent;
            const matches = path.includes(searchTerm) || subjectName.toLowerCase().includes(searchTerm.toLowerCase());
            node.style.display = matches ? '' : 'none';
        });
    }

    // =====================================================
    // CONTENT MANAGEMENT SECTION
    // =====================================================

    updateContentManagement() {
        const container = document.getElementById('content-details');

        if (!this.selectedPath) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Select a path from the Path Browser to manage its content</p>
                </div>
            `;
            return;
        }

        // This would load and display cards for the selected path
        container.innerHTML = `
            <div class="content-loading">
                <p>Content management for path: <strong>${this.selectedPath}</strong></p>
                <p><em>Detailed content management interface to be implemented</em></p>
            </div>
        `;
    }

    async bulkSetVisibility(isPublic) {
        if (!this.selectedPath) {
            this.showError('Please select a path first');
            return;
        }

        try {
            const { data, error } = await this.supabase.rpc('admin_bulk_set_path_visibility', {
                p_admin_id: this.currentUser.id,
                p_path_pattern: this.selectedPath,
                p_is_public: isPublic
            });

            if (error) throw error;

            this.showSuccess(`Updated visibility for ${data.subjects_updated} subjects and ${data.cards_updated} cards`);
            await this.refreshCurrentSection();
        } catch (error) {
            console.error('Error updating bulk visibility:', error);
            this.showError(`Failed to update visibility: ${error.message}`);
        }
    }

    async bulkToggleVisibility() {
        // This would need more complex logic to toggle mixed visibility states
        this.showInfo('Bulk toggle functionality to be implemented');
    }

    // =====================================================
    // FLAGGED CARD MANAGEMENT SECTION
    // =====================================================

    async loadFlaggedCards() {
        try {
            this.setLoading('flagged-cards-table', true);

            const { data: flaggedCards, error } = await this.supabase.rpc('admin_get_flagged_cards_with_details', {
                p_admin_id: this.currentUser.id
            });

            if (error) throw error;

            this.flaggedCards = flaggedCards;
            this.renderFlaggedCardsTable(flaggedCards);
        } catch (error) {
            console.error('Error loading flagged cards:', error);
            this.showError(`Failed to load flagged cards: ${error.message}`);
        } finally {
            this.setLoading('flagged-cards-table', false);
        }
    }

    renderFlaggedCardsTable(flaggedCards) {
        const container = document.getElementById('flagged-cards-table');

        if (flaggedCards.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No flagged cards found. Great job maintaining content quality! 🎉</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="data-table flagged-cards-table">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-flags-checkbox"></th>
                        <th>Question</th>
                        <th>Path</th>
                        <th>Subject</th>
                        <th>Flag Count</th>
                        <th>Recent Flags</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${flaggedCards.map(card => {
                        const recentFlags = card.flag_details || [];
                        const flagReasons = recentFlags.map(f => f.reason).join(', ');

                        return `
                            <tr data-card-id="${card.card_id}" class="${card.is_public ? '' : 'card-hidden'}">
                                <td>
                                    <input type="checkbox" class="flag-select" value="${card.card_id}">
                                </td>
                                <td class="card-question" title="${this.escapeHtml(card.question)}">
                                    ${this.truncateText(card.question, 60)}
                                </td>
                                <td class="card-path">
                                    <span class="path-tag">${card.path || '-'}</span>
                                </td>
                                <td class="card-subject">${card.subject_name || '-'}</td>
                                <td class="flag-count">
                                    <span class="flag-count-badge ${card.user_flag_count > 5 ? 'severe' : card.user_flag_count > 2 ? 'warning' : ''}">
                                        ${card.user_flag_count}
                                    </span>
                                </td>
                                <td class="flag-reasons">${flagReasons || '-'}</td>
                                <td class="card-status">
                                    <div class="status-indicators">
                                        ${card.flagged_for_review ? '<span class="status-badge review">Review</span>' : ''}
                                        <span class="status-badge ${card.is_public ? 'public' : 'hidden'}">
                                            ${card.is_public ? 'Public' : 'Hidden'}
                                        </span>
                                    </div>
                                </td>
                                <td class="flag-actions">
                                    <button class="btn btn-small" onclick="deckManager.viewFlagDetails('${card.card_id}')">
                                        Details
                                    </button>
                                    <button class="btn btn-small btn-primary" onclick="deckManager.editFlaggedCardDirect('${card.card_id}')">
                                        Edit
                                    </button>
                                    <button class="btn btn-small ${card.is_public ? 'btn-warning' : 'btn-success'}"
                                            onclick="deckManager.toggleCardVisibility('${card.card_id}', ${!card.is_public})">
                                        ${card.is_public ? 'Hide' : 'Show'}
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        // Setup select all checkbox
        document.getElementById('select-all-flags-checkbox').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.flag-select');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            this.updateSelectedFlags();
        });

        // Setup individual checkboxes
        document.querySelectorAll('.flag-select').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedFlags());
        });
    }

    updateSelectedFlags() {
        this.selectedFlags.clear();
        document.querySelectorAll('.flag-select:checked').forEach(cb => {
            this.selectedFlags.add(cb.value);
        });

        // Update bulk action button states
        const hasSelection = this.selectedFlags.size > 0;
        document.getElementById('bulk-resolve-dismiss').disabled = !hasSelection;
        document.getElementById('bulk-resolve-hide').disabled = !hasSelection;
        document.getElementById('bulk-resolve-updated').disabled = !hasSelection;
    }

    async loadFlagStatistics() {
        try {
            const { data: stats, error } = await this.supabase.rpc('admin_get_flag_statistics', {
                p_admin_id: this.currentUser.id
            });

            if (error) throw error;

            document.getElementById('total-flagged-count').textContent = stats.total_flagged_cards || 0;
            document.getElementById('pending-flags-count').textContent = stats.pending_flags || 0;
            document.getElementById('resolved-today-count').textContent = stats.resolved_flags_today || 0;
            document.getElementById('common-flag-reason').textContent = stats.most_common_flag_reason || 'None';
        } catch (error) {
            console.error('Error loading flag statistics:', error);
        }
    }

    async applyFlagFilters() {
        const reasonFilter = document.getElementById('flag-reason-filter').value;
        const statusFilter = document.getElementById('flag-status-filter').value;
        const pathFilter = document.getElementById('flag-path-filter').value.trim();

        // Filter the current flagged cards display
        const rows = document.querySelectorAll('#flagged-cards-table tbody tr');
        rows.forEach(row => {
            let showRow = true;

            if (reasonFilter) {
                const reasons = row.querySelector('.flag-reasons').textContent;
                if (!reasons.includes(reasonFilter)) {
                    showRow = false;
                }
            }

            if (statusFilter !== 'all') {
                const isHidden = row.classList.contains('card-hidden');
                if (statusFilter === 'unresolved' && isHidden) {
                    showRow = false;
                }
                // More status filtering logic would go here
            }

            if (pathFilter) {
                const path = row.querySelector('.path-tag').textContent;
                if (!path.includes(pathFilter)) {
                    showRow = false;
                }
            }

            row.style.display = showRow ? '' : 'none';
        });
    }

    viewFlagDetails(cardId) {
        const card = this.flaggedCards.find(c => c.card_id === cardId);
        if (!card) return;

        const modal = document.getElementById('flag-details-modal');
        const content = document.getElementById('flag-details-content');

        content.innerHTML = `
            <div class="flag-details">
                <div class="card-preview">
                    <h4>Card Content</h4>
                    <div class="card-question">
                        <strong>Q:</strong> ${this.escapeHtml(card.question)}
                    </div>
                    <div class="card-answer">
                        <strong>A:</strong> ${this.escapeHtml(card.answer)}
                    </div>
                    <div class="card-meta">
                        <span>Path: ${card.path || 'None'}</span> |
                        <span>Subject: ${card.subject_name || 'None'}</span> |
                        <span class="visibility-status ${card.is_public ? 'public' : 'private'}">
                            ${card.is_public ? 'Public' : 'Hidden'}
                        </span>
                    </div>
                </div>

                <div class="flag-list">
                    <h4>User Flags (${card.user_flag_count})</h4>
                    ${card.flag_details && card.flag_details.length > 0 ?
                        card.flag_details.map(flag => `
                            <div class="flag-item">
                                <div class="flag-header">
                                    <span class="flag-reason">${flag.reason}</span>
                                    <span class="flag-date">${new Date(flag.created_at).toLocaleDateString()}</span>
                                </div>
                                ${flag.comment ? `<div class="flag-comment">"${this.escapeHtml(flag.comment)}"</div>` : ''}
                            </div>
                        `).join('') :
                        '<p>No specific flag details available</p>'
                    }
                </div>
            </div>
        `;

        // Store current card for modal actions
        modal.dataset.cardId = cardId;
        modal.classList.remove('hidden');
    }

    async editFlaggedCardDirect(cardId) {
        const card = this.flaggedCards.find(c => c.card_id === cardId);
        if (!card) return;

        const modal = document.getElementById('card-edit-modal');

        document.getElementById('edit-card-question').value = card.question;
        document.getElementById('edit-card-answer').value = card.answer;
        document.getElementById('edit-card-public').checked = card.is_public;

        modal.dataset.cardId = cardId;
        modal.classList.remove('hidden');
    }

    editFlaggedCard() {
        const flagModal = document.getElementById('flag-details-modal');
        const cardId = flagModal.dataset.cardId;
        flagModal.classList.add('hidden');
        this.editFlaggedCardDirect(cardId);
    }

    async saveCardChanges() {
        const modal = document.getElementById('card-edit-modal');
        const cardId = modal.dataset.cardId;

        const question = document.getElementById('edit-card-question').value.trim();
        const answer = document.getElementById('edit-card-answer').value.trim();
        const isPublic = document.getElementById('edit-card-public').checked;

        if (!question || !answer) {
            this.showError('Question and answer are required');
            return;
        }

        try {
            // Update card content (would need a new admin function)
            // For now, just update visibility
            await this.toggleCardVisibility(cardId, isPublic);

            modal.classList.add('hidden');
            this.showSuccess('Card updated successfully');
            await this.loadFlaggedCards();
        } catch (error) {
            console.error('Error saving card changes:', error);
            this.showError(`Failed to save changes: ${error.message}`);
        }
    }

    async toggleCardVisibility(cardId, isPublic) {
        try {
            const { data, error } = await this.supabase.rpc('admin_set_card_visibility', {
                p_admin_id: this.currentUser.id,
                p_card_id: cardId,
                p_is_public: isPublic
            });

            if (error) throw error;

            this.showSuccess(`Card ${isPublic ? 'shown' : 'hidden'} successfully`);
            await this.loadFlaggedCards();
        } catch (error) {
            console.error('Error toggling card visibility:', error);
            this.showError(`Failed to update card visibility: ${error.message}`);
        }
    }

    async resolveSingleFlag(action) {
        const modal = document.getElementById('flag-details-modal');
        const cardId = modal.dataset.cardId;

        // This would need flag-specific resolution logic
        // For now, just provide feedback
        modal.classList.add('hidden');
        this.showInfo(`Single flag resolution (${action}) to be implemented`);
    }

    selectAllFlags() {
        const selectAllCheckbox = document.getElementById('select-all-flags-checkbox');
        selectAllCheckbox.checked = !selectAllCheckbox.checked;
        selectAllCheckbox.dispatchEvent(new Event('change'));
    }

    initiateBulkResolution(action) {
        if (this.selectedFlags.size === 0) {
            this.showError('Please select flags to resolve');
            return;
        }

        this.bulkResolutionAction = action;
        document.getElementById('bulk-resolution-count').textContent = this.selectedFlags.size;
        document.getElementById('bulk-resolution-modal').classList.remove('hidden');
    }

    async confirmBulkResolution() {
        const comment = document.getElementById('bulk-resolution-comment').value.trim();

        try {
            // This would use the bulk resolution function with the selected card IDs
            // For now, provide feedback
            document.getElementById('bulk-resolution-modal').classList.add('hidden');
            this.showInfo(`Bulk resolution (${this.bulkResolutionAction}) for ${this.selectedFlags.size} items to be implemented`);

            // Clear selections
            this.selectedFlags.clear();
            document.getElementById('select-all-flags-checkbox').checked = false;
            this.updateSelectedFlags();

        } catch (error) {
            console.error('Error in bulk resolution:', error);
            this.showError(`Failed to resolve flags: ${error.message}`);
        }
    }

    // =====================================================
    // LEGACY TOOLS SECTION (existing functionality)
    // =====================================================

    async loadLegacyTools() {
        await this.loadDecks();
    }

    async createDeck() {
        const name = document.getElementById('deck-name').value.trim();
        const description = document.getElementById('deck-description').value.trim();
        const isPublic = document.getElementById('deck-is-public').checked;

        if (!name) {
            this.showError('Deck name is required');
            return;
        }

        try {
            this.setLoading('create-deck', true);

            const { data, error } = await this.supabase.rpc('admin_create_deck', {
                p_admin_id: this.currentUser.id,
                p_name: name,
                p_description: description || null,
                p_is_public: isPublic
            });

            if (error) throw error;

            this.showSuccess(`Deck "${name}" created successfully`);
            this.clearCreateForm();
            await this.loadDecks();

        } catch (error) {
            console.error('Error creating deck:', error);
            this.showError(`Failed to create deck: ${error.message}`);
        } finally {
            this.setLoading('create-deck', false);
        }
    }

    clearCreateForm() {
        document.getElementById('deck-name').value = '';
        document.getElementById('deck-description').value = '';
        document.getElementById('deck-is-public').checked = false;
    }

    async previewCardsByPath() {
        const path = document.getElementById('card-path').value.trim();

        if (!path) {
            this.showError('Please enter an LTREE path');
            return;
        }

        try {
            this.setLoading('preview-cards', true);

            const { data: count, error: countError } = await this.supabase.rpc('admin_count_cards_by_path', {
                p_admin_id: this.currentUser.id,
                p_path_pattern: path
            });

            if (countError) throw countError;

            const { data: cards, error: cardsError } = await this.supabase.rpc('admin_preview_cards_by_path', {
                p_admin_id: this.currentUser.id,
                p_path_pattern: path,
                p_limit: 10
            });

            if (cardsError) throw cardsError;

            this.previewCards = cards;
            this.displayPreview(count, cards, path);
            this.toggleAddButton();

        } catch (error) {
            console.error('Error previewing cards:', error);
            this.showError(`Failed to preview cards: ${error.message}`);
            this.hidePreview();
        } finally {
            this.setLoading('preview-cards', false);
        }
    }

    displayPreview(totalCount, sampleCards, path) {
        const previewContainer = document.getElementById('card-preview');
        const summaryEl = document.getElementById('preview-summary');
        const listEl = document.getElementById('preview-list');

        if (totalCount === 0) {
            summaryEl.innerHTML = `<p class="error-text">No cards found for path "${path}"</p>`;
            listEl.innerHTML = '';
            previewContainer.classList.remove('hidden');
            return;
        }

        summaryEl.innerHTML = `
            <p class="success-text">Found <strong>${totalCount}</strong> cards for path "${path}"</p>
            ${totalCount > 10 ? `<p class="info-text">Showing first 10 cards (${totalCount - 10} more will be added)</p>` : ''}
        `;

        listEl.innerHTML = sampleCards.map(card => `
            <div class="preview-card">
                <div class="preview-card-header">
                    <span class="card-path">${card.path}</span>
                    <span class="card-subject">${card.subject_name}</span>
                </div>
                <div class="preview-card-content">
                    <div class="card-question">${this.truncateText(card.question, 80)}</div>
                    <div class="card-answer">${this.truncateText(card.answer, 60)}</div>
                </div>
            </div>
        `).join('');

        previewContainer.classList.remove('hidden');
    }

    hidePreview() {
        document.getElementById('card-preview').classList.add('hidden');
        this.previewCards = [];
        this.toggleAddButton();
    }

    async addCardsToDeck() {
        const path = document.getElementById('card-path').value.trim();

        if (!this.selectedDeckId || !path || this.previewCards.length === 0) {
            this.showError('Please select a deck and preview cards first');
            return;
        }

        try {
            this.setLoading('add-cards-to-deck', true);

            const { data: cardsAdded, error } = await this.supabase.rpc('admin_add_cards_by_path', {
                p_admin_id: this.currentUser.id,
                p_deck_id: this.selectedDeckId,
                p_path_pattern: path
            });

            if (error) throw error;

            this.showSuccess(`Added ${cardsAdded} cards to deck`);
            this.clearPathForm();
            await this.loadDecks();

        } catch (error) {
            console.error('Error adding cards to deck:', error);
            this.showError(`Failed to add cards: ${error.message}`);
        } finally {
            this.setLoading('add-cards-to-deck', false);
        }
    }

    clearPathForm() {
        document.getElementById('card-path').value = '';
        this.hidePreview();
    }

    toggleAddButton() {
        const addButton = document.getElementById('add-cards-to-deck');
        const canAdd = this.selectedDeckId && this.previewCards.length > 0;
        addButton.disabled = !canAdd;
    }

    async loadDecks() {
        try {
            const { data: decks, error } = await this.supabase.rpc('admin_list_decks', {
                p_admin_id: this.currentUser.id
            });

            if (error) throw error;

            this.populateDeckSelector(decks);

        } catch (error) {
            console.error('Error loading decks:', error);
            this.showError('Failed to load decks');
        }
    }

    populateDeckSelector(decks) {
        const selector = document.getElementById('target-deck');
        selector.innerHTML = '<option value="">Select a deck...</option>';

        decks.forEach(deck => {
            const option = document.createElement('option');
            option.value = deck.deck_id;
            option.textContent = `${deck.deck_name} (${deck.card_count} cards)`;
            selector.appendChild(option);
        });
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setLoading(elementId, isLoading) {
        const element = document.getElementById(elementId);

        if (isLoading) {
            if (element.tagName === 'BUTTON') {
                element.disabled = true;
                element.dataset.originalText = element.textContent;
                element.textContent = 'Loading...';
            } else {
                element.innerHTML = `
                    <div class="loading-spinner"></div>
                    <p>Loading...</p>
                `;
            }
        } else {
            if (element.tagName === 'BUTTON') {
                element.disabled = false;
                element.textContent = element.dataset.originalText;
            }
            // For containers, content will be replaced by render functions
        }
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showInfo(message) {
        this.showMessage(message, 'info');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.temp-message');
        existingMessages.forEach(msg => msg.remove());

        // Create new message
        const messageEl = document.createElement('div');
        messageEl.className = `temp-message ${type}-message`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            max-width: 400px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        `;

        document.body.appendChild(messageEl);

        // Auto remove after 4 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 4000);
    }
}

export default DeckManager;