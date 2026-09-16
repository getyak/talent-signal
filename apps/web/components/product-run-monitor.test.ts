import { describe, expect, it } from "vitest";
import { screenshotPreprocessingPreview } from "./product-run-monitor";

describe("product run screenshot preprocessing",()=>{
  it("selects only the persisted structured packet",()=>{
    const packet={contract_version:"screenshot-preprocess.v3",sources:[{source_image_index:0}]};
    expect(screenshotPreprocessingPreview({preprocessing:packet,source_images:[{image_index:0}]})).toBe(packet);
    expect(screenshotPreprocessingPreview({summary:"legacy"})).toBeNull();
  });
});
