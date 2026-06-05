import { beforeEach, describe, expect, it } from "vitest";
import {
  DATA_TABLE_URL_KEYS,
  parseDataTableSearchParams,
  readDataTableSearchParams,
  serializeDataTableSearchParams,
  shouldSyncDataTableSearchParams,
  updateDataTableSearchParams
} from "../src/data-table/url-state";

const columns = [{ id: "name" }, { id: "status" }] as const;

type BrowserWindowLike = {
  location: { href: string; pathname: string; search: string };
  history: {
    replaceState: (state: unknown, title: string, url: string) => void;
  };
};

function setWindowSearch(search: string): void {
  const baseUrl = "https://example.test";
  const base = new URL(search, baseUrl);
  const windowLike: BrowserWindowLike = {
    location: {
      href: base.toString(),
      pathname: base.pathname,
      search: base.search
    },
    history: {
      replaceState: (_state, _title, nextUrl) => {
        const updated = new URL(nextUrl, baseUrl);
        windowLike.location = {
          href: updated.toString(),
          pathname: updated.pathname,
          search: updated.search
        };
      }
    }
  };

  (globalThis as { window?: BrowserWindowLike }).window = windowLike;
}

beforeEach(() => {
  delete (globalThis as { window?: BrowserWindowLike }).window;
});

describe("Data table URL state", () => {
  const defaults = {
    defaultGlobalFilter: "",
    defaultPageIndex: 0,
    defaultPageSize: 10,
    defaultSorting: []
  } as const;

  beforeEach(() => {
    setWindowSearch("/");
  });

  it("parses valid query values into table state", () => {
    const params = new URLSearchParams({
      [DATA_TABLE_URL_KEYS.globalFilter]: "alice",
      [DATA_TABLE_URL_KEYS.pageIndex]: "3",
      [DATA_TABLE_URL_KEYS.pageSize]: "25",
      [DATA_TABLE_URL_KEYS.sort]: "status",
      [DATA_TABLE_URL_KEYS.sortDirection]: "desc",
      [`${DATA_TABLE_URL_KEYS.columnFilterPrefix}status`]: "active,invited",
      [`${DATA_TABLE_URL_KEYS.visibilityPrefix}name`]: "1"
    });

    const state = parseDataTableSearchParams(params, columns, defaults);

    expect(state.globalFilter).toBe("alice");
    expect(state.pageIndex).toBe(2);
    expect(state.pageSize).toBe(25);
    expect(state.sorting).toEqual([{ id: "status", desc: true }]);
    expect(state.columnFilters.status).toEqual(["active", "invited"]);
    expect(state.visibility.name).toBe(false);
    expect(state.visibility.status).toBe(true);
  });

  it("clamps page size and normalizes sort direction", () => {
    const params = new URLSearchParams({
      [DATA_TABLE_URL_KEYS.pageSize]: "250",
      [DATA_TABLE_URL_KEYS.sort]: "name",
      [DATA_TABLE_URL_KEYS.sortDirection]: "up"
    });

    const state = parseDataTableSearchParams(params, columns, defaults);

    expect(state.pageSize).toBe(100);
    expect(state.sorting).toEqual([{ id: "name", desc: false }]);
  });

  it("ignores unknown sort fields", () => {
    const params = new URLSearchParams({
      [DATA_TABLE_URL_KEYS.sort]: "does-not-exist"
    });

    const state = parseDataTableSearchParams(params, columns, defaults);

    expect(state.sorting).toEqual(defaults.defaultSorting);
  });

  it("ignores unsupported query keys and clamps to defaults", () => {
    const params = new URLSearchParams({
      unknown: "x",
      [`${DATA_TABLE_URL_KEYS.columnFilterPrefix}missing`]: "value",
      [`${DATA_TABLE_URL_KEYS.visibilityPrefix}missing`]: "1"
    });
    const state = parseDataTableSearchParams(params, columns, defaults);

    expect(state.globalFilter).toBe("");
    expect(state.pageIndex).toBe(0);
    expect(state.pageSize).toBe(10);
    expect(state.sorting).toEqual([]);
    expect(state.columnFilters).toEqual({});
    expect(state.visibility).toEqual({ name: true, status: true });
  });

  it("serializes non-default state without adding unrelated keys", () => {
    const state = {
      globalFilter: "alice",
      pageIndex: 0,
      pageSize: 25,
      sorting: [{ id: "name", desc: false }],
      columnFilters: { status: ["active"] } as const,
      visibility: { name: false, status: true }
    };

    const params = serializeDataTableSearchParams(state);
    const entries = [...params.entries()];

    expect(entries).toEqual([
      [DATA_TABLE_URL_KEYS.globalFilter, "alice"],
      [DATA_TABLE_URL_KEYS.pageSize, "25"],
      [DATA_TABLE_URL_KEYS.sort, "name"],
      [DATA_TABLE_URL_KEYS.sortDirection, "asc"],
      [`${DATA_TABLE_URL_KEYS.columnFilterPrefix}status`, "active"],
      [`${DATA_TABLE_URL_KEYS.visibilityPrefix}name`, "1"]
    ]);
  });

  it("reads the current window search params through URLSearchParams", () => {
    setWindowSearch("/?a=1&b=2");
    const params = readDataTableSearchParams();

    expect(params.get("a")).toBe("1");
    expect(params.get("b")).toBe("2");
    expect(params.get(DATA_TABLE_URL_KEYS.globalFilter)).toBeNull();
  });

  it("updates URL params while preserving unknown query parameters", () => {
    setWindowSearch("/?foo=bar&page=2&other=keep");

    updateDataTableSearchParams({
      globalFilter: "",
      pageIndex: 1,
      pageSize: 10,
      sorting: [],
      columnFilters: {},
      visibility: {}
    });

    const windowLike = (globalThis as { window?: BrowserWindowLike }).window;
    expect(windowLike?.location.search).toBe("?foo=bar&other=keep&page=2");
  });

  it("detects when table state needs syncing", () => {
    setWindowSearch("/?foo=bar");
    expect(
      shouldSyncDataTableSearchParams({
        globalFilter: "",
        pageIndex: 0,
        pageSize: 10,
        sorting: [],
        columnFilters: {},
        visibility: {}
      })
    ).toBe(false);

    setWindowSearch("/?q=alice");
    expect(
      shouldSyncDataTableSearchParams({
        globalFilter: "",
        pageIndex: 0,
        pageSize: 10,
        sorting: [],
        columnFilters: {},
        visibility: {}
      })
    ).toBe(true);
  });
});
