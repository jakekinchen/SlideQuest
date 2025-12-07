import { describe, it, expect } from "vitest";
import { isLightColor, getBgClass, getBgStyle } from "@/lib/slideColors";

describe("slideColors", () => {
  it("detects light colors correctly", () => {
    expect(isLightColor("white")).toBe(true);
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#fff")).toBe(true);
    expect(isLightColor("#f12345")).toBe(true);
    expect(isLightColor("#c23456")).toBe(true);
    expect(isLightColor("#a23456")).toBe(false);
    expect(isLightColor("zinc")).toBe(false);
  });

  it("returns appropriate background classes", () => {
    expect(getBgClass("blue")).toBe("bg-blue-800");
    expect(getBgClass("ZINC")).toBe("bg-zinc-800");
    expect(getBgClass("unknown-color")).toBe("bg-zinc-800");
    expect(getBgClass("#123456")).toBe("");
  });

  it("returns background styles for hex colors", () => {
    expect(getBgStyle("#ff0000")).toEqual({ backgroundColor: "#ff0000" });
    expect(getBgStyle("blue")).toEqual({});
  });
});

