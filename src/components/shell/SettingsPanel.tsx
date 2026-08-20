import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import AboutSection from "./settings/AboutSection";
import AppearanceSection from "./settings/AppearanceSection";
import "./settings/settings.css";

export type SettingsSection =
  | "space"
  | "appearance"
  | "model"
  | "runtime"
  | "skills"
  | "about";

type Props = {
  open: boolean;
  onClose: () => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
};

const NAV: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "space", label: "空间", hint: "本库 · Obsidian" },
  { id: "appearance", label: "外观", hint: "主题 · 字体" },
  { id: "model", label: "模型", hint: "BYOK 密钥" },
  { id: "runtime", label: "运行时", hint: "本机 Agent" },
  { id: "skills", label: "技能", hint: "本库启停" },
  { id: "about", label: "关于", hint: "记忆边界" },
];

/** Optional section modules — empty until S2/S3/S4 land the files. */
const spaceGlob = import.meta.glob("./settings/SpaceSection.tsx");
const modelGlob = import.meta.glob("./settings/ModelSettingsForm.tsx");
const runtimeGlob = import.meta.glob("./settings/RuntimeSection.tsx");
const skillsGlob = import.meta.glob("./settings/SkillsList.tsx");

type SectionComp = ComponentType<Record<string, unknown>>;

function firstLoader(
  glob: Record<string, () => Promise<unknown>>,
): (() => Promise<{ default: SectionComp }>) | null {
  const key = Object.keys(glob)[0];
  if (!key) return null;
  const load = glob[key]!;
  return () =>
    load().then((mod) => {
      const m = mod as { default?: SectionComp };
      if (m.default) return { default: m.default };
      throw new Error("section module missing default export");
    });
}

const lazySpace = (() => {
  const load = firstLoader(spaceGlob);
  return load ? lazy(load) : null;
})();
const lazyModel = (() => {
  const load = firstLoader(modelGlob);
  return load ? lazy(load) : null;
})();
const lazyRuntime = (() => {
  const load = firstLoader(runtimeGlob);
  return load ? lazy(load) : null;
})();
const lazySkills = (() => {
  const load = firstLoader(skillsGlob);
  return load ? lazy(load) : null;
})();

function Placeholder({ section }: { section: SettingsSection }) {
  return (
    <div data-settings-slot={section} className="settings-placeholder">
      即将接入
    </div>
  );
}

function OptionalSection({
  section,
  Comp,
  onNeedVault,
}: {
  section: SettingsSection;
  Comp: LazyExoticComponent<ComponentType<Record<string, unknown>>> | null;
  onNeedVault?: () => void;
}) {
  if (!Comp) return <Placeholder section={section} />;
  const extra =
    section === "skills" && onNeedVault
      ? { onNeedVault }
      : section === "space"
        ? { active: true }
        : {};
  return (
    <Suspense
      fallback={
        <div data-settings-slot={section} className="settings-placeholder">
          加载中…
        </div>
      }
    >
      <Comp {...extra} />
    </Suspense>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  section,
  onSectionChange,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const t = window.setTimeout(() => closeRef.current?.focus(), 10);
    return () => {
      window.clearTimeout(t);
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open]);

  const goSpace = () => onSectionChange("space");

  const body = useMemo(() => {
    if (section === "about") return <AboutSection />;
    if (section === "appearance") return <AppearanceSection />;
    if (section === "space")
      return <OptionalSection section="space" Comp={lazySpace} />;
    if (section === "model")
      return <OptionalSection section="model" Comp={lazyModel} />;
    if (section === "runtime")
      return <OptionalSection section="runtime" Comp={lazyRuntime} />;
    return (
      <OptionalSection
        section="skills"
        Comp={lazySkills}
        onNeedVault={goSpace}
      />
    );
  }, [section, onSectionChange]);

  if (!open) return null;

  return (
    <div
      className="settings-panel-root"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <p className="settings-panel-kicker">Soit</p>
            <h2 className="settings-panel-title">设置</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="settings-panel-close"
            aria-label="关闭设置"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="settings-panel-body">
          <nav className="settings-nav" aria-label="设置分段">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item${section === item.id ? " on" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => onSectionChange(item.id)}
              >
                <span className="settings-nav-label">{item.label}</span>
                <span className="settings-nav-hint">{item.hint}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">{body}</div>
        </div>
      </div>
    </div>
  );
}
