/**
 * lib/connect/catalog.ts — the loan systems, point-of-sale and CRMs Command
 * Center connects to, and how (D63). Pure.
 *
 * Each entry says the route that works today, from what the vendor
 * publishes (checked 2026-11-20):
 *  - ARIVE: no direct API for custom integrations; its supported route is
 *    Zapier (Broker Pro and Non-Del plans), with "New Loan" and "Loan Status
 *    Updated" triggers. Command Center's loan address takes those Zaps.
 *  - LendingPad: an Enterprise API for Lender Edition clients, with keys
 *    issued by LendingPad support; no public reference. Keys are stored here
 *    for when access is granted; until then, an automation tool or export.
 *  - Encompass (ICE): Developer Connect, OAuth and loan webhooks. The
 *    credentials are stored and the sign-in is tested here; the loan sync is
 *    finished against the owner's own instance.
 *  - CRMs (Shape, Bonzo, Total Expert, Jungo) and point-of-sale (Floify):
 *    their webhooks or Zapier into the lead address, or an export into
 *    Import.
 */
export type SystemKind = "los" | "pos" | "crm";
export type Route = "zapier" | "webhook" | "api" | "import";

export type System = {
  key: string;
  name: string;
  kind: SystemKind;
  /** What comes in: loans (Pipeline) or people (contacts and leads). */
  brings: "loans" | "people";
  routes: Route[];
  /** Fields for the stored API credentials, when the vendor issues them. */
  credentials?: { key: string; label: string; secret: boolean; hint: string }[];
  steps: string[];
  note?: string;
};

export const SYSTEMS: System[] = [
  {
    key: "arive", name: "ARIVE", kind: "los", brings: "loans", routes: ["zapier"],
    steps: [
      "Zapier needs ARIVE's Broker Pro or Non-Del plan.",
      "In Zapier, make a Zap with the ARIVE trigger \"Loan Status Updated\" (and a second one for \"New Loan\").",
      "Add the action \"Webhooks by Zapier\" (choose POST) and paste your connection address from step 1 as the URL.",
      "Map the loan fields (loan number, borrower name, email and phone, status, purpose, type, amount, rate, application, lock, appraisal, clear-to-close and closing dates, buyer's agent). ARIVE's own field names work.",
      "Turn the Zap on. Each status change updates the loan's journey and your LOA's deadlines.",
    ],
    note: "ARIVE doesn't offer direct API access for custom integrations; Zapier is its supported route. Forms and documents stay in ARIVE: download them and drop them on the loan.",
  },
  {
    key: "lendingpad", name: "LendingPad", kind: "los", brings: "loans", routes: ["api", "webhook", "import"],
    credentials: [
      { key: "apiKey", label: "Enterprise API key", secret: true, hint: "Issued by LendingPad support with the Enterprise API agreement (Lender Edition)." },
      { key: "companyId", label: "Company or tenant ID (if they give one)", secret: false, hint: "Optional." },
    ],
    steps: [
      "Ask LendingPad support for Enterprise API access (it's for Lender Edition clients; they issue the keys).",
      "Meanwhile, any automation tool your plan includes can send loan updates to your connection address from step 1, the same way as ARIVE.",
      "Or export your pipeline to Excel or CSV and drop it on Import.",
      "Once LendingPad grants API access, save the key here and the sync is finished against your account.",
    ],
  },
  {
    key: "encompass", name: "Encompass (ICE)", kind: "los", brings: "loans", routes: ["api", "webhook"],
    credentials: [
      { key: "instanceId", label: "Instance ID", secret: false, hint: "Starts with BE or TEBE." },
      { key: "user", label: "API user name", secret: false, hint: "An Encompass user for the integration." },
      { key: "password", label: "API user password", secret: true, hint: "" },
      { key: "clientId", label: "Developer Connect client ID", secret: false, hint: "From ICE, for your instance." },
      { key: "clientSecret", label: "Developer Connect client secret", secret: true, hint: "" },
    ],
    steps: [
      "Get Developer Connect API credentials for your Encompass instance from ICE (your Encompass admin requests them).",
      "Save them here and press Test: Command Center signs in to check them.",
      "The loan sync uses Encompass's loan webhooks (create and update) and the loan pipeline; it's finished against your instance once the test passes.",
    ],
  },
  {
    key: "shape", name: "Shape", kind: "crm", brings: "people", routes: ["webhook", "api", "import"],
    credentials: [{ key: "apiKey", label: "Shape API key", secret: true, hint: "In Shape, under the API settings." }],
    steps: ["In Shape, add a webhook (or a Zapier step) for new and updated contacts that sends them to your connection address from step 1.", "Or export your contacts and drop the file on Import: columns are matched for you."],
  },
  {
    key: "bonzo", name: "Bonzo", kind: "crm", brings: "people", routes: ["zapier", "webhook", "import"],
    steps: ["In Zapier, a Bonzo \"new prospect\" trigger, then \"Webhooks by Zapier\" (POST) to your connection address from step 1.", "Or export your prospects and drop the file on Import."],
  },
  {
    key: "totalexpert", name: "Total Expert", kind: "crm", brings: "people", routes: ["import", "webhook"],
    steps: ["Export your contacts from Total Expert and drop the file on Import.", "Enterprise accounts can ask Total Expert to send new contacts to your connection address from step 1."],
  },
  {
    key: "jungo", name: "Jungo (Salesforce)", kind: "crm", brings: "people", routes: ["import", "webhook"],
    steps: ["Jungo runs on Salesforce: a Salesforce Flow or report export sends contacts here.", "The quickest: run a contacts report, export it, and drop it on Import."],
  },
  {
    key: "floify", name: "Floify", kind: "pos", brings: "people", routes: ["zapier", "webhook"],
    steps: ["In Zapier, a Floify trigger for new loan applications, then \"Webhooks by Zapier\" (POST) to your connection address from step 1."],
  },
  {
    key: "other", name: "Any other system", kind: "los", brings: "loans", routes: ["webhook", "zapier", "import"],
    steps: ["Anything that can send a webhook, or a Zapier or Make step, can send loans to your connection address from step 1.", "Or export to Excel or CSV and drop it on Import."],
  },
];

export const systemByKey = (k: string) => SYSTEMS.find((s) => s.key === k) ?? null;
export const KIND_LABELS: Record<SystemKind, string> = { los: "Loan system", pos: "Application portal", crm: "CRM" };
export const ROUTE_LABELS: Record<Route, string> = { zapier: "Zapier", webhook: "Webhook", api: "API", import: "Export and import" };
