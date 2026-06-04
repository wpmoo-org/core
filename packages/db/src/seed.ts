export type SeedResult = {
  inserted: number;
  updated: number;
};

export async function seedCore(): Promise<SeedResult> {
  return {
    inserted: 0,
    updated: 0
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seedCore();
  console.log(`Seed complete: ${result.inserted} inserted, ${result.updated} updated.`);
}
