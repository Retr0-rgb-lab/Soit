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
import "./settings/settings.css";

export type SettingsSection = "space" | "model" | "skills" | "about";

type Props = {
  open: boolean;
  onClose: () => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
};

const NAV: { id: SettingsSection; label: string }[] = [
  { id: "space", label: "空间" },
  { id: "model", label: "模型" },
  { id: "skills", label: "技能" },
  { id: "about", label: "关于" },
];

/** Optional section modules — empty until S2/S3/S4 land the files. */
const spaceGlob = import.meta.glob("./settings/SpaceSection.tsx");
const modelGlob = import.meta.glob("./settings/ModelSettingsForm.tsx");
const skillsGlob = import.meta.glob("./settings/SkillsList.tsx");

function firstLoader(
  glob: Record<string, () => Promise<unknown>>,
): (() => Promise<{ default: ComponentType }>) | null {
  const key = Object.keys(glob)[0];
  if (!key) return null;
  const load = glob[key]!;
  return () =>
    load().then((mod) => {
      const m = mod as { default?: ComponentType };
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
}: {
  section: SettingsSection;
  Comp: LazyExoticComponent<ComponentType> | null;
}) {
  if (!Comp) return <Placeholder section={section} />;
  return (
    <Suspense
      fallback={
        <div data-settings-slot={section} className="settings-placeholder">
          加载中…
        </div>
      }
    >
      <Comp />
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

  const body = useMemo(() => {
    if (section === "about") return <AboutSection />;
    if (section === "space")
      return <OptionalSection section="space" Comp={lazySpace} />;
    if (section === "model")
      return <OptionalSection section="model" Comp={lazyModel} />;
    return <OptionalSection section="skills" Comp={lazySkills} />;
  }, [section]);

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
            <p className="shell-label">Soit</p>
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
                {item.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">{body}</div>
        </div>
      </div>
    </div>
  );
}
