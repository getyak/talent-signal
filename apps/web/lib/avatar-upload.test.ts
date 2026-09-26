// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { prepareAvatarUpload } from "./avatar-upload";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("rejects unsupported or oversized photos before decoding", async () => {
  const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
  await expect(prepareAvatarUpload(new File(["svg"], "photo.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPG");
  const large = new File(["image"], "photo.png", { type: "image/png" });
  Object.defineProperty(large, "size", { value: 8 * 1024 * 1024 + 1 });
  await expect(prepareAvatarUpload(large)).rejects.toThrow("8 MB");
  expect(decode).not.toHaveBeenCalled();
});
it("centers the crop, re-encodes bounded output and releases the decoded source", async () => {
  const bitmap = { width: 800, height: 400, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,AAAA");
  expect(await prepareAvatarUpload(new File(["image"], "photo.png", { type: "image/png" }))).toBe("data:image/webp;base64,AAAA");
  expect(drawImage).toHaveBeenCalledWith(bitmap, 200, 0, 400, 400, 0, 0, 192, 192);
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it("explains a decoding failure without exposing the browser's technical error", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("The source image could not be decoded.")));
  await expect(prepareAvatarUpload(new File(["corrupt"], "photo.png", { type: "image/png" }))).rejects.toThrow("图片无法读取");
});
it("releases decoded pixels when the image dimensions are excessive", async () => {
  const bitmap = { width: 10000, height: 10000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  await expect(prepareAvatarUpload(new File(["image"], "photo.png", { type: "image/png" }))).rejects.toThrow("尺寸过大");
  expect(bitmap.close).toHaveBeenCalledOnce();
});
