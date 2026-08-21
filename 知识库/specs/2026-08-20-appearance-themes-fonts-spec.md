# 外观：主题 + 字体 — Spec v1.1

> 日期: 2026-08-20  
> 依据: 用户确认 5 主题 + 系统字体 + 字号；token 审计；Oracle REVISE  
> 基线分支: `main`  
> 前置依赖: SettingsPanel；本 Spec **接管** settings-shell v1.1 §7「主题」原 OOS

---

## 摘要

设置新增 **外观**：十主题（宣纸/抹茶/青瓷/墨夜/丹砂 + 羊皮/蓝晒/藤紫/胡桃/石室）+ 五字体族 + 四档字号。`index.html` 同步 boot 写 `html[data-theme|data-font|data-font-size]` + critical bg；`tokens.css` 映射色与字体；偏好 `localStorage` key `soit-appearance`。默认 paper/system/md。无 CDN 字体。

v3 扩展：每主题含表面阶梯（app/panel/card/elevated/muted/composer）、双 accent（主色 + counter）、header/rail wash、graph 节点色（root/deepen/diverge/path）、soft 渐变舞台。组件内部色差靠 token 而非单色洗染。

---

## 0. 前置依赖

Settings 现有：空间 · 模型 · 运行时 · 技能 · 关于。  
本 Spec 插入 **外观** 后冻结顺序：

**空间 · 外观 · 模型 · 运行时 · 技能 · 关于**

---

## 1. 现状

- 单一 `:root` 暖纸；无 data-theme  
- Settings 无外观；AppShell `parseSettingsSection` 需扩  
- ESM 下 main.tsx **不能**在 CSS import 前跑逻辑 → boot 只能 `index.html` 内联  
- 多处 hex 硬编码（图/卡）— v1 以 token 消费者 + 设置/卡主表面为准  

---

## 2. 工作

### 2.1 主题色表

| id | 中文 | 默认 |
|----|------|------|
| paper | 宣纸 | ✓（现 `:root`） |
| matcha | 抹茶 | 豆青雾 / 苔绿 accent |
| celadon | 青瓷 | 冷青灰 / 青瓷 accent |
| ink | 墨夜 | 暖炭底 / 象牙字；`color-scheme: dark` |
| cinnabar | 丹砂 | 近 paper + 朱红 accent |
| vellum | 羊皮 | 干羊皮 / 牛血封泥 + 叶金 counter |
| cyanotype | 蓝晒 | 普鲁士蓝印相 / 铁锈 counter |
| wisteria | 藤紫 | 灰紫灰泥 / 梅紫 + 鼠尾草 |
| walnut | 胡桃 | 暖木暗室 / 黄铜 + 绿灯罩；`color-scheme: dark` |
| travertine | 石室 | 石灰石展厅 / 铜绿 + 哑光青铜 |

覆盖：`--bg-app/panel/card/elevated/muted/composer`、`--ink*`、`--line*`、`--accent*`/`--accent-2*`、`--danger`、`--focus`、`--header-wash`/`--rail-wash`、`--graph-node-*`、`--gradient-app`、`--e1..e3`、`--e-float`、`--shadow-soft`。  
不覆盖：layout/motion/inquiry/sheet 几何。

```css
:root, html[data-theme="paper"] { ... }
html[data-theme="matcha"] { ... }
html[data-theme="ink"] { color-scheme: dark; ... }
```

### 2.2 字体 + 字号

**font（Windows 优先）：**

| id | 中文 | 栈 |
|----|------|-----|
| system | 系统默认 | 现有 system-ui 栈 |
| song | 宋体书卷 | `"SimSun","NSimSun","Songti SC","Noto Serif CJK SC",serif` + system 回落 |
| hei | 黑体清晰 | `"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif` |
| kai | 楷体手札 | `"KaiTi","STKaiti","Kaiti SC",serif` + 回落 |
| mono | 等宽 | `"Cascadia Code","Sarasa Mono SC","Consolas","Courier New",monospace` |

**fontSize：** sm/md/lg/xl → `--font-size-root`: 14/15/16/18px  

```css
html[data-font-size="md"] { --font-size-root: 15px; }
body { font-family: var(--font); font-size: var(--font-size-root); }
```

阅读面必须跟字号：`.ic-msgs`、`.ic-msg`、composer `textarea`、`.settings-content` 使用 `font-size: inherit` 或 `var(--font-size-root)`（若现为固定 px 则改为 inherit/var）。

### 2.3 持久化 + boot

**JSON** `localStorage["soit-appearance"]`:

```ts
{ theme, font, fontSize } // 校验枚举，非法→paper/system/md
```

**唯一 boot：** `index.html` 在 `<script type="module" src=...>` **之前** 内联脚本：

1. parse storage  
2. `document.documentElement.dataset.theme|font|fontSize`  
3. critical：`document.documentElement.style.backgroundColor` = paper `#f3ebe0` / ink `#1c1916`（其它浅色用各自 app bg 或 paper 近色）  
4. 无 await  

`src/lib/appearance.ts`：`DEFAULT`、`parseAppearance`、`readAppearance`、`writeAppearance`、`applyAppearanceToDocument`（与 boot 同一校验表）。Settings 只走此模块。

### 2.4 Settings UI

- **新建** `AppearanceSection.tsx` — **静态 import**（同 About，不走 glob）  
- `SettingsPanel`：联合类型 + NAV  
- `AppShell.parseSettingsSection` 含 `appearance`  
- UI：主题色板 5 钮（TS 内嵌 swatch hex）；字体 5；字号 4；即时 apply+write  
- `settings.css` 色板样式  

### 2.5 测试

`appearance.test.ts`：非法 JSON→默认；apply 写 dataset。

### 2.6 文档

`shell/AGENTS.md` 导航顺序 + 外观。

---

## 3. 文件清单

| 文件 | 变更 |
|------|------|
| `index.html` | inline boot + critical bg |
| `src/styles/tokens.css` | 五主题 + font/size |
| `src/styles/app.css` | body font-size var；必要阅读面 |
| `src/components/card/card.css` | 正文/composer inherit 字号 |
| `src/lib/appearance.ts` | **新建** |
| `src/lib/appearance.test.ts` | **新建** |
| `src/components/shell/settings/AppearanceSection.tsx` | **新建** |
| `src/components/shell/SettingsPanel.tsx` | appearance 段 |
| `src/components/shell/AppShell.tsx` | parse section |
| `src/components/shell/settings/settings.css` | 外观 UI |
| `src/components/shell/AGENTS.md` | 文档 |

---

## 4. 架构

```text
index.html inline boot → html data-* + critical bg
tokens.css [data-theme][data-font][data-font-size]
Settings 外观 → appearance.ts → apply + localStorage
```

---

## 5. 实施顺序

```text
Wave 1 并行: A1 tokens | A2 appearance.ts + index boot + tests
Wave 2: A3 AppearanceSection + Panel + AppShell + css
Wave 3: A4 AGENTS + full verify + push
```

| Plan | 工作量 |
|------|--------|
| A1 | 0.5–0.75d |
| A2 | 0.4d |
| A3 | 0.5–0.6d |
| A4 | 0.2d |
| 合计 | ~2d |

---

## 6. 验收

- [ ] 外观段在导航第二位  
- [ ] 五主题 / 五字体 / 四字号可切换且刷新保持  
- [ ] 默认 paper/system/md  
- [ ] 字号在探究正文与设置正文可见变化  
- [ ] ink 冷启动无明显纸色/白闪  
- [ ] 无 CDN 字体  
- [ ] 非法 storage 回退  
- [ ] npm test + tsc  
- [ ] ink 下设置/卡主表面正文可读（允许少数 inset 残留）  

---

## 7. 不在范围

CDN/上传字体；图谱 hex 全迁；自定义取色；云同步主题。

---

## 8. 版本

| 版本 | 说明 |
|------|------|
| v1.0 | 首稿 |
| v1.1 | Oracle：index-only boot+FOUC；AppShell/nav；Windows 字栈；字号落到阅读面；接管 shell 主题 OOS |
