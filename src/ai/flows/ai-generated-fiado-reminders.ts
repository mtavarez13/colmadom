'use server';
/**
 * @fileOverview Un agente de IA para generar recordatorios de 'Fiado' personalizados y educados en español.
 *
 * - generateFiadoReminders - Función que maneja el proceso de generación de recordatorios.
 * - FiadoReminderInput - El tipo de entrada para la función.
 * - FiadoReminderOutput - El tipo de retorno de la función.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Esquema de Entrada
const FiadoReminderInputSchema = z.object({
  customerName: z.string().describe("El nombre del cliente con un balance de 'Fiado' pendiente."),
  overdueAmount: z.number().positive().describe("El monto total adeudado en pesos dominicanos (DOP)."),
  overdueDays: z.number().int().positive().describe("La cantidad de días que el balance ha estado pendiente."),
  colmadoName: z.string().describe("El nombre del 'Colmado' que envía el recordatorio."),
  lastInteractionNotes: z.string().optional().describe("Notas opcionales sobre la última interacción con el cliente."),
});
export type FiadoReminderInput = z.infer<typeof FiadoReminderInputSchema>;

// Esquema de Salida
const FiadoReminderOutputSchema = z.object({
  smsTemplate: z.string().describe("Una plantilla de mensaje de SMS/WhatsApp educada y personalizada en español."),
  inPersonScript: z.string().describe("Un guion para una conversación en persona con el cliente en español."),
  emailTemplate: z.string().describe("Una plantilla de correo electrónico educada y personalizada en español."),
  suggestedTone: z.string().describe("Una sugerencia breve sobre el tono general a adoptar (ej. 'Amigable y comprensivo', 'Firme pero respetuoso')."),
});
export type FiadoReminderOutput = z.infer<typeof FiadoReminderOutputSchema>;

// Función envolvente
export async function generateFiadoReminders(input: FiadoReminderInput): Promise<FiadoReminderOutput> {
  return fiadoReminderFlow(input);
}

// Definición del prompt
const fiadoReminderPrompt = ai.definePrompt({
  name: 'fiadoReminderPrompt',
  input: { schema: FiadoReminderInputSchema },
  output: { schema: FiadoReminderOutputSchema },
  prompt: `Eres un asistente de IA experto en comunicación para dueños de Colmados en la República Dominicana.
Tu objetivo es generar recordatorios de pago para clientes que tienen deudas de 'Fiado', manteniendo siempre una relación cercana y respetuosa.

DEBES GENERAR TODA LA SALIDA EN ESPAÑOL.

Datos del Cliente:
Nombre: {{{customerName}}}
Monto Pendiente: RD\${{{overdueAmount}}}
Días de Atraso: {{{overdueDays}}} días
Nombre del Negocio: {{{colmadoName}}}
{{#if lastInteractionNotes}}
Notas de última interacción: {{{lastInteractionNotes}}}
{{/if}}

Por favor proporciona:
1. Una plantilla para SMS o WhatsApp (directa y clara).
2. Un guion breve para hablar en persona (natural y empático).
3. Una plantilla para correo electrónico (un poco más formal).
4. El tono sugerido para la comunicación.

Asegúrate de que los mensajes suenen dominicanos pero profesionales, usando frases como "pasar por aquí", "ponernos al día" o "darle una mano con su cuenta". Evita sonar agresivo o legalista; el objetivo es cobrar manteniendo la confianza del barrio.`,
});

// Definición del flujo de Genkit
const fiadoReminderFlow = ai.defineFlow(
  {
    name: 'fiadoReminderFlow',
    inputSchema: FiadoReminderInputSchema,
    outputSchema: FiadoReminderOutputSchema,
  },
  async (input) => {
    const { output } = await fiadoReminderPrompt(input);
    return output!;
  }
);
