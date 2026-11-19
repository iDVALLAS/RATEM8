/**
 * lib/setup/launch-doc.ts — writes docs/COMMAND_CENTER_LAUNCH.md from the
 * launch checklist (D32), so the doc and /mlo/launch can't drift. A test
 * fails when they differ; run `UPDATE_LAUNCH_DOC=1 npx vitest run lib/setup`
 * to rewrite it.
 */
import { LAUNCH, PHASES } from "./launch";

export function renderLaunchDoc(): string {
  const out: string[] = [
    "# Command Center launch checklist",
    "",
    "Every outside account and Vercel setting Command Center uses, in the order to do them. The live version, showing which variables are already set, is in Command Center → Launch checklist (`/mlo/launch`). Generated from `lib/setup/launch.ts` (D32).",
    "",
    "Add each variable in Vercel → the project → Settings → Environment Variables (Production and Preview), then redeploy. **Sensitive** means mark it Sensitive in Vercel.",
  ];
  PHASES.forEach((title, i) => {
    out.push("", `## ${i + 1}. ${title}`);
    for (const s of LAUNCH.filter((x) => x.phase === i + 1)) {
      out.push("", `### ${s.title}`, "", s.outside ? `${s.detail} (${s.outside})` : s.detail);
      if (s.env?.length) {
        out.push("", "| Variable | Sensitive | Note |", "| --- | --- | --- |");
        for (const e of s.env) out.push(`| \`${e.name}\`${e.optional ? " (optional)" : ""} | ${e.sensitive ? "Yes" : "No"} | ${e.note} |`);
      }
    }
  });
  return out.join("\n") + "\n";
}
