/**
 * @fileOverview Utilidades para generación y parseo de códigos de barras EAN-13.
 * Especializado en productos de peso variable (Prefijo 22 y 24).
 * Ajustado para precisión de 3 decimales (divisor 1,000) según estándar de balanza solicitado.
 */

/**
 * Calcula el dígito verificador (checksum) para un código EAN-13.
 */
export function calculateEan13Checksum(code: string): number {
  if (code.length !== 12) return 0;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    // Posiciones pares (0, 2, 4...) * 1, Posiciones impares (1, 3, 5...) * 3
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Parsea un código EAN-13 de peso variable.
 * Maneja tanto 13 dígitos como 14 (con cero inicial del escáner).
 * @returns Un objeto con el identificador y el peso extraído con 3 decimales.
 */
export function parseVariableWeightBarcode(input: string) {
  // Limpiar espacios y ceros iniciales de relleno del escáner (EAN-14)
  let barcode = input.trim();
  
  // Si tiene 14 dígitos y empieza con 0, es un EAN-13 con prefijo de país 0 (EEUU/Canadá) o relleno de escáner
  if (barcode.length === 14 && barcode.startsWith("0")) {
    barcode = barcode.substring(1);
  }

  // Aceptar códigos de 13 dígitos (estándar EAN-13)
  if (barcode.length !== 13) return null;
  
  // PREFIJO 22: Lógica de 7 dígitos para el artículo (ej: 2200043)
  if (barcode.startsWith("22")) {
    // 2200043 (7 dígitos) + 00462 (5 dígitos de peso) + 3 (1 dígito checksum)
    const articleCode = barcode.substring(0, 7);
    const weightRaw = parseInt(barcode.substring(7, 12));
    const weight = weightRaw / 1000; // Ejemplo: 00462 / 1000 = 0.462 lbs
    return { articleCode, weight, type: 'article' as const };
  }
  
  // PREFIJO 24: Lógica de identificación por PLU
  if (barcode.startsWith("24")) {
    // Intentar formato estándar: 24 + PLU(5) + PESO(5) + C(1)
    const plu = parseInt(barcode.substring(2, 7));
    const weightRaw = parseInt(barcode.substring(7, 12));
    const weight = weightRaw / 1000; 
    return { plu, weight, type: 'plu' as const };
  }
  
  return null;
}
