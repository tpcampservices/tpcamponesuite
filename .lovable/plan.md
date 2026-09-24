# Fix: "Any workspace member can email anyone" (revision 2)

## Findings (unchanged from revision 1, summarized)

**Files and actions**
- `src/lib/invitations.functions.ts`: `inviteWorkspaceMember` and `resendWorkspaceInvitation`.
- `src/lib/invitations.server.ts`: `assertMayInvite`, `assertRoleAssignable`, `createInvitation`, `resendInvitation`.
- Database function `create_workspace_invitation`.
- `src/routes/_authenticated/team.tsx`.

**What is already in place**
- Only the Owner, an Administrator, or someone with an explicit Allow for `workspace.team.invite` can invite. The sender must be an active member.
- The workspace comes from the server, not the browser.
- Owner can never be granted, and a sender can't assign a role above their own.
- Invitation links use a random 32-byte token. Only its hash is stored; it expires after 7 days and works once.
- There is one pending invitation per workspace and address, and the seat limit applies.

**Gaps**
- No rate limit.
- A cancel-and-re-invite loop can repeat without end.
- The link address comes from the browser (`origin`), checked only to start with "http".

**When an email is actually sent today**
- `inviteWorkspaceMember` sends an email **only when the address has no OneSuite account**. It uses the sign-in service's invite email.
- For an address that already has an account, **no email is sent**; the inviter gets the link to share.
- `resendWorkspaceInvitation` **never sends an email**. It rotates the token, extends the expiry and returns a new link. It already requires the invite permission and the invitation must belong to the sender's own workspace.

## Revised design

### 1. Atomic send allowance (small migration: disclosed below)
A new ledger table records each **attempt to send an invitation email**. A database function reserves a slot inside one transaction before the email is sent.

**Concurrency rule:** the function takes transaction locks for the sender, the workspace and the recipient, always in that same order to avoid deadlocks. It then counts and inserts under those locks. Simultaneous requests are processed one at a time, so none can pass on the same count.

**What counts.** Only ledger rows with status `reserved` or `sent` count, within a rolling window. Rules:
- **Initial send:** a slot is reserved immediately before `inviteUserByEmail` runs.
- **Delivery succeeded:** the slot becomes `sent` and keeps counting.
- **Delivery failed:** the slot becomes `failed` and **stops counting**, because no email went out. To stop repeated failures being used to probe addresses, a separate cap allows 10 failed attempts per sender per day.
- **Server stopped before recording the result:** a reservation older than 10 minutes that was never finalized still counts. It's treated as sent to be safe.
- **Invitations to existing accounts** send no email, so they reserve nothing and don't count.
- **Resend** sends no email today, so it doesn't count. If resend ever starts sending email, it must use the same reservation with type `resend`, and the tests cover that path already (see 9–10).
- **Never counted:** previewing, cancelling, accepting, or creating an invitation record with no email.

**Limits (rolling windows, counted on reserved and sent slots):**

| Limit | Window | Key |
|---|---|---|
| 20 per sender | 1 hour | sender user ID |
| 50 per sender | 24 hours | sender user ID |
| 50 per workspace | 24 hours | workspace ID |
| 3 per recipient | 24 hours | recipient email hash, across all workspaces |
| 3 re-invitations per recipient per workspace | 24 hours | workspace ID + recipient email hash |

### 2. Email normalization
Every duplicate check, limit and hash uses one shared function: `normalizeEmail`, which trims and lowercases. The pending-invitation check and the database function already use this form. The ledger stores `sha256(normalizeEmail(email))`, never the address itself.

### 3. Exact trusted link addresses
- A fixed list lives in code (not secrets):
  - `https://tpcamponesuite.app`
  - `https://www.tpcamponesuite.app`
  - `https://tpcamponesuite.lovable.app`
  - The exact preview address `https://id-preview--78e0852d-a4cf-409c-9124-a9a045dc4411.lovable.app`
- Matching is exact on the whole string. There is no wildcard, suffix or partial match.
- The `origin` input is removed from the invite and resend actions.
- The request's Origin header is used only if it exactly equals a listed entry. Otherwise the link uses `https://tpcamponesuite.app`.
- Host, Forwarded and X-Forwarded-Host are never read.

### 4. Resend
Resend stays link-only, with no email sent. The new link uses the trusted address. The permission and same-workspace checks run before the token is rotated, so an unauthorized caller gets a refusal, not a link.

### 5. Plan check
The workspace must have an active plan (the same rule as the rest of the app; trial counts) before any email is reserved.

### 6. Audit and personal data
- A refused send writes `invitation_refused_rate_limited` or `invitation_refused_plan` to `team_audit_log`. The entry holds the limit name, a masked email (for example `j***@gmail.com`) and the email hash.
- It never holds a token, a token hash, the full address or raw errors.
- **Why not the full email address:** it isn't needed. The masked form lets a workspace admin recognize the attempt, and the hash lets them match it against the ledger. That exposes less personal data.
- **Hash limitation:** a plain SHA-256 of an email can be reversed by guessing likely addresses. Using a server secret (keyed hashing) would fix that, but it means creating a new secret, which isn't approved here. So the hash is stored only in the ledger, which no browser role can read at all, and in the refusal audit rows.
- `team_audit_log` access is unchanged: only that workspace's team viewers can read it, through the existing rule.
- Successful sends keep the existing `invitation_created` entry, which already holds the invitee's email as part of normal team records.

## Migration (to be applied only after approval)

```sql
CREATE TABLE public.invitation_send_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  actor_user_id uuid NOT NULL,
  email_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('initial','resend')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','sent','failed')),
  invitation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
GRANT ALL ON public.invitation_send_ledger TO service_role;   -- no anon/authenticated access
ALTER TABLE public.invitation_send_ledger ENABLE ROW LEVEL SECURITY;  -- no policies = locked to browsers
CREATE INDEX ON public.invitation_send_ledger (actor_user_id, created_at);
CREATE INDEX ON public.invitation_send_ledger (workspace_id, created_at);
CREATE INDEX ON public.invitation_send_ledger (email_hash, created_at);

-- reserve_invitation_send(_workspace, _actor, _email_hash, _kind, _invitation_id) RETURNS uuid
--   SECURITY DEFINER, search_path=public
--   pg_advisory_xact_lock('inv-actor:'||actor), ('inv-ws:'||ws), ('inv-email:'||hash)  -- fixed order
--   counts rows WHERE status='sent' OR (status='reserved') in each window
--   (stale reservations count, being status='reserved')
--   failed-attempt cap: 10 status='failed' per actor per 24h
--   RAISE EXCEPTION 'invite_limit:<name>' on any breach; else INSERT reserved, return id
-- finalize_invitation_send(_id uuid, _ok boolean) RETURNS void
--   UPDATE status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END, finalized_at=now()
--   WHERE id=_id AND status='reserved'
-- EXECUTE on both: REVOKE from PUBLIC/anon/authenticated; GRANT to service_role only.
```

The migration is additive only: it doesn't change existing tables, rules or data.

**Rollback**
1. Restore the previous app version from history. The old code doesn't use the ledger.
2. Optionally remove the ledger through the SQL editor: `DROP FUNCTION finalize_invitation_send, reserve_invitation_send; DROP TABLE invitation_send_ledger;`. It holds only counters and hashes, no customer content.

Invitations, memberships and audit history aren't affected either way.

## Affected files
- `src/lib/invitations.functions.ts`: remove `origin`, delegate to the core.
- `src/lib/invitations.core.ts` (new): the permission, plan and trusted-address checks, then reserve, send, and finalize. The database and email sender are passed in so tests use the real path.
- `src/lib/invitation-links.server.ts` (new): the exact address list and the Origin-header rule.
- `src/lib/invitations.server.ts`: expose the reserve and finalize wrappers; return plain error messages.
- `src/routes/_authenticated/team.tsx`: stop sending `origin`; show the plain limit messages.
- `src/lib/invitations.test.ts` (new), plus a database-level concurrency script for tests 1–5 against the real function. It runs only against a fictional workspace and IDs created inside a rolled-back transaction, with no customer data and no email sent.

## Acceptance tests
**Concurrency, run against the real database function with parallel calls:**
1. 30 simultaneous sends from one sender: exactly 20 reserved, 10 refused as `sender_hourly`.
2. Sender daily cap: with 45 sends already in the ledger outside the last hour, 10 simultaneous sends leave exactly 50 counted in the day.
3. Workspace daily cap, spread across several senders: exactly 50.
4. 6 simultaneous sends to one recipient across 3 workspaces: exactly 3.
5. 6 simultaneous re-invitations of one recipient in one workspace: exactly 3.

**Normalization:**

6. `"  Jane@Example.COM "` and `"jane@example.com"` share one hash, count as one recipient, and hit the duplicate-pending rule.

**Send accounting:**

7. A failed delivery releases its slot. The 11th failure in a day is refused. A stale reservation still counts.
8. Inviting an existing account, cancelling or previewing uses no allowance.

**Resend:**

9. Concurrent resends send no email and use no allowance; each returns a trusted-address link to the authorized inviter.
10. A resend from someone with no invite permission, from another workspace, or for someone else's invitation ID is refused, and no link or new token is created.

**Trusted addresses:**

11. An `origin` input of `https://evil.example` is ignored.
12. Origin, Host, Forwarded and X-Forwarded-Host headers set to `evil.example` or `tpcamponesuite.app.evil.example` are all ignored; the link uses the main domain.
13. The exact preview Origin is accepted.

**Authorization:**

14. Staff, Manager, Viewer and Auditor are refused, as are suspended and removed members. Identifiers for another workspace are ignored. Owner can't be assigned, and no role above the sender's own.
15. A workspace with an expired plan or no plan is refused before any reservation.

**Audit:**

16. Refusal audit rows hold the masked email and its hash, with no token, token hash, full address or raw error.

**Legitimate use:**

17. An Owner or Administrator invitation sends exactly one email and records exactly one `sent` slot.

**Guards and regression:**

18. Static guard: every invite and resend action goes through the core.
19. All existing tests pass, plus a type check, a production build and a fresh security scan.

Not in scope: publishing, sending real invitations, customer data, credentials or secrets, registration delivery.
