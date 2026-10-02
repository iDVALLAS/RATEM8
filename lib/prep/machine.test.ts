import { describe, expect, it } from "vitest";
import { NEVER_ASK, PREP_FIELDS, PREP_FIELD_IDS, answer, back, containsSensitive, editField, isDone, start, summaryRows } from "./machine";
import { copy } from "@/lib/copy";

const opts = (id: string) => ((copy.prep.fields as Record<string, { options?: { value: string }[] }>)[id]?.options ?? []).map((o) => o.value);

describe("prep machine", () => {
  it("walks every field in order and ends on the summary", () => {
    let s = start();
    for (const f of PREP_FIELDS) {
      const v = f.kind === "choice" ? opts(f.id)[0] : f.kind === "state" ? "OR" : "";
      s = answer(s, v, f.kind === "choice" ? opts(f.id) : f.kind === "state" ? ["OR", "WA"] : undefined).state;
    }
    expect(isDone(s)).toBe(true);
    expect(s.answers.state).toBe("OR");
    expect(s.answers.questions).toBeUndefined();
  });

  it("rejects empty required answers and values outside the options", () => {
    const s = start();
    expect(answer(s, "").error).toBe("empty");
    expect(answer(s, "steal-a-house", opts("purpose")).error).toBe("invalid");
  });

  it("never stores SSNs, dates of birth, or account numbers in free text", () => {
    let s = start();
    for (let i = 0; i < PREP_FIELDS.length - 1; i++) s = { ...s, step: s.step + 1 };
    for (const bad of ["my ssn is 123-45-6789", "123456789", "DOB 04/12/1985", "born on 4.12.85", "acct 0012 3456 7890", "routing 021000021"]) {
      const r = answer(s, bad);
      expect(r.error).toBe("sensitive");
      expect(r.state.answers.questions).toBeUndefined();
    }
    expect(answer(s, "Can I use gift funds for 10% down?").state.answers.questions).toContain("gift funds");
    expect(containsSensitive("Is 20% down better than 10%?")).toBe(false);
  });

  it("has no field for the things M8 must never ask for", () => {
    const ids = PREP_FIELD_IDS.join(" ").toLowerCase();
    for (const k of ["ssn", "social", "birth", "dob", "account", "document"]) expect(ids).not.toContain(k);
    expect(NEVER_ASK.length).toBe(4);
  });

  it("supports back, edit and summary rows", () => {
    let s = answer(start(), "purchase", opts("purpose")).state;
    s = back(s);
    expect(s.step).toBe(0);
    s = editField({ ...s, step: PREP_FIELDS.length }, "purpose");
    expect(s.step).toBe(0);
    const rows = summaryRows(s, (id) => id, (_id, v) => v.toUpperCase());
    expect(rows).toEqual([{ id: "purpose", label: "purpose", value: "PURCHASE" }]);
  });

  it("prep copy never says an application is submitted or taken", () => {
    const text = JSON.stringify({ apply: copy.apply, prep: copy.prep }).toLowerCase();
    for (const w of ["submitted", "submit your application", "application taken", "application is taken", "we've received your application"]) expect(text).not.toContain(w);
  });
});

describe("M8 system prompt: ready to apply", () => {
  it("offers both paths, lists exactly the prep fields and the never-ask list, and fills every token", async () => {
    const { buildM8SystemPrompt } = await import("@/lib/prompts/m8-system");
    const { PREP_FIELD_DESCRIPTIONS } = await import("./machine");
    const p = buildM8SystemPrompt();
    expect(p).toContain("## 10. When the person is ready to apply");
    expect(p).toContain('"Start your application"');
    expect(p).toContain('"Prep it with me first"');
    expect(p).toContain("the licensed loan officer's application is the official one");
    for (const d of Object.values(PREP_FIELD_DESCRIPTIONS)) expect(p).toContain(d);
    for (const n of NEVER_ASK) expect(p).toContain(n);
    expect(p).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});
