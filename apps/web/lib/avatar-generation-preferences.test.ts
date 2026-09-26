import { describe, expect, it } from "vitest";
import { createAvatarStore } from "./avatar-preferences";
import type { AvatarPreference } from "./avatar";

describe("generated avatar persistence", () => {
  it("rejects unbounded or non-UUID seeds instead of retaining arbitrary input", () => {
    const values = new Map<string, string>();
    const disk = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const store = createAvatarStore("seed-fixture", () => disk);
    for (const seed of ["", "person@example.test", "x".repeat(10000), 123]) {
      expect(() => store.save("self", { style: "shapes", seed } as unknown as AvatarPreference)).toThrow();
      disk.setItem(store.key, JSON.stringify({ defaultStyle: "initials", people: { self: { style: "shapes", seed } } }));
      store.refresh();
      expect(store.getSnapshot().people.self).toBeUndefined();
    }
  });
});
