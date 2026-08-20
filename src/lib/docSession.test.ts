import { describe, expect, it } from "vitest";
import {
  initialDocSession,
  reduceDocSession,
  type DocRef,
  type DocSessionState,
} from "./docSession";

const mdRef: DocRef = {
  pathRel: "notes/a.md",
  displayName: "a.md",
  kind: "md",
  size: 12,
};

function openLoading(
  path = "notes/a.md",
  boundCardId: string | null | undefined = "c1",
): DocSessionState {
  return reduceDocSession(initialDocSession(), {
    type: "open",
    path,
    boundCardId,
  });
}

describe("initialDocSession", () => {
  it("starts closed with split layout and epoch 0", () => {
    const s = initialDocSession();
    expect(s.status).toBe("closed");
    expect(s.layout).toBe("split");
    expect(s.epoch).toBe(0);
    expect(s.ref).toBeNull();
    expect(s.textContent).toBeNull();
    expect(s.requestPath).toBeNull();
    expect(s.error).toBeNull();
    expect(s.boundCardId).toBeNull();
  });
});

describe("reduceDocSession", () => {
  it("open → loading and bumps epoch", () => {
    const s = openLoading("docs/x.md", "card-9");
    expect(s.status).toBe("loading");
    expect(s.epoch).toBe(1);
    expect(s.requestPath).toBe("docs/x.md");
    expect(s.boundCardId).toBe("card-9");
    expect(s.ref).toBeNull();
    expect(s.error).toBeNull();
    expect(s.textContent).toBeNull();
  });

  it("load_ok with matching epoch → ready", () => {
    let s = openLoading();
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: s.epoch,
      ref: mdRef,
      textContent: "# hi",
    });
    expect(s.status).toBe("ready");
    expect(s.ref).toEqual(mdRef);
    expect(s.textContent).toBe("# hi");
    expect(s.error).toBeNull();
  });

  it("load_ok allows null textContent (pdf guide)", () => {
    let s = openLoading("book.pdf");
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: s.epoch,
      ref: { pathRel: "book.pdf", displayName: "book.pdf", kind: "pdf" },
      textContent: null,
    });
    expect(s.status).toBe("ready");
    expect(s.textContent).toBeNull();
    expect(s.ref?.kind).toBe("pdf");
  });

  it("load_err with matching epoch → error", () => {
    let s = openLoading();
    s = reduceDocSession(s, {
      type: "load_err",
      epoch: s.epoch,
      error: "too_large",
    });
    expect(s.status).toBe("error");
    expect(s.error).toBe("too_large");
    expect(s.ref).toBeNull();
    expect(s.textContent).toBeNull();
    expect(s.requestPath).toBe("notes/a.md");
  });

  it("load_ok / load_err ignore stale epoch", () => {
    let s = openLoading();
    const stale = s.epoch;
    s = reduceDocSession(s, {
      type: "open",
      path: "other.md",
      boundCardId: null,
    });
    expect(s.epoch).toBe(stale + 1);
    expect(s.requestPath).toBe("other.md");

    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: stale,
      ref: mdRef,
      textContent: "old",
    });
    expect(s.status).toBe("loading");
    expect(s.ref).toBeNull();

    s = reduceDocSession(s, {
      type: "load_err",
      epoch: stale,
      error: "stale",
    });
    expect(s.status).toBe("loading");
    expect(s.error).toBeNull();
  });

  it("open while loading|ready|error cancels prior epoch", () => {
    let s = openLoading("a.md");
    const e1 = s.epoch;
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: e1,
      ref: mdRef,
      textContent: "a",
    });
    expect(s.status).toBe("ready");

    s = reduceDocSession(s, { type: "open", path: "b.md", boundCardId: "c2" });
    expect(s.status).toBe("loading");
    expect(s.epoch).toBe(e1 + 1);
    expect(s.requestPath).toBe("b.md");
    expect(s.ref).toBeNull();
    expect(s.textContent).toBeNull();
    expect(s.boundCardId).toBe("c2");

    // stale success from first open dropped
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: e1,
      ref: mdRef,
      textContent: "a",
    });
    expect(s.status).toBe("loading");

    s = reduceDocSession(s, {
      type: "load_err",
      epoch: s.epoch,
      error: "io",
    });
    const errEpoch = s.epoch;
    s = reduceDocSession(s, { type: "open", path: "c.md" });
    expect(s.status).toBe("loading");
    expect(s.epoch).toBe(errEpoch + 1);
    expect(s.error).toBeNull();
    expect(s.requestPath).toBe("c.md");
  });

  it("retry from error → loading and reuses requestPath", () => {
    let s = openLoading("retry-me.md");
    s = reduceDocSession(s, {
      type: "load_err",
      epoch: s.epoch,
      error: "io",
    });
    const errEpoch = s.epoch;
    s = reduceDocSession(s, { type: "retry" });
    expect(s.status).toBe("loading");
    expect(s.epoch).toBe(errEpoch + 1);
    expect(s.requestPath).toBe("retry-me.md");
    expect(s.error).toBeNull();
  });

  it("retry is no-op outside error", () => {
    const closed = reduceDocSession(initialDocSession(), { type: "retry" });
    expect(closed).toEqual(initialDocSession());

    let s = openLoading();
    const before = s;
    s = reduceDocSession(s, { type: "retry" });
    expect(s).toEqual(before);
  });

  it("set_layout / rebind / set_cursor only on ready", () => {
    let s = openLoading();
    s = reduceDocSession(s, { type: "set_layout", layout: "peek" });
    expect(s.layout).toBe("split");

    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: s.epoch,
      ref: mdRef,
      textContent: "x",
    });
    s = reduceDocSession(s, { type: "set_layout", layout: "doc-wide" });
    expect(s.layout).toBe("doc-wide");
    s = reduceDocSession(s, { type: "set_layout", layout: "peek" });
    expect(s.layout).toBe("peek");

    s = reduceDocSession(s, { type: "rebind", boundCardId: "c99" });
    expect(s.boundCardId).toBe("c99");
    s = reduceDocSession(s, { type: "rebind", boundCardId: null });
    expect(s.boundCardId).toBeNull();

    s = reduceDocSession(s, { type: "set_cursor", cursor: { page: 3, scrollTop: 40 } });
    expect(s.cursor).toEqual({ page: 3, scrollTop: 40 });
  });

  it("close from ready → closing → closed", () => {
    let s = openLoading();
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: s.epoch,
      ref: mdRef,
      textContent: "body",
    });
    s = reduceDocSession(s, { type: "close" });
    expect(s.status).toBe("closing");
    expect(s.ref).toEqual(mdRef);

    const epochBefore = s.epoch;
    s = reduceDocSession(s, { type: "closed" });
    expect(s.status).toBe("closed");
    expect(s.ref).toBeNull();
    expect(s.textContent).toBeNull();
    expect(s.requestPath).toBeNull();
    expect(s.epoch).toBe(epochBefore + 1);
  });

  it("close from error → closed immediately", () => {
    let s = openLoading();
    s = reduceDocSession(s, {
      type: "load_err",
      epoch: s.epoch,
      error: "denied",
    });
    s = reduceDocSession(s, { type: "close" });
    expect(s.status).toBe("closed");
    expect(s.error).toBeNull();
    expect(s.requestPath).toBeNull();
  });

  it("force_close skips anim and clears session", () => {
    let s = openLoading();
    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: s.epoch,
      ref: mdRef,
      textContent: "body",
    });
    s = reduceDocSession(s, { type: "set_layout", layout: "peek" });
    const epochBefore = s.epoch;
    s = reduceDocSession(s, { type: "force_close" });
    expect(s.status).toBe("closed");
    expect(s.ref).toBeNull();
    expect(s.textContent).toBeNull();
    expect(s.error).toBeNull();
    expect(s.requestPath).toBeNull();
    expect(s.boundCardId).toBeNull();
    expect(s.cursor).toEqual({});
    expect(s.epoch).toBe(epochBefore + 1);
    // layout preference may persist
    expect(s.layout).toBe("peek");
  });

  it("force_close while loading bumps epoch so late load is dropped", () => {
    let s = openLoading();
    const loadEpoch = s.epoch;
    s = reduceDocSession(s, { type: "force_close" });
    expect(s.status).toBe("closed");
    expect(s.epoch).toBe(loadEpoch + 1);

    s = reduceDocSession(s, {
      type: "load_ok",
      epoch: loadEpoch,
      ref: mdRef,
      textContent: "late",
    });
    expect(s.status).toBe("closed");
    expect(s.ref).toBeNull();
  });

  it("close from loading → closing → closed", () => {
    let s = openLoading();
    s = reduceDocSession(s, { type: "close" });
    expect(s.status).toBe("closing");
    s = reduceDocSession(s, { type: "closed" });
    expect(s.status).toBe("closed");
    expect(s.requestPath).toBeNull();
  });
});
