# Roadmap

- [x] Make dashboard presentation workspace-aware for ordinary team members.
- [x] Keep all displayed plan, role, seat, and per-app results scoped to one resolver-selected workspace.
- [x] Preserve Owner billing, payment, entitlement, seat, SSO, and authorization behavior.
- [x] Validate the live Owner and Staff scenarios and report multi-workspace limitations.

## HubSpot Phase 3
- [x] Queue table, triggers, processor endpoint, hourly backstop, backoff, backfill, admin controls (auto-sync flag OFF)
- [ ] Live tests A–J with controlled accounts (needs Super Admin to turn automation on and publish)

- [x] Registration feed: per-app dev/prod credentials + safeguards, 18 tests
- [ ] Registration feed credentials: values not created (awaiting approval to create/share with Catalog & Split Sheets)

- [x] Contract Builder server-side plan check (6 actions, 106 new tests) — deep-scan re-check pending, not published

- [x] Invitation email abuse fix: plan revised and approved
- [x] Invitation fix implemented and verified (deep code scan from Security view still to run)

## PayWise Phase 1 (sandbox)
- [x] Hide PayPal checkout, PayWise notify/callback, success/error pages, diagnostics, tests
- [ ] PAYWISE_SUBSCRIPTION_KEY, PAYWISE_BUSINESS_API_KEY, PAYWISE_IP_ADDRESS values (user to provide)
- [ ] Publish so live URLs respond (awaiting approval)
