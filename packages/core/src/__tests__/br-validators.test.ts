/**
 * @camilooscargbaptista/nexus-core — BR Validators Tests
 */

import { describe, it, expect } from "@jest/globals";
import {
  validateCPF,
  validateCNPJ,
  validateCEP,
  formatCPF,
  formatCNPJ,
  formatCEP,
} from "../br-validators.js";

describe("CPF Validation", () => {
  it("should validate a correct CPF", () => {
    const result = validateCPF("52998224725");
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe("529.982.247-25");
  });

  it("should validate a formatted CPF", () => {
    const result = validateCPF("529.982.247-25");
    expect(result.valid).toBe(true);
  });

  it("should reject CPF with wrong check digit", () => {
    const result = validateCPF("52998224726");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("check digit");
  });

  it("should reject CPF with all identical digits", () => {
    const result = validateCPF("11111111111");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("identical");
  });

  it("should reject CPF with wrong length", () => {
    const result = validateCPF("1234567");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("11 digits");
  });

  it("should format CPF correctly", () => {
    expect(formatCPF("52998224725")).toBe("529.982.247-25");
  });

  it("should return original for invalid length", () => {
    expect(formatCPF("123")).toBe("123");
  });
});

describe("CNPJ Validation", () => {
  it("should validate a correct CNPJ", () => {
    const result = validateCNPJ("11222333000181");
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe("11.222.333/0001-81");
  });

  it("should validate a formatted CNPJ", () => {
    const result = validateCNPJ("11.222.333/0001-81");
    expect(result.valid).toBe(true);
  });

  it("should reject CNPJ with wrong check digit", () => {
    const result = validateCNPJ("11222333000182");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("check digit");
  });

  it("should reject CNPJ with all identical digits", () => {
    const result = validateCNPJ("11111111111111");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("identical");
  });

  it("should reject CNPJ with wrong length", () => {
    const result = validateCNPJ("123456");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("14 digits");
  });

  it("should format CNPJ correctly", () => {
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("CEP Validation", () => {
  it("should validate a correct CEP", () => {
    const result = validateCEP("01310100");
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe("01310-100");
  });

  it("should validate a formatted CEP", () => {
    const result = validateCEP("01310-100");
    expect(result.valid).toBe(true);
  });

  it("should reject all-zeros CEP", () => {
    const result = validateCEP("00000000");
    expect(result.valid).toBe(false);
  });

  it("should reject CEP with wrong length", () => {
    const result = validateCEP("12345");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("8 digits");
  });

  it("should format CEP correctly", () => {
    expect(formatCEP("01310100")).toBe("01310-100");
  });
});
