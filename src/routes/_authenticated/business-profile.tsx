import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2 } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getBusinessProfile, saveBusinessProfile } from "@/lib/contracts.functions";

export const Route = createFileRoute("/_authenticated/business-profile")({
  head: () => ({
    meta: [
      { title: "Business Profile — TP-CAMP" },
      {
        name: "description",
        content:
          "Store your entity details once so every TP-CAMP contract and invoice is pre-filled correctly.",
      },
      { property: "og:title", content: "Business profile — TP-CAMP" },
      { property: "og:description", content: "Your entity details across the TP-CAMP suite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BusinessProfilePage,
});

const empty = {
  legal_name: "",
  trading_name: "",
  registration_number: "",
  address: "",
  contact_email: "",
  contact_phone: "",
  signatory_name: "",
  signatory_title: "",
  default_currency: "TTD",
  governing_law: "Republic of Trinidad and Tobago",
};

function BusinessProfilePage() {
  const fetchProfile = useServerFn(getBusinessProfile);
  const persist = useServerFn(saveBusinessProfile);
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(empty);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["business-profile"],
    queryFn: () => fetchProfile(),
  });

  useEffect(() => {
    if (!data) return;
    setFormState({
      legal_name: data.legal_name ?? "",
      trading_name: data.trading_name ?? "",
      registration_number: data.registration_number ?? "",
      address: data.address ?? "",
      contact_email: data.contact_email ?? "",
      contact_phone: data.contact_phone ?? "",
      signatory_name: data.signatory_name ?? "",
      signatory_title: data.signatory_title ?? "",
      default_currency: data.default_currency ?? "TTD",
      governing_law: data.governing_law ?? "Republic of Trinidad and Tobago",
    });
  }, [data]);

  function set(key: keyof typeof empty, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!formState.legal_name.trim()) {
      toast.error("Legal business name is required");
      return;
    }
    setBusy(true);
    try {
      await persist({ data: formState });
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      toast.success("Business profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-16 pb-20">
        <Link
          to="/contracts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Contract builder
        </Link>

        <p className="eyebrow mt-6">Setup</p>
        <h1 className="mt-3 inline-flex items-center gap-3 text-3xl font-semibold">
          <Building2 className="h-7 w-7 text-accent" /> Business profile
        </h1>
        <p className="mt-4 text-muted-foreground">
          These details identify your entity across the TP-CAMP suite and pre-fill your side of
          every contract you generate.
        </p>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

        <form onSubmit={handleSubmit} className="panel mt-8 grid gap-5 p-7 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">
              Legal business name <span className="text-destructive">*</span>
            </span>
            <input
              value={formState.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              className={inputClass}
              required
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Trading name</span>
            <input
              value={formState.trading_name}
              onChange={(e) => set("trading_name", e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Registration number</span>
            <input
              value={formState.registration_number}
              onChange={(e) => set("registration_number", e.target.value)}
              className={inputClass}
              maxLength={100}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Registered address</span>
            <textarea
              value={formState.address}
              onChange={(e) => set("address", e.target.value)}
              rows={3}
              className={inputClass}
              maxLength={500}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Notice email</span>
            <input
              type="email"
              value={formState.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Phone</span>
            <input
              value={formState.contact_phone}
              onChange={(e) => set("contact_phone", e.target.value)}
              className={inputClass}
              maxLength={60}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Authorised signatory</span>
            <input
              value={formState.signatory_name}
              onChange={(e) => set("signatory_name", e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Signatory title</span>
            <input
              value={formState.signatory_title}
              onChange={(e) => set("signatory_title", e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Default currency</span>
            <select
              value={formState.default_currency}
              onChange={(e) => set("default_currency", e.target.value)}
              className={inputClass}
            >
              {["TTD", "USD", "GBP", "EUR"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Governing law</span>
            <input
              value={formState.governing_law}
              onChange={(e) => set("governing_law", e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save business profile"}
            </button>
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
