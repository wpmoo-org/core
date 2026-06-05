import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("data table foundation", () => {
  it("keeps TanStack Table and nuqs as direct UI package foundations", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
    };
    const patternsSource = readFileSync(
      resolve(packageRoot, "src/data-table/patterns.tsx"),
      "utf8"
    );

    expect(manifest.dependencies?.["@tanstack/react-table"]).toBeDefined();
    expect(manifest.dependencies?.nuqs).toBeDefined();
    expect(patternsSource).toContain('from "@tanstack/react-table"');
    expect(patternsSource).toContain('from "nuqs"');
    expect(patternsSource).toContain("useReactTable");
    expect(patternsSource).toContain("useQueryStates");
  });

  it("keeps the bulk action bar accessible and able to clear all selected rows", () => {
    const patternsSource = readFileSync(
      resolve(packageRoot, "src/data-table/patterns.tsx"),
      "utf8"
    );

    expect(patternsSource).toContain('role="toolbar"');
    expect(patternsSource).toContain("ArrowRight");
    expect(patternsSource).toContain("ArrowLeft");
    expect(patternsSource).toContain("clearRowSelection");
    expect(patternsSource).toContain("setRowSelection({})");
    expect(patternsSource).toContain("wpmoo-data-table-action-bar-actions");
    expect(patternsSource).not.toContain("<span>{children}</span>");
  });

  it("treats URL visibility state as authoritative after query changes", () => {
    const patternsSource = readFileSync(
      resolve(packageRoot, "src/data-table/patterns.tsx"),
      "utf8"
    );

    expect(patternsSource).toContain("isApplyingUrlStateRef");
    expect(patternsSource).toContain("dataTableStateKey(state) === nuqsStateKey");
    expect(patternsSource).toContain("visibility: next.visibility");
    expect(patternsSource).not.toContain("visibility: {\n          ...next.visibility");
  });

  it("guards URL and selection synchronization against render loops", () => {
    const patternsSource = readFileSync(
      resolve(packageRoot, "src/data-table/patterns.tsx"),
      "utf8"
    );

    expect(patternsSource).toContain("nuqsValuesStableKey");
    expect(patternsSource).toContain("dataTableStateKey(previous) === dataTableStateKey(next)");
    expect(patternsSource).toContain("selectedIds.every((rowId) => validIds.has(rowId))");
  });
});
