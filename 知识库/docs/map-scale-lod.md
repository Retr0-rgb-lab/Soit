# 图谱规模与 LOD（决策备忘）

> 来源：2026-08-19 压力测试思想实验 + Spec v1.1  
> 实现：`src/lib/mapScope.ts`、`GraphCanvas` LOD、Map 工作集默认

## 原则

1. **Map ≠ 全库数据库**，默认是结构切片（工作集 / 焦点锥 / 总览）。
2. **虚化 = opacity + 尺寸 + 标签 LOD**，禁止稳态高斯模糊。
3. **Locus / cone 保留完整祖先链**；压缩只用于面包屑。
4. **宽扇出聚合**；点击聚合展开 cap，不 `focusNode(aggId)`。
5. **Ctrl+K 传送**；空查询不倾倒全库。
6. **未读列表截断**；大 N 用搜索补洞。

## 常量

见 `DEFAULT_MAP_CAPS` / `PALETTE_RESULT_CAP` / `UNREAD_RAIL_CAP`。

## DEV

Map 顶栏仅在 `import.meta.env.DEV` 显示压测种子（fan80 / deep40 / …）。

## 续作（已落地）

| 能力 | 说明 |
|------|------|
| Map pan/zoom | 拖拽平移、滚轮缩放；动态 layout bounds |
| 跟焦 / 全览 | 按钮 + `F` / `0` |
| 生长视图 | scope=`growth` = 本会话 touch |
| 活线 | ≤5；左栏钉/停养；focus 自动 pin 根 |
| 线债 | 未读按 root 聚合；「本线标已读」 |
| 再进入条 | 冷启动/换库后的继续条 |
| 命中区 | 最小 hit radius；未读 pulse ≤3 |
| Map 键盘 | ↑↓/jk 浏览可见点，Enter 打开 |

## 仍不做（产品非目标）

WebGL 粒子宇宙、力导向、稳态高斯模糊、真 LLM、Obsidian 编辑器、universe.db 业务。
