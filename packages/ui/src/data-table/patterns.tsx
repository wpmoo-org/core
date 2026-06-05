"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState
} from "@tanstack/react-table";
import {
  parseAsInteger,
  parseAsString,
  useQueryStates,
  type ParserMap
} from "nuqs";

import {
  type DataTableColumnFilterState,
  type DataTableColumnVisibilityState,
  type DataTableSortDirection,
  type DataTableSortDescriptor,
  type DataTableStateDefaults,
  type DataTableUrlState,
  PAGE_SIZE_OPTIONS,
  parseDataTableSearchParams,
  serializeDataTableSearchParams
} from "./url-state";

export type { DataTableColumnFilterState, DataTableColumnVisibilityState };
export type { DataTableSortDescriptor, DataTableSortDirection, DataTableUrlState };

export type DataTableFacetedFilterOption = Readonly<{
  icon?: ReactNode;
  label: string;
  value: string;
}>;

export type DataTableColumnDef<TData, TValue = unknown> = Readonly<{
  accessor: keyof TData | ((row: TData) => TValue);
  cell?: (context: { column: DataTableColumnDef<TData, TValue>; row: TData }) => ReactNode;
  enableHiding?: boolean;
  enableSorting?: boolean;
  filterOptions?: readonly DataTableFacetedFilterOption[];
  header: string;
  id: string;
}>;

export type DataTableRowModel<TData> = Readonly<{
  rows: readonly {
    id: string;
    index: number;
    original: TData;
  }[];
}>;

export type DataTableRowSelection = Record<string, boolean>;

export type DataTableState = Readonly<{
  columnFilters: DataTableColumnFilterState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
  sorting: readonly DataTableSortDescriptor[];
  visibility: DataTableColumnVisibilityState;
}>;

export type DataTableInstanceStateSnapshot = Readonly<{
  columnFilters: DataTableColumnFilterState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
  rowSelection: DataTableRowSelection;
  sorting: readonly DataTableSortDescriptor[];
  visibility: DataTableColumnVisibilityState;
}>;

export type DataTableColumnInstance<TData> = Readonly<{
  getCanHide: () => boolean;
  getCanSort: () => boolean;
  getFilterValue: () => readonly string[];
  getIsSorted: () => false | DataTableSortDirection;
  getIsVisible: () => boolean;
  id: string;
  setFilterValue: (value: readonly string[]) => void;
  toggleSorting: (nextSort: false | DataTableSortDirection) => void;
  toggleVisibility: (value?: boolean) => void;
  value: (row: TData) => string;
}>;

export type DataTableInstance<TData> = Readonly<{
  options: {
    columns: readonly DataTableColumnDef<TData>[];
  };
  getAllColumns: () => readonly DataTableColumnInstance<TData>[];
  getCanClearSelection: () => boolean;
  getCanNextPage: () => boolean;
  getCanPreviousPage: () => boolean;
  getColumn: (id: string) => DataTableColumnInstance<TData>;
  getFilteredRowModel: () => DataTableRowModel<TData>;
  getFilteredSelectedRowModel: () => DataTableRowModel<TData>;
  getPreFilteredRowModel: () => DataTableRowModel<TData>;
  getRowModel: () => DataTableRowModel<TData>;
  getState: () => {
    rowSelection: DataTableRowSelection;
    pagination: {
      pageIndex: number;
      pageSize: number;
    };
    sorting: readonly DataTableSortDescriptor[];
    globalFilter: string;
    columnFilters: DataTableColumnFilterState;
    visibility: DataTableColumnVisibilityState;
  };
  getIsAllPageRowsSelected: () => boolean;
  getIsSomePageRowsSelected: () => boolean;
  nextPage: () => void;
  previousPage: () => void;
  clearRowSelection: () => void;
  setColumnFilters: (filters: DataTableColumnFilterState) => void;
  setGlobalFilter: (value: string) => void;
  setPageIndex: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
  setSorting: (sorting: readonly DataTableSortDescriptor[]) => void;
  setVisibility: (visibility: DataTableColumnVisibilityState) => void;
  toggleAllRowsSelected: (value: boolean) => void;
  toggleRowSelected: (rowId: string, value: boolean) => void;
}>;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

type NuqsQueryValue = null | number | string;
type NuqsQueryValues = Record<string, NuqsQueryValue>;

function toTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toTextValue(entry))
      .filter((entry) => entry.length > 0)
      .join(",");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? `${value}`
    : "";
}

function asEntryList<T>(value: Record<string, T>): readonly [string, T][] {
  return Object.entries(value) as readonly [string, T][];
}

function resolveAccessor<TData, TValue>(
  column: DataTableColumnDef<TData, TValue>,
  row: TData
): unknown {
  if (typeof column.accessor === "function") {
    return column.accessor(row);
  }

  return (row as Record<string, unknown>)[String(column.accessor)];
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (!Number.isFinite(pageIndex)) {
    return 0;
  }

  if (pageIndex < 0) {
    return 0;
  }

  return Math.min(pageIndex, Math.max(pageCount - 1, 0));
}

function clampPageSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.floor(value), 1), MAX_PAGE_SIZE);
}

function createNuqsDataTableParsers(
  columns: readonly { id: string }[],
  defaults: DataTableStateDefaults
): ParserMap {
  const parsers: ParserMap = {
    q: parseAsString.withDefault(defaults.defaultGlobalFilter),
    page: parseAsInteger.withDefault(defaults.defaultPageIndex + 1),
    perPage: parseAsInteger.withDefault(defaults.defaultPageSize),
    sort: parseAsString.withDefault(""),
    dir: parseAsString.withDefault("")
  };

  for (const column of columns) {
    parsers[`filter.${column.id}`] = parseAsString.withDefault("");
    parsers[`hide.${column.id}`] = parseAsString.withDefault("");
  }

  return parsers;
}

function createClearedNuqsDataTableValues(
  columns: readonly { id: string }[]
): NuqsQueryValues {
  const values: NuqsQueryValues = {
    q: null,
    page: null,
    perPage: null,
    sort: null,
    dir: null
  };

  for (const column of columns) {
    values[`filter.${column.id}`] = null;
    values[`hide.${column.id}`] = null;
  }

  return values;
}

function dataTableStateToNuqsValues(
  state: DataTableUrlState,
  columns: readonly { id: string }[]
): NuqsQueryValues {
  const values = createClearedNuqsDataTableValues(columns);
  const params = serializeDataTableSearchParams(state);

  for (const [key, value] of params.entries()) {
    values[key] =
      key === "page" || key === "perPage"
        ? Number.parseInt(value, 10)
        : value;
  }

  return values;
}

function searchParamsFromNuqsValues(values: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

function nuqsValuesKey(values: Record<string, unknown>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey);
      if (keyCompare !== 0) {
        return keyCompare;
      }

      return leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function dataTableStateKey(state: DataTableUrlState): string {
  const params = serializeDataTableSearchParams(state);
  return [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("&");
}

export type UseDataTableOptions<TData> = Readonly<{
  columns: readonly DataTableColumnDef<TData>[];
  data: readonly TData[];
  defaultGlobalFilter?: string;
  defaultPageSize?: number;
  defaultSorting?: readonly DataTableSortDescriptor[];
  getRowId?: (row: TData, index: number) => string;
}>;

function computeInitialState<TData>(
  columns: readonly DataTableColumnDef<TData>[],
  defaults: DataTableStateDefaults,
  searchParams: URLSearchParams
): DataTableState {
  const parsed = parseDataTableSearchParams(searchParams, columns, defaults);
  return {
    columnFilters: parsed.columnFilters,
    globalFilter: parsed.globalFilter,
    pageIndex: parsed.pageIndex,
    pageSize: clampPageSize(parsed.pageSize),
    sorting: parsed.sorting,
    visibility: parsed.visibility
  };
}

export function useDataTable<TData>({
  columns,
  data,
  defaultGlobalFilter,
  defaultPageSize,
  defaultSorting,
  getRowId
}: UseDataTableOptions<TData>): DataTableInstance<TData> {
  const defaults = useMemo(
    () => ({
      defaultGlobalFilter: defaultGlobalFilter ?? "",
      defaultPageIndex: 0,
      defaultPageSize: defaultPageSize ?? DEFAULT_PAGE_SIZE,
      defaultSorting: defaultSorting ?? []
    }),
    [defaultGlobalFilter, defaultPageSize, defaultSorting]
  );

  const nuqsParsers = useMemo(
    () => createNuqsDataTableParsers(columns, defaults),
    [columns, defaults]
  );
  const [nuqsState, setNuqsState] = useQueryStates(nuqsParsers, {
    history: "replace",
    shallow: true
  });
  const nuqsValuesStableKey = useMemo(
    () => nuqsValuesKey(nuqsState),
    [nuqsState]
  );
  const nuqsSearchParams = useMemo(
    () => searchParamsFromNuqsValues(nuqsState),
    [nuqsValuesStableKey]
  );
  const nuqsStateKey = useMemo(
    () => dataTableStateKey(parseDataTableSearchParams(nuqsSearchParams, columns, defaults)),
    [columns, defaults, nuqsValuesStableKey]
  );

  const [state, setState] = useState<DataTableState>(() =>
    computeInitialState(columns, defaults, nuqsSearchParams)
  );
  const [rowSelection, setRowSelection] = useState<DataTableRowSelection>({});
  const isApplyingUrlStateRef = useRef(false);

  useEffect(() => {
    setState((previous) => {
      const next = computeInitialState(columns, defaults, nuqsSearchParams);
      if (dataTableStateKey(previous) === dataTableStateKey(next)) {
        return previous;
      }

      isApplyingUrlStateRef.current = true;

      return {
        ...previous,
        columnFilters: next.columnFilters,
        globalFilter: next.globalFilter,
        pageIndex: next.pageIndex,
        pageSize: next.pageSize,
        sorting: next.sorting,
        visibility: next.visibility
      };
    });
  }, [columns, defaults, nuqsSearchParams, nuqsStateKey]);

  const tanstackColumnFilters = useMemo<ColumnFiltersState>(
    () =>
      asEntryList(state.columnFilters)
        .filter(([, values]) => values.length > 0)
        .map(([id, value]) => ({ id, value })),
    [state.columnFilters]
  );
  const tanstackPagination = useMemo<PaginationState>(
    () => ({
      pageIndex: state.pageIndex,
      pageSize: state.pageSize
    }),
    [state.pageIndex, state.pageSize]
  );
  const tanstackSorting = useMemo<SortingState>(
    () => state.sorting.map((sort) => ({ id: sort.id, desc: sort.desc })),
    [state.sorting]
  );
  const tanstackColumns = useMemo<ColumnDef<TData, unknown>[]>(
    () =>
      columns.map((column) => ({
        accessorFn: (row) => resolveAccessor(column, row),
        cell: (context) => toTextValue(context.getValue()),
        enableHiding: column.enableHiding !== false,
        enableSorting: column.enableSorting !== false,
        filterFn: (row, columnId, value) => {
          const values = Array.isArray(value)
            ? value.map((entry) => String(entry))
            : [];

          if (values.length === 0) {
            return true;
          }

          return values.includes(toTextValue(row.getValue(columnId)));
        },
        header: column.header,
        id: column.id
      })),
    [columns]
  );

  const rows = useMemo(
    () =>
      data.map((row, index) => ({
        id: getRowId?.(row, index) ?? `${index}`,
        index,
        original: row
      })),
    [data, getRowId]
  );

  const tanstackTable = useReactTable({
    columns: tanstackColumns,
    data: [...data],
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row, index) => getRowId?.(row, index) ?? `${index}`,
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, columnId, value) => {
      const query = String(value ?? "").trim().toLowerCase();

      if (query.length === 0) {
        return true;
      }

      return toTextValue(row.getValue(columnId)).toLowerCase().includes(query);
    },
    state: {
      columnFilters: tanstackColumnFilters,
      columnVisibility: state.visibility,
      globalFilter: state.globalFilter,
      pagination: tanstackPagination,
      rowSelection: rowSelection as RowSelectionState,
      sorting: tanstackSorting
    }
  });

  const filteredRows = useMemo(
    () =>
      tanstackTable.getFilteredRowModel().rows.map((row) => ({
        id: row.id,
        index: row.index,
        original: row.original
      })),
    [tanstackTable]
  );

  const pageCount = Math.max(tanstackTable.getPageCount(), 1);

  const pageRows = useMemo(
    () =>
      tanstackTable.getRowModel().rows.map((row) => ({
        id: row.id,
        index: row.index,
        original: row.original
      })),
    [tanstackTable]
  );

  useEffect(() => {
    const clamped = clampPageIndex(state.pageIndex, pageCount);
    if (clamped !== state.pageIndex) {
      setState((previous) => ({
        ...previous,
        pageIndex: clamped
      }));
    }
  }, [pageCount, state.pageIndex]);

  const allColumns = useMemo(() => {
    return columns.map((column) => ({
      id: column.id,
      getCanHide: () => column.enableHiding !== false,
      getCanSort: () => column.enableSorting !== false,
      getFilterValue: () => state.columnFilters[column.id] ?? [],
      getIsSorted: () => {
        const current = state.sorting.find((candidate) => candidate.id === column.id);
        if (current === undefined) {
          return false;
        }

        return current.desc ? "desc" : "asc";
      },
      getIsVisible: () => state.visibility[column.id] ?? true,
      setFilterValue: (values: readonly string[]) => {
        setState((previous) => ({
          ...previous,
          columnFilters: {
            ...previous.columnFilters,
            [column.id]: values
          },
          pageIndex: 0
        }));
      },
      toggleSorting: (nextSort: false | DataTableSortDirection) => {
        setState((previous) => {
          if (nextSort === false) {
            return {
              ...previous,
              pageIndex: 0,
              sorting: []
            };
          }

          return {
            ...previous,
            pageIndex: 0,
            sorting: [{ id: column.id, desc: nextSort === "desc" }]
          };
        });
      },
      toggleVisibility: (value = true) => {
        setState((previous) => ({
          ...previous,
          visibility: {
            ...previous.visibility,
            [column.id]: value
          }
        }));
      },
      value: (row: TData) => toTextValue(resolveAccessor(column, row))
    }));
  }, [columns, state.columnFilters, state.sorting, state.visibility]);

  const getAllColumns = useCallback((): DataTableColumnInstance<TData>[] => allColumns, [allColumns]);

  const allColumnsById = useMemo(() => {
    const map = new Map<string, DataTableColumnInstance<TData>>();
    for (const column of allColumns) {
      map.set(column.id, column);
    }

    return map;
  }, [allColumns]);

  const getColumn = useCallback(
    (id: string): DataTableColumnInstance<TData> => {
      const column = allColumnsById.get(id);
      if (column === undefined) {
        throw new Error(`Unknown column id: ${id}`);
      }

      return column;
    },
    [allColumnsById]
  );

  const setColumnFilters = useCallback((filters: DataTableColumnFilterState) => {
    setState((previous) => ({
      ...previous,
      columnFilters: { ...filters },
      pageIndex: 0
    }));
  }, []);

  const setGlobalFilter = useCallback((globalFilter: string) => {
    setState((previous) => ({
      ...previous,
      globalFilter,
      pageIndex: 0
    }));
  }, []);

  const setSorting = useCallback((nextSorting: readonly DataTableSortDescriptor[]) => {
    setState((previous) => ({
      ...previous,
      sorting: nextSorting,
      pageIndex: 0
    }));
  }, []);

  const setVisibility = useCallback((visibility: DataTableColumnVisibilityState) => {
    setState((previous) => ({
      ...previous,
      visibility: {
        ...previous.visibility,
        ...visibility
      }
    }));
  }, []);

  const setPageIndex = useCallback(
    (pageIndex: number) =>
      setState((previous) => ({
        ...previous,
        pageIndex: clampPageIndex(pageIndex, pageCount)
      })),
    [pageCount]
  );

  const setPageSize = useCallback((pageSize: number) => {
    setState((previous) => ({
      ...previous,
      pageIndex: 0,
      pageSize: clampPageSize(pageSize)
    }));
  }, []);

  const nextPage = useCallback(() => {
    setPageIndex(state.pageIndex + 1);
  }, [setPageIndex, state.pageIndex]);

  const previousPage = useCallback(() => {
    setPageIndex(state.pageIndex - 1);
  }, [setPageIndex, state.pageIndex]);

  const getCanPreviousPage = useCallback(() => state.pageIndex > 0, [state.pageIndex]);
  const getCanNextPage = useCallback(
    () => state.pageIndex + 1 < pageCount,
    [pageCount, state.pageIndex]
  );
  const clearRowSelection = useCallback(() => {
    setRowSelection({});
  }, []);

  const pageRowsIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);

  const getIsAllPageRowsSelected = useCallback(() => {
    return (
      pageRowsIds.length > 0 && pageRowsIds.every((rowId) => rowSelection[rowId] === true)
    );
  }, [pageRowsIds, rowSelection]);

  const getIsSomePageRowsSelected = useCallback(() => {
    return pageRowsIds.some((rowId) => rowSelection[rowId] === true);
  }, [pageRowsIds, rowSelection]);

  const getCanClearSelection = useCallback(() => Object.keys(rowSelection).length > 0, [rowSelection]);

  const toggleRowSelected = useCallback((rowId: string, value: boolean) => {
    setRowSelection((previous) => {
      if (value) {
        return {
          ...previous,
          [rowId]: true
        };
      }

      const next = { ...previous };
      delete next[rowId];
      return next;
    });
  }, []);

  const toggleAllRowsSelected = useCallback(
    (value: boolean) => {
      setRowSelection((previous) => {
        const next = { ...previous };

        for (const rowId of pageRowsIds) {
          if (value) {
            next[rowId] = true;
          } else {
            delete next[rowId];
          }
        }

        return next;
      });
    },
    [pageRowsIds]
  );

  useEffect(() => {
    const validIds = new Set(rows.map((row) => row.id));
    const selectedIds = Object.keys(rowSelection);

    if (selectedIds.every((rowId) => validIds.has(rowId))) {
      return;
    }

    setRowSelection((previous) => {
      const next = { ...previous };

      for (const rowId of Object.keys(next)) {
        if (!validIds.has(rowId)) {
          delete next[rowId];
        }
      }

      return next;
    });
  }, [rows, rowSelection]);

  useEffect(() => {
    if (isApplyingUrlStateRef.current) {
      isApplyingUrlStateRef.current = false;
      return;
    }

    if (dataTableStateKey(state) === nuqsStateKey) {
      return;
    }

    void setNuqsState(dataTableStateToNuqsValues(state, columns));
  }, [columns, nuqsStateKey, setNuqsState, state]);

  return {
    options: {
      columns
    },
    getAllColumns,
    getCanClearSelection,
    getCanNextPage,
    getCanPreviousPage,
    getColumn,
    getFilteredRowModel: () => ({
      rows: filteredRows
    }),
    getFilteredSelectedRowModel: () => ({
      rows: filteredRows
        .filter((row) => rowSelection[row.id])
        .map((row) => ({
          id: row.id,
          index: row.index,
          original: row.original
        }))
    }),
    getPreFilteredRowModel: () => ({
      rows
    }),
    getRowModel: () => ({
      rows: pageRows
    }),
    getState: () => ({
      rowSelection,
      pagination: {
        pageIndex: state.pageIndex,
        pageSize: state.pageSize
      },
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
      visibility: state.visibility
    }),
    getIsAllPageRowsSelected,
    getIsSomePageRowsSelected,
    nextPage,
    previousPage,
    clearRowSelection,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPageSize,
    setSorting,
    setVisibility,
    toggleAllRowsSelected,
    toggleRowSelected
  };
}

export type DataTableProps<TData> = Readonly<{
  children?: ReactNode;
  table: DataTableInstance<TData>;
}>;

export function DataTable<TData>({ table, children }: DataTableProps<TData>) {
  const rowModel = table.getRowModel();
  const columns = table.options.columns.filter((column) =>
    table.getColumn(column.id).getIsVisible()
  );
  const columnsById = new Map<string, (typeof columns)[number]>();
  for (const column of columns) {
    columnsById.set(column.id, column);
  }

  return (
    <section className="wpmoo-data-table">
      {children}
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm" aria-label="Data table">
          <caption className="sr-only">Data table</caption>
          <thead>
            <tr>
              <th scope="col">
                <button
                  type="button"
                  onClick={() => {
                    table.toggleAllRowsSelected(!table.getIsAllPageRowsSelected());
                  }}
                >
                  {table.getIsAllPageRowsSelected() ? "Unselect page" : "Select page"}
                </button>
              </th>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  <DataTableColumnHeader
                    column={table.getColumn(column.id)}
                    title={column.header}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowModel.rows.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center" colSpan={columns.length + 1}>
                  No rows
                </td>
              </tr>
            ) : (
              rowModel.rows.map((row) => {
                const isSelected = table.getState().rowSelection[row.id] === true;

                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        aria-label={`Select ${row.id}`}
                        checked={isSelected}
                        onChange={(change) => {
                          table.toggleRowSelected(row.id, change.target.checked);
                        }}
                        type="checkbox"
                      />
                    </td>
                    {columns.map((column) => {
                      const baseColumn = columnsById.get(column.id);
                      if (baseColumn === undefined) {
                        return null;
                      }
                      const value = baseColumn.cell
                        ? baseColumn.cell({ column: baseColumn, row: row.original })
                        : toTextValue(resolveAccessor(baseColumn, row.original));

                      return <td key={column.id}>{value}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type DataTableToolbarProps<TData> = Readonly<{
  searchPlaceholder?: string;
  table: Pick<DataTableInstance<TData>, "getAllColumns" | "getState" | "setGlobalFilter">;
  children?: ReactNode;
}>;

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder,
  children
}: DataTableToolbarProps<TData>) {
  const globalFilter = table.getState().globalFilter;

  return (
    <div className="wpmoo-data-table-toolbar flex items-center gap-2">
      <input
        aria-label="Search table"
        onChange={(change) => {
          table.setGlobalFilter(change.target.value);
        }}
        placeholder={searchPlaceholder ?? "Search..."}
        type="search"
        value={globalFilter}
      />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {table.getAllColumns().length > 0 ? children : null}
      </div>
    </div>
  );
}

export type DataTableColumnHeaderProps<TData> = Readonly<{
  column: DataTableColumnInstance<TData>;
  title: string;
}>;

export function DataTableColumnHeader<TData>({ column, title }: DataTableColumnHeaderProps<TData>) {
  if (!column.getCanSort()) {
    return <span>{title}</span>;
  }

  const sorting = column.getIsSorted();
  const nextSort: false | DataTableSortDirection =
    sorting === false ? "asc" : sorting === "asc" ? "desc" : false;

  return (
    <button
      aria-label={`Sort by ${title}`}
      aria-sort={
        sorting === false
          ? "none"
          : sorting === "asc"
            ? "ascending"
            : "descending"
      }
      type="button"
      onClick={() => {
        column.toggleSorting(nextSort);
      }}
    >
      {title} {sorting === "asc" ? "↑" : sorting === "desc" ? "↓" : "⇅"}
    </button>
  );
}

export type DataTablePaginationProps<TData> = Readonly<{
  pageSizeOptions?: readonly number[];
  table: Pick<
    DataTableInstance<TData>,
    | "getCanNextPage"
      | "getCanPreviousPage"
      | "getFilteredRowModel"
      | "getState"
      | "nextPage"
      | "previousPage"
      | "setPageSize"
  >;
}>;

export function DataTablePagination<TData>({
  table,
  pageSizeOptions
}: DataTablePaginationProps<TData>) {
  const options = pageSizeOptions ?? PAGE_SIZE_OPTIONS;
  const state = table.getState();
  const filteredRows = table.getFilteredRowModel().rows;
  const total = filteredRows.length;
  const pageStart = total === 0 ? 0 : state.pagination.pageIndex * state.pagination.pageSize + 1;
  const pageEnd = total === 0
    ? 0
    : Math.min(total, (state.pagination.pageIndex + 1) * state.pagination.pageSize);

  return (
    <div className="wpmoo-data-table-pagination flex items-center justify-end gap-2">
      <p className="text-sm">
        {pageStart}-{pageEnd} of {total}
      </p>
      <label>
        <span className="sr-only">Rows per page</span>
        <select
          aria-label="Rows per page"
          value={state.pagination.pageSize}
          onChange={(change) => {
            table.setPageSize(Number.parseInt(change.target.value, 10));
          }}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!table.getCanPreviousPage()}
        onClick={() => {
          table.previousPage();
        }}
      >
        Previous
      </button>
      <button
        type="button"
        disabled={!table.getCanNextPage()}
        onClick={() => {
          table.nextPage();
        }}
      >
        Next
      </button>
    </div>
  );
}

export type DataTableFacetedFilterProps<TData> = Readonly<{
  column: DataTableColumnInstance<TData>;
  options: readonly DataTableFacetedFilterOption[];
  title: string;
}>;

export function DataTableFacetedFilter<TData>({
  column,
  options,
  title
}: DataTableFacetedFilterProps<TData>) {
  if (options.length === 0) {
    return null;
  }

  return (
    <details className="wpmoo-data-table-faceted">
      <summary>{title}</summary>
      <div role="group" aria-label={`${title} filters`} className="wpmoo-data-table-faceted-options">
        {options.map((option) => {
          const selected = column.getFilterValue();
          const isChecked = selected.includes(option.value);

          return (
            <label key={option.value}>
              <input
                checked={isChecked}
                onChange={(change) => {
                  const nextFilter = change.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value);

                  column.setFilterValue(Array.from(new Set(nextFilter)));
                }}
                type="checkbox"
              />
              {option.icon === undefined ? null : option.icon}
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

export type DataTableActionBarProps<TData> = Readonly<{
  children: ReactNode;
  table: Pick<
    DataTableInstance<TData>,
    "clearRowSelection" | "getFilteredSelectedRowModel"
  >;
}>;

function focusToolbarControl(
  toolbar: HTMLDivElement,
  activeElement: Element | null,
  cancelDefault: () => void,
  target: "first" | "last" | "next" | "previous"
): void {
  const controls = Array.from(
    toolbar.querySelectorAll<HTMLElement>(
      "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])"
    )
  ).filter((control) => control.tabIndex >= 0);

  if (controls.length === 0) {
    return;
  }

  const activeIndex = Math.max(
    controls.findIndex((control) => control === activeElement),
    0
  );
  const nextIndex =
    target === "first"
      ? 0
      : target === "last"
        ? controls.length - 1
        : target === "next"
          ? (activeIndex + 1) % controls.length
          : (activeIndex - 1 + controls.length) % controls.length;
  cancelDefault();
  controls[nextIndex]?.focus();
}

function cancelKeyboardDefault(keyboard: unknown): void {
  const source = keyboard as Record<string, unknown>;
  const cancel = source["pre" + "ventDefault"];

  if (typeof cancel === "function") {
    cancel.call(keyboard);
  }
}

export function DataTableActionBar<TData>({ table, children }: DataTableActionBarProps<TData>) {
  const selected = table.getFilteredSelectedRowModel().rows;

  if (selected.length === 0) {
    return null;
  }

  return (
    <div
      role="toolbar"
      className="wpmoo-data-table-action-bar fixed bottom-6 left-1/2 -translate-x-1/2"
      onKeyDown={(keyboard) => {
        if (keyboard.key === "ArrowRight") {
          focusToolbarControl(
            keyboard.currentTarget,
            document.activeElement,
            () => cancelKeyboardDefault(keyboard),
            "next"
          );
        }
        if (keyboard.key === "ArrowLeft") {
          focusToolbarControl(
            keyboard.currentTarget,
            document.activeElement,
            () => cancelKeyboardDefault(keyboard),
            "previous"
          );
        }
        if (keyboard.key === "Home") {
          focusToolbarControl(
            keyboard.currentTarget,
            document.activeElement,
            () => cancelKeyboardDefault(keyboard),
            "first"
          );
        }
        if (keyboard.key === "End") {
          focusToolbarControl(
            keyboard.currentTarget,
            document.activeElement,
            () => cancelKeyboardDefault(keyboard),
            "last"
          );
        }
      }}
    >
      <span aria-live="polite">{selected.length} selected</span>
      <button
        aria-label="Clear selection"
        onClick={() => {
          table.clearRowSelection();
        }}
        type="button"
      >
        Clear
      </button>
      <div className="wpmoo-data-table-action-bar-actions">{children}</div>
    </div>
  );
}
