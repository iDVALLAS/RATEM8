import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLaunchDoc } from "./launch-doc";

const DOC = join(process.cwd(), "docs/COMMAND_CENTER_LAUNCH.md");

describe("Launch doc (D32)", () => {
  it("matches lib/setup/launch.ts", () => {
    if (process.env.UPDATE_LAUNCH_DOC === "1") writeFileSync(DOC, renderLaunchDoc());
    expect(readFileSync(DOC, "utf8")).toBe(renderLaunchDoc());
  });
});
