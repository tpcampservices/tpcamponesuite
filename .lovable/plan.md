# Workspace-aware dashboard fix

## Goal
Show ordinary team members the workspace, role, plan, and per-app access that actually authorize them, while preserving the Owner’s existing billing dashboard and all current payment, entitlement, seat, SSO, and authorization behavior.

## Changes
1. Add a read-only dashboard summary server function that:
   - uses the existing centralized workspace/application resolvers;
   - selects the active workspace currently providing application access;
   - returns workspace name/status, role, membership status, workspace plan, seat summary, and effective access for every registered app;
   - marks billing authority separately, limited to the workspace Owner for now because no delegated billing permission exists.
2. Update the dashboard presentation:
   - Owners keep the current access-period, usage, payment-history, renewal, and plan controls;
   - ordinary team members instead see “Workspace Access,” the providing workspace, plan, role, and “Access provided by your workspace”;
   - team members do not see payment history, renewal controls, or prompts to buy a personal plan;
   - app cards show Manage, Edit, View, or Not available from the centralized per-app authorization result.
3. Preserve the current Owner experience, contract tools, Team & Access link, super-admin behavior, and child-app launch flow.

## Multiple-workspace behavior
Use the same workspace selected by centralized authorization today: the first active workspace that actually grants applications, rather than the user’s empty personal workspace. Do not add a switcher. If several active workspaces grant apps, the dashboard will show the resolver-selected workspace and this limitation will be reported for a future switcher.

## Validation
- Test the existing Owner and Staff accounts in the live preview.
- Verify Staff sees CMMG RECORDS, Growth, Staff, and Catalog’s current access level; other apps remain unavailable.
- Verify Staff sees no Owner payment history or renewal/purchase controls.
- Verify Owner billing and app launch remain functional.
- Run focused type checks and confirm no changes to authorization v2, seats, SSO, PayPal, or entitlement records.
