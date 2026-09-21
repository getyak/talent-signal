// @vitest-environment happy-dom
//
// Image handoff on the shared composer: a dropped or pasted image batch reaches
// `onFiles` untouched, while plain text paste, text-only clipboard data and the
// draft itself are never hijacked. Directory and unsupported drops surface an
// actionable error instead of navigating away.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceComposer } from "@/components/workspace-composer";

let mount: HTMLDivElement | null = null;
let root: Root | null = null;

function imageFile(name = "a.png", type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function transfer(overrides: {
  files?: File[];
  items?: Array<{ kind: string }>;
  types?: string[];
}): unknown {
  return {
    files: overrides.files ?? [],
    items: overrides.items ?? [],
    types: overrides.types ?? [],
  };
}

function nativeEvent(
  type: string,
  property: "dataTransfer" | "clipboardData",
  value: unknown,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, property, { value });
  return event;
}

async function render(
  overrides: Partial<Parameters<typeof WorkspaceComposer>[0]> = {},
): Promise<void> {
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
  await act(async () => {
    root?.render(
      createElement(WorkspaceComposer, {
        id: "composer",
        label: "消息",
        value: "已有草稿",
        maxLength: 1_000,
        placeholder: "输入",
        variant: "home",
        canSubmit: false,
        binding: null,
        onValueChange: () => {},
        onSubmit: () => {},
        onNavigate: () => {},
        ...overrides,
      }),
    );
  });
}

function composerRoot(): HTMLElement {
  return document.querySelector("[data-variant]")!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  mount?.remove();
  mount = null;
  vi.unstubAllGlobals();
});

describe("composer image intake", () => {
  it("hands pasted images to onFiles without touching the draft", async () => {
    const onFiles = vi.fn();
    const onValueChange = vi.fn();
    await render({ onFiles, onValueChange });
    const file = imageFile();
    const textarea = document.querySelector("textarea")!;
    const paste = nativeEvent("paste", "clipboardData", {
      items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      getData: () => "",
    });
    await act(async () => {
      textarea.dispatchEvent(paste);
    });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toEqual([file]);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(textarea.value).toBe("已有草稿");
  });

  it("leaves text-only paste to the normal draft path", async () => {
    const onFiles = vi.fn();
    await render({ onFiles });
    const textarea = document.querySelector("textarea")!;
    const paste = nativeEvent("paste", "clipboardData", {
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
      getData: () => "普通文字",
    });
    await act(async () => {
      textarea.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("does not intercept image paste when no intake is wired", async () => {
    await render();
    const textarea = document.querySelector("textarea")!;
    const paste = nativeEvent("paste", "clipboardData", {
      items: [
        { kind: "file", type: "image/png", getAsFile: () => imageFile() },
      ],
      getData: () => "",
    });
    await act(async () => {
      textarea.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(false);
  });

  it("accepts a dropped image batch and shows a drag affordance", async () => {
    const onFiles = vi.fn();
    await render({ onFiles });
    const file = imageFile("b.jpg", "image/jpeg");
    const dragEnter = nativeEvent(
      "dragenter",
      "dataTransfer",
      transfer({ files: [file], types: ["Files"] }),
    );
    await act(async () => {
      composerRoot().dispatchEvent(dragEnter);
    });
    expect(composerRoot().dataset.dragging).toBe("true");
    expect(document.body.textContent).toContain("松开后保存并整理图片");

    const drop = nativeEvent(
      "drop",
      "dataTransfer",
      transfer({ files: [file], types: ["Files"] }),
    );
    await act(async () => {
      composerRoot().dispatchEvent(drop);
    });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(composerRoot().dataset.dragging).toBeUndefined();
  });

  it("refuses a directory drop with a useful message and no navigation", async () => {
    const onFiles = vi.fn();
    await render({ onFiles });
    const drop = nativeEvent(
      "drop",
      "dataTransfer",
      transfer({ files: [], items: [{ kind: "file" }], types: ["Files"] }),
    );
    await act(async () => {
      composerRoot().dispatchEvent(drop);
    });
    expect(onFiles).not.toHaveBeenCalled();
    expect(drop.defaultPrevented).toBe(true);
    expect(document.body.textContent).toContain("暂不支持文件夹");
  });

  it("refuses an unsupported or oversize batch as a whole", async () => {
    const onFiles = vi.fn();
    await render({ onFiles });
    const drop = nativeEvent(
      "drop",
      "dataTransfer",
      transfer({
        files: [imageFile("vector.gif", "image/gif")],
        types: ["Files"],
      }),
    );
    await act(async () => {
      composerRoot().dispatchEvent(drop);
    });
    expect(onFiles).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("PNG、JPEG 或 WebP");
  });
});
