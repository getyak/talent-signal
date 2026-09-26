// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarCropBounds, decodeAvatarUpload, prepareAvatarUpload } from "./avatar-upload";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("bounded local avatar processing", () => {
  it("keeps zoom and positioning within the source pixels for every aspect ratio", () => {
    expect(avatarCropBounds(800, 400, { zoom: 1, x: .5, y: .5 })).toEqual({ x: 200, y: 0, edge: 400 });
    expect(avatarCropBounds(400, 800, { zoom: 2, x: 1, y: 0 })).toEqual({ x: 200, y: 0, edge: 200 });
    for (const width of [1, 400, 800]) for (const height of [1, 400, 800]) {
      const bounds = avatarCropBounds(width, height, { zoom: 99, x: -10, y: 10 });
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.edge).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.edge).toBeLessThanOrEqual(height);
    }
  });

  it("rejects unsupported, empty and oversized files before decoding", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    await expect(decodeAvatarUpload(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPG");
    await expect(decodeAvatarUpload(new File([], "a.png", { type: "image/png" }))).rejects.toThrow("空文件");
    const large = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: 8 * 1024 * 1024 + 1 });
    await expect(decodeAvatarUpload(large)).rejects.toThrow("8 MB");
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports corrupt raster data and releases rejected decoded images", async () => {
    const file = new File(["not a png"], "a.png", { type: "image/png" });
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    await expect(decodeAvatarUpload(file)).rejects.toThrow("无法读取");
    const bitmap = { width: 10000, height: 10000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    await expect(decodeAvatarUpload(file)).rejects.toThrow("尺寸过大");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("releases decoded pixels even when the encoder is unavailable", async () => {
    const bitmap = { width: 600, height: 400, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(prepareAvatarUpload(new File(["x"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow("无法处理");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

it("centers the crop, re-encodes bounded output and releases the decoded source", async () => {
  const bitmap = { width: 800, height: 400, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,AAAA");
  expect(await prepareAvatarUpload(new File(["image"], "photo.png", { type: "image/png" }))).toBe("data:image/webp;base64,AAAA");
  expect(drawImage).toHaveBeenCalledWith(bitmap, 200, 0, 400, 400, 0, 0, 192, 192);
  expect(bitmap.close).toHaveBeenCalledOnce();
});
