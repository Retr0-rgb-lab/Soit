# 作曲条 Web Search 开关 — Design v1.0

> 日期: 2026-08-22
> 依据: `2026-08-21-inquiry-tools-search-spec.md` v1.1（§2.2 工具目录 / §2.3 Tools prefs / §2.5 system 注入 / §2.6 runToolLoop）；`知识库/docs/共识.md` §6.1
> 基线分支: `main`
> Oracle: v1.0
> 决策（头脑风暴已确认）：**粘性开关** · **自动回退 DDG** · **独立于全局 toolsEnabled**

---

## 摘要

卡片作曲条工具栏新增一个 **web search 粘性开关按钮**。点亮后，`web_search` 工具随每次发送注入模型工具列表，与设置里的全局「启用工具」解耦；后端解析优先用设置中已配置的后端（Tavily/DDG），未配置时自动回退 DDG（免费、无 Key）。状态持久化进 `soit-tools.json`（Host 权威，非 universe.db），跨卡、跨重启生效。设置面板不改。

---

## 1. 现状与缺口

| 现状 | 证据 |
|------|------|
| web_search 工具已存在（function calling，Rust Host 执行） | `INQUIRY_TOOL_DEFS` · `src-tauri/src/tools/web_search.rs` |
| 后端三态 off / ddg / tavily，默认 **off** | `ToolsPrefs.webSearchBackend` |
| 全局 `toolsEnabled` 一开全开（三工具捆绑） | `runToolLoop.ts:164` |
| 无 per-tool 开关；无作曲条入口 | Composer 工具栏仅 模型/附件/引用 |
| system 工具策略唯一注入点 `{ toolsEnabled }` | `systemPrompt.ts:127` |

缺口：用户无法在发送前快速开关 web search；要改需进设置面板改总开关 + 后端两步。

---

## 2. 需要做的工作

### 2.1 数据模型：`ToolsPrefs v1` 增字段（P0）

`soit-tools.json` 增 `webSearchEnabled: boolean`，默认 `false`（保持 web 默认关，共识不变）：

```ts
{
  version: 1,
  toolsEnabled: true,           // 不变：vault_search / fetch_url 的门
  maxToolRounds: 3,             // 不变
  webSearchBackend: "off",      // 不变：用户在后端配置中的选择
  webSearchEnabled: false,      // 新：作曲条按钮状态
  tavilyApiKey: "",
  allowLoopbackFetch: false
}
```

- Rust `ToolsPrefsDto` 增 `#[serde(default)] web_search_enabled: bool`；`Default`/`normalize` 同步。
- FE `normalizeToolsPrefs` 增同名字段（缺省 → false）。
- **有效后端解析（不写回）**：
  `effective = webSearchEnabled ? (webSearchBackend === "off" ? "ddg" : webSearchBackend) : "off"`
  即：按钮关 → 一律不搜；按钮开 → 用配置的后端，配置为 off 时回退 DDG。**用户设置里的 `webSearchBackend` 原值不被覆盖**。
- `get_tools_prefs` / `set_tools_prefs` 命令与 IPC 形状不变（字段随 DTO 透传），无需新 command / permission。

### 2.2 工具注入（P0）

`runToolLoop.ts` 组装改为按工具过滤（替代现在的整体 `toolsOn ? INQUIRY_TOOL_DEFS : undefined`）：

| toolsEnabled | webSearchEnabled | 注入 |
|---|---|---|
| true | true | vault_search + fetch_url + web_search |
| true | false | vault_search + fetch_url |
| false | true | 仅 web_search |
| false | false | 无 |

- `openaiCompat.complete` 的 `toolsEnabled` 提示词参数改传 `toolsEnabled || webSearchEnabled`。
- `systemPrompt.ts`：`InquiryPromptOptions` 增 `webSearchEnabled?: boolean`；工具策略段按实际可用集合拼接（仅 vault/fetch、仅 web_search、全部），不再统一提"web_search (only if enabled in settings)"。

### 2.3 Host 门禁（P0）

- Rust `web_search()`：`!web_search_enabled` → 可读 error「网页搜索已关闭（点作曲条的搜索按钮开启）」；开启且 `WebSearchBackend::Off` → 走 `search_ddg`（回退），不再直接 Err。
- Tavily 无 key → 保持现有 error（提示设置填写）。
- 浏览器 mock（`host.ts` `invoke_inquiry_tool` web_search 分支）：按同一 `effective` 逻辑镜像（关 → error；开 → mock 1 条）。

### 2.4 Composer UI（P0）

- `Composer.tsx` 工具栏（模型按钮左侧）新增图标按钮 `ic-tool-btn ic-ws-btn`：
  - 关：暗态；开：高亮态（复用 `ic-tool-btn` 已有 on/accent 语言），`aria-pressed` 同步；
  - `data-tip`：关 →「网页搜索：关，点击开启」；开 →「网页搜索：开（DuckDuckGo|Tavily）」按 effective 显示；
  - 点击 → `setToolsPrefs({...prefs, webSearchEnabled: !on})`，成功后更新本地态；失败回滚；
  - 挂载时 `getToolsPrefs()` 读初始态；`inputLocked`（生成中）**不禁用**该按钮——状态作用于下一次发送；
  - 图标：`icons.tsx` 新增 `IconSearch`（沿用现有 stroke 风格）。
- 设置面板 `ToolsSection` 不改（后端选择仍在那里；按钮只写 `webSearchEnabled` 一个字段，读-改-写全对象，单用户无并发风险）。
- 与设置面板的字段冲突：两处都整体写 `ToolsPrefs`；顺序操作下后写覆盖先写，但两处写的是**互不相同的字段**，正常使用无丢失。

### 2.5 测试（P0）

| 层 | 用例 |
|----|------|
| `src/lib/tools/prefs.test.ts` | normalize 增字段默认 false；非法值回退 |
| `src/state/runToolLoop.test.ts` | 注入矩阵 2×2（断言传给 port 的 tools 集合） |
| `src/lib/chat/assistantHtml`…（不涉及） | — |
| `src-tauri/src/tools/web_search.rs` 单测 | 关 → Err；开 + off → DDG 路径（mock/失败断言不做真网）；开 + tavily 无 key → Err |
| `src/components/card/Composer.test.tsx`（jsdom + testing-library） | 按钮开关切换、aria-pressed、tooltip 后端名、写入 prefs |

---

## 3. 文件变更清单

| 文件 | 变更 |
|------|------|
| `src/lib/tools/types.ts` | `webSearchEnabled` 字段 + default/normalize |
| `src/lib/chat/systemPrompt.ts` | opts 增 webSearchEnabled；策略段按集合拼接 |
| `src/state/runToolLoop.ts` | 工具过滤注入 |
| `src/lib/host.ts` | 浏览器 mock web_search 门禁镜像 |
| `src/components/card/Composer.tsx` | 按钮 + prefs 读写 |
| `src/components/card/icons.tsx` | `IconSearch` |
| `src/components/card/card.css` | 按钮 on/accent 态（复用既有类为主） |
| `src-tauri/src/tools/prefs.rs` | DTO 字段 + default/normalize |
| `src-tauri/src/tools/web_search.rs` | 门禁 + off→ddg 回退 |
| 测试 | prefs / runToolLoop / rust web_search / Composer |

热文件：`runToolLoop.ts` `host.ts` `systemPrompt.ts` `Composer.tsx` `prefs.rs` `web_search.rs` — 串行改。

---

## 4. 数据流

```
Composer 按钮 click
   └─ setToolsPrefs({...prefs, webSearchEnabled: !on})   // Host soit-tools.json + FE LS 镜像
         └─ 本地态更新 → 按钮高亮/aria-pressed/tooltip

下次发送 → runToolLoop:
   prefs = getToolsPrefs()
   tools = (toolsEnabled ? [vault_search, fetch_url] : [])
         + (webSearchEnabled ? [web_search] : [])
   systemPrompt(scope, { toolsEnabled, webSearchEnabled })
   → port.complete({ tools })
         └─ 模型调 web_search(query)
               └─ Host invoke_inquiry_tool
                     └─ Rust web_search: !enabled → Err；Off → DDG；Tavily → API
                           └─ 结果回 wire → 过程条「网页搜索」步骤
```

---

## 5. 验收标准

- [ ] 按钮点击即开/关，状态跨发送、跨卡、跨重启保持（重启后 `get_tools_prefs` 读回）
- [ ] 开 + 后端 off → 实际走 DDG；设置面板里 `webSearchBackend` 原值不变
- [ ] 开 + Tavily 已配 → 走 Tavily
- [ ] 关 → 模型工具列表无 web_search；Rust 直接调也报可读错误
- [ ] toolsEnabled=false + 按钮开 → 仅 web_search 注入，vault_search/fetch_url 不注入
- [ ] system 提示词与注入集合一致（无"已启用却不描述 / 描述却未注入"）
- [ ] 生成中可切换按钮，作用于下一次发送
- [ ] 浏览器 mock（npm run dev）行为一致
- [ ] `npm test` / `npm run build` / `cargo test` 通过
- [ ] 冷启动无搜索网络请求

---

## 6. 不在范围

- 设置面板加同款开关（按钮即唯一入口）
- 后端枚举扩展（SearXNG 等）
- web_search 结果缓存 / 引用卡片化
- 每条消息级（非粘性）开关
- 强制模型必须调用搜索（仅注入工具，调用仍由模型决定）
- 共识.md 决策表变更（web 默认仍 off，仅多一个用户显式入口）

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| DDG HTML 解析脆弱 | 既有 error step 可读；后端默认仍 off；按钮提示"可能不稳定"不展开 |
| 两处写 ToolsPrefs（按钮 vs 设置） | 互不重叠字段；读-改-写全对象；单用户顺序操作 |
| 模型不调用搜索 | 注入只是给能力；提示词已说明"需要时用"；不承诺必搜 |
| Composer prefs 与设置面板打开时不同步 | 影响极小（tooltip 后端名可能滞后一次），设置面板关闭后下次发送以 Host 为准 |

---

## 8. 版本变更

| Ver | 说明 |
|-----|------|
| v1.0 | 初稿（决策：粘性 / DDG 回退 / 独立全局开关） |
