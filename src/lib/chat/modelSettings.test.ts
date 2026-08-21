import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_CONFIG,
  type ChatConfig,
  CHAT_CONFIG_LS_KEY,
} from "./config";
import {
  activeModelLabel,
  emptyModelSettings,
  explainModelLabel,
  migrateChatConfigToSettings,
  MODEL_SETTINGS_LS_KEY,
  normalizeModelSettings,
  readModelSettingsFromLocalStorage,
  resolveChatConfig,
  resolveExplainConfig,
  upsertFromChatConfig,
  writeModelSettingsToLocalStorage,
  type ModelSettings,
} from "./modelSettings";

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

describe("emptyModelSettings", () => {
  it("returns version 1 empty catalog", () => {
    const s = emptyModelSettings();
    expect(s.version).toBe(1);
    expect(s.providers).toEqual([]);
    expect(s.models).toEqual([]);
    expect(s.activeModelId).toBeNull();
    expect(s.explainModelId).toBeNull();
  });
});

describe("migrateChatConfigToSettings", () => {
  it("empty key → empty settings", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "",
    });
    expect(s.providers).toHaveLength(0);
    expect(s.models).toHaveLength(0);
    expect(s.activeModelId).toBeNull();
  });

  it("non-empty key → 1 provider + 1 model + active", () => {
    const cfg: ChatConfig = {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "sk-test",
    };
    const s = migrateChatConfigToSettings(cfg);
    expect(s.providers).toHaveLength(1);
    expect(s.models).toHaveLength(1);
    expect(s.activeModelId).toBe(s.models[0]!.id);
    expect(s.providers[0]!.apiKey).toBe("sk-test");
    expect(s.providers[0]!.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(s.providers[0]!.name).toMatch(/Deepseek/i);
    expect(s.models[0]!.modelId).toBe("deepseek-chat");
    expect(s.models[0]!.providerId).toBe(s.providers[0]!.id);
    expect(s.models[0]!.enabled).toBe(true);
  });
});

describe("resolveChatConfig", () => {
  it("no active → empty key mock path", () => {
    const cfg = resolveChatConfig(emptyModelSettings());
    expect(cfg.apiKey).toBe("");
    expect(cfg.baseUrl).toBe(DEFAULT_CHAT_CONFIG.baseUrl);
  });

  it("active model resolves provider credentials", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "local-key",
    });
    const cfg = resolveChatConfig(s);
    expect(cfg.baseUrl).toBe("http://localhost:11434/v1");
    expect(cfg.model).toBe("llama3");
    expect(cfg.apiKey).toBe("local-key");
  });

  it("delete-active (null) → mock", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk",
    });
    const cleared: ModelSettings = { ...s, activeModelId: null };
    expect(resolveChatConfig(cleared).apiKey).toBe("");
  });

  it("disabled active entry → mock", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk",
    });
    const disabled: ModelSettings = {
      ...s,
      models: s.models.map((m) => ({ ...m, enabled: false })),
    };
    // normalize clears invalid active
    const cfg = resolveChatConfig(disabled);
    expect(cfg.apiKey).toBe("");
  });
});

describe("normalizeModelSettings", () => {
  it("passes version 1 through and drops orphan models", () => {
    const raw = {
      version: 1,
      providers: [
        {
          id: "p1",
          name: "P",
          baseUrl: "https://x.com/v1",
          apiKey: "k",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      models: [
        {
          id: "m1",
          providerId: "p1",
          modelId: "m",
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "m2",
          providerId: "missing",
          modelId: "x",
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeModelId: "m1",
    };
    const s = normalizeModelSettings(raw);
    expect(s.models).toHaveLength(1);
    expect(s.activeModelId).toBe("m1");
  });

  it("migrates flat ChatConfig shape", () => {
    const s = normalizeModelSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "sk-abc",
    });
    expect(s.version).toBe(1);
    expect(s.providers).toHaveLength(1);
    expect(s.activeModelId).toBeTruthy();
  });

  it("null/garbage → empty", () => {
    expect(normalizeModelSettings(null).providers).toHaveLength(0);
    expect(normalizeModelSettings("nope").providers).toHaveLength(0);
  });
});

describe("localStorage roundtrip", () => {
  it("writes settings and projected chat config", () => {
    installLocalStorageMock();
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "sk-ls",
    });
    writeModelSettingsToLocalStorage(s);
    expect(mem.has(MODEL_SETTINGS_LS_KEY)).toBe(true);
    expect(mem.has(CHAT_CONFIG_LS_KEY)).toBe(true);
    const back = readModelSettingsFromLocalStorage();
    expect(back.providers[0]!.apiKey).toBe("sk-ls");
    expect(resolveChatConfig(back).apiKey).toBe("sk-ls");
  });

  it("migrates legacy soit-chat-config on read", () => {
    installLocalStorageMock();
    mem.set(
      CHAT_CONFIG_LS_KEY,
      JSON.stringify({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: "legacy-key",
      }),
    );
    const s = readModelSettingsFromLocalStorage();
    expect(s.providers).toHaveLength(1);
    expect(s.providers[0]!.apiKey).toBe("legacy-key");
    expect(mem.has(MODEL_SETTINGS_LS_KEY)).toBe(true);
  });
});

describe("upsertFromChatConfig", () => {
  it("empty key clears active without wiping catalog", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk",
    });
    const next = upsertFromChatConfig(s, {
      baseUrl: s.providers[0]!.baseUrl,
      model: "gpt-4o",
      apiKey: "",
    });
    expect(next.providers).toHaveLength(1);
    expect(next.activeModelId).toBeNull();
  });

  it("updates existing provider key/model", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "old",
    });
    const next = upsertFromChatConfig(s, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "new",
    });
    expect(next.providers[0]!.apiKey).toBe("new");
    expect(next.models.some((m) => m.modelId === "gpt-4o")).toBe(true);
    expect(next.activeModelId).toBeTruthy();
  });
});

describe("activeModelLabel", () => {
  it("returns label or modelId", () => {
    const s = migrateChatConfigToSettings({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "sk",
    });
    expect(activeModelLabel(s)).toBe("gpt-4o-mini");
    const labeled: ModelSettings = {
      ...s,
      models: s.models.map((m) => ({ ...m, label: "快" })),
    };
    expect(activeModelLabel(labeled)).toBe("快");
    expect(activeModelLabel(emptyModelSettings())).toBeNull();
  });
});

function twoSlotSettings(explainKey = "sk-explain"): ModelSettings {
  return normalizeModelSettings({
    version: 1,
    providers: [
      {
        id: "p-chat",
        name: "ChatProv",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-chat",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "p-explain",
        name: "ExplainProv",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: explainKey,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    models: [
      {
        id: "m-chat",
        providerId: "p-chat",
        modelId: "gpt-4o",
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "m-explain",
        providerId: "p-explain",
        modelId: "deepseek-chat",
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    activeModelId: "m-chat",
    explainModelId: "m-explain",
  });
}

describe("explainModelId / resolveExplainConfig", () => {
  it("legacy JSON without key → null slot; chat resolve unchanged", () => {
    const raw = {
      version: 1,
      providers: [
        {
          id: "p1",
          name: "P",
          baseUrl: "https://x.com/v1",
          apiKey: "k",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      models: [
        {
          id: "m1",
          providerId: "p1",
          modelId: "m",
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeModelId: "m1",
    };
    const s = normalizeModelSettings(raw);
    expect(s.explainModelId).toBeNull();
    expect(resolveChatConfig(s)).toEqual({
      baseUrl: "https://x.com/v1",
      model: "m",
      apiKey: "k",
    });
    expect(resolveExplainConfig(s)).toEqual(resolveChatConfig(s));
    expect(explainModelLabel(s)).toBeNull();
  });

  it("independent slot with key → API modelId, not catalog id", () => {
    const s = twoSlotSettings();
    expect(s.explainModelId).toBe("m-explain");
    const cfg = resolveExplainConfig(s);
    expect(cfg.model).toBe("deepseek-chat");
    expect(cfg.model).not.toBe(s.explainModelId);
    expect(cfg.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(cfg.apiKey).toBe("sk-explain");
    expect(cfg).not.toEqual(resolveChatConfig(s));
    expect(explainModelLabel(s)).toBe("deepseek-chat");
  });

  it("null / disabled / deleted slot follows chat", () => {
    const base = twoSlotSettings();

    const followNull: ModelSettings = { ...base, explainModelId: null };
    expect(resolveExplainConfig(followNull)).toEqual(resolveChatConfig(followNull));

    const disabled: ModelSettings = {
      ...base,
      models: base.models.map((m) =>
        m.id === "m-explain" ? { ...m, enabled: false } : m,
      ),
    };
    expect(normalizeModelSettings(disabled).explainModelId).toBeNull();
    expect(resolveExplainConfig(disabled)).toEqual(resolveChatConfig(disabled));

    const deleted: ModelSettings = {
      ...base,
      models: base.models.filter((m) => m.id !== "m-explain"),
    };
    expect(normalizeModelSettings(deleted).explainModelId).toBeNull();
    expect(resolveExplainConfig(deleted)).toEqual(resolveChatConfig(deleted));
  });

  it("empty explain key follows chat; slot id is kept", () => {
    const s = twoSlotSettings("");
    expect(s.explainModelId).toBe("m-explain");
    const chat = resolveChatConfig(s);
    const explain = resolveExplainConfig(s);
    expect(explain.model).toBe(chat.model);
    expect(explain.apiKey).toBe(chat.apiKey);
    expect(explain).toEqual(chat);
    expect(chat.apiKey).toBe("sk-chat");
  });

  it("upsertFromChatConfig keeps explainModelId after key change", () => {
    const s = twoSlotSettings();
    expect(s.explainModelId).toBe("m-explain");
    const next = upsertFromChatConfig(s, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk-new",
    });
    expect(next.explainModelId).toBe("m-explain");
    expect(next.providers.find((p) => p.id === "p-chat")!.apiKey).toBe("sk-new");
  });

  it("emptyModelSettings().explainModelId === null", () => {
    expect(emptyModelSettings().explainModelId).toBeNull();
  });
});
