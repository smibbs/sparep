# Client-Server Security Architecture

## Overview

This document outlines the security architecture for the flashcard application, specifically addressing the separation between client-side and server-side security validation.

## Security Principles

### 1. Defense in Depth
- **Client-side checks**: UI optimization and user experience
- **Server-side enforcement**: Actual security and access control
- **Database-level protection**: RLS policies and SECURITY DEFINER functions

### 2. Zero Trust Client Model
- **All client-side data is untrusted**
- **All security decisions made server-side**
- **Client-side checks are purely cosmetic**

## Authentication & Authorization Layers

### Client-Side Methods (UI Optimization Only)

#### ⚠️ auth.js - CLIENT-SIDE ONLY
```javascript
// These methods are for UI display optimization ONLY
async isAdmin()           // Shows/hides admin UI elements
async hasPremiumAccess()  // Shows/hides premium features
async getUserTier()       // Displays user tier information
```

**Use cases:**
- Hiding/showing navigation links
- Displaying different UI elements based on user tier
- Reducing unnecessary server requests
- Improving user experience

**⚠️ NEVER use for:**
- Security decisions
- Access control
- Data protection
- Critical operations

#### ⚠️ admin.js - CLIENT-SIDE ONLY
```javascript
// UI optimization method
async checkAdminAccess()  // For showing admin panels
```

### Server-Side Methods (SECURE)

#### ✅ auth.js - SERVER-SIDE VERIFICATION
```javascript
// These methods perform actual security verification
async verifyAdminAccess()                    // Calls database function
async verifyAdminAccessWithSessionCheck()    // Enhanced verification
```

#### ✅ admin.js - SECURE VERIFICATION
```javascript
// Secure server-side verification
async verifyAdminAccessSecure()  // Uses auth.verifyAdminAccess()
```

#### ✅ Database Functions (PostgreSQL)
```sql
-- Server-side security enforcement
is_admin()                           -- Core admin check with RLS
verify_admin_access()                -- Client-callable admin verification
verify_admin_access_with_session_check()  -- Enhanced verification
validate_active_admin_session()     -- Periodic validation
```

## Security Implementation Patterns

### 1. Dual-Check Pattern for Critical Operations

```javascript
async deleteCard(cardId) {
    // 1. Optional: Client-side check for immediate feedback
    if (!(await this.checkAdminAccess())) {
        alert('Admin access required');
        return;
    }
    
    // 2. REQUIRED: Server-side verification before action
    const isAdminVerified = await this.verifyAdminAccessSecure();
    if (!isAdminVerified) {
        alert('Admin verification failed. Please refresh and try again.');
        return;
    }
    
    // 3. Database operation (protected by RLS policies)
    await supabase.from('cards').delete().eq('id', cardId);
}
```

### 2. Periodic Validation Pattern

```javascript
// Admin pages validate server-side status every 5 minutes
function startPeriodicAdminValidation(auth) {
    setInterval(async () => {
        const isValid = await auth.verifyAdminAccess();
        if (!isValid) {
            // Force re-authentication
            window.location.href = 'login.html';
        }
    }, 5 * 60 * 1000);
}
```

### 3. Database Security Enforcement

All admin operations are protected by:

1. **RLS Policies**: Row-level security based on auth.uid()
2. **SECURITY DEFINER Functions**: Run with elevated privileges but check caller
3. **Enum Constraints**: User tiers validated at database level

```sql
-- Example RLS policy
CREATE POLICY "admin_only_delete" ON cards
FOR DELETE USING (
    (SELECT get_user_tier(auth.uid())) = 'admin'
);
```

## Attack Scenarios & Mitigations

### Scenario 1: Client-Side Bypass
**Attack**: User modifies JavaScript to bypass client-side admin checks
**Mitigation**: Server-side functions reject non-admin users regardless of client state

### Scenario 2: Privilege Escalation
**Attack**: User modifies their user_tier in client-side storage
**Mitigation**: Server always queries database for current user_tier

### Scenario 3: Session Hijacking
**Attack**: Attacker gains access to admin session
**Mitigation**: Periodic server-side validation detects unauthorized access

### Scenario 4: CSRF Attacks
**Attack**: Cross-site request forgery to admin endpoints
**Mitigation**: Supabase JWT tokens and RLS policies prevent unauthorized actions

## Security Testing Checklist

### Client-Side Security Tests
- [ ] Verify UI elements hide/show correctly based on user tier
- [ ] Confirm client-side checks don't affect actual permissions
- [ ] Test that modified client code doesn't bypass server security

### Server-Side Security Tests
- [ ] Verify all admin functions require server-side verification
- [ ] Test that non-admin users receive proper error messages
- [ ] Confirm RLS policies prevent unauthorized data access
- [ ] Validate that database functions properly check auth.uid()

### Integration Tests
- [ ] Test dual-check pattern in critical operations
- [ ] Verify periodic validation works correctly
- [ ] Confirm admin session expires appropriately
- [ ] Test admin access across browser refresh/reload

## Migration Requirements

When implementing these security enhancements:

1. **Run Migration 32**: Creates secure verification functions
   ```sql
   -- Creates verify_admin_access() and related functions
   \i migration/32-secure-admin-verification.sql
   ```

2. **Update Client Code**: Ensure all critical operations use dual-check pattern

3. **Test Security**: Verify both client and server-side protections work

## Security Boundary Summary

| Layer | Purpose | Trust Level | Examples |
|-------|---------|-------------|----------|
| **Client-Side** | UI/UX optimization | UNTRUSTED | Hide buttons, show status |
| **Application Server** | Business logic | TRUSTED | Supabase functions, RLS |
| **Database** | Data protection | TRUSTED | PostgreSQL policies |

## Best Practices

### DO:
- ✅ Use client-side checks for UI optimization
- ✅ Always verify permissions server-side for security
- ✅ Implement periodic validation for admin sessions
- ✅ Use database RLS policies as final protection layer
- ✅ Document which methods are client-side vs server-side

### DON'T:
- ❌ Rely on client-side checks for security
- ❌ Trust user input or client-side state
- ❌ Skip server-side verification for critical operations
- ❌ Assume client-side code cannot be modified
- ❌ Use client-side admin checks for access control

## Conclusion

The security architecture follows a "client for UX, server for security" model where:

- **Client-side code optimizes user experience** but makes no security decisions
- **Server-side verification enforces all security policies**
- **Database-level protection provides the ultimate security boundary**

This approach provides both good user experience and robust security protection.