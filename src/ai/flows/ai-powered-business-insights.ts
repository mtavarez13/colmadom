'use server';
/**
 * @fileOverview Proporciona insights de negocio generados por IA para dueños de colmados.
 *
 * - getBusinessInsights - Función que genera resúmenes y recomendaciones basadas en datos del negocio.
 * - AiPoweredBusinessInsightsInput - Tipo de entrada para la función.
 * - AiPoweredBusinessInsightsOutput - Tipo de retorno de la función.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AiPoweredBusinessInsightsInputSchema = z.object({
  salesSummary: z
    .string()
    .describe('Un resumen del rendimiento de ventas reciente, incluyendo métricas clave y productos top.'),
  inventorySummary: z
    .string()
    .describe('Un resumen de los niveles actuales de inventario, resaltando stock bajo, exceso de productos y artículos de alta/baja rotación.'),
  fiadoSummary: z
    .string()
    .describe('Un resumen de los estados de deuda de "Fiado", incluyendo total pendiente, principales deudores y antigüedad promedio de la deuda.'),
});
export type AiPoweredBusinessInsightsInput = z.infer<
  typeof AiPoweredBusinessInsightsInputSchema
>;

const AiPoweredBusinessInsightsOutputSchema = z.object({
  salesPerformanceSummary: z.string().describe('Un resumen generado por IA del rendimiento de ventas del colmado.'),
  inventoryStatusSummary: z.string().describe('Un resumen generado por IA del estado actual del inventario.'),
  fiadoDebtSummary: z.string().describe('Un resumen generado por IA de la situación de las deudas de "Fiado".'),
  stockOptimizationRecommendations: z.string().describe('Recomendaciones personalizadas para optimizar los niveles de stock.'),
  pricingAdjustmentRecommendations: z.string().describe('Recomendaciones personalizadas para ajustar los precios de los productos.'),
  debtCollectionRecommendations: z.string().describe('Recomendaciones personalizadas para mejorar el cobro de deudas de "Fiado".'),
  overallActionableInsights: z.string().describe('Insights accionables generales y consejos estratégicos para el dueño del colmado.'),
});
export type AiPoweredBusinessInsightsOutput = z.infer<
  typeof AiPoweredBusinessInsightsOutputSchema
>;

export async function getBusinessInsights(
  input: AiPoweredBusinessInsightsInput
): Promise<AiPoweredBusinessInsightsOutput> {
  return aiPoweredBusinessInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiPoweredBusinessInsightsPrompt',
  input: {schema: AiPoweredBusinessInsightsInputSchema},
  output: {schema: AiPoweredBusinessInsightsOutputSchema},
  prompt: `Eres un experto analista de negocios especializado en operaciones de colmados en la República Dominicana. Tu objetivo es proporcionar resúmenes concisos y recomendaciones accionables basadas en los datos comerciales proporcionados.

DEBES GENERAR TODA LA SALIDA EN ESPAÑOL.

Usa la siguiente información para generar tu análisis:

Resumen de Ventas:
{{{salesSummary}}}

Resumen de Inventario:
{{{inventorySummary}}}

Resumen de "Fiado" (Crédito):
{{{fiadoSummary}}}

Basándote en los datos anteriores, proporciona lo siguiente:

1.  **Resumen de Rendimiento de Ventas**: Una breve descripción del rendimiento de las ventas.
2.  **Resumen del Estado del Inventario**: Una breve descripción de los niveles y el movimiento del inventario.
3.  **Resumen de Deuda de "Fiado"**: Una breve descripción de la situación de la deuda de "Fiado".
4.  **Recomendaciones para Optimización de Stock**: Consejos específicos sobre qué productos pedir más o menos, y cómo gestionar el stock de forma eficiente.
5.  **Recomendaciones para Ajuste de Precios**: Consejos específicos sobre posibles cambios de precios para maximizar el beneficio o liquidar inventario de lento movimiento.
6.  **Recomendaciones para Cobro de Deudas**: Consejos específicos sobre estrategias para mejorar el cobro de deudas de "Fiado", incluyendo la priorización de deudores o métodos de comunicación dominicanos efectivos.
7.  **Información Accionable General**: Proporciona una visión estratégica de los conocimientos más críticos y una o dos recomendaciones generales para que el dueño del colmado haga crecer su negocio.`,
});

const aiPoweredBusinessInsightsFlow = ai.defineFlow(
  {
    name: 'aiPoweredBusinessInsightsFlow',
    inputSchema: AiPoweredBusinessInsightsInputSchema,
    outputSchema: AiPoweredBusinessInsightsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('No se pudieron generar los insights de negocio.');
    }
    return output;
  }
);