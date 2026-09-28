import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getRegistrationIdentity, saveRegistrationIdentity } from "@/lib/registration.functions";
import { identityComplete, submittingPartyFrom } from "@/lib/registration-core";

const FIELDS: { key: string; label: string; required?: boolean; type?: string }[] = [
  { key: "legal_name", label: "Legal Name", required: true },
  { key: "trading_name", label: "Trading Name" },
  { key: "contact_name", label: "Contact Name", required: true },
  { key: "contact_email", label: "Contact Email", required: true, type: "email" },
  { key: "contact_phone", label: "Contact Phone", type: "tel" },
  { key: "address_street", label: "Street" },
  { key: "address_city", label: "City" },
  { key: "address_country", label: "Country (2-letter code)", required: true },
  { key: "address_postal_code", label: "Postal Code" },
  { key: "signatory_name", label: "Signatory Name", required: true },
  { key: "signatory_title", label: "Signatory Title", required: true },
];

export function RegistrationIdentityPanel() {
  const fetchIdentity = useServerFn(getRegistrationIdentity);
  const save = useServerFn(saveRegistrationIdentity);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["registration-identity"], queryFn: () => fetchIdentity() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!data?.allowed) return null;
  const row = data.identity as Record<string, string | null> | null;
  const complete = identityComplete(submittingPartyFrom(row as never));

  function openForm() {
    const f: Record<string, string> = {};
    for (const { key } of FIELDS) f[key] = (row?.[key] as string | null) ?? "";
    setForm(f);
    setOpen(true);
  }

  async function onSave() {
    setSaving(true);
    try {
      await save({ data: form });
      toast.success("Registration Identity saved. Rebuild profiles to use it.");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["registration-identity"] });
      await qc.invalidateQueries({ queryKey: ["registration-hub"] });
    } catch (e) {
      let msg = e instanceof Error ? e.message : "Could not save.";
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed) && parsed[0]?.message) msg = parsed[0].message;
      } catch { /* plain message */ }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">{complete ? "Submitting Entity Configured" : "Registration Identity Incomplete"}</h2>
            <p className="text-xs text-muted-foreground">
              {complete
                ? `${row?.legal_name} · signatory ${row?.signatory_name}, ${row?.signatory_title}`
                : "Profiles can't pass validation until the workspace's submitting entity is set up."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Source: OneSuite admin</Badge>
          {data.canEdit ? (
            <Button size="sm" variant={complete ? "outline" : "default"} onClick={openForm}>
              {complete ? "Edit" : "Configure Submitting Party"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Only an owner or administrator can change this.</span>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registration Identity</DialogTitle>
            <DialogDescription>The entity that submits registrations for this workspace. Saving marks existing profiles out of date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>{f.label}{f.required ? " *" : ""}</Label>
                <Input id={f.key} type={f.type ?? "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
