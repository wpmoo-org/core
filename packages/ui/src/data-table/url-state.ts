export const DATA_TABLE_URL_KEYS = {
  columnFilterPrefix: "filter.",
  globalFilter: "q",
  pageIndex: "page",
  pageSize: "perPage",
  sort: "sort",
  sortDirection: "dir",
  visibilityPrefix: "hide."
} as const;

export type DataTableSortDirection = "asc" | "desc";

export type DataTableSortDescriptor = Readonly<{
  desc: boolean;
  id: string;
}>;

export type DataTableColumnFilterState = Record<string, readonly string[]>;

export type DataTableColumnVisibilityState = Record<string, boolean>;

export type DataTableUrlState = Readonly<{
  columnFilters: DataTableColumnFilterState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
  sorting: readonly DataTableSortDescriptor[];
  visibility: DataTableColumnVisibilityState;
}>;

export type DataTableStateDefaults = Readonly<{
  defaultGlobalFilter: string;
  defaultPageIndex: number;
  defaultPageSize: number;
  defaultSorting: readonly DataTableSortDescriptor[];
}>;

const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100] as const;

function isTableParam(paramKey: string): boolean {
  return (
    paramKey === DATA_TABLE_URL_KEYS.globalFilter ||
    paramKey === DATA_TABLE_URL_KEYS.pageIndex ||
    paramKey === DATA_TABLE_URL_KEYS.pageSize ||
    paramKey === DATA_TABLE_URL_KEYS.sort ||
    paramKey === DATA_TABLE_URL_KEYS.sortDirection ||
    paramKey.startsWith(DATA_TABLE_URL_KEYS.columnFilterPrefix) ||
    paramKey.startsWith(DATA_TABLE_URL_KEYS.visibilityPrefix)
  );
}

function tableParamsToString(params: URLSearchParams): string {
  const rows = [...params.entries()]
    .filter(([key]) => isTableParam(key))
    .map(([key, value]) => [key, value] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey);
      if (keyCompare !== 0) {
        return keyCompare;
      }
      return leftValue.localeCompare(rightValue);
    });

  return rows
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function isColumnIdAllowed(
  columnId: string,
  columns: readonly { id: string }[]
): boolean {
  return columns.some((column) => column.id === columnId);
}

function parseInteger(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDataTableSearchParams(
  params: URLSearchParams,
  columns: readonly { id: string }[],
  defaults: DataTableStateDefaults
): DataTableUrlState {
  const pageIndexRaw = parseInteger(params.get(DATA_TABLE_URL_KEYS.pageIndex));
  const pageSizeRaw = parseInteger(params.get(DATA_TABLE_URL_KEYS.pageSize));
  const sortColumnId = params.get(DATA_TABLE_URL_KEYS.sort);
  const sortDirectionRaw = params.get(DATA_TABLE_URL_KEYS.sortDirection);

  const sortDirection: DataTableSortDirection =
    sortDirectionRaw === "desc" ? "desc" : "asc";

  const pageIndex = Math.max(pageIndexRaw === null ? defaults.defaultPageIndex : pageIndexRaw - 1, 0);
  const pageSize = Math.min(
    Math.max(
      pageSizeRaw === null ? defaults.defaultPageSize : pageSizeRaw,
      MIN_PAGE_SIZE
    ),
    MAX_PAGE_SIZE
  );

  const globalFilter = params.get(DATA_TABLE_URL_KEYS.globalFilter) ?? defaults.defaultGlobalFilter;

  const columnFilterEntries: [string, readonly string[]][] = [];

  for (const [key, rawValue] of params.entries()) {
    if (!key.startsWith(DATA_TABLE_URL_KEYS.columnFilterPrefix)) {
      continue;
    }

    const columnId = key.slice(DATA_TABLE_URL_KEYS.columnFilterPrefix.length);
    if (!columnId || !isColumnIdAllowed(columnId, columns)) {
      continue;
    }

    const values = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    columnFilterEntries.push([columnId, values]);
  }

  const visibilityEntries: [string, boolean][] = [];
  for (const [key, rawValue] of params.entries()) {
    if (!key.startsWith(DATA_TABLE_URL_KEYS.visibilityPrefix)) {
      continue;
    }

    const columnId = key.slice(DATA_TABLE_URL_KEYS.visibilityPrefix.length);
    if (!columnId || !isColumnIdAllowed(columnId, columns)) {
      continue;
    }

    visibilityEntries.push([columnId, rawValue !== "1"]);
  }

  const visibility: DataTableColumnVisibilityState = columns.reduce((acc, column) => {
    const entry = visibilityEntries.find(([candidate]) => candidate === column.id);
    acc[column.id] = entry?.[1] ?? true;
    return acc;
  }, {} as DataTableColumnVisibilityState);

  const sorting: readonly DataTableSortDescriptor[] =
    sortColumnId !== null && isColumnIdAllowed(sortColumnId, columns)
      ? [{
          desc: sortDirection === "desc",
          id: sortColumnId
        }]
      : defaults.defaultSorting;

  return {
    columnFilters: columnFilterEntries.reduce((acc, [id, values]) => {
      if (values.length > 0) {
        acc[id] = values;
      }
      return acc;
    }, {} as DataTableColumnFilterState),
    globalFilter,
    pageIndex,
    pageSize,
    sorting,
    visibility
  };
}

function normalizeUrlValue(values: readonly string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(",");
}

function asEntryList<T>(value: Record<string, T>): readonly [string, T][] {
  return Object.entries(value) as readonly [string, T][];
}

export function serializeDataTableSearchParams(
  state: DataTableUrlState
): URLSearchParams {
  const params = new URLSearchParams();

  if (state.globalFilter.trim().length > 0) {
    params.set(DATA_TABLE_URL_KEYS.globalFilter, state.globalFilter);
  }

  if (state.pageIndex > 0) {
    params.set(DATA_TABLE_URL_KEYS.pageIndex, `${state.pageIndex + 1}`);
  }

  if (state.pageSize !== 10 && state.pageSize > 0) {
    params.set(DATA_TABLE_URL_KEYS.pageSize, `${state.pageSize}`);
  }

  if (state.sorting.length > 0) {
    params.set(DATA_TABLE_URL_KEYS.sort, state.sorting[0]?.id ?? "");
    params.set(DATA_TABLE_URL_KEYS.sortDirection, state.sorting[0]?.desc ? "desc" : "asc");
  }

  for (const [columnId, rawValues] of asEntryList(state.columnFilters)) {
    const values = normalizeUrlValue(rawValues);
    if (values.length > 0) {
      params.set(`${DATA_TABLE_URL_KEYS.columnFilterPrefix}${columnId}`, values);
    }
  }

  for (const [columnId, isVisible] of asEntryList(state.visibility)) {
    if (isVisible) {
      continue;
    }

    params.set(`${DATA_TABLE_URL_KEYS.visibilityPrefix}${columnId}`, "1");
  }

  return params;
}

export function readDataTableSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

export function shouldSyncDataTableSearchParams(nextState: DataTableUrlState): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const next = serializeDataTableSearchParams(nextState);
  const current = new URLSearchParams(window.location.search);

  return tableParamsToString(current) !== tableParamsToString(next);
}

export function updateDataTableSearchParams(state: DataTableUrlState): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const next = serializeDataTableSearchParams(state);

  for (const key of [...url.searchParams.keys()]) {
    const isTableFilter = key.startsWith(DATA_TABLE_URL_KEYS.columnFilterPrefix);
    const isVisibilityKey = key.startsWith(DATA_TABLE_URL_KEYS.visibilityPrefix);
    if (
      key === DATA_TABLE_URL_KEYS.globalFilter ||
      key === DATA_TABLE_URL_KEYS.pageIndex ||
      key === DATA_TABLE_URL_KEYS.pageSize ||
      key === DATA_TABLE_URL_KEYS.sort ||
      key === DATA_TABLE_URL_KEYS.sortDirection ||
      isTableFilter ||
      isVisibilityKey
    ) {
      url.searchParams.delete(key);
    }
  }

  for (const [key, value] of next.entries()) {
    url.searchParams.set(key, value);
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}
