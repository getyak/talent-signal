import { describe, expect, it } from "vitest";
import { createAvatarStore } from "./avatar-preferences";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("local avatar preference boundary", () => {
  it("survives reload, isolates account and person IDs, and resets to the current default", () => {
    const disk = storage();
    const a = createAvatarStore("account-a", () => disk);
    a.save("person:one", { style: "glass" });
    a.setDefault("shapes");
    expect(createAvatarStore("account-a", () => disk).getSnapshot().people["person:one"]).toEqual({ style: "glass" });
    expect(createAvatarStore("account-b", () => disk).getSnapshot().people["person:one"]).toBeUndefined();
    expect(a.getSnapshot().people["person:two"]).toBeUndefined();
    a.save("person:one", undefined);
    expect(a.getSnapshot()).toEqual({ defaultStyle: "shapes", people: {} });
    a.clear();
    expect(createAvatarStore("account-a", () => disk).getSnapshot()).toEqual({ defaultStyle: "initials", people: {} });
  });

  it("does not report a failed write as saved", () => {
    const a = createAvatarStore("account-a", () => ({ ...storage(), setItem: () => { throw new Error("quota"); } }));
    expect(() => a.save("self", { style: "glass" })).toThrow();
    expect(a.getSnapshot().people.self).toBeUndefined();
  });

  it("rejects untrusted stored URLs, invalid styles and prototype keys", () => {
    const disk = storage();
    const a = createAvatarStore("account-a", () => disk);
    expect(() => a.save("self", { style: "auto", photo: "https://tracker.test/a" })).toThrow();
    expect(() => a.save("__proto__", { style: "shapes" })).toThrow();
    disk.setItem(a.key, JSON.stringify({ defaultStyle: "initials", people: { self: { style: "auto", photo: "https://tracker.test/a" }, "person:one": { style: "glass" }, "person:two": { style: "invalid" } } }));
    a.refresh();
    expect(a.getSnapshot().people).toEqual({ "person:one": { style: "glass" } });
  });

  it("reads browser storage once per notification, not once per avatar", () => {
    let reads = 0;
    const disk = storage();
    const a = createAvatarStore("account-a", () => ({ ...disk, getItem: key => { reads++; return disk.getItem(key); } }));
    for (let i = 0; i < 1000; i++) a.getSnapshot();
    expect(reads).toBe(1);
    disk.setItem(a.key, JSON.stringify({ defaultStyle: "glass", people: {} }));
    a.refresh();
    expect(a.getSnapshot().defaultStyle).toBe("glass");
    expect(reads).toBe(2);
  });
});
