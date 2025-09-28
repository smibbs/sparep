# System Architecture - nanotopic

## Content Model: Admin-Curated, User-Consumed

This system follows an **admin-curated content model** where administrators create and manage all content, and users consume published content based on their access level.

### Key Principles

#### 1. Content Creation (Admin-Only)
- **Only administrators create content**: cards, decks, subjects
- **Regular users cannot create content**: they are consumers, not creators
- **Content curation**: Admins decide what content gets published to users

#### 2. ID Field Usage
- **`user_id` fields**: Track which **admin** created the content, NOT user ownership
- **`creator_id` fields**: Track which **admin** created the content, NOT user ownership
- **Purpose**: Administrative tracking and accountability, not access control

#### 3. Access Control Model
Content visibility is determined by:
- **Public flags**: `is_public` on cards/decks/subjects
- **Admin flags**: `flagged_for_review` allows admins to hide individual cards
- **User tiers**: `free`, `paid`, `admin` determine access levels
- **NOT by ownership**: Users don't own content, they consume published content

#### 4. User Types and Access
- **Free users**: Access to public content (with daily limits)
- **Paid users**: Access to public content (with higher/unlimited limits)
- **Admin users**: Full access to all content + content management

### Database Schema Implications

#### RLS (Row Level Security) Policies
The RLS policies should reflect the consumption model:

```sql
-- ✅ CORRECT: Content visibility based on public flags
-- ❌ INCORRECT: Content visibility based on user ownership

-- Subjects: Visible if they contain public, unflagged cards
CREATE POLICY "Users can view subjects with public cards" ON subjects
FOR SELECT USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM card_templates ct
    WHERE ct.subject_id = subjects.id
    AND ct.is_public = true
    AND ct.flagged_for_review = false
  )
);

-- Cards: Visible if public and not flagged
CREATE POLICY "Public unflagged cards are viewable by all" ON card_templates
FOR SELECT USING (is_public = true AND flagged_for_review = false);

-- Decks: Visible if public
CREATE POLICY "Users can view public decks" ON decks
FOR SELECT USING (is_public = true);
```

#### Tables and Relationships
- **subjects**: Organizational structure (hierarchical with ltree paths)
- **card_templates**: Core learning content
- **decks**: Collections of cards (auto-managed via card_deck_assignments)
- **card_deck_assignments**: Auto-assigns cards to decks based on subject hierarchy
- **user_cards**: Individual user progress on cards
- **profiles**: User accounts and tier information

### Content Workflow

#### Admin Workflow
1. **Create subjects**: Organize content hierarchically
2. **Create cards**: Assign to subjects, set public/private
3. **Manage decks**: Auto-generated or manually created collections
4. **Content review**: Use `flagged_for_review` to hide/show cards
5. **Publish content**: Set `is_public = true` for user access

#### User Workflow
1. **Browse available content**: See subjects/decks with public cards
2. **Start study sessions**: Cards filtered by tier and daily limits
3. **Track progress**: Individual learning state maintained
4. **No content creation**: Users consume, not create

### Migration Notes

This documentation was created during a migration from a mixed model (some user-generated content RLS policies) to a pure admin-curated model. The RLS policies were updated to reflect that regular users are consumers, not creators.

#### Previous Issues
- User ownership RLS policies prevented paid users from seeing public content
- Only 6 subjects visible instead of expected 99+ subjects with public cards
- Content access incorrectly based on `creator_id` rather than public flags

#### Resolution
- Updated RLS policies to focus on content publication flags
- Removed user ownership requirements for content viewing
- Maintained admin-only content creation and management