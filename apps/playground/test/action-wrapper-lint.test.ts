import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import requireActionWrapper from "../../../eslint-rules/require-action-wrapper.mjs";

const linter = new Linter({ configType: "flat" });
const config = [
  {
    files: ["**/*.{js,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    plugins: {
      "wpmoo-security": {
        rules: {
          "require-action-wrapper": requireActionWrapper
        }
      }
    },
    rules: {
      "wpmoo-security/require-action-wrapper": "error"
    }
  }
] as Linter.Config[];

describe("require-action-wrapper eslint rule", () => {
  it("ignores the central action() helper module", () => {
    const messages = linter.verify(
      `
      export function action() {
        return async function wrappedAction() {
          return { ok: true };
        };
      }
      `,
      config,
      { filename: "apps/playground/lib/action.ts" }
    );

    expect(messages).toEqual([]);
  });

  it("allows exported server actions created through action()", () => {
    const messages = linter.verify(
      `
      "use server";
      import { action } from "../lib/action.js";
      export const saveThing = action("proof.noop", {});
      `,
      config,
      { filename: "apps/playground/app/admin/actions.ts" }
    );

    expect(messages).toEqual([]);
  });

  it("flags raw server action exports that bypass action()", () => {
    const messages = linter.verify(
      `
      "use server";
      export async function saveThing() {
        return { ok: true };
      }
      `,
      config,
      { filename: "apps/playground/app/admin/actions.ts" }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("action()");
  });

  it("allows mutating route handlers created through routeAction()", () => {
    const messages = linter.verify(
      `
      import { routeAction } from "../../../lib/action.js";
      export const POST = routeAction("proof.noop", {});
      `,
      config,
      { filename: "apps/playground/app/api/users/route.ts" }
    );

    expect(messages).toEqual([]);
  });

  it("flags mutating route handlers that bypass routeAction()", () => {
    const messages = linter.verify(
      `
      export async function POST() {
        return Response.json({ ok: true });
      }
      `,
      config,
      { filename: "apps/playground/app/api/users/route.ts" }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("routeAction()");
  });

  it("flags route handlers exported through the server action wrapper", () => {
    const messages = linter.verify(
      `
      import { action } from "../../../lib/action.js";
      export const POST = action("proof.noop", {});
      `,
      config,
      { filename: "apps/playground/app/api/users/route.ts" }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("routeAction()");
  });

  it("ignores non-mutating route handlers and route config exports", () => {
    const messages = linter.verify(
      `
      export const dynamic = "force-dynamic";
      export async function GET() {
        return Response.json({ ok: true });
      }
      `,
      config,
      { filename: "apps/playground/app/api/users/route.ts" }
    );

    expect(messages).toEqual([]);
  });
});
