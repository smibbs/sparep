import database from './database.js';
import { getSupabaseClient } from './supabase-client.js';
import NavigationController from './navigation.js';
import slideMenu from './slideMenu.js';
import { Validator } from './validator.js';

/**
 * Get available decks with card counts for the current user
 * @param {string} userId
 * @returns {Promise<Array>} Array of decks with card counts
 */
async function getAvailableDecks(userId) {
    const supabase = await getSupabaseClient();
    
    try {
        // Get all decks with counts using the optimized view
        // This respects RLS policies - users see public decks, admins see all
        const { data: decks, error } = await supabase
            .from('v_due_counts_by_deck')
            .select('*')
            .eq('user_id', userId)
            .order('deck_name');
            
        if (error) throw error;
        
        return decks || [];
    } catch (error) {
        console.error('Error getting available decks:', error);
        throw error;
    }
}

/**
 * Get overall statistics for all decks combined
 * @param {Array} decks - Array of deck data from v_due_counts_by_deck
 * @returns {Object} Combined statistics
 */
function calculateOverallStats(decks) {
    return decks.reduce((totals, deck) => ({
        total_cards: totals.total_cards + (deck.total_cards || 0),
        total_due: totals.total_due + (deck.total_due_count || 0),
        total_new: totals.total_new + (deck.new_count || 0)
    }), { total_cards: 0, total_due: 0, total_new: 0 });
}

/**
 * Render a single deck card
 * @param {Object} deck - Deck data from v_due_counts_by_deck
 * @returns {string} HTML string for deck card
 */
function renderDeckCard(deck) {
    const safeName = Validator.escapeHtml(deck.deck_name || 'Unnamed Deck');
    const safeDescription = Validator.escapeHtml(deck.deck_description || 'No description available');
    const deckUrl = `deck-study.html?deck=${encodeURIComponent(deck.deck_id)}`;
    
    // Determine deck status
    const isPublic = deck.deck_is_public;
    const hasCards = (deck.total_cards || 0) > 0;
    const hasDueCards = (deck.total_due_count || 0) > 0;
    
    // Generate status indicators
    let statusIndicators = '';
    if (isPublic) {
        statusIndicators += '<span class="deck-status public" title="Public deck"></span>';
    }
    if (hasDueCards) {
        statusIndicators += '<span class="deck-status due" title="Has cards due for review"></span>';
    }
    
    return `
        <a href="${deckUrl}" class="deck-card ${hasCards ? '' : 'empty-deck'}">
            <div class="deck-header">
                <h3 class="deck-name">${safeName}</h3>
                <div class="deck-indicators">
                    ${statusIndicators}
                </div>
            </div>
            <p class="deck-description">${safeDescription}</p>
            <p class="deck-description practice-note">Practice mode – reviews do not affect your FSRS schedule.</p>
            <div class="deck-stats">
                <span class="stat-item">
                    <span class="stat-label">Total:</span>
                    <span class="stat-value">${deck.total_cards || 0}</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">Due:</span>
                    <span class="stat-value ${hasDueCards ? 'has-due' : ''}">${deck.total_due_count || 0}</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">New:</span>
                    <span class="stat-value">${deck.new_count || 0}</span>
                </span>
            </div>
            ${!hasCards ? '<div class="empty-deck-overlay">No cards available</div>' : ''}
        </a>
    `;
}

/**
 * Update the "Study All Decks" card with combined statistics
 * @param {Object} stats - Combined statistics object
 */
function updateStudyAllStats(stats) {
    const totalElement = document.getElementById('total-all-cards');
    const dueElement = document.getElementById('total-due-cards');
    const newElement = document.getElementById('total-new-cards');
    
    if (totalElement) totalElement.textContent = stats.total_cards;
    if (dueElement) dueElement.textContent = stats.total_due;
    if (newElement) newElement.textContent = stats.total_new;
}

// --- Deck Selection Page Logic ---

// Deck selection state management
let deckSelectionState = 'loading';
let deckSelectionLoadingStartTime = null;
const DECK_SELECTION_MINIMUM_LOADING_TIME = 600;
const DECK_SELECTION_TRANSITION_DURATION = 300;

function setDeckSelectionButtonsDisabled(disabled) {
    const retryBtn = document.getElementById('deck-selection-retry-button');
    if (retryBtn) retryBtn.disabled = !!disabled;
    // Never disable logout buttons
}

async function transitionDeckSelectionToState(newState, message = null) {
    if (deckSelectionState === newState) return;
    
    const loading = document.getElementById('deck-selection-loading');
    const error = document.getElementById('deck-selection-error');
    const results = document.getElementById('deck-selection-results');
    const errorMsg = document.getElementById('deck-selection-error-message');
    
    // Ensure minimum loading time
    if (deckSelectionState === 'loading' && deckSelectionLoadingStartTime) {
        const elapsed = Date.now() - deckSelectionLoadingStartTime;
        if (elapsed < DECK_SELECTION_MINIMUM_LOADING_TIME) {
            await new Promise(resolve => setTimeout(resolve, DECK_SELECTION_MINIMUM_LOADING_TIME - elapsed));
        }
    }
    
    // Fade out current state
    const currentElement = getDeckSelectionCurrentStateElement();
    if (currentElement && !currentElement.classList.contains('hidden')) {
        currentElement.classList.add('fade-out');
        await new Promise(resolve => setTimeout(resolve, DECK_SELECTION_TRANSITION_DURATION));
        currentElement.classList.add('hidden');
        currentElement.classList.remove('fade-out');
    }
    
    // Update error message if provided
    if (message && newState === 'error' && errorMsg) {
        errorMsg.textContent = getDeckSelectionFriendlyMessage(message);
    }
    
    // Show new state
    const newElement = getDeckSelectionElementForState(newState);
    if (newElement) {
        newElement.classList.remove('hidden');
        newElement.classList.add('fade-in');
        setTimeout(() => newElement.classList.remove('fade-in'), DECK_SELECTION_TRANSITION_DURATION);
    }
    
    deckSelectionState = newState;
    
    if (newState === 'loading') {
        deckSelectionLoadingStartTime = Date.now();
    }
}

function getDeckSelectionCurrentStateElement() {
    switch (deckSelectionState) {
        case 'loading': return document.getElementById('deck-selection-loading');
        case 'error': return document.getElementById('deck-selection-error');
        case 'results': return document.getElementById('deck-selection-results');
        default: return null;
    }
}

function getDeckSelectionElementForState(state) {
    switch (state) {
        case 'loading': return document.getElementById('deck-selection-loading');
        case 'error': return document.getElementById('deck-selection-error');
        case 'results': return document.getElementById('deck-selection-results');
        default: return null;
    }
}

function getDeckSelectionFriendlyMessage(message) {
    if (!message) return 'Unable to load available decks. Please try again.';
    
    if (/permission denied|42501/i.test(message)) {
        return 'Access issue detected. Please refresh the page or contact support.';
    }
    if (/not found|PGRST116/i.test(message)) {
        return 'Deck data is being prepared. Please try again in a moment.';
    }
    if (/network|fetch/i.test(message)) {
        return 'Connection issue. Please check your internet and try again.';
    }
    if (/not logged in|not authenticated/i.test(message)) {
        return 'Session expired. Please log in again.';
    }
    
    return 'Unable to load available decks. Please try refreshing the page.';
}

async function loadDeckSelection() {
    setDeckSelectionButtonsDisabled(true);
    
    // Start loading state
    await transitionDeckSelectionToState('loading');
    
    try {
        // Get user
        const user = await window.authService.getCurrentUser();
        if (!user) throw new Error('Not logged in');
        
        // Fetch available decks
        const decks = await getAvailableDecks(user.id);
        
        // Calculate overall stats for "Study All" card
        const overallStats = calculateOverallStats(decks);
        updateStudyAllStats(overallStats);
        
        // Render deck cards
        const deckGrid = document.getElementById('deck-grid');
        const noDecksMessage = document.getElementById('no-decks-message');
        
        if (decks.length === 0) {
            deckGrid.innerHTML = '';
            noDecksMessage.classList.remove('hidden');
        } else {
            noDecksMessage.classList.add('hidden');
            deckGrid.innerHTML = decks.map(deck => renderDeckCard(deck)).join('');
        }
        
        // Transition to results view
        await transitionDeckSelectionToState('results');
    } catch (e) {
        console.error('Error loading deck selection:', e);
        // Transition to error state with friendly message
        await transitionDeckSelectionToState('error', e.message || 'Failed to load decks');
    } finally {
        setDeckSelectionButtonsDisabled(false);
    }
}

function setupDeckSelectionEvents() {
    document.getElementById('deck-selection-retry-button')?.addEventListener('click', loadDeckSelection);
    document.getElementById('deck-selection-error-logout-button')?.addEventListener('click', () => window.authService.signOut());
}

// Global navigation controller
let navigationController = null;

// Wait for DOM and authService
window.addEventListener('DOMContentLoaded', async () => {
    // Wait for authService to be available
    while (!window.authService) await new Promise(r => setTimeout(r, 50));
    
    // Initialize slide menu navigation
    await slideMenu.initialize();
    
    // Initialize navigation controller
    navigationController = new NavigationController();
    
    // Phase 1: Deck selection disabled - redirect to main study page
    console.log('🔄 Deck selection disabled in Phase 1 - redirecting to main study page');
    window.location.href = 'index.html';
});