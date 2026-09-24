# Contract Builder: server-side plan check

## What changes
Every contract and business-profile server action checks, on the server, that the caller's current OneSuite workspace has an active plan that includes Contract Builder. If it doesn't, the action refuses with: "Your plan doesn't include Contract Builder." Page visibility and navigation are not relied on. Direct calls that skip the page are refused the same way.

Decision (answered): team members follow the workspace plan only. Any active member of a workspace whose active plan includes Contract Builder may use it. No new permission and no database change.

## Affected server actions (all in `src/lib/contracts.functions.ts`)
| Action | Used by | Existing checks today | Plan check today |
|---|---|---|---|
| `getBusinessProfile` | contracts pages, business profile page | sign-in required; row filtered to caller's own user ID; database access rules | none |
| `saveBusinessProfile` | business profile page | sign-in required; writes only caller's own row; input validated | none |
| `listContracts` | contracts list | sign-in required; filtered to caller's own user ID; database access rules | none |
| `getContract` | contract editor | sign-in required; ID + own user ID filter | none |
| `saveContract` (create and update) | contract editor | sign-in required; update filtered to own user ID; input validated | none |
| `deleteContract` | contracts list | sign-in required; filtered to own user ID | none |

No other server actions touch the `contracts` or `business_profiles` tables. (The CRM payload builder reads business profiles through its own Super Admin-only path. It is not part of the contract builder and is unchanged.)

All existing checks stay exactly as they are. The plan check is added before them.

## Proposed shared check
New server-only file `src/lib/contract-access.server.ts`:

```ts
export const CONTRACT_BUILDER_DENIED = "Your plan doesn't include Contract Builder.";

// Pure decision, unit-tested.
export function decideContractAccess(input: {
  isSuperAdmin: boolean;
  workspace: { id: string; status: string } | null;       // caller's current workspace
  activeMember: boolean;                                   // active membership in it
  entitlement: { plan_id: string | null; status: string; access_expiry_date: string | null } | null;
  now?: number;
}): { ok: true; workspaceId: string | null } | { ok: false };

// Loads the inputs, then calls decideContractAccess. Throws the plain message on refusal.
export async function requireContractBuilder(userId: string): Promise<{ workspaceId: string | null }>;
```

Each of the six handlers calls `await requireContractBuilder(context.userId)` first. It's loaded inside the handler with a dynamic import, so no server-only code reaches the browser.

### How it decides
1. **Current workspace:** the existing `resolveCurrentWorkspace(userId)`. This is the same resolver used by the dashboard and single sign-on. It only picks active memberships in active workspaces, and prefers a workspace the user owns. Nothing comes from the browser.
2. **Membership:** the resolver only returns workspaces where the caller has an `active` membership. Suspended or removed members get nothing.
3. **Active plan:** the existing `workspaceEntitlementRow(workspaceId)`. It reads the workspace owner's plan record (the same record billing writes), refreshes expiry, and ignores a record linked to a different workspace. The plan must pass the existing `deriveAccess` rule: the status is active or trial, the expiry is in the future (or there is none), and a plan exists.
4. **Feature included:** a new code-only flag `contractBuilder: boolean` in `PlanFeatures` in `src/lib/plans.ts`. It is `true` for Starter, Growth, Pro and Institutional, because every published plan already advertises the contract builder and has a monthly contract allowance. An unknown plan ID means the feature is not included. The workspace's allowed-apps list is not used, because Contract Builder is a OneSuite feature, not a child app.
5. **User permission:** the plan decides alone, as you chose. Staff in a covered workspace are allowed, and the existing own-user-ID filters still apply.
6. **Super Admin:** allowed, matching the existing platform rule (`has_tier_access` already lets super admins through).

Contracts and business profiles stay scoped to the caller's own user ID, as today. A user can never read or change another person's contracts or profile, in any workspace.

### Error handling
- On refusal, the handler throws an error whose message is exactly the plain sentence. The server log records the fixed code `contract_builder_not_entitled`, with no user data.
- The contracts, contract editor and business profile pages show that message with a "See plans" link, instead of a raw error.

## Migration / configuration
None. No database migration, no access-rule change, no secrets and no settings. The existing plan records are sufficient.

## Files
- New: `src/lib/contract-access.server.ts`
- New: `src/lib/contract-access.test.ts`
- Edit: `src/lib/contracts.functions.ts` (one call at the top of each of the six handlers)
- Edit: `src/lib/plans.ts` (add the `contractBuilder` flag)
- Edit: `src/routes/_authenticated/contracts/index.tsx`, `src/routes/_authenticated/contracts/$contractId.tsx` and `src/routes/_authenticated/business-profile.tsx`, to show the plain refusal message

## Tests (vitest, in-memory fakes, no real data)
1. No plan: refused.
2. Expired plan: refused. Cancelled, pending or suspended plan: refused.
3. Active plan whose definition has `contractBuilder: false` (test fixture), or an unknown plan ID: refused.
4. Active Starter, Growth, Pro or Institutional plan: allowed.
5. Staff with an active membership in a covered workspace: allowed. Staff whose membership is suspended or removed: refused. Staff whose workspace plan expired: refused. Staff in an uncovered workspace: refused, even if they own a separate plan elsewhere that isn't their current workspace's.
6. Workspace isolation: a plan record linked to a different workspace doesn't cover this one. Every contract and profile query still filters by the caller's own user ID (checked by inspecting the handler source).
7. Direct calls: all six handlers call `requireContractBuilder` before any database access. This is a static check over `contracts.functions.ts`, so a new handler without the check fails the test.
8. Existing paid users: an active paid owner (like the CMMG RECORDS Growth plan) and its active Staff are allowed. Currently there are 0 contracts and 1 business profile in the database, so no existing work is lost.
9. Super Admin allowed. The refusal message is exactly "Your plan doesn't include Contract Builder." and contains no internal details.
10. All 74 existing tests still pass.

## After approval
Run all tests, type check, production build and a fresh deep security scan. Report whether "Unpaid users can use the contract builder" is cleared.

## Not in scope
Registration feed code, credentials, workspaces, database access rules, delivery settings, customer data, legal pages, contract monthly limits, publishing.
