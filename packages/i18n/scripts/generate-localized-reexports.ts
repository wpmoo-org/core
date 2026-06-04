import { generateLocalizedReexports } from "../src/index.js";

const args = process.argv.slice(2);
const check = args.includes("--check");
const appDir = getArgValue("--app-dir") ?? "../../apps/playground/app";

const changes = await generateLocalizedReexports({
  appDir,
  dryRun: check
});

if (changes.length === 0) {
  console.log("Localized route re-exports are up to date.");
} else {
  for (const change of changes) {
    console.log(`${check ? "missing" : "wrote"} ${change.relativeTarget}`);
  }

  if (check) {
    process.exitCode = 1;
  }
}

function getArgValue(name: string): string | undefined {
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
}
