#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "test-results"
]);

const sourceExtensions = new Set([
  ".css",
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx"
]);

function fail(message) {
  failures.push(message);
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function walk(directory, predicate = () => true) {
  const files = [];

  function visit(current) {
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(path.join(current, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(current, entry.name);

      if (predicate(filePath)) {
        files.push(filePath);
      }
    }
  }

  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    visit(directory);
  }

  return files;
}

function read(filePath) {
  return readFileSync(filePath, "utf8");
}

function sourceFilesUnder(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  return walk(directory, (filePath) => sourceExtensions.has(path.extname(filePath)));
}

function packageJsonFiles() {
  return walk(root, (filePath) => path.basename(filePath) === "package.json");
}

function checkNoStaticAdminFixturesInRoutes() {
  const forbiddenSymbols = [
    "phase2StaticAdminContext",
    "createStaticPageQueryClient"
  ];

  for (const filePath of sourceFilesUnder("apps/playground/app")) {
    const contents = read(filePath);

    for (const symbol of forbiddenSymbols) {
      if (contents.includes(symbol)) {
        fail(`${relative(filePath)} uses ${symbol}; product routes must use real request context and DB clients.`);
      }
    }
  }
}

function checkDbPackageIsBottomLayer() {
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']+from\s+)?["'](@wpmoo\/[^"']+)["']/g;

  for (const filePath of sourceFilesUnder("packages/db/src")) {
    const contents = read(filePath);
    let match;

    while ((match = importPattern.exec(contents)) !== null) {
      fail(`${relative(filePath)} imports ${match[1]}; packages/db must not import other @wpmoo packages.`);
    }
  }

  const manifestPath = path.join(root, "packages/db/package.json");
  const manifest = JSON.parse(read(manifestPath));
  const dependencyNames = Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {})
  });

  for (const dependencyName of dependencyNames) {
    if (dependencyName.startsWith("@wpmoo/")) {
      fail(`${relative(manifestPath)} depends on ${dependencyName}; packages/db must remain the bottom layer.`);
    }
  }
}

function checkUiPackageDoesNotImportServerPackages() {
  const forbiddenImports = new Set([
    "@wpmoo/audit",
    "@wpmoo/auth",
    "@wpmoo/db",
    "@wpmoo/security"
  ]);
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']+from\s+)?["']([^"']+)["']/g;

  for (const filePath of sourceFilesUnder("packages/ui/src")) {
    const contents = read(filePath);
    let match;

    while ((match = importPattern.exec(contents)) !== null) {
      if (forbiddenImports.has(match[1])) {
        fail(`${relative(filePath)} imports ${match[1]}; packages/ui must not import server/data packages.`);
      }
    }
  }
}

function checkBannedUiDependencies() {
  const bannedPackageNames = ["cmdk", "vaul"];
  const bannedImportFragments = ["@radix-ui/", "radix-ui", "cmdk", "vaul"];

  for (const filePath of packageJsonFiles()) {
    const manifest = JSON.parse(read(filePath));
    const dependencyNames = Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.peerDependencies ?? {})
    });

    for (const dependencyName of dependencyNames) {
      if (
        dependencyName.startsWith("@radix-ui/") ||
        dependencyName === "radix-ui" ||
        bannedPackageNames.includes(dependencyName)
      ) {
        fail(`${relative(filePath)} declares banned UI dependency ${dependencyName}.`);
      }
    }
  }

  for (const filePath of [
    ...sourceFilesUnder("apps"),
    ...sourceFilesUnder("packages")
  ]) {
    const contents = read(filePath);

    for (const fragment of bannedImportFragments) {
      const importPattern = new RegExp(`["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      if (importPattern.test(contents)) {
        fail(`${relative(filePath)} imports banned UI primitive ${fragment}.`);
      }
    }
  }
}

function extractObjectLiteralAfter(source, marker, terminator) {
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error(`Could not find ${marker}`);
  }

  const bodyStart = source.indexOf("{", start);
  const end = source.indexOf(terminator, bodyStart);

  if (bodyStart === -1 || end === -1) {
    throw new Error(`Could not extract object literal for ${marker}`);
  }

  return source.slice(bodyStart + 1, end);
}

function parseActionRegistry() {
  const filePath = path.join(root, "apps/playground/lib/action.ts");
  const body = extractObjectLiteralAfter(read(filePath), "export const actionRegistry", "} as const");
  const entries = [];
  const entryPattern = /["']([^"']+)["']:\s*\{([\s\S]*?)\n\s*\}/g;
  let match;

  while ((match = entryPattern.exec(body)) !== null) {
    const [, id, block] = match;
    const action = block.match(/action:\s*["']([^"']+)["']/)?.[1];
    const resource = block.match(/resource:\s*["']([^"']+)["']/)?.[1];
    const risk = block.match(/risk:\s*["']([^"']+)["']/)?.[1];
    const requireCsrf = block.match(/requireCsrf:\s*(true|false)/)?.[1] === "true";

    if (action && resource && risk) {
      entries.push({ action, id, requireCsrf, resource, risk });
    }
  }

  return entries;
}

function catalogPermissionIds() {
  const filePath = path.join(root, "packages/rbac/src/catalog.ts");
  const contents = read(filePath);
  return new Set([...contents.matchAll(/id:\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

function permissionSeedIds() {
  const filePath = path.join(root, "packages/db/src/seed-data.ts");
  const contents = read(filePath);
  const body = contents.match(
    /export const corePermissionSeeds = \[([\s\S]*?)\] as const satisfies readonly CorePermissionSeed\[];/
  )?.[1];

  if (!body) {
    fail("packages/db/src/seed-data.ts does not expose corePermissionSeeds in the expected shape.");
    return new Set();
  }

  return new Set([...body.matchAll(/id:\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

function checkPermissionCatalogSeedsStayInSync() {
  const catalogIds = [...catalogPermissionIds()].sort();
  const seedIds = [...permissionSeedIds()].sort();

  if (JSON.stringify(catalogIds) !== JSON.stringify(seedIds)) {
    fail(
      `RBAC catalog and DB permission seeds drifted. catalog=[${catalogIds.join(", ")}] seeds=[${seedIds.join(", ")}].`
    );
  }
}

function checkDrizzleMigrationArtifactsStayInSync() {
  const drizzleDir = path.join(root, "packages/db/drizzle");
  const metaDir = path.join(drizzleDir, "meta");
  const journalPath = path.join(metaDir, "_journal.json");

  if (!statSync(drizzleDir, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`${relative(drizzleDir)} is missing; Drizzle migrations must live in packages/db/drizzle.`);
    return;
  }

  if (!statSync(metaDir, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`${relative(metaDir)} is missing; Drizzle metadata snapshots must live in packages/db/drizzle/meta.`);
    return;
  }

  if (!statSync(journalPath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${relative(journalPath)} is missing; Drizzle migration journal is required.`);
    return;
  }

  let journal;

  try {
    journal = JSON.parse(read(journalPath));
  } catch {
    fail(`${relative(journalPath)} is not valid JSON.`);
    return;
  }

  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const migrationFiles = readdirSync(drizzleDir).filter((fileName) =>
    /^\d+_.+\.sql$/.test(fileName)
  );
  const snapshotFiles = readdirSync(metaDir).filter((fileName) =>
    /^\d+_snapshot\.json$/.test(fileName)
  );
  const sortNumbers = (left, right) => left - right;
  const journalIndexes = entries
    .map((entry) => entry.idx)
    .filter((index) => Number.isInteger(index))
    .sort(sortNumbers);
  const migrationIndexes = migrationFiles
    .map((fileName) => Number(fileName.split("_")[0]))
    .filter((index) => Number.isInteger(index))
    .sort(sortNumbers);
  const snapshotIndexes = snapshotFiles
    .map((fileName) => Number(fileName.split("_")[0]))
    .filter((index) => Number.isInteger(index))
    .sort(sortNumbers);

  if (JSON.stringify(journalIndexes) !== JSON.stringify(migrationIndexes)) {
    fail(
      `Drizzle migration journal indexes [${journalIndexes.join(", ")}] do not match SQL migrations [${migrationIndexes.join(", ")}].`
    );
  }

  if (JSON.stringify(journalIndexes) !== JSON.stringify(snapshotIndexes)) {
    fail(
      `Drizzle migration journal indexes [${journalIndexes.join(", ")}] do not match metadata snapshots [${snapshotIndexes.join(", ")}].`
    );
  }

  const migrationFileNames = new Set(migrationFiles);
  const snapshotFileNames = new Set(snapshotFiles);

  for (const entry of entries) {
    if (!migrationFileNames.has(`${entry.tag}.sql`)) {
      fail(`Drizzle journal entry ${entry.tag} is missing ${entry.tag}.sql.`);
    }

    const snapshotFileName = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;

    if (!snapshotFileNames.has(snapshotFileName)) {
      fail(`Drizzle journal entry ${entry.tag} is missing ${snapshotFileName}.`);
    }
  }
}

function checkActionPolicies() {
  const actions = parseActionRegistry();
  const catalog = catalogPermissionIds();

  for (const action of actions) {
    if ((action.risk === "high" || action.risk === "critical") && !action.requireCsrf) {
      fail(`${action.id} is ${action.risk} risk but does not require CSRF.`);
    }

    if (action.id.startsWith("admin.")) {
      const permissionId = `${action.resource}:${action.action}`;

      if (!catalog.has(permissionId)) {
        fail(`${action.id} resolves to missing catalog permission ${permissionId}.`);
      }
    }
  }
}

function checkDocumentedScriptsExist() {
  const rootManifest = JSON.parse(read(path.join(root, "package.json")));
  const scripts = new Set(Object.keys(rootManifest.scripts ?? {}));
  const builtinPnpmCommands = new Set([
    "add",
    "audit",
    "config",
    "deploy",
    "dlx",
    "exec",
    "install",
    "link",
    "outdated",
    "patch",
    "publish",
    "approve-builds",
    "remove",
    "run",
    "store",
    "update",
    "why"
  ]);

  for (const filePath of [path.join(root, "README.md"), ...walk(path.join(root, "docs"), (candidate) => path.extname(candidate) === ".md")]) {
    const contents = read(filePath);
    const commandPattern = /\bpnpm\s+(?!--)([A-Za-z0-9:_-]+)/g;
    let match;

    while ((match = commandPattern.exec(contents)) !== null) {
      const command = match[1];

      if (/^\d+$/.test(command)) {
        continue;
      }

      if (!scripts.has(command) && !builtinPnpmCommands.has(command)) {
        fail(`${relative(filePath)} documents pnpm ${command}, but root package.json has no such script.`);
      }
    }
  }
}

checkNoStaticAdminFixturesInRoutes();
checkDbPackageIsBottomLayer();
checkUiPackageDoesNotImportServerPackages();
checkBannedUiDependencies();
checkPermissionCatalogSeedsStayInSync();
checkDrizzleMigrationArtifactsStayInSync();
checkActionPolicies();
checkDocumentedScriptsExist();

if (failures.length > 0) {
  console.error("Architecture contract check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Architecture contract check passed.");
