/**
 * @camilooscargbaptista/nexus-core — BR Validators
 *
 * Validação de documentos brasileiros: CPF, CNPJ, CEP.
 * Algoritmos puros, zero dependências externas.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  formatted: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// CPF
// ═══════════════════════════════════════════════════════════════

/**
 * Valida um CPF brasileiro.
 * Aceita com ou sem formatação (123.456.789-09 ou 12345678909).
 */
export function validateCPF(cpf: string): ValidationResult {
  const digits = cpf.replace(/\D/g, "");

  if (digits.length !== 11) {
    return { valid: false, formatted: cpf, error: "CPF must have 11 digits" };
  }

  // Reject all same digits (e.g. 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) {
    return { valid: false, formatted: formatCPF(digits), error: "CPF with all identical digits is invalid" };
  }

  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]!, 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9]!, 10)) {
    return { valid: false, formatted: formatCPF(digits), error: "Invalid CPF check digit" };
  }

  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]!, 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[10]!, 10)) {
    return { valid: false, formatted: formatCPF(digits), error: "Invalid CPF check digit" };
  }

  return { valid: true, formatted: formatCPF(digits) };
}

/**
 * Formata CPF: 12345678909 → 123.456.789-09
 */
export function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// ═══════════════════════════════════════════════════════════════
// CNPJ
// ═══════════════════════════════════════════════════════════════

/**
 * Valida um CNPJ brasileiro.
 * Aceita com ou sem formatação (12.345.678/0001-95 ou 12345678000195).
 */
export function validateCNPJ(cnpj: string): ValidationResult {
  const digits = cnpj.replace(/\D/g, "");

  if (digits.length !== 14) {
    return { valid: false, formatted: cnpj, error: "CNPJ must have 14 digits" };
  }

  // Reject all same digits
  if (/^(\d)\1{13}$/.test(digits)) {
    return { valid: false, formatted: formatCNPJ(digits), error: "CNPJ with all identical digits is invalid" };
  }

  // First check digit
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]!, 10) * weights1[i]!;
  }
  let remainder = sum % 11;
  const check1 = remainder < 2 ? 0 : 11 - remainder;
  if (check1 !== parseInt(digits[12]!, 10)) {
    return { valid: false, formatted: formatCNPJ(digits), error: "Invalid CNPJ check digit" };
  }

  // Second check digit
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]!, 10) * weights2[i]!;
  }
  remainder = sum % 11;
  const check2 = remainder < 2 ? 0 : 11 - remainder;
  if (check2 !== parseInt(digits[13]!, 10)) {
    return { valid: false, formatted: formatCNPJ(digits), error: "Invalid CNPJ check digit" };
  }

  return { valid: true, formatted: formatCNPJ(digits) };
}

/**
 * Formata CNPJ: 12345678000195 → 12.345.678/0001-95
 */
export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// ═══════════════════════════════════════════════════════════════
// CEP
// ═══════════════════════════════════════════════════════════════

/**
 * Valida um CEP brasileiro.
 * Aceita com ou sem formatação (01310-100 ou 01310100).
 */
export function validateCEP(cep: string): ValidationResult {
  const digits = cep.replace(/\D/g, "");

  if (digits.length !== 8) {
    return { valid: false, formatted: cep, error: "CEP must have 8 digits" };
  }

  // CEP cannot be all zeros
  if (digits === "00000000") {
    return { valid: false, formatted: formatCEP(digits), error: "CEP cannot be all zeros" };
  }

  return { valid: true, formatted: formatCEP(digits) };
}

/**
 * Formata CEP: 01310100 → 01310-100
 */
export function formatCEP(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return cep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
