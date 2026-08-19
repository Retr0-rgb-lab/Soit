# PROTOTYPE — 工作区视觉 + 卡片交互

**问题：** Soit 主工作区骨架，以及 Explore 级卡片交互在 Soit 规则下怎么落。

v5（当前）：B Stack 为主 demo——修布局/重绘 bug，补卡片切换与浮层动效，卡缘按钮与作曲条分层，节点图自动布局。  
视觉仍用暖纸色，**不抄** Explore 粉彩。长卡只认 **深挖 + 发散**。`?debug=1` 显示左下状态条。

| key | 名字 | 在试什么 |
|-----|------|----------|
| A | Workbench | 三栏托盘（轻量） |
| B | Stack | **主 demo**：Explore 交互 × Soit 规则 |
| C | Paper | 编辑式单栏（轻量） |

状态只在内存里。一次性原型，不是 App。

## B 里可点的

- 左栏折叠、换焦点卡、右栏 **节点图** 点换卡  
- 卡头：深挖 / 沉淀标记 / 删（demo 不真删）  
- 卡下沿外：深挖 · 发散  
- 轮次 hover 条：深挖 · 发散 · 收藏轮 · 重生 · 删轮  
- 助手旁：复制文本 / Markdown；用户气泡：复制  
- 下划线：hover 高亮 → 点击浮层 → 浮层上深挖/发散  
- 划词：预览(先选方向) · 引用 · 复制  
- 作曲条在卡外：Enter 换行，Ctrl+Enter 发送  

## 在 Windows 里看

```bash
python 知识库/design/serve.py
```

- http://127.0.0.1:8765/prototype-workspace.html?variant=B（端口被占时用 `SOIT_PROTO_PORT=8766`）  
- 右上角切换条或键盘 `←` `→` 切变体  


探查依据：`知识库/docs/explore-card-interaction.md`、`explore-probe.md`。
