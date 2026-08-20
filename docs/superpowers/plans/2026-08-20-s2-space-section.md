# Plan S2: SpaceSection + Empty CTA

> **For agentic workers:** only section + EmptyWorkspace; do not rewrite AppShell  
> **Spec:** v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1 · **Parallel OK with:** S1, S3  
> **Owns:** `settings/SpaceSection.tsx`, `EmptyWorkspace.tsx` (CTA only)

---

### Task S2.1: SpaceSection

**Files:**
- Create: `src/components/shell/settings/SpaceSection.tsx`

Implement per Spec §2.2:

```tsx
// open flow
const epoch = beginBootLoad();
setBusy(true);
try {
  if (vaultPath && vaultPath !== path) await closeUniverse();
  const res = await openUniverse(path);
  if (!res.ok) { setError(mapErr(res.error)); return; }
  setVaultPath(res.path);
  if (res.snapshot) loadSnapshot(res.snapshot, epoch);
} finally { setBusy(false); }
```

- [ ] path input, open, use lastVault, clear lastVault, unbind
- [ ] getLastVault on mount / when panel shown (prop `active?: boolean`)
- [ ] map browser error to 需要桌面版
- [ ] show source badge

### Task S2.2: EmptyWorkspace CTA

**Files:**
- Modify: `src/components/shell/EmptyWorkspace.tsx`

- [ ] If !vaultPath: button 打开设置 · 空间 →
```ts
window.dispatchEvent(new CustomEvent("soit:open-settings", { detail: { section: "space" } }));
```
- [ ] Keep create root form when vaultPath set

### Task S2.3: Verify

```bash
npx tsc --noEmit
npm test
```

---

## Acceptance

- [ ] SpaceSection compiles and exports default
- [ ] Empty unbound has settings CTA
- [ ] Uses beginBootLoad + epoch loadSnapshot
