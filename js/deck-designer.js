import { getSupabaseClient } from './supabase-client.js';

class DeckDesigner {
    constructor() {
        this.supabasePromise = getSupabaseClient();
        this.currentUser = null;
        this.selectedDeckId = null;
        this.previewCards = [];
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
            await this.loadDecks();
        } catch (error) {
            console.error('Failed to initialize DeckDesigner:', error);
            this.showError('Failed to initialize deck designer');
        }
    }

    setupEventListeners() {
        // Create deck form
        document.getElementById('create-deck').addEventListener('click', () => this.createDeck());
        document.getElementById('clear-form').addEventListener('click', () => this.clearCreateForm());
        
        // Path management
        document.getElementById('preview-cards').addEventListener('click', () => this.previewCardsByPath());
        document.getElementById('add-cards-to-deck').addEventListener('click', () => this.addCardsToDeck());
        
        // Deck selection
        document.getElementById('target-deck').addEventListener('change', (e) => {
            this.selectedDeckId = e.target.value;
            this.toggleAddButton();
        });
        
        // Other controls
        document.getElementById('refresh-decks').addEventListener('click', () => this.loadDecks());
        
        // Enter key handling
        document.getElementById('card-path').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.previewCardsByPath();
            }
        });
    }

    // =====================================================
    // DECK CREATION
    // =====================================================

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

    // =====================================================
    // CARD PREVIEW AND ADDITION
    // =====================================================

    async previewCardsByPath() {
        const path = document.getElementById('card-path').value.trim();
        
        if (!path) {
            this.showError('Please enter an LTREE path');
            return;
        }

        try {
            this.setLoading('preview-cards', true);

            // Get card count
            const { data: count, error: countError } = await this.supabase.rpc('admin_count_cards_by_path', {
                p_admin_id: this.currentUser.id,
                p_path_pattern: path
            });

            if (countError) throw countError;

            // Get preview cards (limit to first 10 for display)
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

    // =====================================================
    // DECK MANAGEMENT
    // =====================================================

    async loadDecks() {
        try {
            const { data: decks, error } = await this.supabase.rpc('admin_list_decks', {
                p_admin_id: this.currentUser.id
            });

            if (error) throw error;

            this.displayDecks(decks);
            this.populateDeckSelector(decks);

        } catch (error) {
            console.error('Error loading decks:', error);
            this.showError('Failed to load decks');
        }
    }

    displayDecks(decks) {
        const listContainer = document.getElementById('deck-list');

        if (decks.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No decks created yet. Create your first deck above.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = decks.map(deck => `
            <div class="deck-item" data-deck-id="${deck.deck_id}">
                <div class="deck-header">
                    <h4 class="deck-name">${deck.deck_name}</h4>
                    <div class="deck-meta">
                        <span class="deck-card-count">${deck.card_count} cards</span>
                        <span class="deck-visibility ${deck.is_public ? 'public' : 'private'}">
                            ${deck.is_public ? 'Public' : 'Private'}
                        </span>
                    </div>
                </div>
                <div class="deck-description">${deck.description || 'No description'}</div>
                <div class="deck-actions">
                    <button class="btn btn-small btn-primary" onclick="deckDesigner.toggleVisibility('${deck.deck_id}', ${!deck.is_public})">
                        Make ${deck.is_public ? 'Private' : 'Public'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="deckDesigner.deleteDeck('${deck.deck_id}', '${deck.deck_name}')">
                        Delete
                    </button>
                </div>
                <div class="deck-timestamps">
                    Created: ${new Date(deck.created_at).toLocaleDateString()} | 
                    Updated: ${new Date(deck.updated_at).toLocaleDateString()}
                </div>
            </div>
        `).join('');
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

    async toggleVisibility(deckId, isPublic) {
        try {
            const { error } = await this.supabase.rpc('admin_set_deck_visibility', {
                p_admin_id: this.currentUser.id,
                p_deck_id: deckId,
                p_is_public: isPublic
            });

            if (error) throw error;

            this.showSuccess(`Deck visibility updated to ${isPublic ? 'public' : 'private'}`);
            await this.loadDecks();

        } catch (error) {
            console.error('Error updating deck visibility:', error);
            this.showError(`Failed to update visibility: ${error.message}`);
        }
    }

    async deleteDeck(deckId, deckName) {
        if (!confirm(`Are you sure you want to delete deck "${deckName}"? This cannot be undone.`)) {
            return;
        }

        try {
            const { error } = await this.supabase.rpc('admin_delete_deck', {
                p_admin_id: this.currentUser.id,
                p_deck_id: deckId
            });

            if (error) throw error;

            this.showSuccess(`Deck "${deckName}" deleted successfully`);
            await this.loadDecks();

        } catch (error) {
            console.error('Error deleting deck:', error);
            this.showError(`Failed to delete deck: ${error.message}`);
        }
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    setLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = 'Loading...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText;
        }
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
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
            background: ${type === 'success' ? '#28a745' : '#dc3545'};
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

export default DeckDesigner;