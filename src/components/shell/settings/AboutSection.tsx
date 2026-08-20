import { useEffect, useState } from "react";
import { getBootstrapState } from "../../../lib/host";

/** Product identity + memory boundary (db / md / keys). */
export default function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBootstrapState().then((boot) => {
      if (!cancelled) setVersion(boot.version || "unknown");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="settings-about" aria-label="关于">
      <h3 className="settings-about-title">Soit</h3>
      <p className="settings-about-version">
        {version === null ? "…" : `版本 ${version}`}
      </p>
      <ul className="settings-about-copy">
        <li>
          宇宙图保存在本库 <code>vault/.soit/universe.db</code>
          ，跟着 vault 走，不是云端账号。
        </li>
        <li>
          给人复访的记忆写在 Obsidian 笔记（.md）里；卡片是探究工作区，不是笔记镜像。
        </li>
        <li>
          模型 API 密钥只存在本机应用配置，不写入 vault，也不进对话沉淀。
        </li>
      </ul>
    </section>
  );
}
