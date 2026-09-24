# Fix: "Any workspace member can email anyone"

## Findings (current invitation flow)

**Files and actions**
- `src/lib/invitations.functions.ts` — `inviteWorkspaceMember` (sends the email), `resendWorkspaceInvitation`, `cancelWorkspaceInvitation`, `previewWorkspaceInvitation`, `acceptWorkspaceInvitation`. They're called through the normal internal server-call endpoint, not a public API route.
- `src/lib/invitations.server.ts` — `assertMayInvite`, `assertRoleAssignable`, `createInvitation`, `resendInvitation`, `cancelInvitation`.
- Database function `create_workspace_invitation` (migration 20260914201709) — locks the workspace's seat count, catches duplicates and existing members, and enforces the seat limit.
- `src/routes/_authenticated/team.tsx` — the invite form. It sends `window.location.origin` as `origin`.

**Who can invite:** Owner and Administrator, plus anyone given an explicit Allow for `workspace.team.invite`. Manager, Staff, Viewer and Auditor can't.

**Server or page check:** the check runs on the server (`assertMayInvite` runs before anything is written). The sender must be an active member of the workspace.

**Workspace ID:** it's worked out on the server from the sender's session (`resolveCurrentWorkspace`). The browser can't supply or change it.

**Roles that can be assigned:** never Owner, only roles on the invitable list, and never a role ranked above the sender's own.

**Invitation link:** a random 32-byte token. Only its SHA-256 hash is stored, it expires after 7 days, and it can be used once (accepting it changes the status).

**Existing controls:**
- One pending invitation per workspace and email address.
- Existing members can't be re-invited.
- Pending invitations count against the seat limit.
- Every create, resend and cancel is written to the audit log without the token.
- There is **no rate limit** of any kind.

**What the browser can supply:**
- The recipient email, role, display name and app access (all checked on the server).
- An `origin`. **It's only checked to start with "http"**, and it becomes both the link in the email and the address the sign-up email sends people to afterwards.
- Email wording, sender name and reply-to can't be supplied; the email template is fixed.

**Direct calls:** calling the action directly, without the page, sends the same email if the caller passes the checks above.

**The misuse the scan found, plus two related gaps:**
1. **Unlimited emails.** An Owner or Administrator (including any trial or free-plan owner) can invite any address. Cancelling and re-inviting frees the pending slot and the seat, so repeating the loop sends unlimited official OneSuite emails to any list of addresses.
2. **Phishing link (more serious).** A direct call with `origin: "https://evil.example"` puts an attacker's link inside a real OneSuite invitation email. Whether the sign-in service's allowed-address list blocks the final redirect isn't confirmed, and the link we build and return is attacker-controlled either way.
3. **Resend** returns a fresh link built from the browser-supplied origin in the same way. It doesn't send an email itself.

## Proposed fix (server-side only, no database change)

1. **Server-owned link address.** Remove `origin` from the invite and resend inputs; the server ignores it if sent anyway. Build every link from a fixed server allowlist:
   - Published: `https://tpcamponesuite.app`. Also allow `https://www.tpcamponesuite.app` and `https://tpcamponesuite.lovable.app`.
   - Preview: the preview address.
   - The link is chosen from the request's own host only when that host is on the allowlist; otherwise it falls back to the main domain.
2. **Rate limits**, counted from existing records (invitation rows and the audit log), so no new table is needed:
   - Per sender: at most 20 invitation emails per hour and 50 per day.
   - Per workspace: at most 50 per day.
   - Per email address, across all workspaces: at most 3 per day.
   - Re-inviting the same address in the same workspace after cancelling: at most 3 per day.
   - Refusals use plain messages such as "Too many invitations right now. Try again later."
3. **Repeat controls:** the existing pending-invitation and member checks stay. The per-email and re-invite limits close the cancel-and-re-invite loop.
4. **Paid plan required to send email.** The workspace must have an active plan (the same `deriveAccess` check the rest of the app uses). Trial counts as active. Without one, the refusal reads "Your plan must be active to invite team members."
5. **Keep as is:** the permission check, server-side workspace, role limits, hashed expiring single-use tokens, fixed email template, and the resend flow's existing cap on repeat sends.
6. **Audit:**
   - Every refusal is logged as a new audit action, `invitation_refused_rate_limited` or `invitation_refused_plan`, with the recipient's email and no token.
   - The server log records only safe codes.
   - Raw sign-in service errors no longer reach the browser: the `emailError` field is replaced by a plain message.
7. **Per-IP limit: not proposed.** It would mean storing visitor IP addresses, a new privacy practice not covered by the current policies. The per-user and per-workspace limits already cover the misuse, since sending requires a signed-in account.

To make testing possible, the checks move into a small gated core (same pattern as the Contract Builder fix). The recording database and email sender are passed in, so the tests use the real code path.

## Affected files
- `src/lib/invitations.functions.ts` — remove `origin`; delegate to the core.
- `src/lib/invitations.core.ts` (new) — the permission, plan, rate-limit and link-address checks, then create or resend, then send the email.
- `src/lib/invitation-links.server.ts` (new) — the fixed allowlist of link addresses.
- `src/lib/invitations.server.ts` — small change: return the plain error instead of the raw one.
- `src/routes/_authenticated/team.tsx` — stop sending `origin`; show the new plain messages.
- `src/lib/invitations.test.ts` (new).

No migration, no access-rule changes, no secrets, no registration or delivery changes.

## Acceptance tests (direct calls to the core; no real email is sent)
1. A Staff, Manager, Viewer or Auditor caller is refused, and no email is sent.
2. A suspended or removed member is refused.
3. Identifiers for another workspace in the input are ignored; the invitation goes to the sender's own workspace.
4. The Owner role can't be assigned; a role above the sender's own is refused.
5. An `origin` pointing to evil.example is ignored; the email link and the returned link use the allowlisted domain.
6. A request host not on the allowlist falls back to the main domain.
7. The 21st invitation from one sender within an hour is refused, and no email is sent.
8. The workspace daily limit is enforced.
9. The per-email limit across workspaces is enforced.
10. The cancel-and-re-invite loop stops after 3 invitations per day.
11. A workspace with an expired or no plan is refused; a trial is allowed.
12. Refusals are written to the audit log with no token or hash.
13. A raw sign-in service error never reaches the result.
14. A legitimate Owner or Administrator invitation succeeds, and exactly one email is sent.
15. Resend links use the allowlisted domain.
16. Static guard: every invite action goes through the core.
17. All existing tests still pass, plus a type check, a production build and a fresh security scan.

Not in scope: publishing, sending a real invitation, customer data, credentials, registration delivery.
