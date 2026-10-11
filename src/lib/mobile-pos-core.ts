import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const decimal = (digits: number) => z.string().regex(new RegExp(`^\\d{1,8}(?:\\.\\d{1,${digits}})?$`));
export const checkoutSchema = z.object({
  storeId: id, requestId: z.string().uuid(),
  items: z.array(z.object({productId: id, quantity: decimal(6).optional(), amountInDop: decimal(2).optional()}).strict()
    .refine(i => (i.quantity !== undefined) !== (i.amountInDop !== undefined), 'Indica cantidad o importe.')).min(1).max(80),
  expectedTotal: decimal(2), paymentMethod: z.enum(['Efectivo','Tarjeta']), cashReceived: decimal(2).optional(), paymentRef: z.string().trim().max(100).optional(),
}).strict();
export type Checkout = z.infer<typeof checkoutSchema>;
export function posRole(p: Record<string, any>) {
  return p.isActive !== false && (['Admin','Supervisor'].includes(p.role) ||
    (!['Driver','Contable','ContableIndependiente'].includes(p.role) && Array.isArray(p.allowedModules) && p.allowedModules.includes('pos')));
}
export function branchAllowed(p: Record<string, any>, id: string) {
  return p.colmadoId === id || (p.role === 'Admin' && Array.isArray(p.allowedColmadoIds) && p.allowedColmadoIds.includes(id));
}
export class PosValidationError extends Error {}
const reject = (message: string): never => { throw new PosValidationError(message); };
export function unsupportedProduct(p: Record<string, any>): string | null {
  if (p.isActive === false || p.isDeleted === true) return 'Producto inactivo';
  if (p.isExtra || p.isGeneric) return 'Extras y productos genéricos requieren el POS web';
  if (!Number.isFinite(Number(p.salePrice)) || Number(p.salePrice) <= 0 || Number(p.salePrice) > 1_000_000) return 'Precio inválido';
  if (p.isCombo && (!Array.isArray(p.comboItems) || !p.comboItems.length || p.comboItems.length > 80)) return 'Combo sin componentes válidos';
  return null;
}
export function buildPosSale(input: Checkout, products: Map<string, Record<string, any>>) {
  const stock = new Map<string, number>();
  const consume = (id: string, quantity: number) => stock.set(id, (stock.get(id) || 0) + quantity);
  const items = input.items.map(line => {
    const p = products.get(line.productId) || reject('Producto no disponible.');
    const reason = unsupportedProduct(p); if (reason) reject(reason);
    const price = Number(p.salePrice);
    const fractional = !!(p.isFractionalOnly || p.isBreakdownAllowed);
    if (line.amountInDop !== undefined && !fractional) reject('Este producto no admite venta por importe.');
    const quantity = line.amountInDop !== undefined ? Number(line.amountInDop) / price : Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || (!fractional && !Number.isInteger(quantity))) reject('Cantidad inválida.');
    const cents = line.amountInDop !== undefined ? Math.round(Number(line.amountInDop)*100) : Math.round((price*quantity+Number.EPSILON)*100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) reject('Importe inválido.');
    if (p.isCombo) {
      for (const c of p.comboItems) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(c.id || '') || !Number.isFinite(Number(c.quantity)) || Number(c.quantity) <= 0) reject('Componente de combo inválido.');
        const component = products.get(c.id); if (!component || component.isCombo || component.isExtra || component.isActive === false) reject('Componente no disponible.');
        consume(c.id, Number(c.quantity)*quantity);
      }
    } else consume(line.productId,quantity);
    return {id:line.productId,productId:line.productId,name:String(p.name || 'Producto'),quantity,price,costPrice:Number(p.basePrice)||0,lineTotal:cents/100,amountInDop:cents/100,unitType:String(p.unitType || 'ud'),itbisRate:Number(p.itbisRate)||0,isCombo:!!p.isCombo,comboItems:p.isCombo?p.comboItems:[]};
  });
  for (const [id, amount] of stock) {
    const available = Number(products.get(id)?.quantityInStock);
    if (!Number.isFinite(available) || available < amount - 1e-9) reject('Existencias insuficientes. Actualiza el catálogo.');
  }
  const totalCents = items.reduce((sum,i)=>sum+Math.round(i.lineTotal*100),0);
  if (totalCents > 100_000_000) reject('La venta excede el límite móvil.');
  if (Math.round(Number(input.expectedTotal)*100) !== totalCents) reject('El precio cambió. Actualiza el catálogo y revisa el total antes de cobrar.');
  const received = input.paymentMethod === 'Efectivo' ? Math.round(Number(input.cashReceived)*100) : totalCents;
  if (!Number.isSafeInteger(received) || received < totalCents) reject('El efectivo recibido no cubre la venta.');
  if (input.paymentMethod === 'Tarjeta' && !input.paymentRef?.trim()) reject('Indica la referencia del pago externo con tarjeta.');
  return {items,stock,totalAmount:totalCents/100,paidAmount:received/100,changeGiven:(received-totalCents)/100};
}
