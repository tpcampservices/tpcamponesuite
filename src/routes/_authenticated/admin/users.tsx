import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Mail, ShieldCheck, Users, Wrench, XCircle } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  grantAccess,
  inspectAccount,
  inviteUser,
  listAccessAudit,
  listPlatformUsers,
  repairAccount,
} from "@/lib/admin-users.functions";
import { getMyAccount } from "@/lib/account.functions";
import {
  ensureHubSpotProperties,
  getCrmAutomation,
  previewCrmBackfill,
  previewHubSpotMapping,
  runCrmQueueNow,
  setCrmAutoSync,
  startCrmBackfill,
  syncToHubSpot,
  testHubSpotConnection,
} from "@/lib/crm.functions";
import { PLANS } from "@/lib/plans";
import {
  ENTITLEMENT_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  SUBSCRIPTION_SOURCES,
} from "@/lib/entitlement-model";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Customer Accounts & Access — TP-CAMP OneSuite Admin" },
      {
        name: "description",
        content:
          "Review TP-CAMP OneSuite customer accounts, verification state and plan access, and activate access manually while payment is being completed.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite — customer accounts" },
      {
        property: "og:description",
        content: "Platform administration for accounts, provisioning and plan access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminUsersPage,
});

const APPS = [
  { slug: "catalog", name: "Catalogue" },
  { slug: "invoice", name: "Invoicing" },
  { slug: "splits", name: "Split sheets" },
  { slug: "operations", name: "Operations" },
  { slug: "finance", name: "Finance" },
];

const CRM_LABELS: Record<string, string> = {
  not_synced: "Not Synced",
  pending: "Pending",
  synced: "Synced",
  failed: "Failed",
  needs_update: "Needs Update",
  blocked: "Ambiguous / Blocked",
};
const CRM_BADGE: Record<string, string> = {
  not_synced: "border-border text-muted-foreground",
  pending: "border-accent/40 text-accent",
  synced: "border-accent bg-accent/10 text-accent",
  failed: "border-destructive/60 text-destructive",
  needs_update: "border-primary/50 text-primary",
  blocked: "border-destructive/40 text-destructive",
};

const fmt = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const todayIso = () => new Date().toISOString().slice(0, 10);

type GrantForm = {
  planId: string;
  status: string;
  subscriptionSource: string;
  paymentStatus: string;
  billingPeriod: "monthly" | "yearly" | "none";
  startDate: string;
  expiryDate: string;
  seatsLimit: string;
  allowedApps: string[];
  reason: string;
};

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const fetchUsers = useServerFn(listPlatformUsers);
  const fetchAudit = useServerFn(listAccessAudit);
  const submitGrant = useServerFn(grantAccess);
  const submitRepair = useServerFn(repairAccount);
  const submitInvite = useServerFn(inviteUser);
  const runInspect = useServerFn(inspectAccount);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [form, setForm] = useState<GrantForm | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<{ userId: string; missing: string[] } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [crmTarget, setCrmTarget] = useState<string | null>(null);
  const [crmPreview, setCrmPreview] = useState<
    { field: string; property: string; value: unknown; skipped: boolean; missingInHubSpot: boolean | null }[] | null
  >(null);
  const [crmWarning, setCrmWarning] = useState<string | null>(null);
  const runPreview = useServerFn(previewHubSpotMapping);
  const runHubSpotTest = useServerFn(testHubSpotConnection);
  const runEnsureProps = useServerFn(ensureHubSpotProperties);
  const runSyncFn = useServerFn(syncToHubSpot);
  const [hubspotTest, setHubspotTest] = useState<Awaited<ReturnType<typeof runHubSpotTest>> | null>(null);

  const runSync = async (userId: string, retry: boolean) => {
    setBusy(true);
    try {
      const res = await runSyncFn({ data: { userId, retry } });
      if (res.ok) toast.success(`HubSpot contact ${res.outcome} (ID ${res.state.externalContactId}).`);
      else toast.error(`Sync failed: ${res.error}`);
      await queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      await queryClient.invalidateQueries({ queryKey: ["access-audit"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sync this account.");
    } finally {
      setBusy(false);
    }
  };

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: () => fetchAccount() });
  const {
    data,
    isLoading,
    isError: usersFailed,
    isFetching: usersFetching,
    refetch: retryUsers,
  } = useQuery({
    queryKey: ["platform-users", query],
    queryFn: () => fetchUsers({ data: { query } }),
    enabled: Boolean(account?.isSuperAdmin),
    retry: 1,
  });
  const { data: audit } = useQuery({
    queryKey: ["access-audit"],
    queryFn: () => fetchAudit({ data: {} }),
    enabled: Boolean(account?.isSuperAdmin),
  });

  const { data: hubspotStatus } = useQuery({
    queryKey: ["hubspot-status"],
    queryFn: () => runHubSpotTest({ data: { run: false } }),
    enabled: Boolean(account?.isSuperAdmin),
  });
  const hubspot = hubspotTest ?? hubspotStatus ?? null;
  const fetchAutomation = useServerFn(getCrmAutomation);
  const toggleAuto = useServerFn(setCrmAutoSync);
  const runQueue = useServerFn(runCrmQueueNow);
  const fetchBackfill = useServerFn(previewCrmBackfill);
  const runBackfill = useServerFn(startCrmBackfill);
  const [backfill, setBackfill] = useState<Awaited<ReturnType<typeof fetchBackfill>> | null>(null);
  const { data: automation } = useQuery({
    queryKey: ["crm-automation"],
    queryFn: () => fetchAutomation(),
    enabled: Boolean(account?.isSuperAdmin),
  });
  const crmAct = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await queryClient.invalidateQueries({ queryKey: ["crm-automation"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CRM action failed.");
    } finally {
      setBusy(false);
    }
  };
  const users = data?.users ?? [];
  const selected = useMemo(() => users.find((u) => u.id === target) ?? null, [users, target]);

  if (account && !account.isSuperAdmin) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-5 pt-24 pb-24 text-center">
          <h1 className="text-2xl font-semibold">Platform administration</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This area is restricted to TP-CAMP platform administrators.
          </p>
          <Link to="/dashboard" className="mt-6 inline-block text-accent">
            Back to your dashboard
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const openGrant = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    const ent = user?.entitlement ?? null;
    setTarget(userId);
    setConfirming(false);
    setForm({
      planId: ent?.planId ?? "growth",
      status: ent && ent.status !== "none" ? ent.status : "active",
      subscriptionSource:
        ent && ent.subscriptionSource !== "paypal" ? ent.subscriptionSource : "manual_admin",
      paymentStatus: ent?.paymentStatus === "paid" ? "not_required" : (ent?.paymentStatus ?? "not_required"),
      billingPeriod: (ent?.billingPeriod === "monthly"
        ? "monthly"
        : ent?.billingPeriod === "none"
          ? "none"
          : "yearly") as "monthly" | "yearly" | "none",
      startDate: ent?.startDate ? ent.startDate.slice(0, 10) : todayIso(),
      expiryDate: ent?.expiryDate ? ent.expiryDate.slice(0, 10) : "",
      seatsLimit: ent?.seatsLimit ? String(ent.seatsLimit) : "",
      allowedApps: ent?.allowedApps ?? [],
      reason: "",
    });
  };

  const commit = async () => {
    if (!form || !target) return;
    setBusy(true);
    try {
      const res = await submitGrant({
        data: {
          userId: target,
          planId: form.planId,
          status: form.status,
          subscriptionSource: form.subscriptionSource,
          paymentStatus: form.paymentStatus,
          billingPeriod: form.billingPeriod,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
          expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
          seatsLimit: form.seatsLimit ? Number(form.seatsLimit) : undefined,
          allowedApps: form.allowedApps.length ? form.allowedApps : undefined,
          reason: form.reason,
        },
      });
      toast.success(`${res.planName} access saved (${STATUS_LABELS[res.status]}).`);
      setForm(null);
      setTarget(null);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      await queryClient.invalidateQueries({ queryKey: ["access-audit"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that access change.");
    } finally {
      setBusy(false);
    }
  };

  const inspect = async (userId: string) => {
    try {
      const res = await runInspect({ data: { userId } });
      setInspection({ userId, missing: res.missing });
      if (!res.missing.length) toast.success("This account is fully provisioned — nothing to repair.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not inspect that account.");
    }
  };

  const repair = async (userId: string) => {
    setBusy(true);
    try {
      const res = await submitRepair({ data: { userId } });
      toast.success(res.created.length ? `Created: ${res.created.join(", ")}` : "Nothing needed repair.");
      setInspection(null);
      await queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not repair that account.");
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const res = await submitInvite({
        data: { email: inviteEmail, redirectOrigin: window.location.origin },
      });
      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail}.`);
        setInviteEmail("");
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that invitation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-20">
        <p className="eyebrow">Platform administration</p>
        <h1 className="mt-4 inline-flex items-center gap-3 text-3xl font-semibold">
          <Users className="h-7 w-7 text-accent" /> Customer accounts &amp; access
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Review every account, check that it was provisioned correctly, and activate a plan
          manually while card payment is being completed. Every change is recorded in the audit
          trail below.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/admin/settings"
            className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-accent/60"
          >
            PayPal settings
          </Link>
          <Link
            to="/admin/webhooks"
            className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-accent/60"
          >
            Webhook log
          </Link>
        </div>

        <section className="panel mt-8 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">HubSpot CRM</h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${hubspot?.connected ? "border-accent text-accent" : "border-border text-muted-foreground"}`}
            >
              {hubspot?.connected ? "Connected" : "Not connected"}
            </span>
            {hubspot?.tested && (
              <span className={`text-xs ${hubspot.ok ? "text-accent" : "text-destructive"}`}>
                Test {hubspot.ok ? "passed" : `failed (${hubspot.error})`}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Last successful test: {hubspot?.lastOkAt ? new Date(hubspot.lastOkAt).toLocaleString() : "never"}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                disabled={busy || !hubspot?.connected}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setHubspotTest(await runHubSpotTest({ data: { run: true } }));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Connection test failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Test connection
              </button>
              <button
                disabled={busy || !hubspot?.connected}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await runEnsureProps();
                    if (res.failed.length) toast.error(`Could not create: ${res.failed.map((f) => f.name).join(", ")}`);
                    else toast.success(res.created.length ? `Created ${res.created.length} HubSpot properties.` : "All TP-CAMP properties already exist.");
                    setHubspotTest(await runHubSpotTest({ data: { run: true } }));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not create properties.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent disabled:opacity-50"
              >
                Create missing properties
              </button>
            </div>
          </div>
          {hubspot?.missingProperties && hubspot.missingProperties.length > 0 && (
            <p className="mt-3 text-xs text-destructive">
              Missing HubSpot contact properties: {hubspot.missingProperties.join(", ")}
            </p>
          )}
          {hubspot?.missingProperties && hubspot.missingProperties.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">All TP-CAMP contact properties exist in HubSpot.</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Syncing never changes TP-CAMP access and never subscribes anyone to marketing email.
          </p>
          {automation && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(automation.counts).map(([k, v]) => (
                  <span key={k} className={`rounded-full border px-2 py-0.5 ${CRM_BADGE[k] ?? ""}`}>
                    {CRM_LABELS[k] ?? k}: {v}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Queue: {automation.queue.pending} pending · {automation.queue.failed} retrying · {automation.queue.dead_letter} dead-letter ·
                Last run {automation.lastRun ? new Date(automation.lastRun).toLocaleString() : "never"} · Last automated sync{" "}
                {automation.lastAutoSuccess ? new Date(automation.lastAutoSuccess).toLocaleString() : "never"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs">
                  Automatic sync: <strong>{automation.autoSyncEnabled ? "On" : "Off"}</strong>
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    crmAct(
                      () => toggleAuto({ data: { enabled: !automation.autoSyncEnabled } }),
                      automation.autoSyncEnabled ? "Automatic sync turned off." : "Automatic sync turned on.",
                    )
                  }
                  className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {automation.autoSyncEnabled ? "Turn off" : "Turn on"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => crmAct(() => runQueue(), "Queue processed.")}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Process queue now
                </button>
                <button
                  disabled={busy || !hubspot?.connected}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setBackfill(await fetchBackfill());
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not check existing customers.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent disabled:opacity-50"
                >
                  Sync Existing Customers to HubSpot
                </button>
              </div>
              {backfill && (
                <div className="mt-3 rounded-lg border border-border p-3 text-xs">
                  <p>
                    Total {backfill.total} · Eligible {backfill.eligible} · Already synced {backfill.alreadySynced} · Not synced{" "}
                    {backfill.notSynced} · Ambiguous {backfill.ambiguous} · Missing email {backfill.missingEmail} · Failed{" "}
                    {backfill.failed} · Excluded {backfill.ineligible}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy || backfill.eligible === 0}
                      onClick={() => {
                        if (!window.confirm(`Send the next ${Math.min(5, backfill.eligible)} eligible customers to HubSpot?`)) return;
                        crmAct(async () => {
                          const r = await runBackfill({ data: { batchSize: 5, confirm: true } });
                          setBackfill(await fetchBackfill());
                          toast.message(`Batch: ${r.synced} synced, ${r.skipped} skipped, ${r.remaining} remaining.`);
                        }, "Backfill batch finished.");
                      }}
                      className="rounded-lg border border-accent px-3 py-1.5 text-accent disabled:opacity-50"
                    >
                      Confirm — sync next batch of 5
                    </button>
                    <button onClick={() => setBackfill(null)} className="rounded-lg border border-border px-3 py-1.5">
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel mt-6 p-6">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-accent" /> Invite a customer
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              type="email"
              maxLength={255}
              className="min-w-[260px] flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={sendInvite}
              disabled={busy}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Send invitation
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The invitation link opens the secure acceptance page where they set their own password.
          </p>
        </section>

        <section className="panel mt-6 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())}
              placeholder="Search by email, name, account id or workspace"
              className="min-w-[280px] flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => setQuery(search.trim())}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/60"
            >
              Search
            </button>
            <span className="text-xs text-muted-foreground">
              {usersFailed
                ? "Not loaded"
                : isLoading
                  ? "Loading…"
                  : `${users.length} of ${data?.total ?? 0} accounts`}
            </span>
          </div>

          {usersFailed && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            >
              <span>
                The account list couldn't be loaded from the sign-in service. No data was changed.
                Try again, and if it keeps failing, check the server logs for
                <span className="font-mono"> admin_users_list_failed</span>.
              </span>
              <button
                onClick={() => retryUsers()}
                disabled={usersFetching}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent/60 disabled:opacity-60"
              >
                {usersFetching ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Account</th>
                  <th className="py-2 pr-4 font-medium">Verified</th>
                  <th className="py-2 pr-4 font-medium">Last sign-in</th>
                  <th className="py-2 pr-4 font-medium">Profile / role</th>
                  <th className="py-2 pr-4 font-medium">Workspace</th>
                  <th className="py-2 pr-4 font-medium">Plan &amp; access</th>
                  <th className="py-2 pr-4 font-medium">CRM</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border/70 align-top">
                    <td className="py-3 pr-4">
                      <span className="block font-medium">{u.email ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {u.fullName ?? "No name"} · {u.provider ?? "email"}
                      </span>
                      <span className="block font-mono text-[11px] break-all text-muted-foreground">
                        {u.id}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {u.emailConfirmed ? (
                        <span className="inline-flex items-center gap-1 text-accent">
                          <CheckCircle2 className="h-4 w-4" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <XCircle className="h-4 w-4" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{fmt(u.lastSignInAt)}</td>
                    <td className="py-3 pr-4">
                      <span className="block text-xs">
                        {u.profileExists ? "Profile ✓" : "Profile missing"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {u.roles.length ? u.roles.join(", ") : "No role"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{u.workspace ?? "—"}</td>
                    <td className="py-3 pr-4">
                      {u.entitlement ? (
                        <>
                          <span className="block">
                            {u.entitlement.planName ?? "—"} ·{" "}
                            {STATUS_LABELS[u.entitlement.status] ?? u.entitlement.status}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {SOURCE_LABELS[u.entitlement.subscriptionSource] ??
                              u.entitlement.subscriptionSource}{" "}
                            ·{" "}
                            {PAYMENT_STATUS_LABELS[u.entitlement.paymentStatus] ??
                              u.entitlement.paymentStatus}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fmt(u.entitlement.startDate)} → {u.entitlement.expiryDate ? fmt(u.entitlement.expiryDate) : "No expiry"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No access record</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${CRM_BADGE[u.crm.status] ?? ""}`}>
                        {CRM_LABELS[u.crm.status] ?? u.crm.status}
                      </span>
                      {u.crm.lastSyncedAt && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">{fmt(u.crm.lastSyncedAt)}</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => openGrant(u.id)}
                          className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent"
                        >
                          {u.entitlement ? "Manage access" : "Grant access"}
                        </button>
                        <button
                          onClick={() => inspect(u.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs"
                        >
                          <Wrench className="h-3 w-3" /> Repair account
                        </button>
                        <button
                          onClick={() => { setCrmTarget(u.id); setCrmPreview(null); }}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs"
                        >
                          CRM details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {crmTarget && (() => {
          const u = users.find((x) => x.id === crmTarget);
          if (!u) return null;
          return (
            <div className="panel mt-6 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">CRM — {u.email}</h2>
                <button onClick={() => { setCrmTarget(null); setCrmPreview(null); }} className="text-xs text-accent">
                  Close
                </button>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <Summary label="CRM provider" value="HubSpot" />
                <Summary label="CRM status" value={CRM_LABELS[u.crm.status] ?? u.crm.status} />
                <Summary label="External contact ID" value={u.crm.externalContactId ?? "—"} />
                <Summary label="Last successful sync" value={u.crm.lastSyncedAt ? new Date(u.crm.lastSyncedAt).toLocaleString() : "—"} />
                <Summary label="Last attempt" value={u.crm.lastAttemptedAt ? new Date(u.crm.lastAttemptedAt).toLocaleString() : "—"} />
                <Summary label="Attempt count" value={String(u.crm.attempts)} />
              </dl>
              <div className="mt-2">
                <Summary label="Last error" value={u.crm.lastError ?? "—"} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  disabled={busy || !hubspot?.connected}
                  onClick={() => runSync(u.id, false)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Syncing…" : "Sync to HubSpot"}
                </button>
                <button
                  disabled={busy || !hubspot?.connected || u.crm.status !== "failed"}
                  onClick={() => runSync(u.id, true)}
                  className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
                >
                  Retry sync
                </button>
                {!hubspot?.connected && (
                  <span className="text-xs text-muted-foreground">HubSpot not connected</span>
                )}
                <button
                  onClick={async () => {
                    try {
                      const res = await runPreview({ data: { userId: u.id } });
                      setCrmPreview(res.rows);
                      setCrmWarning(res.workspaceWarning);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not build the preview.");
                    }
                  }}
                  className="ml-auto rounded-lg border border-accent/50 px-4 py-2 text-sm text-accent"
                >
                  Preview CRM data
                </button>
              </div>
              {crmWarning && (
                <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  {crmWarning}
                </p>
              )}
              {crmPreview && (
                <div className="mt-4 overflow-x-auto">
                  <p className="text-xs text-muted-foreground">
                    Preview only — nothing was sent. Empty fields are skipped and never clear HubSpot data.
                  </p>
                  <table className="mt-2 w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">TP-CAMP field</th>
                        <th className="py-1 pr-3 font-medium">HubSpot property</th>
                        <th className="py-1 pr-3 font-medium">Value</th>
                        <th className="py-1 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crmPreview.map((r) => (
                        <tr key={r.field} className="border-t border-border/50">
                          <td className="py-1 pr-3 text-muted-foreground">{r.field}</td>
                          <td className="py-1 pr-3 font-mono">{r.property}</td>
                          <td className="py-1 pr-3 break-all">{r.value === null ? "—" : String(r.value)}</td>
                          <td className="py-1">
                            {r.missingInHubSpot ? (
                              <span className="text-destructive">Missing in HubSpot</span>
                            ) : r.skipped ? (
                              <span className="text-muted-foreground">Skipped (empty)</span>
                            ) : (
                              "Will send"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {inspection && (
          <div className="panel mt-6 p-6">
            <h2 className="text-sm font-semibold">Repair account</h2>
            {inspection.missing.length ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  These records are missing and will be created. Nothing existing is changed.
                </p>
                <ul className="mt-3 list-disc pl-5 text-sm">
                  {inspection.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => repair(inspection.userId)}
                    disabled={busy}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Create missing records
                  </button>
                  <button
                    onClick={() => setInspection(null)}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing to repair — this account has its profile and role.
                <button onClick={() => setInspection(null)} className="ml-2 text-accent">
                  Close
                </button>
              </p>
            )}
          </div>
        )}

        {form && selected && (
          <div className="panel mt-6 p-6">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-accent" /> Manage access — {selected.email}
            </h2>

            {confirming ? (
              <>
                <p className="mt-4 text-sm text-muted-foreground">
                  Please confirm this administrative change:
                </p>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <Summary label="Customer" value={selected.email ?? selected.id} />
                  <Summary label="Plan" value={PLANS.find((p) => p.id === form.planId)?.name ?? form.planId} />
                  <Summary label="Access status" value={STATUS_LABELS[form.status as keyof typeof STATUS_LABELS]} />
                  <Summary
                    label="Subscription source"
                    value={SOURCE_LABELS[form.subscriptionSource as keyof typeof SOURCE_LABELS]}
                  />
                  <Summary
                    label="Payment status"
                    value={PAYMENT_STATUS_LABELS[form.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]}
                  />
                  <Summary
                    label="Term"
                    value={
                      form.billingPeriod === "monthly"
                        ? "1 month"
                        : form.billingPeriod === "none"
                          ? "No expiry"
                          : "12 months"
                    }
                  />
                  <Summary label="Start" value={fmt(form.startDate)} />
                  <Summary
                    label="Expiry"
                    value={
                      form.expiryDate
                        ? fmt(form.expiryDate)
                        : form.billingPeriod === "none"
                          ? "None (open-ended)"
                          : `Calculated from the term (${form.billingPeriod === "monthly" ? "1 month" : "12 months"} from start)`
                    }
                  />
                  <Summary label="Seat limit" value={form.seatsLimit || "Plan default"} />
                  <Summary
                    label="Apps"
                    value={form.allowedApps.length ? form.allowedApps.join(", ") : "Standard plan entitlement"}
                  />
                  <Summary label="Reason" value={form.reason || "—"} />
                </dl>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={commit}
                    disabled={busy}
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Confirm and activate"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-border px-5 py-2.5 text-sm"
                  >
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Select
                    label="Plan"
                    value={form.planId}
                    onChange={(v) => setForm({ ...form, planId: v })}
                    options={PLANS.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <Select
                    label="Access status"
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                    options={ENTITLEMENT_STATUSES.filter((s) => s !== "none").map((s) => ({
                      value: s,
                      label: STATUS_LABELS[s],
                    }))}
                  />
                  <Select
                    label="Subscription source"
                    value={form.subscriptionSource}
                    onChange={(v) => setForm({ ...form, subscriptionSource: v })}
                    options={SUBSCRIPTION_SOURCES.filter((s) => s !== "paypal").map((s) => ({
                      value: s,
                      label: SOURCE_LABELS[s],
                    }))}
                  />
                  <Select
                    label="Payment status"
                    value={form.paymentStatus}
                    onChange={(v) => setForm({ ...form, paymentStatus: v })}
                    options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))}
                  />
                  <Select
                    label="Term"
                    value={form.billingPeriod}
                    onChange={(v) =>
                      setForm({ ...form, billingPeriod: v as "monthly" | "yearly" | "none" })
                    }
                    options={[
                      { value: "monthly", label: "1 month" },
                      { value: "yearly", label: "12 months" },
                      { value: "none", label: "No expiry (open-ended)" },
                    ]}
                  />
                  <Field
                    label="Start date"
                    type="date"
                    value={form.startDate}
                    onChange={(v) => setForm({ ...form, startDate: v })}
                  />
                  <Field
                    label="Expiry date (optional)"
                    type="date"
                    value={form.expiryDate}
                    onChange={(v) => setForm({ ...form, expiryDate: v })}
                  />
                  <Field
                    label="Seat limit (optional)"
                    type="number"
                    value={form.seatsLimit}
                    onChange={(v) => setForm({ ...form, seatsLimit: v })}
                  />
                </div>

                <fieldset className="mt-5">
                  <legend className="text-xs text-muted-foreground">
                    App override (leave empty for the standard plan entitlement)
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {APPS.map((app) => (
                      <label key={app.slug} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.allowedApps.includes(app.slug)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              allowedApps: e.target.checked
                                ? [...form.allowedApps, app.slug]
                                : form.allowedApps.filter((s) => s !== app.slug),
                            })
                          }
                        />
                        {app.name}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-5 block text-sm">
                  <span className="text-muted-foreground">Reason / notes</span>
                  <textarea
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    maxLength={500}
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </label>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={() => setConfirming(true)}
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    Review change
                  </button>
                  <button
                    onClick={() => {
                      setForm(null);
                      setTarget(null);
                    }}
                    className="rounded-lg border border-border px-5 py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Manual access never creates a PayPal order, capture or invoice. A later verified
                  payment updates this same access record.
                </p>
              </>
            )}
          </div>
        )}

        <details className="panel group mt-6 p-6">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            Access change audit trail
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({audit?.entries.length ?? 0}) — show
            </span>
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Append-only. Entries cannot be edited or deleted from the application.
          </p>
          {!audit?.entries.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No administrative changes recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Admin</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.entries.map((e: any) => (
                    <tr key={e.id} className="border-t border-border/70">
                      <td className="py-2.5 pr-4">{new Date(e.created_at).toLocaleString()}</td>
                      <td className="py-2.5 pr-4">{e.actor_email ?? e.actor_user_id ?? "—"}</td>
                      <td className="py-2.5 pr-4">{String(e.action).replace(/_/g, " ")}</td>
                      <td className="py-2.5 pr-4">
                        {e.old_plan_id ?? "—"} → {e.new_plan_id ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {e.old_status ?? "—"} → {e.new_status ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {e.old_subscription_source ?? "—"} → {e.new_subscription_source ?? "—"}
                      </td>
                      <td className="py-2.5">{e.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </main>
      <SiteFooter />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
