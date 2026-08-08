import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import schemaJson from "./contract-schema.json";

export type ContractField = {
  id: string;
  token: string;
  label: string;
  group: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "date"
    | "number"
    | "email"
    | "money_or_text"
    | "percentage_or_formula"
    | "multiselect_or_text";
  required: boolean;
  help_text?: string;
  options?: string[];
  computed_clause?: {
    default: string;
    options: Record<string, string>;
  };
};

export type ContractForm = {
  template_id: string;
  template_file: string;
  title: string;
  form_steps: string[];
  fields: ContractField[];
};

type Schema = {
  schema_version: string;
  jurisdiction: string;
  legal_review_triggers: string[];
  forms: ContractForm[];
  all_tokens: string[];
  clause_library: Record<string, { default: string; options: Record<string, string> }>;
};

export const contractSchema = schemaJson as unknown as Schema;

/**
 * Party/date placeholders that appear in every Word template but are not listed
 * in the JSON schema's field arrays. Merged into each form so no {{TOKEN}} is
 * ever left unresolved at export.
 */
const PARTY_FIELDS: ContractField[] = [
  {
    id: "effective_date",
    token: "EFFECTIVE_DATE",
    label: "Effective Date",
    group: "Parties and signatures",
    type: "date",
    required: true,
    help_text: "The date this agreement takes effect.",
  },
  {
    id: "artist_legal_name",
    token: "ARTIST_LEGAL_NAME",
    label: "Artist Legal Name",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "Use the Artist's full legal name.",
  },
  {
    id: "artist_stage_name",
    token: "ARTIST_STAGE_NAME",
    label: "Artist Stage Name",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "The name the Artist performs and releases under.",
  },
  {
    id: "artist_address",
    token: "ARTIST_ADDRESS",
    label: "Artist Address",
    group: "Parties and signatures",
    type: "textarea",
    required: true,
    help_text: "Full address used for formal notices to the Artist.",
  },
  {
    id: "label_legal_name",
    token: "LABEL_LEGAL_NAME",
    label: "Company / Label Legal Name",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "Pre-filled from your business profile.",
  },
  {
    id: "label_entity_type",
    token: "LABEL_ENTITY_TYPE",
    label: "Company Entity Type",
    group: "Parties and signatures",
    type: "select",
    required: true,
    options: [
      "limited liability company",
      "sole trader",
      "partnership",
      "non-profit company",
      "individual",
    ],
    help_text: "How your entity is registered.",
  },
  {
    id: "label_registration_number",
    token: "LABEL_REGISTRATION_NUMBER",
    label: "Company Registration Number",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "Pre-filled from your business profile.",
  },
  {
    id: "label_jurisdiction",
    token: "LABEL_JURISDICTION",
    label: "Company Jurisdiction",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "Where your entity is registered, e.g. Republic of Trinidad and Tobago.",
  },
  {
    id: "label_address",
    token: "LABEL_ADDRESS",
    label: "Company Address",
    group: "Parties and signatures",
    type: "textarea",
    required: true,
    help_text: "Pre-filled from your business profile.",
  },
  {
    id: "label_witness_name",
    token: "LABEL_WITNESS_NAME",
    label: "Company Witness Name",
    group: "Parties and signatures",
    type: "text",
    required: true,
    help_text: "Person who witnesses the company signature.",
  },
];

/** Party placeholders actually present in each Word template. */
const TEMPLATE_PARTY_TOKENS: Record<string, string[]> = {
  "TT-ALS-01": ["ARTIST_ADDRESS", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-RPA-02": ["ARTIST_ADDRESS", "ARTIST_LEGAL_NAME", "ARTIST_STAGE_NAME", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-MLD-03": ["ARTIST_ADDRESS", "ARTIST_LEGAL_NAME", "ARTIST_STAGE_NAME", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-MPA-04": ["ARTIST_ADDRESS", "ARTIST_LEGAL_NAME", "ARTIST_STAGE_NAME", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-PBR-05": ["ARTIST_ADDRESS", "ARTIST_LEGAL_NAME", "ARTIST_STAGE_NAME", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-PAA-06": ["ARTIST_ADDRESS", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_LEGAL_NAME", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
  "TT-AMA-07": ["ARTIST_ADDRESS", "ARTIST_LEGAL_NAME", "ARTIST_STAGE_NAME", "EFFECTIVE_DATE", "LABEL_ADDRESS", "LABEL_ENTITY_TYPE", "LABEL_JURISDICTION", "LABEL_REGISTRATION_NUMBER", "LABEL_WITNESS_NAME"],
};

export const contractForms: ContractForm[] = contractSchema.forms.map((form) => {
  const existing = new Set(form.fields.map((f) => f.token));
  const needed = new Set(TEMPLATE_PARTY_TOKENS[form.template_id] ?? []);
  const extra = PARTY_FIELDS.filter((f) => needed.has(f.token) && !existing.has(f.token));
  return { ...form, fields: [...extra, ...form.fields] };
});


export const templateSummaries: Record<string, string> = {
  "TT-ALS-01":
    "Engage a label or services company for a release while the artist keeps ownership of the masters.",
  "TT-RPA-02":
    "Cover a specific recording project: tracks, delivery, budget and who owns the finished masters.",
  "TT-MLD-03":
    "Licence finished masters to a distributor or partner for release on DSPs for a defined term.",
  "TT-MPA-04":
    "Hire a marketing or promotion team for a campaign with deliverables, budget and reporting.",
  "TT-PBR-05":
    "Add a budget, artist advance and recoupment waterfall on top of an existing agreement.",
  "TT-PAA-06":
    "Appoint a publishing administrator to register, licence and collect on your compositions.",
  "TT-AMA-07":
    "Appoint a manager, with commission rate, scope, term and sunset clause clearly defined.",
};

export function getForm(templateId: string): ContractForm | undefined {
  return contractForms.find((f) => f.template_id === templateId);
}

/** Steps that actually contain fields, in the schema's declared order. */
export function getFormSteps(form: ContractForm): string[] {
  const used = new Set(form.fields.map((f) => f.group));
  return form.form_steps.filter((s) => used.has(s));
}

export function fieldsForStep(form: ContractForm, step: string): ContractField[] {
  return form.fields.filter((f) => f.group === step);
}

/** Business profile fields that pre-fill company-side tokens. */
export type BusinessProfileLike = {
  legal_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  address?: string | null;
  contact_email?: string | null;
  signatory_name?: string | null;
  signatory_title?: string | null;
  default_currency?: string | null;
  governing_law?: string | null;
};

export const profilePrefillTokens: Record<string, keyof BusinessProfileLike> = {
  LABEL_LEGAL_NAME: "legal_name",
  LABEL_ADDRESS: "address",
  LABEL_REGISTRATION_NUMBER: "registration_number",
  LABEL_JURISDICTION: "governing_law",
  LABEL_NOTICE_EMAIL: "contact_email",
  LABEL_SIGNATORY_NAME: "signatory_name",
  LABEL_SIGNATORY_TITLE: "signatory_title",
  CURRENCY: "default_currency",
};

export function prefillFromProfile(
  form: ContractForm,
  profile: BusinessProfileLike | null | undefined,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.computed_clause) values[field.token] = field.computed_clause.default;
    if (!profile) continue;
    const key = profilePrefillTokens[field.token];
    if (key) {
      const value = profile[key];
      if (value) values[field.token] = String(value);
    }
  }
  return values;
}

export function missingRequired(form: ContractForm, values: Record<string, string>): ContractField[] {
  return form.fields.filter((f) => f.required && !String(values[f.token] ?? "").trim());
}

const REVIEW_TRIGGER_VALUES = [
  "attorney review required",
  "assignment",
  "assigned",
  "joint ownership",
  "personally repayable",
  "broad cross-collateralisation",
];

export function reviewFlags(values: Record<string, string>): string[] {
  const flags: string[] = [];
  for (const [token, value] of Object.entries(values)) {
    const lower = String(value ?? "").toLowerCase();
    if (REVIEW_TRIGGER_VALUES.some((t) => lower.includes(t))) {
      flags.push(`${token.replaceAll("_", " ").toLowerCase()}: "${value}"`);
    }
  }
  return flags;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Resolve a field's stored value into the literal text placed in the document. */
export function resolveValue(field: ContractField | undefined, raw: string): string {
  if (field?.computed_clause) {
    return field.computed_clause.options[raw] ?? raw;
  }
  return raw;
}

export type GenerateResult = { blob: Blob; unresolved: string[] };

/**
 * Fetch the .docx template, replace every {{TOKEN}} and return a new .docx.
 * Runs in the browser only.
 */
export async function generateDocx(
  form: ContractForm,
  values: Record<string, string>,
): Promise<GenerateResult> {
  const response = await fetch(`/contract-templates/${form.template_file}`);
  if (!response.ok) throw new Error("Could not load the contract template.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(buffer);

  const fieldByToken = new Map(form.fields.map((f) => [f.token, f] as const));
  const unresolved = new Set<string>();

  for (const name of Object.keys(files)) {
    if (!name.endsWith(".xml")) continue;
    let xml = strFromU8(files[name]!);
    if (!xml.includes("{{")) continue;
    xml = xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, token: string) => {
      const raw = values[token];
      if (raw === undefined || String(raw).trim() === "") {
        unresolved.add(token);
        return match;
      }
      return escapeXml(resolveValue(fieldByToken.get(token), String(raw)));
    });
    files[name] = strToU8(xml);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped.slice() as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return { blob, unresolved: [...unresolved] };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "contract"
  );
}
