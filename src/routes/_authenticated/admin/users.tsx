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

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: () => fetchAccount() });
  const { data, isLoading } = useQuery({
    queryKey: ["platform-users", query],
    queryFn: () => fetchUsers({ data: { query } }),
    enabled: Boolean(account?.isSuperAdmin),
  });
  const { data: audit } = useQuery({
    queryKey: ["access-audit"],
    queryFn: () => fetchAudit({ data: {} }),
    enabled: Boolean(account?.isSuperAdmin),
  });

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
              {isLoading ? "Loading…" : `${users.length} of ${data?.total ?? 0} accounts`}
            </span>
          </div>

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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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

        <section className="panel mt-6 p-6">
          <h2 className="text-sm font-semibold">Access change audit trail</h2>
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
        </section>
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
