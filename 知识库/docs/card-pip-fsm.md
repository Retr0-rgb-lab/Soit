# 卡片 PiP 小窗 — 状态机与动画

> 对标 YouTube 悬浮窗：整卡缩成可拖浮窗，可放大 / 关闭；**不是**右上角死缩放，**不是**独立 tab。

## 状态

| 状态 | 含义 |
|------|------|
| `idle` | 舞台主卡正常全尺寸 |
| `dragging` | 标题按下后跟手剥离（尚未进 PiP） |
| `pip` | 某张卡在 **viewport 固定层** 成 PiP；舞台显示另一张（默认下一张） |

PiP 会话字段：`pipCardId`、`x/y`（左上角，viewport 坐标）、`w/h`、可选 `phase: entering | settled | expanding | closing`。

## 转换

```text
idle ──pointerdown(标题)──► dragging
dragging ──move──► dragging          (只更新 peel 位移，不出现 tab)
dragging ──release 且 flick──► idle  (focus → 目标卡，enter 动效)
dragging ──release 未 flick 未 hold──► idle  (弹回)
dragging ──hold ≥ ~0.45s──► pip
         · pipCardId = 当前 focus
         · 若有「下一张」→ focusNode(下一张) 舞台交给下一张
         · 浮窗 FLIP：从主卡 rect → 右下角安全区
pip ──拖浮窗头──► pip                 (改 x/y，始终 clamp 进视口)
pip ──放大──► idle                   (focus → pipCardId；expand 动画后卸浮窗)
pip ──关闭/删除──► idle              (focus 留在舞台当前卡；close 动画后卸浮窗)
pip ──Esc──► idle                    (同关闭)
```

**禁止：** 拖动过程中弹出任何跟随指针的小 tab；PiP 不得 `overflow: hidden` 祖先裁切（挂 `document.body` portal）。

## 动画

| 转换 | 动效 |
|------|------|
| idle→dragging | 主卡 `translate` 跟手 + 微旋（无 scale） |
| dragging→idle（弹回） | transform 0.2s ease-out 回位 |
| dragging→pip | FLIP：from=主卡 getBoundingClientRect，to=默认 PiP 框；0.32s ease-out |
| pip 拖动 | 无过渡，直跟手；松手可轻微 settle |
| pip→idle 放大 | 浮窗 scale→1 并移向舞台中心感 0.28s，结束卸 PiP + 主卡 enter |
| pip→idle 关闭 | 浮窗 scale 0.85 + opacity 0，0.2s，卸 PiP |

## 默认几何

- 尺寸：约 `min(440, 34vw)` × `min(300, 0.68·w)`（更大的 YouTube 式浮窗）
- **触发：** 按住约 **450ms**
- **落点：以 hold 时拖动卡片中心**（`pipGeomAtPointer`），再 clamp 进视口 —— **不**自动贴右下角
- clamp：`x ∈ [8, vw-w-8]`，`y ∈ [8, vh-h-8]`

## 滚动标题淡出（主卡 + PiP）

对齐 Explore：正文 `scrollTop` 增大时，标题/路径/工具行 `opacity` + 微 `translateY` 淡出（约 300ms），`visibility` 在近全隐时 hidden。  
主卡：`.ic-msgs` scroll → `chromeFade` → `CardHeader`。  
PiP：`.card-pip-body` scroll → 同式淡出 chrome。

## 浮窗控件

- **放大**：恢复该卡为舞台主卡  
- **关闭/删除**：关掉浮窗，舞台保持当前 focus  
- 标题条可拖  
