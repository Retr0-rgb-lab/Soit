# 卡片栈 · 动效 · 方位图（设计落地备忘）

> 2026-08-20 · 三路 subagent 审查后实现

## 卡片背面（叠层）

- **不要**纯平行等距片；用 **轻微 staggered**：
  - s1: `+10×8px` · `+0.7°` · `scale 0.985` · opacity 0.88
  - s2: `+18×15px` · `−1.1°` · `scale 0.97` · opacity 0.72
- 后层淡边、弱影；前卡唯一 `--e3` 英雄影

## 切卡动画

| 导航 | enter |
|------|--------|
| jump | Y+8 fade |
| deepen | Y+12 微 scale |
| diverge | X+12 微旋 |
| back | Y−8 |

时长 `--motion-card: 0.28s`；换卡时 edge/dock 暂退 opacity。

## 方位图

- **Minimal spine**：小点、淡边、无大阴影、无玻璃 blur
- 默认 **收成窄条**；hover / focus-within / 主区 hover 展开
- 未读：赭色小点，默认不 pulse 海

## 阴影阶梯

`--e0` 工具静息 · `--e1` hover · `--e2` dock/locus · `--e3` 仅焦点卡
