# PROTOTYPE — 工作区视觉方向

**问题：** Soit 的主工作区该用哪种组件骨架（按钮 / 卡片 / 栏位），而不是配色微调。

v3：卡片更大（约 80vh，左右留空）。立体感只用阴影分层，不用凹槽/错位纸。

三个结构不同的变体，底栏或 `?variant=` 切换（默认 B）：

| key | 名字 | 在试什么 |
|-----|------|----------|
| A | Workbench | OpenWork / DSH：三栏、胶囊按钮、会话当列表 |
| B | Stack | Explore：卡片堆叠 + 下划线先选深挖/发散 |
| C | Paper | 编辑式单栏：探究像一篇正在写的文章 |

这是一次性原型，不是 App。状态只在内存里。

## 在 Windows 里看

WSL2 里执行：

```bash
python3 /home/peleclic/workspace/soit/知识库/design/serve.py
```

浏览器打开（一般直接走 Windows 的 localhost）：

- http://127.0.0.1:8765/prototype-workspace.html?variant=A
- http://127.0.0.1:8765/prototype-workspace.html?variant=B
- http://127.0.0.1:8765/prototype-workspace.html?variant=C

如果 `127.0.0.1` 打不开，用脚本打印的 WSL IP。键盘 `←` `→` 切变体。
