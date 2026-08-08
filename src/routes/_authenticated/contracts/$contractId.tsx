import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Download, Save } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getBusinessProfile, getContract, saveContract } from "@/lib/contracts.functions";
import {
  downloadBlob,
  fieldsForStep,
  generateDocx,
  getForm,
  getFormSteps,
  missingRequired,
  prefillFromProfile,
  reviewFlags,
  slugify,
  type ContractField,
} from "@/lib/contracts";

export const Route = createFileRoute("/_authenticated/contracts/$contractId")({
  validateSearch: (search: Record<string, unknown>) => ({
    template: typeof search.template === "string" ? search.template : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Build a Contract — TP-CAMP" },
      {
        name: "description",
        content:
          "Fill in the guided form to generate a Trinidad and Tobago music agreement as a Word document.",
      },
      { property: "og:title", content: "Build a contract — TP-CAMP" },
      { property: "og:description", content: "Guided contract drafting for Caribbean artists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContractBuilderPage,
});

function ContractBuilderPage() {
  const { contractId } = Route.useParams();
  const { template } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isNew = contractId === "new";
  const fetchContract = useServerFn(getContract);
  const fetchProfile = useServerFn(getBusinessProfile);
  const persist = useServerFn(saveContract);

  const { data: existing, isLoading: loadingContract } = useQuery({
    queryKey: ["contract", contractId],
    queryFn: () => fetchContract({ data: { id: contractId } }),
    enabled: !isNew,
  });
  const { data: profile } = useQuery({
    queryKey: ["business-profile"],
    queryFn: () => fetchProfile(),
  });

  const templateId = isNew ? template : existing?.template_id;
  const form = templateId ? getForm(templateId) : undefined;

  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : contractId);
  const [initialised, setInitialised] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialised || !form) return;
    if (!isNew && !existing) return;
    const base = prefillFromProfile(form, profile ?? null);
    if (existing) {
      setValues({ ...base, ...((existing.values as Record<string, string>) ?? {}) });
      setTitle(existing.title ?? "");
      setCounterparty(existing.counterparty ?? "");
    } else {
      setValues(base);
      setTitle(form.title);
    }
    setInitialised(true);
  }, [form, existing, profile, isNew, initialised]);

  const steps = useMemo(() => (form ? getFormSteps(form) : []), [form]);
  const currentStep = steps[stepIndex];
  const missing = form ? missingRequired(form, values) : [];
  const flags = reviewFlags(values);

  function setValue(token: string, value: string) {
    setValues((prev) => ({ ...prev, [token]: value }));
  }

  async function handleSave(markGenerated = false) {
    if (!form) return null;
    setBusy(true);
    try {
      const row = await persist({
        data: {
          id: savedId ?? undefined,
          template_id: form.template_id,
          template_title: form.title,
          title: title || form.title,
          counterparty,
          values,
          markGenerated,
        },
      });
      setSavedId(row.id);
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      if (isNew) {
        navigate({
          to: "/contracts/$contractId",
          params: { contractId: row.id },
          search: { template: undefined },
          replace: true,
        });
      }
      return row;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!form) return;
    if (missing.length) {
      toast.error(`${missing.length} required field${missing.length > 1 ? "s" : ""} still empty.`);
      return;
    }
    setBusy(true);
    try {
      const { blob, unresolved } = await generateDocx(form, values);
      if (unresolved.length) {
        toast.error(
          `Export blocked — ${unresolved.length} placeholder${unresolved.length > 1 ? "s" : ""} unresolved: ${unresolved.slice(0, 4).join(", ")}${unresolved.length > 4 ? "…" : ""}`,
        );
        return;
      }
      downloadBlob(blob, `${slugify(title || form.title)}.docx`);
      await handleSave(true);
      toast.success("Contract generated. Get Trinidad and Tobago legal review before signing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 pt-20 pb-20">
          <p className="text-sm text-muted-foreground">
            {loadingContract ? "Loading contract…" : "That contract or template could not be found."}
          </p>
          <Link to="/contracts" className="mt-6 inline-flex items-center gap-2 text-sm text-accent">
            <ArrowLeft className="h-4 w-4" /> Back to contract builder
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const optionalRemaining = fieldsForStep(form, currentStep ?? "").length;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pt-16 pb-20">
        <Link to="/contracts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Contract builder
        </Link>

        <p className="eyebrow mt-6">{form.template_id}</p>
        <h1 className="mt-3 text-3xl font-semibold">{form.title}</h1>

        <div className="panel mt-8 grid gap-5 p-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Contract name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Counterparty (for your records)</span>
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              maxLength={200}
              className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <nav className="mt-8 flex flex-wrap gap-2">
          {steps.map((step, index) => (
            <button
              key={step}
              onClick={() => setStepIndex(index)}
              className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                index === stepIndex
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {index + 1}. {step}
            </button>
          ))}
        </nav>

        <section className="panel mt-6 space-y-6 p-7">
          <h2 className="text-lg font-semibold">{currentStep}</h2>
          <p className="text-sm text-muted-foreground">
            {optionalRemaining} field{optionalRemaining === 1 ? "" : "s"} in this section. Fields
            marked with * must be completed before export.
          </p>
          {fieldsForStep(form, currentStep ?? "").map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.token] ?? ""}
              onChange={(value) => setValue(field.token, value)}
            />
          ))}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              disabled={stepIndex >= steps.length - 1}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-40"
            >
              Next section <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="panel mt-8 p-7">
          <h2 className="text-lg font-semibold">Review &amp; generate</h2>
          {missing.length ? (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <p className="font-medium">
                {missing.length} required field{missing.length > 1 ? "s" : ""} still empty:
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {missing.slice(0, 8).map((f) => (
                  <li key={f.id}>
                    <button
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setStepIndex(Math.max(0, steps.indexOf(f.group)))}
                    >
                      {f.label}
                    </button>{" "}
                    <span className="text-xs">({f.group})</span>
                  </li>
                ))}
                {missing.length > 8 && <li>…and {missing.length - 8} more.</li>}
              </ul>
            </div>
          ) : (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-accent">
              <Check className="h-4 w-4" /> All required fields complete.
            </p>
          )}

          {flags.length > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm">
              <p className="inline-flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 text-accent" /> Attorney review recommended
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => handleSave(false).then((row) => row && toast.success("Draft saved"))}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Save draft
            </button>
            <button
              onClick={handleGenerate}
              disabled={busy || missing.length > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Generate Word document
            </button>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            Drafting template only — not legal advice. Obtain Trinidad and Tobago legal review
            before signature.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ContractField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = (
    <span className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive"> *</span>}
    </span>
  );
  const inputClass =
    "mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <label className="block">
      {label}
      {field.type === "select" && field.options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {field.computed_clause ? option.replaceAll("_", " ") : option}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" || field.type === "multiselect_or_text" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
      {field.help_text && (
        <span className="mt-1.5 block text-xs text-muted-foreground">{field.help_text}</span>
      )}
    </label>
  );
}
