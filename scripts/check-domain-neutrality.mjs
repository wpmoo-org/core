import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const scanRoots = ["packages", "apps/playground"];
const skippedDirectories = new Set([
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules"
]);
const scannedExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".ts",
  ".tsx"
]);

const forbiddenTerms = [
  "customer",
  "order",
  "course",
  "event",
  "project",
  "task",
  "crm",
  "cms",
  "subscription plan",
  "product analytics",
  "organization",
  "workspace",
  "tenant"
];

const allowlistedLinePatterns = [
  /"workspace:\*"/,
  /Provider-internal technical records are allowed/i,
  /payment_customer/i
];

const findings = [];

for (const root of scanRoots) {
  await scanPath(root);
}

if (findings.length > 0) {
  console.error("Domain-neutrality scanner found forbidden terms:");

  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line}: ${finding.term}: ${finding.text.trim()}`
    );
  }

  process.exitCode = 1;
}

async function scanPath(path) {
  let entries;

  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const entryPath = join(path, entry.name);

    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        await scanPath(entryPath);
      }

      continue;
    }

    if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      await scanFile(entryPath);
    }
  }
}

async function scanFile(filePath) {
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (allowlistedLinePatterns.some((pattern) => pattern.test(line))) {
      return;
    }

    for (const term of forbiddenTerms) {
      if (matchesTerm(line, term)) {
        findings.push({
          file: relative(process.cwd(), filePath),
          line: index + 1,
          term,
          text: line
        });
      }
    }
  });
}

function matchesTerm(line, term) {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedTerm}\\b`, "i");

  return pattern.test(line);
}

function isNotFoundError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
