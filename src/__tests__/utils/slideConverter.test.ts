import { describe, it, expect } from "vitest";
import {
  SUPPORTED_FILE_TYPES,
  getAcceptedFileTypes,
  isImageFile,
  isPdfFile,
  isPowerPointFile,
  isKeynoteFile,
} from "@/utils/slideConverter";

function createFile(name: string, type: string): File {
  return new File(["dummy"], name, { type });
}

describe("slideConverter utility helpers", () => {
  it("exposes supported file types", () => {
    expect(Object.keys(SUPPORTED_FILE_TYPES)).toContain("image/png");
    expect(Object.keys(SUPPORTED_FILE_TYPES)).toContain("application/pdf");
  });

  it("builds accepted file types string", () => {
    const accepted = getAcceptedFileTypes();
    expect(accepted).toContain(".png");
    expect(accepted).toContain(".pdf");
    expect(accepted).toContain("image/png");
    expect(accepted).toContain("application/pdf");
  });

  it("detects image files", () => {
    expect(isImageFile(createFile("image.png", "image/png"))).toBe(true);
    expect(isImageFile(createFile("doc.pdf", "application/pdf"))).toBe(
      false,
    );
  });

  it("detects PDF files", () => {
    expect(
      isPdfFile(createFile("doc.pdf", "application/pdf")),
    ).toBe(true);
    expect(
      isPdfFile(createFile("doc.PDF", "application/octet-stream")),
    ).toBe(true);
    expect(
      isPdfFile(createFile("image.png", "image/png")),
    ).toBe(false);
  });

  it("detects PowerPoint files", () => {
    expect(
      isPowerPointFile(
        createFile(
          "slides.pptx",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
      ),
    ).toBe(true);
    expect(
      isPowerPointFile(
        createFile("slides.ppt", "application/vnd.ms-powerpoint"),
      ),
    ).toBe(true);
    expect(
      isPowerPointFile(
        createFile("slides.pptx", "application/octet-stream"),
      ),
    ).toBe(true);
    expect(
      isPowerPointFile(createFile("doc.pdf", "application/pdf")),
    ).toBe(false);
  });

  it("detects Keynote files", () => {
    expect(
      isKeynoteFile(
        createFile("talk.key", "application/x-iwork-keynote-sffkey"),
      ),
    ).toBe(true);
    expect(
      isKeynoteFile(
        createFile("talk.key", "application/vnd.apple.keynote"),
      ),
    ).toBe(true);
    expect(
      isKeynoteFile(
        createFile("talk.key", "application/octet-stream"),
      ),
    ).toBe(true);
    expect(
      isKeynoteFile(createFile("doc.pdf", "application/pdf")),
    ).toBe(false);
  });
});

