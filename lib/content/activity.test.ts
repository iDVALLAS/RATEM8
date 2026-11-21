import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activityLabel } from "./activity";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === ".next") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

describe("activity in words (D76)", () => {
  it("says what happened, not the code", () => {
    expect(activityLabel("contacts.import.finish")).toBe("Imported contacts");
    expect(activityLabel("contacts.import.batch")).toBe("Imported contacts");
    expect(activityLabel("user.bootstrap_owner")).toBe("Account created (owner)");
    expect(activityLabel("gate.send.text")).toBe("Sent a message");
    expect(activityLabel("brand.new_thing")).toBe("Other: brand new thing");
  });

  it("has words for every code the app writes to the audit log", () => {
    const codes = new Set<string>();
    for (const f of [...walk(join(process.cwd(), "lib")), ...walk(join(process.cwd(), "app"))]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/audit\(\{[^}]*?action: "([a-z_.]+)"/g)) codes.add(m[1]!);
      // Helpers that take the code as an argument, e.g. journey's save(…, now, "journey.lock", {…}).
      for (const m of src.matchAll(/now, "([a-z]+\.[a-z_.]+)", \{/g)) codes.add(m[1]!);
    }
    expect(codes.size).toBeGreaterThan(50);
    const missing = [...codes].filter((c) => activityLabel(c).startsWith("Other"));
    expect(missing).toEqual([]);
  });
});
