import { SESSION_CONFIG } from './config.js';
import { Validator } from './validator.js';

/**
 * DeckStudySessionManager
 * Lightweight session manager for deck-specific practice sessions.
 * Sessions loaded through this manager do not mutate FSRS scheduling data.
 */
class DeckStudySessionManager {
    constructor() {
        this.sessionData = null;
        this.dbService = null;
        this.sessionStorageKey = 'deck_study_session';
    }

    detectStorageMethod() {
        return 'memory';
    }

    hasSession() {
        return Boolean(this.sessionData);
    }

    loadSession() {
        // Deck study sessions are ephemeral and not restored across reloads
        return false;
    }

    saveSession() {
        // No persistence required for practice sessions
    }

    getSessionDeckId() {
        return this.sessionData?.deckId || null;
    }

    getDeckMetadata() {
        if (!this.sessionData) {
            return null;
        }

        return {
            id: this.sessionData.deckId,
            name: this.sessionData.deckName,
            totalCardsInSession: this.sessionData.totalCardsInSession,
            totalAvailableCards: this.sessionData.metadata?.totalAvailableCards ?? this.sessionData.totalCardsInSession
        };
    }

    generateSessionId(deckId) {
        return `deck_study_${deckId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    shuffleCards(cards) {
        const shuffled = [...cards];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    transformCard(card, deck) {
        const subjectName = card.subjects?.name || deck?.name || 'Deck Study';

        return {
            card_template_id: card.id,
            cards: {
                question: card.question,
                answer: card.answer,
                id: card.id,
                subject_name: subjectName,
                deck_name: deck?.name || 'Selected Deck',
                tags: Array.isArray(card.tags) ? card.tags : []
            },
            stability: 1.0,
            difficulty: 5.0,
            state: 'practice',
            total_reviews: 0,
            due_at: null,
            last_reviewed_at: null,
            reps: 0,
            lapses: 0,
            correct_reviews: 0,
            incorrect_reviews: 0,
            _cardSource: 'deck-study'
        };
    }

    async initializeSession(userId, dbService, options = {}) {
        Validator.validateUserId(userId, 'deck study session');

        const deckId = options.deckId;
        if (!deckId || typeof deckId !== 'string' || deckId.trim() === '') {
            throw new Error('Deck study requires a valid deck selection.');
        }

        this.dbService = dbService;

        const preferredSize = SESSION_CONFIG?.CARDS_PER_SESSION || 10;
        const requestedSize = Number.isInteger(options.sessionSize) ? options.sessionSize : preferredSize;

        const { deck, cards, totalAvailable } = await dbService.getDeckStudyCards(deckId, requestedSize);

        if (!cards || cards.length === 0) {
            throw new Error('No cards available for the selected deck.');
        }

        const shuffledCards = this.shuffleCards(cards);
        const sessionCards = shuffledCards.slice(0, Math.min(requestedSize, shuffledCards.length));

        this.sessionData = {
            sessionId: this.generateSessionId(deckId),
            userId,
            deckId,
            deckName: deck?.name || 'Selected Deck',
            cards: sessionCards.map(card => this.transformCard(card, deck)),
            totalCardsInSession: sessionCards.length,
            currentCardIndex: 0,
            submittedCount: 0,
            sessionType: 'deck-study',
            status: 'created',
            ratings: {},
            completedCards: new Set(),
            sessionStartTime: new Date().toISOString(),
            metadata: {
                sessionType: 'deck-study',
                deckId,
                deckName: deck?.name || 'Selected Deck',
                totalAvailableCards: totalAvailable,
                fsrsImpact: false
            }
        };

        return true;
    }

    async shuffleAndFinalize(enableShuffle = true) {
        if (!this.sessionData) {
            return false;
        }

        if (enableShuffle) {
            this.sessionData.cards = this.shuffleCards(this.sessionData.cards);
        }

        this.sessionData.currentCardIndex = 0;
        this.sessionData.status = 'active';
        return true;
    }

    getCurrentCard() {
        if (!this.sessionData || !Array.isArray(this.sessionData.cards)) {
            return null;
        }

        while (this.sessionData.currentCardIndex < this.sessionData.cards.length) {
            const candidate = this.sessionData.cards[this.sessionData.currentCardIndex];
            if (!candidate) {
                break;
            }

            const cardId = String(candidate.card_template_id);
            if (!this.sessionData.completedCards.has(cardId)) {
                return candidate;
            }

            this.sessionData.currentCardIndex++;
        }

        return null;
    }

    async recordRating(rating, responseTime) {
        if (!this.sessionData) {
            throw new Error('No active deck study session.');
        }

        Validator.validateRating(rating, 'deck study');
        Validator.validateResponseTime(responseTime, 'deck study');

        const card = this.getCurrentCard();
        if (!card) {
            return false;
        }

        const cardId = String(card.card_template_id);
        if (!this.sessionData.ratings[cardId]) {
            this.sessionData.ratings[cardId] = [];
        }

        this.sessionData.ratings[cardId].push({
            rating,
            responseTime,
            timestamp: new Date().toISOString()
        });

        this.sessionData.completedCards.add(cardId);
        this.sessionData.submittedCount = Math.min(
            this.sessionData.submittedCount + 1,
            this.sessionData.totalCardsInSession
        );
        this.sessionData.currentCardIndex++;

        return true;
    }

    isSessionComplete() {
        if (!this.sessionData) {
            return false;
        }

        return this.sessionData.submittedCount >= this.sessionData.totalCardsInSession;
    }

    getProgress() {
        if (!this.sessionData) {
            return { completed: 0, total: 0, percentage: 0, currentIndex: 0 };
        }

        const completed = this.sessionData.submittedCount;
        const total = this.sessionData.totalCardsInSession;
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        const currentIndex = Math.min(this.sessionData.currentCardIndex + 1, total);

        return {
            completed,
            total,
            percentage,
            currentIndex
        };
    }

    getSessionData() {
        return this.sessionData;
    }

    async loadRatingsFromReviews() {
        // Deck study sessions do not synchronize with review history
    }

    clearSession() {
        this.sessionData = null;
        this.dbService = null;
    }
}

export default DeckStudySessionManager;
