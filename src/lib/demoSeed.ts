import type { WorkspaceSnapshot } from "../types";

/** In-memory demo universe (mirrors prototype B seed). */
export function demoSnapshot(): WorkspaceSnapshot {
  return {
    source: "demo",
    focusId: "c3",
    nodes: [
      { id: "c1", title: "线性代数基础", parentId: null, kind: "root", unread: false },
      { id: "c2", title: "范畴论入门", parentId: "c1", kind: "deepen", unread: false },
      { id: "c3", title: "函子", parentId: "c2", kind: "deepen", unread: false },
      { id: "c4", title: "自然变换", parentId: "c2", kind: "diverge", unread: true },
      { id: "c5", title: "伴随", parentId: "c2", kind: "diverge", unread: false },
    ],
    turnsByCardId: {
      c1: [
        {
          id: "t0",
          title: "根卡",
          collapsed: false,
          user: "从线性代数开始。",
          think: "",
          thinkOpen: false,
          aiHtml: "这是宇宙根探究。从这里深挖会进入范畴论。",
        },
      ],
      c2: [
        {
          id: "t0",
          title: "入门",
          collapsed: false,
          user: "范畴论怎么接上线性代数？",
          think: "",
          thinkOpen: false,
          aiHtml:
            '对象 ≈ 结构，态射 ≈ 保结构映射。下一步是<span class="mark" data-term="函子">函子</span>。',
        },
      ],
      c3: [
        {
          id: "t0",
          title: "开场",
          collapsed: true,
          user: "从线性代数过来，先对一下词。",
          think: "对齐背景：向量空间 → 范畴语言。",
          thinkOpen: false,
          aiHtml: "先把对象和态射分开。后面的「函子」只在这两个词站稳之后再谈。",
        },
        {
          id: "t1",
          title: "函子在保什么",
          collapsed: false,
          user: "函子到底在保什么结构？",
          think: "回答要可分叉：函子 / 范畴 / 自然变换 分开。",
          thinkOpen: false,
          aiHtml:
            '一个<span class="mark" data-term="函子">函子</span>把一个<span class="mark" data-term="范畴">范畴</span>里的对象和态射送到另一个范畴，并保住复合与单位。点下划线先选<strong>深挖</strong>或<strong>发散</strong>；不要和<span class="mark" data-term="自然变换">自然变换</span>搅在一起。重生只在本轮，不长新卡。',
        },
      ],
      c4: [
        {
          id: "t0",
          title: "平行线",
          collapsed: false,
          user: "自然变换是另一条线。",
          think: "",
          thinkOpen: false,
          aiHtml: "发散卡：空白对话 + 回边。父卡「范畴论入门」仍活着。",
        },
      ],
      c5: [
        {
          id: "t0",
          title: "平行线",
          collapsed: false,
          user: "伴随呢？",
          think: "",
          thinkOpen: false,
          aiHtml: "又一条发散。树是关系，不是强制暂停父卡。",
        },
      ],
    },
  };
}
