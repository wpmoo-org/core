export type QueryBudget = Readonly<{
  maxQueries: number;
  p95Ms: number;
}>;

export const phase3QueryBudgets = {
  adminAuditList: {
    maxQueries: 2,
    p95Ms: 50
  },
  adminUsersList: {
    maxQueries: 2,
    p95Ms: 50
  },
  effectiveAccess: {
    maxQueries: 1,
    p95Ms: 25
  }
} as const satisfies Record<string, QueryBudget>;

export function calculateP95Ms(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * 0.95) - 1;

  return sorted[Math.max(index, 0)] ?? 0;
}

export function isWithinQueryBudget(
  observed: Readonly<{ queryCount: number; queryDurationsMs: readonly number[] }>,
  budget: QueryBudget
): boolean {
  return (
    observed.queryCount <= budget.maxQueries &&
    calculateP95Ms(observed.queryDurationsMs) <= budget.p95Ms
  );
}
