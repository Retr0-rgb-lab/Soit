# 文档陪读会话 — 状态机与布局

> 2026-08-20 · PEL-156 · 与 [共识.md](./共识.md) §2.1、[对象模型.md](./对象模型.md)「文档引用」一致  
> 对标：卡主台 + 语境陪读面（非文档主权 IDE）

## 不变式

- 探究卡是主工作记忆；文档是**只读对照面**，不是新卡片类型。
- 不在 Soit 内编辑并写回 vault 正文（深编回 Obsidian）。
- 不为预览扫 vault；打开 = 单路径探测 + 限额读取。
- **禁止**把 PDF/md 塞进 `CardPipWindow`（卡 PiP 语义不变，见 `card-pip-fsm.md`）。
- **禁止** `OrbitStage` 与文档主面叠 z-index；进 map 时文档会话关闭或收成不可读。
- AI 流式只写卡 turns，不流式改文件。

## 实体：`DocSession`（会话级，非树上节点）

| 字段 | 含义 |
|------|------|
| `status` | `closed \| loading \| ready \| error \| closing` |
| `path` | 经 Host 校验的绝对路径，或 vault 相对路径（实现二选一，须 canonicalize） |
| `displayName` | 文件名 |
| `kind` | `md \| text \| pdf \| unsupported` |
| `layout` | `split \| doc-wide \| peek` |
| `boundCardId` | 可选；「这份材料服务哪张探究」 |
| `cursor` | PDF 页码 / 滚动位置 / 选区摘要 |
| `error` | 人类可读失败原因 |
| `tabs` | v1 可只实现长度 ≤1；结构预留多 tab |

v1 默认：**全局一次一个文档会话**（非一卡强制钉死一份；`boundCardId` 可显示服务关系）。

## 状态

| 状态 | 含义 |
|------|------|
| `closed` | 无陪读面；中栏仅卡 / empty / map |
| `loading` | 已选路径，Host 探测/读中 |
| `ready` | 渲染器挂载；可划词、改 layout |
| `error` | 打不开（越权/过大/类型不支持/IO）；可 retry 或 close |
| `closing` | 卸面动画或 map 强制收起 |

## 转换

```text
closed ──open(path)──► loading
loading ──probe+read ok──► ready
loading ──fail──► error
error ──retry──► loading
error ──close──► closed
ready ──change_layout──► ready          (split | doc-wide | peek)
ready ──rebind(cardId?)──► ready
ready ──open(other)──► loading          (替换当前会话；v1 单 tab)
ready ──close──► closing ──► closed
ready|loading|error ──enter map──► closing ──► closed
* ──unbound vault──► closing ──► closed  (解绑宇宙时必须清会话)
```

**禁止：** loading 期间并行开第二个路径（后开覆盖前开或排队取消前请求，二选一写进实现，默认**取消前请求**）。

## 与 workspace 耦合

```text
workspaceMode = focus | map

focus + DocSession.closed     →  InquiryCard 全宽（现状）
focus + DocSession.ready
        layout=split          →  center-stage 分栏：Card | DocPane
        layout=doc-wide       →  Doc 为主宽；卡收窄条/底条，不卸卡
        layout=peek           →  Card 全宽 + DocPeek 浮层（非 CardPip）
map   + 任意 DocSession       →  强制 closing → closed
card PiP + DocSession         →  互不抢语义；可并存（卡浮窗 + 陪读面）
```

专注模式（`card-stage-chrome`）：**保留**已打开的 split/peek 陪读（材料是专注的一部分）；隐藏左轨等 chrome 不变。

## 划词 → 探究（复用卡内出口）

```text
doc.ready ──select──► selecting
selecting ──解释──► TermFloat / 短解释（不建卡）
selecting ──引用──► Composer quote chip
                     payload 含 DocAnchor { path, page?, offset?, text }
selecting ──深挖|发散──► DirectionChooser
                     SourceSpan 扩展可选 doc 锚点（见对象模型）
selecting ──cancel/Esc──► ready
```

与卡内划词**同一套**解释 / 引用 / 方向选择；不要另做「文档 AI 重写条」。

## 打开生命周期（Host）

```text
user open
  → FE DocSession.loading
  → Host resolve_doc_path（vault 前缀内，或 v1 仅 vault 内）
  → Host probe_kind + read（md/text 全文限额；pdf 元数据/按页策略）
  → FE kind → 渲染器
  → ready | error
```

冷启动：**禁止**为文档功能在 bootstrap 扫库或多开 DB。

## 布局默认

| layout | 卡 | 文档 |
|--------|----|------|
| `split`（默认） | ~55–60% | ~40–45%，可拖分隔 |
| `doc-wide` | 窄条或底条 composer 可达 | 主宽 |
| `peek` | 全宽 | 半宽浮层，Esc 关 |

## 实时预览（本产品定义）

| 是 | 否 |
|----|----|
| 打开即渲染（**P0：md/text**；pdf 为探测+引导，内嵌后置） | Soit 内 WYSIWYG 编辑 |
| 划词即时进 composer / 解释 | AI 流式改 PDF/md |
| 外部改文件后手动刷新/重开（v1） | vault 全量索引预览 |
| | `data:` iframe 赌 CSP 看 PDF |

## 与 Composer 附件

| | 附件 chip | DocSession |
|--|-----------|------------|
| 目的 | 本轮 prompt 注入 | 人眼对照 + 锚点引用 |
| 持久 | 弱（嵌 user 文本） | 会话级；可选卡绑定 path |
| 互通 | 「在陪读面打开」可后置 | 引用 → quote chip |

## 浮层与 z-index

- DocPane 挂在 `workspace-main` / `center-stage` 内，**不** portal 到 body（peek 可 portal，但 z 低于 Settings，高于卡内容）。
- 不得与 `OrbitStage` 同挂。
- Settings / Palette 打开时 Doc 可保持，不抢 Esc 第一层（Esc：settings → palette → doc peek/close? → focus chrome；细则实现时与 shell Esc 表对齐，peek 优先于关卡）。

## 验收口诀

1. 墨夜/任意主题下 Doc 面不是「永远白纸刺眼」（跟 token）。  
2. 无卡时仍可开文档（bound 可空；中栏 Doc 全宽），但主循环仍是探究；无卡/无 turn 时深挖发散 disable。  
3. 进 map / 解绑 / loadSnapshot 文档面消失。  
4. 划词引用能进发送正文且带路径/页码线索。  
5. vault 外路径默认拒绝（v1）。  
6. 深挖须焦点卡已有 turn；回源优先 `docPath` 重开陪读。
