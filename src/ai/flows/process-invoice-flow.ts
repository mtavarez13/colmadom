'use server';
/**
 * @fileOverview Genkit flow for processing supplier invoices and extracting product data, supplier info, and taxes (ITBIS).
 *
 * - processInvoice - Function to handle the invoice scanning process.
 * - ProcessInvoiceInput - The input type (image as data URI).
 * - ProcessInvoiceOutput - The extracted product list, supplier details, and tax information.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ProcessInvoiceInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a supplier invoice, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ProcessInvoiceInput = z.infer<typeof ProcessInvoiceInputSchema>;

const ExtractedItemSchema = z.object({
  name: z.string().describe('The exact name of the product as written on the invoice.'),
  quantity: z.number().describe('The precise quantity purchased.'),
  unitType: z.string().describe('The unit of measurement (e.g., ud, lb, caja, fardo).'),
  costPrice: z.number().describe('The exact unit cost price paid (Net Price per item, excluding ITBIS/taxes).'),
  itbisAmount: z.number().optional().describe('The ITBIS amount paid for this line item if specified.'),
  itbisRate: z.number().optional().describe('The tax rate for this item (e.g., 0.18 for 18%).'),
});

const ProcessInvoiceOutputSchema = z.object({
  items: z.array(ExtractedItemSchema).describe('The list of products extracted from the invoice.'),
  supplierName: z.string().optional().describe('The name of the supplier or company (Razón Social).'),
  supplierRnc: z.string().optional().describe('The RNC of the supplier if found.'),
  invoiceNumber: z.string().optional().describe('The invoice number (NCF or sequence number) if found.'),
  totalNetAmount: z.number().optional().describe('The total net amount (base) of the invoice.'),
  totalItbisAmount: z.number().optional().describe('The total ITBIS amount paid in the invoice.'),
  totalInvoiceAmount: z.number().optional().describe('The total final amount of the invoice (Net + ITBIS).'),
});
export type ProcessInvoiceOutput = z.infer<typeof ProcessInvoiceOutputSchema>;

export async function processInvoice(input: ProcessInvoiceInput): Promise<ProcessInvoiceOutput> {
  return processInvoiceFlow(input);
}

const invoicePrompt = ai.definePrompt({
  name: 'processInvoicePrompt',
  input: { schema: ProcessInvoiceInputSchema },
  output: { schema: ProcessInvoiceOutputSchema },
  prompt: `You are an expert OCR and data extraction agent specialized in Dominican commercial invoices for colmados and DGII compliance.
Your goal is to extract EXACT and LITERAL data from the provided image, focusing on accounting precision and ITBIS extraction.

CRITICAL INSTRUCTIONS FOR ACCURACY:
1. **Supplier Info**: Identify the name (Razón Social) and RNC of the company issuing the invoice.
2. **Invoice Number**: Look for labels like "Factura No.", "No. Factura", or "NCF". Extract the full NCF sequence (B01..., B02..., etc.).
3. **Product Name**: Extract the full, exact name as written.
4. **Quantity & Unit**: Identify the numeric quantity and exact unit (ud, lb, caja, etc.).
5. **Unit Cost Price**: 
   - Extract the unit cost price per item BEFORE ITBIS (Net Unit Price).
   - IT IS CRITICAL TO SEPARATE THE BASE COST FROM THE TAX.
6. **ITBIS (Taxes)**:
   - Identify the ITBIS rate for each item (usually 18%, 16%, or 0% for exempt items).
   - Extract the total ITBIS amount for the entire invoice.
7. **Exclusion**: Ignore non-product lines (freight, service charges).

Invoice Image: {{media url=photoDataUri}}`,
});

const processInvoiceFlow = ai.defineFlow(
  {
    name: 'processInvoiceFlow',
    inputSchema: ProcessInvoiceInputSchema,
    outputSchema: ProcessInvoiceOutputSchema,
  },
  async (input) => {
    const { output } = await invoicePrompt(input);
    if (!output) {
      throw new Error('Failed to process the invoice image.');
    }
    return output;
  }
);