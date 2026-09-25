# Deep security review: verification only (no changes)

## Blocker
I can't start a deep code scan myself. The newest deep scan on record is from **25 Sep 21:41 UTC** and is marked **out of date**. It ran before the invitation-origin fix. The scans that are current right now (the database scan at 22:15 and the app scan at 22:25) found nothing.

**Your step:** open the Security view and click **Run deep scan**. When it finishes, approve this plan. I'll then read the new results and report back, without changing anything.

## What the current records show (deep scan from 21:41, out of date)
| # | Item | Scanner status | Current code check |
|---|------|----------------|--------------------|
| 1 | Contract Builder | ABSENT from findings | Access check still covers all six actions |
| 2 | Team invitation email | ABSENT from findings | Links use only the four approved addresses |
| 3 | Super Admin external invitation origin (Warning, `admin-users.functions.ts#inviteUser`) | Still listed | Fixed in code: uses the exact approved-address list (line 407) |
| 4 | PayPal subscription claim (Warning, from 5 Sep) | Still listed | Out of date: `recordPaypalSubscription` and the `paypal.functions.ts` file no longer exist |
| 5 | PayWise notify/callback "Anyone can submit unverified payment notifications" (Warning, 2 findings: notify.ts and callback.ts, writing via `paywise-events.server.ts`) | Still listed | Still valid: requests are logged as "not verified" and can never turn on access |

## After the new deep scan
- For each finding I'll report: title, severity, affected files and how it could be exploited, plus PRESENT or ABSENT for items 1–5.
- For PayWise, I'll check PayWise's official documentation for **signed notifications**, which would be the preferred fix. I'll suggest limiting by network address only if their documentation lists fixed sender addresses. I won't make any changes.
- No changes to code, settings, secrets, the database or what's published.
