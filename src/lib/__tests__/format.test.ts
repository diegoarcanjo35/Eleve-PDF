import { describe, expect, it } from "vitest";
import {
  bytesFromUnit,
  formatBytes,
  formatPercent,
  isReductionSignificant,
  reductionStats,
} from "../format";

describe("formatBytes", () => {
  it("formats bytes below 1 KB", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.00 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("bytesFromUnit", () => {
  it("converts KB to bytes", () => {
    expect(bytesFromUnit(10, "KB")).toBe(10240);
  });

  it("converts MB to bytes", () => {
    expect(bytesFromUnit(1, "MB")).toBe(1048576);
  });
});

describe("reductionStats", () => {
  it("computes reduced bytes and percent", () => {
    const { reducedBytes, reducedPercent } = reductionStats(1000, 750);
    expect(reducedBytes).toBe(250);
    expect(reducedPercent).toBe(25);
  });

  it("never reports negative reduction", () => {
    const { reducedBytes } = reductionStats(500, 600);
    expect(reducedBytes).toBe(0);
  });
});

describe("formatPercent", () => {
  it("formats with one decimal by default", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
  });
});

describe("isReductionSignificant", () => {
  it("is false below the threshold", () => {
    expect(isReductionSignificant(1)).toBe(false);
  });

  it("is true at or above the threshold", () => {
    expect(isReductionSignificant(3)).toBe(true);
    expect(isReductionSignificant(40)).toBe(true);
  });
});
