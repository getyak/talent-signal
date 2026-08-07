import { describe, expect, it } from "vitest";

import { extractDocument } from "./documentExtraction";

describe("bounded document extraction", () => {
  it("keeps plain-text paragraphs addressable without inventing pages", async () => {
    const file = new File(
      [
        "VP Product at Example Co.\n\nLed a 12-person product team.\n\nhttps://example.com/portfolio",
      ],
      "candidate-resume.txt",
      { type: "text/plain" },
    );

    const result = await extractDocument(
      file,
      "web-resource:11111111-1111-4111-8111-111111111111",
    );

    expect(result.fragments).toHaveLength(3);
    expect(result.fragments[0]).toMatchObject({
      kind: "document_text",
      locator: {
        kind: "document_text",
        paragraph: 1,
      },
      review_status: "proposed",
      attribution: {
        actor_kind: "document_author",
        status: "proposed",
      },
    });
    expect(result.links).toEqual(["https://example.com/portfolio"]);
    expect(result.content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an empty document instead of creating a ready resource", async () => {
    const file = new File([" \n\n "], "empty.txt", {
      type: "text/plain",
    });

    await expect(
      extractDocument(
        file,
        "web-resource:22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow("No readable text");
  });
});
