#!/usr/bin/env node
import { URL } from "node:url";
import { chromium } from "@playwright/test";

const baseUrl = process.env.PLAYGROUND_SMOKE_URL ?? "http://127.0.0.1:3000";
const headed = process.env.PLAYGROUND_SMOKE_HEADED === "1";
const cookieHeader = process.env.PLAYGROUND_SMOKE_COOKIE;

async function main() {
  const browser = await chromium.launch({ headless: !headed });

  try {
    const page = await browser.newPage();

    if (cookieHeader !== undefined && cookieHeader.length > 0) {
      await setCookieHeader(page, cookieHeader);
    }

    await page.goto(new URL("/admin/users", baseUrl).toString(), {
      waitUntil: "networkidle"
    });

    await expectVisible(page, "h1", "Users");

    await page.getByPlaceholder("Search users").fill("Core");
    await page.waitForURL((url) => url.searchParams.get("q") === "Core");

    await page.getByRole("button", { name: /sort by email/i }).click();
    await page.waitForURL((url) => url.searchParams.get("sort") === "email");

    await page.getByText("Role", { exact: true }).click();
    await page.getByLabel("Admin").check();
    await page.waitForURL((url) => url.searchParams.get("filter.role") === "admin");

    await page.locator("tbody input[type='checkbox']").first().check();
    await page.locator("[role='toolbar'].wpmoo-data-table-action-bar").waitFor({
      state: "visible"
    });

    console.log("Admin users UI smoke passed.");
  } finally {
    await browser.close();
  }
}

async function setCookieHeader(page, header) {
  const url = new URL(baseUrl);
  const cookies = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const separator = part.indexOf("=");
      const name = separator === -1 ? part : part.slice(0, separator);
      const value = separator === -1 ? "" : part.slice(separator + 1);

      return {
        domain: url.hostname,
        httpOnly: true,
        name,
        path: "/",
        sameSite: "Lax",
        secure: url.protocol === "https:",
        value
      };
    });

  await page.context().addCookies(cookies);
}

async function expectVisible(page, selector, text) {
  await page.locator(selector).filter({ hasText: text }).waitFor({
    state: "visible"
  });
}

main().catch((error) => {
  console.error(error);
  console.error(
    "Hint: run against a local seeded DB with an authenticated admin session. " +
      "Pass PLAYGROUND_SMOKE_COOKIE='name=value; ...' when the browser needs a session cookie."
  );
  process.exit(1);
});
