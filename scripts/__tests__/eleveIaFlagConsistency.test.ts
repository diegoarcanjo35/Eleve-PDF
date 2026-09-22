import { describe, expect, it } from "vitest";
import { checkEleveIaFlagConsistency } from "../eleveIaFlagConsistency";

describe("checkEleveIaFlagConsistency (Sprint 01H.1)", () => {
  it("1. backend=false + frontend=false → válido, desligada", () => {
    const result = checkEleveIaFlagConsistency("false", "false");
    expect(result.consistent).toBe(true);
    expect(result.state).toBe("desligada");
  });

  it("2. backend ausente + frontend ausente → válido, desligada", () => {
    const result = checkEleveIaFlagConsistency(undefined, undefined);
    expect(result.consistent).toBe(true);
    expect(result.state).toBe("desligada");
  });

  it("3. backend=true + frontend=true → válido, ligada", () => {
    const result = checkEleveIaFlagConsistency("true", "true");
    expect(result.consistent).toBe(true);
    expect(result.state).toBe("ligada");
  });

  it("4. backend=true + frontend=false → inválido", () => {
    const result = checkEleveIaFlagConsistency("true", "false");
    expect(result.consistent).toBe(false);
    expect(result.state).toBe("inconsistente");
    expect(result.message).toMatch(/ELEVE_IA_ENABLED e VITE_ELEVE_IA_ENABLED precisam representar o mesmo estado/);
  });

  it("5. backend=false + frontend=true → inválido", () => {
    const result = checkEleveIaFlagConsistency("false", "true");
    expect(result.consistent).toBe(false);
    expect(result.message).toMatch(/precisam representar o mesmo estado/);
  });

  it("6. backend ausente + frontend=true → inválido", () => {
    const result = checkEleveIaFlagConsistency(undefined, "true");
    expect(result.consistent).toBe(false);
  });

  it("7. backend=true + frontend ausente → inválido", () => {
    const result = checkEleveIaFlagConsistency("true", undefined);
    expect(result.consistent).toBe(false);
  });

  it("8. valores diferentes de \"true\" (ex.: \"1\", \"TRUE\" maiúsculo) contam como desligado — se os dois lados usarem um valor não-\"true\", ainda é consistente (ambos desligados)", () => {
    expect(checkEleveIaFlagConsistency("1", "TRUE").consistent).toBe(true);
  });

  it("8a. mas um valor quase-verdadeiro (\"TRUE\") de um lado só, contra \"true\" exato do outro, é inconsistente — fail-closed não perdoa capitalização", () => {
    expect(checkEleveIaFlagConsistency("TRUE", "true").consistent).toBe(false);
  });

  it("9. mensagem de erro nunca ecoa o valor bruto recebido, só o rótulo ligada/desligada", () => {
    const result = checkEleveIaFlagConsistency("um-valor-qualquer-nao-secreto", "true");
    expect(result.message).not.toContain("um-valor-qualquer-nao-secreto");
  });
});
