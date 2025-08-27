# Deck Hierarchy Implementation Guide

## Overview

This implementation adds a hierarchical structure to decks: **cards (card_templates) → subjects → decks**

Users can now:
1. Add entire subjects to decks (all cards from that subject)
2. Add/remove individual cards by their `path` (from card_templates.path column)
3. Maintain full FSRS functionality and existing user progress

## Database Changes

### New Tables

#### `deck_subjects` Junction Table
```sql
deck_id UUID (FK to decks.id)
subject_id UUID (FK to subjects.id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
PRIMARY KEY (deck_id, subject_id)
```

### Updated Functions

#### Subject Management
- `add_subject_to_deck(user_id, deck_id, subject_id)` - Adds entire subject and all its cards
- `remove_subject_from_deck(user_id, deck_id, subject_id)` - Removes subject (preserves studied cards)
- `get_deck_subjects(user_id, deck_id)` - Lists subjects in a deck

#### Individual Card Management  
- `add_card_to_deck_by_path(user_id, deck_id, path)` - Adds single card by path
- `remove_card_from_deck_by_path(user_id, deck_id, path)` - Removes single card by path

#### Enhanced Retrieval
- `get_due_cards_for_user()` - Now filters by deck's subjects
- `get_new_cards_for_user()` - Now filters by deck's subjects  
- `get_deck_content_summary()` - Shows subjects + individual cards in deck

## FSRS Compatibility

### ✅ PRESERVED
- All existing `user_cards` data and progress
- FSRS algorithm parameters and calculations
- Review scheduling and difficulty adjustments
- Composite primary key `(user_id, card_template_id, deck_id)`
- All existing functions: `update_card_after_review()`, `process_card_review()`

### ✅ ENHANCED  
- Card filtering now respects subject-deck relationships
- Backward compatibility with existing decks
- Studied cards are never deleted (preserves FSRS progress)

## Usage Examples

### Adding a Subject to a Deck
```sql
-- Add entire "Firearms Law" subject to user's deck
SELECT add_subject_to_deck(
    'user-uuid'::UUID,
    'deck-uuid'::UUID, 
    'subject-uuid'::UUID
);
-- Automatically creates user_cards for all cards in that subject
```

### Adding Individual Cards by Path
```sql
-- Add specific card from Book 1, Section 7, Item 2, Subitem 1
SELECT add_card_to_deck_by_path(
    'user-uuid'::UUID,
    'deck-uuid'::UUID,
    '1.7.2.1'::LTREE
);
```

### Viewing Deck Contents
```sql
-- See all subjects and individual cards in deck
SELECT * FROM get_deck_content_summary('user-uuid'::UUID, 'deck-uuid'::UUID);
```

### Getting Study Cards (FSRS Compatible)
```sql
-- Get due cards for review (works exactly like before)
SELECT * FROM get_due_cards_for_user('user-uuid'::UUID, 'deck-uuid'::UUID);

-- Get new cards for learning
SELECT * FROM get_new_cards_for_user('user-uuid'::UUID, 'deck-uuid'::UUID);
```

## Migration Process

1. **Run Migration 17**: Creates `deck_subjects` table and subject management functions
2. **Run Migration 18**: Updates card retrieval functions with subject filtering  
3. **Run FSRS Test**: Execute `test-fsrs-compatibility.sql` to verify everything works
4. **Update UI**: Implement frontend for subject/card management

## API Integration Points

### Recommended Endpoints

```
POST   /api/decks/{deck_id}/subjects          - Add subject to deck
DELETE /api/decks/{deck_id}/subjects/{subject_id} - Remove subject from deck
GET    /api/decks/{deck_id}/subjects          - List deck subjects

POST   /api/decks/{deck_id}/cards/by-path     - Add individual card by path  
DELETE /api/decks/{deck_id}/cards/by-path     - Remove individual card by path
GET    /api/decks/{deck_id}/content           - Get complete deck contents

GET    /api/subjects/{subject_id}/cards       - Browse cards in a subject
GET    /api/cards/search?path=1.7.*           - Search cards by path pattern
```

## UI Considerations

### Deck Management Interface
1. **Subject Browser**: Tree view of available subjects
2. **Card Browser**: Hierarchical view using `path` column (1.7.2.1 format)
3. **Current Deck Contents**: Shows both subjects and individual cards
4. **Bulk Actions**: Add/remove entire subjects or card ranges

### Study Interface
- **No changes needed** - existing study flow works identically
- Cards are filtered automatically based on deck's subjects
- All FSRS scheduling continues to work normally

## Backward Compatibility

### Existing Decks
- Continue to work without any changes
- Cards added individually before this update are preserved
- If no subjects are assigned to a deck, all cards in deck are shown (legacy mode)

### Migration Safety
- **No data loss**: All existing `user_cards` are preserved  
- **No FSRS disruption**: Algorithm continues with existing parameters
- **Gradual adoption**: Users can migrate decks to subject-based model over time

## Testing

Run the comprehensive test suite:
```sql
-- Verify FSRS compatibility
\i test-fsrs-compatibility.sql
```

Tests verify:
- Database structure integrity
- FSRS algorithm preservation  
- Card filtering accuracy
- Subject addition/removal
- Progress preservation

## Security

### Row Level Security (RLS)
- Users can only manage their own deck subjects
- Subject visibility respects existing `is_public` and creator permissions  
- Card access maintains existing flagging and visibility rules
- Admin users have full management capabilities

### Data Integrity
- Foreign key constraints prevent orphaned relationships
- Check constraints validate input parameters
- Triggers maintain timestamp consistency
- FSRS progress is never lost during subject operations

## Performance Considerations

### New Indexes
- `idx_deck_subjects_deck_id` - Fast deck → subjects lookup
- `idx_deck_subjects_subject_id` - Fast subject → decks lookup
- Enhanced card retrieval uses existing optimized indexes

### Query Optimization
- Card filtering uses efficient JOIN operations
- Subject-based queries leverage existing `card_templates` indexes
- Path-based lookups use existing LTREE indexes (`idx_card_templates_path_gist`)

## Troubleshooting

### Common Issues

**Q: Cards not appearing in deck after adding subject**
A: Check if cards are flagged (`flagged_for_review = FALSE`) and subject is active (`is_active = TRUE`)

**Q: FSRS progress lost after subject removal**  
A: This shouldn't happen - studied cards are preserved. Check `remove_subject_from_deck()` only removes unstudied cards.

**Q: Performance slow with large subjects**
A: Ensure database indexes are present. Run `ANALYZE` on tables after bulk operations.

### Debug Queries
```sql
-- Check deck-subject relationships
SELECT d.name, s.name, ds.created_at 
FROM deck_subjects ds
JOIN decks d ON d.id = ds.deck_id  
JOIN subjects s ON s.id = ds.subject_id
WHERE d.user_id = 'your-user-id';

-- Verify card filtering logic
SELECT ct.question, ct.subject_id, uc.state, uc.deck_id
FROM user_cards uc
JOIN card_templates ct ON ct.id = uc.card_template_id
WHERE uc.user_id = 'your-user-id' AND uc.deck_id = 'your-deck-id';
```

## Summary

This implementation successfully adds the requested **cards → subjects → decks** hierarchy while:

✅ **Preserving FSRS**: All algorithm functionality remains identical  
✅ **Maintaining Data**: No existing progress is lost  
✅ **Adding Flexibility**: Users can manage by subjects OR individual cards  
✅ **Ensuring Performance**: Optimized queries and indexes  
✅ **Providing Safety**: Comprehensive testing and rollback capabilities  

The system is now ready for frontend implementation and user adoption!