import { afterEach, describe, expect, it, vi } from "vitest";

describe("ELEVE_IA_ENABLED (frontend, Sprint 01H) — só cosmético, fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("1. desligada quando VITE_ELEVE_IA_ENABLED está ausente", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const { ELEVE_IA_ENABLED } = await import("../featureFlags");
    expect(ELEVE_IA_ENABLED).toBe(false);
  });

  it("2. desligada para qualquer valor diferente de \"true\"", async () => {
    vi.stubEnv("VITE_ELEVE_IA_ENABLED", "1");
    vi.resetModules();
    const { ELEVE_IA_ENABLED } = await import("../featureFlags");
    expect(ELEVE_IA_ENABLED).toBe(false);
  });

  it("3. ligada somente quando explicitamente \"true\"", async () => {
    vi.stubEnv("VITE_ELEVE_IA_ENABLED", "true");
    vi.resetModules();
    const { ELEVE_IA_ENABLED } = await import("../featureFlags");
    expect(ELEVE_IA_ENABLED).toBe(true);
  });
});
