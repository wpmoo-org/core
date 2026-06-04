import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

export const DEFAULT_ROUTE_MODULE_FILE_NAMES = [
  "default.ts",
  "default.tsx",
  "error.ts",
  "error.tsx",
  "layout.ts",
  "layout.tsx",
  "loading.ts",
  "loading.tsx",
  "not-found.ts",
  "not-found.tsx",
  "page.ts",
  "page.tsx",
  "template.ts",
  "template.tsx"
] as const;

export type GenerateLocalizedReexportsOptions = Readonly<{
  appDir: string;
  dryRun?: boolean;
  localeSegment?: string;
  routeModuleFileNames?: readonly string[];
}>;

export type LocalizedReexportChange = Readonly<{
  content: string;
  relativeSource: string;
  relativeTarget: string;
  sourceFile: string;
  targetFile: string;
}>;

type DiscoverOptions = Readonly<{
  appDir: string;
  localeSegment: string;
  routeModuleFileNames: ReadonlySet<string>;
}>;

export async function generateLocalizedReexports(
  options: GenerateLocalizedReexportsOptions
): Promise<LocalizedReexportChange[]> {
  const appDir = resolve(options.appDir);
  const localeSegment = options.localeSegment ?? "[locale]";
  const routeModuleFileNames = new Set(
    options.routeModuleFileNames ?? DEFAULT_ROUTE_MODULE_FILE_NAMES
  );
  const sourceFiles = await discoverRouteModules(appDir, {
    appDir,
    localeSegment,
    routeModuleFileNames
  });
  const changes: LocalizedReexportChange[] = [];

  for (const sourceFile of sourceFiles.sort()) {
    const relativeSource = toPosixPath(relative(appDir, sourceFile));
    const targetFile = resolve(appDir, localeSegment, relativeSource);
    const relativeTarget = toPosixPath(relative(appDir, targetFile));
    const content = createReexportContent(sourceFile, targetFile);
    const currentContent = await readOptionalFile(targetFile);

    if (currentContent === content) {
      continue;
    }

    changes.push({
      content,
      relativeSource,
      relativeTarget,
      sourceFile,
      targetFile
    });

    if (options.dryRun !== true) {
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, content);
    }
  }

  return changes;
}

async function discoverRouteModules(
  directory: string,
  options: DiscoverOptions
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routeModules: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name, options.localeSegment)) {
        continue;
      }

      routeModules.push(...(await discoverRouteModules(entryPath, options)));
      continue;
    }

    if (entry.isFile() && options.routeModuleFileNames.has(entry.name)) {
      routeModules.push(entryPath);
    }
  }

  return routeModules;
}

function shouldSkipDirectory(name: string, localeSegment: string): boolean {
  return name === localeSegment || name === "node_modules" || name.startsWith(".");
}

function createReexportContent(sourceFile: string, targetFile: string): string {
  const importSpecifier = toImportSpecifier(relative(dirname(targetFile), sourceFile));

  return `export { default } from "${importSpecifier}";\nexport * from "${importSpecifier}";\n`;
}

function toImportSpecifier(relativePath: string): string {
  const extensionlessPath = toPosixPath(relativePath).replace(
    /\.[cm]?[tj]sx?$/,
    ""
  );

  return extensionlessPath.startsWith(".")
    ? extensionlessPath
    : `./${extensionlessPath}`;
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
