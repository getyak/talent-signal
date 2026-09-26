// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createAvatarStore } from "@/lib/avatar-preferences";
import { AvatarPreferencesProvider, useAvatarDisplay } from "./avatar-preferences-provider";

it("updates only the changed person's subscriber after another tab saves", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const renders = new Map<string, number>();
  function Sample({ id }: { id: string }) {
    const { preference, defaultStyle } = useAvatarDisplay(`person:${id}`);
    renders.set(id, (renders.get(id) ?? 0) + 1);
    return <span>{preference?.style ?? defaultStyle}</span>;
  }
  try {
    await act(() => root.render(<AvatarPreferencesProvider scope="performance">
      {Array.from({ length: 100 }, (_, i) => <Sample key={i} id={String(i)} />)}
    </AvatarPreferencesProvider>));
    renders.clear();
    const external = createAvatarStore("performance", () => localStorage);
    await act(() => {
      external.save("person:37", { style: "glass" });
      window.dispatchEvent(new StorageEvent("storage", { key: external.key }));
    });
    expect([...renders.keys()]).toEqual(["37"]);
    expect(host.children[37]?.textContent).toBe("glass");
  } finally { await act(() => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});
