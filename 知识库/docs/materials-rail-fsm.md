# 资料轨（Materials Rail）— 状态机

> 2026-08-20 · 接 PEL-156 陪读 · 右上设置齿轮**下方**入口  
> 与 [doc-session-fsm.md](./doc-session-fsm.md)、[共识.md](./共识.md) §2.1 / §2.2 一致

## 人话

用户点右上角设置底下的 **资料** 按钮 → 中栏右侧 **同一块陪读面** 打开，先显示 `materials/` 文件列表（和 Obsidian 同目录）。  
点某个文件 → **还是这一块面**，切成只读预览（不是再往右长一列）。  
预览顶栏可「列表」返回；关按钮关掉整块陪读面。  
预览宽度 = 卡 | 陪读面 之间的拖条。  
导入 = 复制进 `vault/materials/`。

## 不变式

1. **资料轨 ≠ 卡片树节点**；只是 vault 文件的浏览器（浅列表）。  
2. **真文件只在 vault**（默认根：`materials/`）；`.soit/` 禁止列出/写入资料。  
3. **预览权威仍是 DocSession**；资料轨只负责 list / import / 点选 `openDoc(pathRel)`。  
4. **不为列表做冷启动全库 walk**；仅在轨打开时懒列 `materials/`（有深度上限）。  
5. **进 map / 解绑 / loadSnapshot** → 资料轨强制收起；DocSession 仍按既有 force_close。  
6. 编辑归 Obsidian；Soit 内列表与预览只读（导入是写文件，不是编辑正文）。

## 目录约定

```text
vault/
  materials/                 # 资料根（Soit 导入默认落点；Obsidian 可见）
    <files and optional subdirs>
  concepts/ …
  inquiry/ …
  .soit/                     # 禁止作为 materials 源
```

- 导入目标：`materials/` 下，保留原文件名；冲突则 `name (2).ext`。  
- v1 **不**强制按卡分子目录（可后置 `materials/by-card/<cardId>/`）。  
- 列表范围：**仅** `materials/` 子树，不扫整个 vault。

---

## 实体

### MaterialsRailState

| 字段 | 含义 |
|------|------|
| `open` | 轨是否展开 |
| `listStatus` | `idle \| loading \| ready \| error` |
| `entries` | 当前列表项（见下） |
| `error` | 列表失败文案 |
| `selectedPathRel` | 列表高亮（通常 = 当前 DocSession.pathRel） |
| `listEpoch` | 丢弃过期 list 响应 |

### MaterialsEntry

| 字段 | 含义 |
|------|------|
| `pathRel` | vault 相对，`materials/...` |
| `name` | 文件名 |
| `kind` | `md \| text \| pdf \| unsupported \| dir`（v1 可扁平化，dir 点进后置） |
| `size` | 字节 |
| `mtimeMs` | 可选，排序 |

v1 列表：**单层或浅递归（≤2 层）文件**；目录可显示但点进 = 后置，P0 可 flatten 所有文件。

### SplitRatio（预览宽度，属壳布局）

| 字段 | 含义 |
|------|------|
| `docFraction` | DocPane 占 split 宽度 0.28–0.72，默认 0.42 |
| 持久化 | `localStorage` 键 `soit-doc-split-ratio`；不进 universe.db |

---

## MaterialsRail FSM

```text
                    click 资料按钮 / soit:toggle-materials
  rail closed ──────────────────────────────────────────► rail open
       ▲                                                      │
       │                                                      │ open 时
       │                                                      ▼
       │                                              listStatus=loading
       │                                                      │
       │                         ok                           │ fail
       │                          ▼                           ▼
       │                    listStatus=ready          listStatus=error
       │                          │                           │
       │                          │ refresh / 导入成功         │ retry
       │                          └──────────► loading ◄──────┘
       │
       │ click 资料按钮(关) / Esc(轮到轨) / map / loadSnapshot / unbind
       └────────────────────────────────────────────────────────
```

**转换表**

| 事件 | 从 | 到 | 副作用 |
|------|----|----|--------|
| `toggle` 且 closed | closed | open | 触发 `list` |
| `toggle` 且 open | open | closed | 不清 DocSession |
| `list` | open | loading→ready/error | Host `list_vault_materials` |
| `refresh` | open+ready/error | loading→… | 同上 |
| `import_files` | open | （保持 open） | Host `import_vault_material`（P0：base64≤2MB）→ refresh → openDoc 首个成功 |
| `select(pathRel)` | open | open | **`openDoc(pathRel)`**；selectedPathRel=pathRel |
| `force_close` | * | closed | map / loadSnapshot / unbind；**不**自动 closeDoc（Doc 由 DocSession 自己 force_close） |
| Esc（见壳层顺序） | open | closed | 仅收轨 |

**与 DocSession 关系（关键）**

```text
CompanionPane (单一右槽)
  view=list     → MaterialsList
  view=preview  → DocPane（同一槽，互斥）

Materials.select(path)
  → view=preview + DocSession.open(path)
  → workspace-split: Card | CompanionPane

返回列表 → view=list + closeDoc（仍占右槽）
关闭陪读 → open=false + closeDoc → 卡全宽
```

**禁止三栏：** 不得同时挂 MaterialsList 与 DocPane 为两列。

```text
[ LeftRail | workspace-main: Card | sash | CompanionPane | gear stack ]
```

---

## 导入 FSM（Host 单次操作）

```text
user pick files (input[type=file] multiple)
    → import_status=busy
    → 每个 file.size 预检（>2MB 跳过并提示）
    → Host import_vault_material({ fileName, bytesBase64 }) × N
         · 仅写入 vault/materials/
         · 解码后 ≤ 2_000_000 bytes
         · 路径沙箱；返回 pathRel
    → import_status=idle
    → list refresh
    → DocSession.open(第一个成功)
```

大文件：请用户直接放进 `vault/materials/` 后点刷新（P1 再做 OS 路径复制）。

浏览器 mock：list 含 `demo/welcome.md`；import **内存追加** entries，不写盘。

---

## 壳层 Esc 顺序（更新）

```text
settings → palette → open-doc popover → materials rail close → doc close → map→focus
```

资料按钮与设置互不抢模态：设置是 dialog；资料轨是 dock。

---

## 右上 chrome 栈

```text
┌────┐
│ ⚙  │  settings-gear（已有）
├────┤
│ 📄 │  materials-toggle（本波新增，在齿轮正下方）
└────┘
```

- 常驻：focus / empty / demo / map 均可见。  
- map 下点开资料轨：v1 **允许打开列表**，但 **禁止** 与 Orbit 叠预览——若 map 下 select 文件，先 `setMode('focus')` 再 `openDoc`（或 disable 预览并 toast「请先退出图谱」）。  
  **P0 拍板：map 下点文件 → 自动 focus + openDoc**（资料优先于继续看图）。

---

## 验收口诀

1. 齿轮下有资料按钮；点一下出轨，再点收起。  
2. 轨内看到 `materials/` 文件；与 Obsidian 同目录增删后点刷新能更新（v1 手动刷新即可）。  
3. 点文件 → 中栏出现只读预览（md/text；pdf 引导）。  
4. 卡|预览之间可拖宽度，松手比例记住。  
5. 导入文件出现在 `materials/` 且列表可见。  
6. 进 map / 解绑：轨收起；Doc 按原规则关。  
7. 冷启动不列 materials。
