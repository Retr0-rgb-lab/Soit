import type { Edge, WorkspaceSnapshot } from "../types";
import { renderAssistantHtml } from "./chat/assistantHtml";

/** Demo edges matching the seeded tree (parentId denormalized). */
const demoEdges: Edge[] = [
  {
    id: "e_c1_c2",
    kind: "deepen",
    fromCardId: "c1",
    toCardId: "c2",
    source: { turnId: "c1_t0", text: "范畴论", markId: undefined },
    actor: "user",
  },
  {
    id: "e_c2_c3",
    kind: "deepen",
    fromCardId: "c2",
    toCardId: "c3",
    source: { turnId: "c2_t0", text: "函子", markId: "函子" },
    actor: "user",
  },
  {
    id: "e_c2_c4",
    kind: "diverge",
    fromCardId: "c2",
    toCardId: "c4",
    source: { turnId: "c2_t0", text: "自然变换", markId: "自然变换" },
    actor: "user",
  },
  {
    id: "e_c2_c5",
    kind: "diverge",
    fromCardId: "c2",
    toCardId: "c5",
    source: { turnId: "c2_t0", text: "伴随" },
    actor: "user",
  },
];

/** In-memory demo universe (mirrors prototype B seed). */
export function demoSnapshot(): WorkspaceSnapshot {
  return {
    source: "demo",
    focusId: "c3",
    nodes: [
      { id: "c1", title: "线性代数基础", parentId: null, kind: "root", unread: false, status: "active" },
      { id: "c2", title: "范畴论入门", parentId: "c1", kind: "deepen", unread: false, status: "active" },
      { id: "c3", title: "函子", parentId: "c2", kind: "deepen", unread: false, status: "active" },
      { id: "c4", title: "自然变换", parentId: "c2", kind: "diverge", unread: true, status: "active" },
      { id: "c5", title: "伴随", parentId: "c2", kind: "diverge", unread: false, status: "active" },
    ],
    edges: demoEdges.map((e) => ({ ...e, source: { ...e.source } })),
    turnsByCardId: {
      c1: [
        {
          id: "c1_t0",
          title: "根卡",
          collapsed: false,
          user: "从线性代数开始。",
          think: "",
          thinkOpen: false,
          aiHtml: renderAssistantHtml(
            "这是宇宙根探究。从这里深挖会进入范畴论。\n\n质量–能量：$E=mc^2$。半份：\n\n$$\\frac{1}{2}$$",
          ),
        },
      ],
      c2: [
        {
          id: "c2_t0",
          title: "入门",
          collapsed: false,
          user: "范畴论怎么接上线性代数？",
          think: "",
          thinkOpen: false,
          aiHtml:
            '对象 ≈ 结构，态射 ≈ 保结构映射。下一步是<span class="mark" data-term="函子" data-mark-id="函子">函子</span>。也可看<span class="mark" data-term="自然变换" data-mark-id="自然变换">自然变换</span>。',
        },
      ],
      c3: [
        {
          id: "c3_t0",
          title: "开场",
          collapsed: true,
          user: "从线性代数过来，先对一下词。",
          think: "对齐背景：向量空间 → 范畴语言。",
          thinkOpen: false,
          aiHtml: "先把对象和态射分开。后面的「函子」只在这两个词站稳之后再谈。",
        },
        {
          id: "c3_t1",
          title: "函子在保什么",
          collapsed: false,
          user: "函子到底在保什么结构？",
          think: "回答要可分叉：函子 / 范畴 / 自然变换 分开。",
          thinkOpen: false,
          aiHtml:
            '一个<span class="mark" data-term="函子" data-mark-id="函子">函子</span>把一个<span class="mark" data-term="范畴" data-mark-id="范畴">范畴</span>里的对象和态射送到另一个范畴，并保住复合与单位。点下划线先选<strong>深挖</strong>或<strong>发散</strong>；不要和<span class="mark" data-term="自然变换" data-mark-id="自然变换">自然变换</span>搅在一起。重生只在本轮，不长新卡。',
        },
      ],
      // Diverge cards start empty (L4); demo edges still back-link to source.
      c4: [
        {
          id: "c4_t0",
          title: "开场",
          collapsed: false,
          user: "自然变换是什么？",
          think: "",
          thinkOpen: false,
          aiHtml: "自然变换是函子之间的态射：在每个对象上给一个箭头，并与态射自然交换。",
        },
      ],
      c5: [
        {
          id: "c5_t0",
          title: "开场",
          collapsed: false,
          user: "伴随呢？",
          think: "",
          thinkOpen: false,
          aiHtml: "伴随是一对函子之间的可逆 Hom 自然同构关系。",
        },
      ],
    },
  };
}
