import { useCallback, useState } from "react";
import {
  applyAppearanceToDocument,
  readAppearance,
  writeAppearance,
  type AppearanceFont,
  type AppearanceFontSize,
  type AppearancePrefs,
  type AppearanceTheme,
} from "../../../lib/appearance";

/** Static swatch hex for theme picker (independent of live CSS vars). */
const THEME_OPTIONS: {
  id: AppearanceTheme;
  label: string;
  bg: string;
  accent: string;
  ink: string;
}[] = [
  {
    id: "paper",
    label: "宣纸",
    bg: "#f3ebe0",
    accent: "#8b5e34",
    ink: "#2a241c",
  },
  {
    id: "matcha",
    label: "抹茶",
    bg: "#e8efe4",
    accent: "#5a7a48",
    ink: "#243028",
  },
  {
    id: "celadon",
    label: "青瓷",
    bg: "#e6eeec",
    accent: "#4a8a7c",
    ink: "#1e2a2c",
  },
  {
    id: "ink",
    label: "墨夜",
    bg: "#1c1916",
    accent: "#c4a06a",
    ink: "#f0e6d8",
  },
  {
    id: "cinnabar",
    label: "丹砂",
    bg: "#f4eae4",
    accent: "#b54535",
    ink: "#2c221c",
  },
];

const FONT_OPTIONS: {
  id: AppearanceFont;
  label: string;
  stack: string;
}[] = [
  {
    id: "system",
    label: "系统默认",
    stack:
      'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: "song",
    label: "宋体书卷",
    stack:
      '"SimSun", "NSimSun", "Songti SC", "Noto Serif CJK SC", serif, system-ui, sans-serif',
  },
  {
    id: "hei",
    label: "黑体清晰",
    stack:
      '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
  },
  {
    id: "kai",
    label: "楷体手札",
    stack:
      '"KaiTi", "STKaiti", "Kaiti SC", serif, system-ui, "Microsoft YaHei", sans-serif',
  },
  {
    id: "mono",
    label: "等宽",
    stack:
      '"Cascadia Code", "Sarasa Mono SC", "Consolas", "Courier New", monospace',
  },
];

const SIZE_OPTIONS: { id: AppearanceFontSize; label: string; px: string }[] = [
  { id: "sm", label: "小", px: "14" },
  { id: "md", label: "中", px: "15" },
  { id: "lg", label: "大", px: "16" },
  { id: "xl", label: "特大", px: "18" },
];

const PREVIEW_SAMPLE = "永 Soit";

/**
 * Settings · 外观 — theme / font / fontSize.
 * Instant apply + localStorage via lib/appearance (not universe.db).
 */
export default function AppearanceSection() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => readAppearance());

  const commit = useCallback((next: AppearancePrefs) => {
    setPrefs(next);
    applyAppearanceToDocument(next);
    writeAppearance(next);
  }, []);

  const setTheme = (theme: AppearanceTheme) => {
    if (theme === prefs.theme) return;
    commit({ ...prefs, theme });
  };

  const setFont = (font: AppearanceFont) => {
    if (font === prefs.font) return;
    commit({ ...prefs, font });
  };

  const setFontSize = (fontSize: AppearanceFontSize) => {
    if (fontSize === prefs.fontSize) return;
    commit({ ...prefs, fontSize });
  };

  return (
    <section className="settings-appearance" aria-label="外观">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">外观</h3>
        <p className="settings-section-desc">
          主题、字体与字号保存在本机，不写入 vault。默认宣纸 · 系统 · 中。
        </p>
      </header>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">主题</p>
        </div>
        <div className="settings-card-body">
          <div
            className="appearance-theme-grid"
            role="radiogroup"
            aria-label="主题"
          >
            {THEME_OPTIONS.map((t) => {
              const on = prefs.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`appearance-theme-swatch${on ? " on" : ""}`}
                  data-theme-id={t.id}
                  onClick={() => setTheme(t.id)}
                >
                  <span
                    className="appearance-theme-chip"
                    style={{
                      background: `linear-gradient(135deg, ${t.bg} 55%, ${t.accent} 55%)`,
                      borderColor: t.ink,
                    }}
                    aria-hidden
                  />
                  <span className="appearance-theme-label">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">字体</p>
        </div>
        <div className="settings-card-body">
          <div
            className="appearance-font-grid"
            role="radiogroup"
            aria-label="字体"
          >
            {FONT_OPTIONS.map((f) => {
              const on = prefs.font === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`appearance-font-btn${on ? " on" : ""}`}
                  data-font-id={f.id}
                  onClick={() => setFont(f.id)}
                >
                  <span
                    className="appearance-font-preview"
                    style={{ fontFamily: f.stack }}
                  >
                    {PREVIEW_SAMPLE}
                  </span>
                  <span className="appearance-font-label">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">字号</p>
        </div>
        <div className="settings-card-body">
          <div
            className="appearance-size-row"
            role="radiogroup"
            aria-label="字号"
          >
            {SIZE_OPTIONS.map((s) => {
              const on = prefs.fontSize === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`appearance-size-btn${on ? " on" : ""}`}
                  data-size-id={s.id}
                  onClick={() => setFontSize(s.id)}
                >
                  <span className="appearance-size-id">{s.id}</span>
                  <span className="appearance-size-meta">
                    {s.label} · {s.px}px
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="settings-hint">
        切换立即生效并写入本机偏好。探究正文与设置正文跟随字号；无 CDN
        字体，仅用系统已安装字族。
      </p>
    </section>
  );
}
