'use server';
/**
 * @fileOverview Un agente de IA para categorizar productos de colmado automáticamente.
 *
 * - categorizeProduct - Función que maneja el proceso de categorización.
 * - CategorizeProductInput - El tipo de entrada para la función.
 * - CategorizeProductOutput - El tipo de retorno de la función.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Esquema de Entrada
const CategorizeProductInputSchema = z.object({
  productName: z.string().describe("El nombre del producto a categorizar."),
});
export type CategorizeProductInput = z.infer<typeof CategorizeProductInputSchema>;

// Esquema de Salida
const CategorizeProductOutputSchema = z.object({
  category: z.string().describe("La categoría principal del producto."),
  subcategory: z.string().describe("La subcategoría sugerida."),
});
export type CategorizeProductOutput = z.infer<typeof CategorizeProductOutputSchema>;

// Función envolvente
export async function categorizeProduct(input: CategorizeProductInput): Promise<CategorizeProductOutput> {
  return categorizeProductFlow(input);
}

// Definición del prompt con las categorías solicitadas
const categorizeProductPrompt = ai.definePrompt({
  name: 'categorizeProductPrompt',
  input: { schema: CategorizeProductInputSchema },
  output: { schema: CategorizeProductOutputSchema },
  prompt: `Eres un experto en gestión de inventarios para Colmados en la República Dominicana.
Tu tarea es asignar la categoría y subcategoría más adecuada para el producto: "{{{productName}}}"

DEBES USAR EXCLUSIVAMENTE las siguientes categorías y sus subcategorías:

1. Alimentos Básicos: Arroz, Habichuelas, Pastas, Aceites, Harinas, Azúcar y Sal.
2. Víveres y Agrícola: Plátanos/Guineos, Tubérculos (Yuca/Yautía), Vegetales y Frutas.
3. Embutidos y Lácteos: Salami, Jamón, Quesos, Leche, Mantequilla y Yogur.
4. Bebidas con Alcohol: Cervezas, Rones, Whiskies y Vinos.
5. Bebidas sin Alcohol: Refrescos, Agua (Botellones/Unidad), Jugos y Maltas.
6. Desayuno y Merienda: Café, Panadería, Galletas, Cereales y Snacks (Picaderas).
7. Enlatados y Conservas: Salsa de Tomate, Sazón, Atún/Sardinas, Maíz y Guandules.
8. Higiene Personal: Jabón, Pasta Dental, Papel Higiénico, Desodorantes y Afeitado.
9. Limpieza del Hogar: Detergentes, Cloro, Desinfectantes y Lavaplatos.
10. Varios y Misceláneos: Cigarrillos, Carbón, Velas, Fósforos, Pilas y Plásticos.

Si el producto no encaja perfectamente, elige "Varios y Misceláneos".
Responde solo con el JSON que contenga "category" y "subcategory".`,
});

// Definición del flujo de Genkit
const categorizeProductFlow = ai.defineFlow(
  {
    name: 'categorizeProductFlow',
    inputSchema: CategorizeProductInputSchema,
    outputSchema: CategorizeProductOutputSchema,
  },
  async (input) => {
    const { output } = await categorizeProductPrompt(input);
    if (!output) throw new Error('No se pudo categorizar el producto.');
    return output;
  }
);
