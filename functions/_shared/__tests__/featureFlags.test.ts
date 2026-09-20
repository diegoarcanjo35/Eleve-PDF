import { describe, expect, it } from "vitest";
import { isEleveIaEnabled } from "../featureFlags";

describe("isEleveIaEnabled (backend, Sprint 01H) — fail-closed, fonte de verdade real", () => {
  it("1. desligada quando ELEVE_IA_ENABLED está ausente", () => {
    expect(isEleveIaEnabled({})).toBe(false);
  });

  it("2. desligada para qualquer valor diferente de \"true\"", () => {
    expect(isEleveIaEnabled({ ELEVE_IA_ENABLED: "false" })).toBe(false);
    expect(isEleveIaEnabled({ ELEVE_IA_ENABLED: "1" })).toBe(false);
    expect(isEleveIaEnabled({ ELEVE_IA_ENABLED: "TRUE" })).toBe(false);
  });

  it("3. ligada só quando exatamente \"true\"", () => {
    expect(isEleveIaEnabled({ ELEVE_IA_ENABLED: "true" })).toBe(true);
  });
});
