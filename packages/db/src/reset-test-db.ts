import { Client } from "pg";

const safeLocalHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const testDatabaseUrl = process.env.RBAC_TEST_DATABASE_URL;

if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  throw new Error("RBAC_TEST_DATABASE_URL is required for db:test:reset.");
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, "");

if (
  databaseName.length === 0 ||
  ["postgres", "template0", "template1"].includes(databaseName)
) {
  throw new Error(`Refusing to reset unsafe database: ${databaseName || "<empty>"}.`);
}

if (process.env.CI !== "true" && !safeLocalHosts.has(parsedUrl.hostname)) {
  throw new Error(
    "Refusing to reset a non-local test database outside CI. Set RBAC_TEST_DATABASE_URL to a local database."
  );
}

const client = new Client({
  connectionString: testDatabaseUrl
});

await client.connect();

try {
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("GRANT ALL ON SCHEMA public TO public");
  await client.query("COMMENT ON SCHEMA public IS 'standard public schema'");
  console.log(`Reset test database: ${databaseName}.`);
} finally {
  await client.end();
}
