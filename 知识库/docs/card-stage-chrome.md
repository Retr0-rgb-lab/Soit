# 卡片舞台 · 全屏 / 拖卡切换 / 动效

> 2026-08-20 · PEL-147 / 150 / 153 · Explore 对标后修正

## 不变式

- 单一 `focusId` 主卡；composer 在卡外；边沿只有深挖 / 发散。
- **不做** 自由桌面摆放、MindScape 多窗编辑器。
- 纸栈 = 祖先路径的视觉暗示（可点下层回退），不是独立小窗会话。

## PEL-147 专注模式

原「全屏」现称 **专注模式**：只保留主卡 + 输入框（+ 已打开的文档陪读）。

- 进入：Header「专注模式」/ `F`
- 退出：`Esc`；进 map 自动退出
- 隐藏：左轨、方位图、设置齿轮、边沿深挖/发散、轮次历史轨
- 保留：主卡、纸栈、composer；**若 DocSession 已 ready，保留 split/peek 陪读面**（材料算专注的一部分）
- 非 OS/Tauri 窗口全屏

## PEL-156 文档陪读面（中栏）

- 中栏在 `focus` 且 `DocSession.ready` 时可 **分栏**：探究卡 | 只读 DocPane（默认 split）。
- layout：`split` | `doc-wide` | `peek` —— 详见 `doc-session-fsm.md`。
- **进 map：DocSession → closed**（与卡退出再挂 Orbit 同一硬规则：禁止三层叠）。
- 文档 **不是** 卡 PiP；可与卡 PiP 并存，但独立状态机。
- 打开入口（实现波次定 UI）：作曲区 / 命令 / 卡工具；路径须在当前 vault 内。

## PEL-150 拖动 = **切换卡片**

### Explore 实际（勿当 Soit 规格照抄）

- Header 拖动 **不是** 上下左右选邻居。有父卡时：过阈值（mouse≈6 / touch≈10）后揭起 **半尺寸 compare 浮卡**，同时 `setCurrentCard(parent)`。
- 拖动方向只带动浮卡位置，不决定子/兄弟。
- 子/发散/分支切换主要靠右栏节点图 + 创建钮；fly 动画与拖动手势解耦。
- 祖先纸栈多为装饰（`pointer-events: none`）。

### Soit 落地（有意不同于 Explore）

要的是「拖动切换 + 按住只读小窗」，不是自由摆放、不是多 composer：

| 拖动方向 | 目标 |
|----------|------|
| **上** | 父卡（back） |
| **下** | 优先 deepen 子卡 → diverge 子卡 → **叶节点则发散兄弟** |
| **左 / 右** | 同父兄弟循环 |

| 手势 | 效果 |
|------|------|
| **甩开（flick）** | 过阈值 / 足够速度 → 直接 `focusNode` |
| **拖住约 0.45s** | 当前卡 **FLIP 成更大 YouTube 式 PiP**（拖动处落点、视口 clamp、可拖）；舞台切到下一张 |
| **PiP 放大** | 动画后 focus 回 PiP 卡，全尺寸 |
| **PiP 关闭** | 动画卸浮窗，舞台 focus 不变 |
| 详见 | `知识库/docs/card-pip-fsm.md` |

| 项 | 约定 |
|----|------|
| 起手 | Header 标题区（`.ic-drag-surface`）；按钮/输入不抢 |
| 进行中 | 主卡跟随指针微移+微旋；未提交松手 **弹回** |
| 纸栈 | s1/s2 近两代祖先标题；**可点**回退 |
| 不做 | 任意坐标停住；多窗可聊；Explore 第三种「分支」卡 |

## PEL-153 动效同步

- `--motion-focus: 0.32s` 对齐主卡 enter 与 FocusOrbit 相机。
- `inferFocusNavKind` 在未显式设 kind 时从树/边推断。
