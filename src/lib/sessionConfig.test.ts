import { afterEach, describe, expect, it } from "vitest";
import {
  emptySessionConfig,
  MAX_RECENT_VAULTS,
  migrateSessionRaw,
  normalizeSessionConfig,
  pushRecentVault,
  readSessionConfigFromLocalStorage,
  removeRecentVault,
  SESSION_CONFIG_LS_KEY,
  writeSessionConfigToLocalStorage,
} from "./sessionConfig";

const mem = new Map<string, string>();

function installLocalStorageMock() {
  mem.clear();
  const ls = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: ls,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  mem.clear();
});

describe("emptySessionConfig", () => {
  it("returns version 1 empty", () => {
    const c = emptySessionConfig();
    expect(c.version).toBe(1);
    expect(c.lastVault).toBeNull();
    expect(c.recentVaults).toEqual([]);
  });
});

describe("migrateSessionRaw", () => {
  it("legacy { lastVault } → version 1 + recentVaults seeded", () => {
    const c = migrateSessionRaw({ lastVault: "E:\\vaults\\a" });
    expect(c.version).toBe(1);
    expect(c.lastVault).toBe("E:\\vaults\\a");
    expect(c.recentVaults).toEqual(["E:\\vaults\\a"]);
  });

  it("legacy null lastVault → empty recents", () => {
    const c = migrateSessionRaw({ lastVault: null });
    expect(c.lastVault).toBeNull();
    expect(c.recentVaults).toEqual([]);
  });

  it("missing / invalid → empty", () => {
    expect(migrateSessionRaw(null)).toEqual(emptySessionConfig());
    expect(migrateSessionRaw(undefined)).toEqual(emptySessionConfig());
    expect(migrateSessionRaw("x")).toEqual(emptySessionConfig());
  });

  it("v1 with recentVaults preserves order and caps", () => {
    const paths = Array.from({ length: 12 }, (_, i) => `P:\\v${i}`);
    const c = migrateSessionRaw({
      version: 1,
      lastVault: "P:\\v0",
      recentVaults: paths,
    });
    expect(c.recentVaults).toHaveLength(MAX_RECENT_VAULTS);
    expect(c.recentVaults[0]).toBe("P:\\v0");
    expect(c.recentVaults[7]).toBe("P:\\v7");
  });

  it("empty object → empty config", () => {
    expect(migrateSessionRaw({})).toEqual(emptySessionConfig());
  });
});

describe("normalizeSessionConfig", () => {
  it("trims lastVault and drops empty", () => {
    expect(normalizeSessionConfig({ lastVault: "  " }).lastVault).toBeNull();
    expect(
      normalizeSessionConfig({ lastVault: "  E:\\a  " }).lastVault,
    ).toBe("E:\\a");
  });

  it("dedupes recents keeping first", () => {
    const c = normalizeSessionConfig({
      recentVaults: ["A", "B", "A", "  B  ", ""],
    });
    expect(c.recentVaults).toEqual(["A", "B"]);
  });
});

describe("pushRecentVault", () => {
  it("newest first, dedupe, cap 8", () => {
    let c = emptySessionConfig();
    for (let i = 0; i < 10; i++) {
      c = pushRecentVault(c, `V:\\${i}`);
    }
    expect(c.recentVaults).toHaveLength(8);
    expect(c.recentVaults[0]).toBe("V:\\9");
    expect(c.recentVaults[7]).toBe("V:\\2");
    // lastVault unchanged by push alone
    expect(c.lastVault).toBeNull();
  });

  it("moves existing path to front", () => {
    let c = normalizeSessionConfig({
      recentVaults: ["A", "B", "C"],
    });
    c = pushRecentVault(c, "B");
    expect(c.recentVaults).toEqual(["B", "A", "C"]);
  });

  it("ignores blank path", () => {
    const base = normalizeSessionConfig({ recentVaults: ["A"] });
    expect(pushRecentVault(base, "  ")).toEqual(base);
  });
});

describe("removeRecentVault", () => {
  it("removes from recents only when not last", () => {
    const c = removeRecentVault(
      normalizeSessionConfig({
        lastVault: "A",
        recentVaults: ["A", "B", "C"],
      }),
      "B",
    );
    expect(c.recentVaults).toEqual(["A", "C"]);
    expect(c.lastVault).toBe("A");
  });

  it("clears lastVault when removed path matches last", () => {
    const c = removeRecentVault(
      normalizeSessionConfig({
        lastVault: "A",
        recentVaults: ["A", "B"],
      }),
      "A",
    );
    expect(c.lastVault).toBeNull();
    expect(c.recentVaults).toEqual(["B"]);
  });

  it("set last null does not wipe recents (via normalize leave)", () => {
    const c = normalizeSessionConfig({
      lastVault: null,
      recentVaults: ["A", "B"],
    });
    expect(c.lastVault).toBeNull();
    expect(c.recentVaults).toEqual(["A", "B"]);
  });
});

describe("localStorage session helpers", () => {
  it("roundtrips normalized config", () => {
    installLocalStorageMock();
    const cfg = normalizeSessionConfig({
      lastVault: "E:\\vault",
      recentVaults: ["E:\\vault", "D:\\other"],
    });
    writeSessionConfigToLocalStorage(cfg);
    expect(mem.get(SESSION_CONFIG_LS_KEY)).toContain("recentVaults");
    expect(readSessionConfigFromLocalStorage()).toEqual(cfg);
  });

  it("migrates legacy LS payload on read", () => {
    installLocalStorageMock();
    mem.set(SESSION_CONFIG_LS_KEY, JSON.stringify({ lastVault: "X:\\old" }));
    const c = readSessionConfigFromLocalStorage();
    expect(c.version).toBe(1);
    expect(c.lastVault).toBe("X:\\old");
    expect(c.recentVaults).toEqual(["X:\\old"]);
  });
});
