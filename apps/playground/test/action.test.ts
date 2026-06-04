import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { action, routeAction, safeRedirectTarget } from "../lib/action.js";

describe("action", () => {
  it("validates input before authorize and handler run", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const submit = action("proof.noop", {
      authorize,
      handler,
      schema: z.object({ name: z.string().min(1) })
    });

    await expect(submit({ name: "" })).resolves.toEqual({
      error: { code: "validation.invalid_input" },
      ok: false
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("authorizes before running the mutation handler", async () => {
    const authorize = vi.fn().mockResolvedValue({ id: "user_1" });
    const handler = vi.fn().mockResolvedValue({ saved: true });
    const submit = action("proof.noop", {
      authorize,
      handler,
      schema: z.object({ name: z.string().min(1) })
    });

    await expect(submit({ name: "Core" })).resolves.toEqual({
      data: { saved: true },
      ok: true
    });
    expect(authorize).toHaveBeenCalledWith({
      action: "execute",
      input: { name: "Core" },
      resource: "proof"
    });
    expect(handler).toHaveBeenCalledWith({
      actor: { id: "user_1" },
      input: { name: "Core" },
      policy: expect.objectContaining({ resource: "proof" })
    });
  });

  it("requires double-submit CSRF values for critical actions", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const claim = action("bootstrap.claim", {
      authorize,
      handler,
      schema: z.object({
        csrfCookie: z.string().optional(),
        csrfToken: z.string().optional()
      })
    });

    await expect(claim({})).resolves.toEqual({
      error: { code: "auth.forbidden" },
      ok: false
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("routeAction", () => {
  it("returns a Response and authorizes before running the route handler", async () => {
    const authorize = vi.fn().mockResolvedValue({ id: "user_1" });
    const handler = vi.fn().mockResolvedValue(
      Response.json(
        {
          saved: true
        },
        {
          status: 201
        }
      )
    );
    const post = routeAction("proof.noop", {
      authorize,
      handler,
      parse: (request) => request.json(),
      schema: z.object({ name: z.string().min(1) })
    });

    const response = await post(
      new Request("https://wpmoo.local/api/proof", {
        body: JSON.stringify({ name: "Core" }),
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toEqual({ saved: true });
    expect(response.status).toBe(201);
    expect(authorize).toHaveBeenCalledWith({
      action: "execute",
      input: { name: "Core" },
      resource: "proof"
    });
    expect(handler).toHaveBeenCalledWith({
      actor: { id: "user_1" },
      input: { name: "Core" },
      policy: expect.objectContaining({ resource: "proof" }),
      request: expect.any(Request)
    });
  });

  it("maps invalid route input to a stable HTTP error response", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const post = routeAction("proof.noop", {
      authorize,
      handler,
      parse: (request) => request.json(),
      schema: z.object({ name: z.string().min(1) })
    });

    const response = await post(
      new Request("https://wpmoo.local/api/proof", {
        body: JSON.stringify({ name: "" }),
        method: "POST"
      })
    );

    await expect(response.json()).resolves.toEqual({
      error: { code: "validation.invalid_input" },
      ok: false
    });
    expect(response.status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("safeRedirectTarget", () => {
  it("allows known internal paths and locale-prefixed variants", () => {
    expect(safeRedirectTarget("/admin/users")).toBe("/admin/users");
    expect(safeRedirectTarget("/de/admin/users")).toBe("/de/admin/users");
  });

  it("rejects external, protocol-relative, encoded, and unknown targets", () => {
    expect(safeRedirectTarget("https://evil.example")).toBeNull();
    expect(safeRedirectTarget("//evil.example")).toBeNull();
    expect(safeRedirectTarget("%2F%2Fevil.example")).toBeNull();
    expect(safeRedirectTarget("/unknown")).toBeNull();
  });
});
