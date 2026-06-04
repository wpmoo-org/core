import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(scriptDir, "../drizzle");

if (!existsSync(migrationsDir)) {
  console.log("No generated migrations yet. Waiting for Better Auth proof approval.");
  process.exit(0);
}

const generatedFiles = readdirSync(migrationsDir).filter((file) =>
  file.endsWith(".sql")
);

if (generatedFiles.length > 0) {
  throw new Error(
    `Migration generation is blocked until proof approval. Found: ${generatedFiles.join(", ")}`
  );
}

console.log("No generated migration SQL files found.");
