# Daily Review Limit Testing Guide

## Overview
This document describes how to test that the daily review limit enforcement is working correctly to prevent users from circumventing the 10-card daily limit.

## Test Cases

### Test Case 1: Fresh Free User
**Goal**: Verify that a new free user can review up to 10 cards but no more.

**Steps**:
1. Create a new free user account or reset the `reviews_today` count for an existing free user
2. Start a new study session
3. Review exactly 10 cards with any ratings (0, 1, 2, or 3)
4. Attempt to start another session

**Expected Result**: 
- First 10 cards should work normally
- After 10th card, session should complete
- Attempting to start a new session should show "Daily review limit reached" message

### Test Case 2: Page Refresh Circumvention Prevention
**Goal**: Verify that refreshing the page doesn't allow bypassing the limit.

**Steps**:
1. As a free user, review 9 cards
2. Refresh the browser page
3. Attempt to start a new session
4. Try to review more cards

**Expected Result**: 
- After refresh, user should be able to review 1 more card (to reach 10 total)
- After that 1 card, daily limit should be enforced
- No new sessions should be possible until tomorrow

### Test Case 3: Server-Side Enforcement During Review
**Goal**: Verify that if somehow a session is created, the server still blocks reviews at the limit.

**Steps**:
1. As a free user who has already reviewed 10 cards today
2. If somehow a session exists, attempt to rate a card
3. The server should reject the rating

**Expected Result**:
- Server should return "daily_limit_reached" error
- UI should show the daily limit message
- No review should be recorded in the database

### Test Case 4: Paid User Unlimited Reviews
**Goal**: Verify that paid/admin users are not affected by the limits.

**Steps**:
1. Set user_tier to 'paid' or 'admin' in the profiles table
2. Review more than 10 cards in a single day
3. Attempt to start multiple sessions

**Expected Result**:
- No daily limit should be enforced
- User can review unlimited cards
- Multiple sessions can be created

## Manual Testing Commands

### Reset Free User Daily Count (for testing)
```sql
UPDATE profiles SET reviews_today = 0, last_review_date = NULL WHERE user_tier = 'free' AND id = 'USER_ID_HERE';
```

### Set User to Paid Tier (for testing)
```sql
UPDATE profiles SET user_tier = 'paid' WHERE id = 'USER_ID_HERE';
```

### Check Current User Status
```sql
SELECT user_tier, reviews_today, last_review_date FROM profiles WHERE id = 'USER_ID_HERE';
```

### Simulate 9 Reviews (for testing page refresh scenario)
```sql
UPDATE profiles SET reviews_today = 9, last_review_date = CURRENT_DATE WHERE id = 'USER_ID_HERE';
```

## Implementation Details Verified

✅ **Client-Side Pre-Check**: Session initialization checks daily limits before creating sessions

✅ **Server-Side RPC Enforcement**: `record_review()` function validates daily limits before processing reviews

✅ **UI Error Handling**: Both session creation and rating errors display appropriate limit messages

✅ **Database Consistency**: `reviews_today` counter properly tracks daily reviews with date validation

## Test Results

### Pre-Implementation (Vulnerable)
- ❌ Page refresh allowed bypassing limits
- ❌ Client-only validation could be circumvented
- ❌ Multiple sessions per day were possible

### Post-Implementation (Secure)
- ✅ Server-side validation prevents all circumvention attempts
- ✅ Page refresh no longer bypasses limits
- ✅ Daily limits enforced at both session creation and review submission
- ✅ Clear user feedback when limits are reached

## Notes
- The implementation uses both client-side pre-checks (for better UX) and server-side enforcement (for security)
- Free users are limited to exactly 10 reviews per calendar day
- Paid and admin users have effectively unlimited reviews (9999 limit)
- The system properly handles day rollovers and timezone considerations