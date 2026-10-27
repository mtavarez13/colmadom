export type PharmacyDoseDraft = {
  enabled: boolean;
  unitsSupplied: string;
  unitsPerDose: string;
  dosesPerDay: string;
  instructions: string;
};

export type PharmacySaleSelection = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  followUpConsent: boolean;
  doses: Record<string, PharmacyDoseDraft>;
};

export type PharmacyFollowUpItem = {
  productId: string;
  productName: string;
  unitsSupplied: number;
  unitsPerDose: number;
  dosesPerDay: number;
  instructions: string;
  estimatedDays: number;
  estimatedEndDate: string;
};

export const emptyPharmacySelection = (): PharmacySaleSelection => ({
  customerId: '', customerName: '', customerPhone: '', followUpConsent: false, doses: {},
});

export function santoDomingoDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function estimatedRefillDate(now: Date, unitsSupplied: number, unitsPerDose: number, dosesPerDay: number): { days: number; date: string } {
  if (![unitsSupplied, unitsPerDose, dosesPerDay].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('La cantidad entregada y la pauta deben ser mayores que cero.');
  }
  const days = Math.ceil(unitsSupplied / (unitsPerDose * dosesPerDay));
  if (days > 3650) throw new Error('La duración estimada no puede superar 10 años.');
  const start = santoDomingoDate(now);
  const date = new Date(`${start}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return { days, date: date.toISOString().slice(0, 10) };
}

export function buildPharmacyFollowUps(
  cart: Array<{ productId?: string; id: string; name: string }>,
  selection: PharmacySaleSelection,
  now: Date,
): PharmacyFollowUpItem[] {
  const selected = cart.filter(item => selection.doses[item.productId || item.id]?.enabled);
  if (selected.length && !selection.customerId) throw new Error('Selecciona un cliente registrado para el seguimiento.');
  return selected.map(item => {
    const productId = item.productId || item.id;
    const draft = selection.doses[productId];
    const unitsSupplied = Number(draft.unitsSupplied);
    const unitsPerDose = Number(draft.unitsPerDose);
    const dosesPerDay = Number(draft.dosesPerDay);
    const { days, date } = estimatedRefillDate(now, unitsSupplied, unitsPerDose, dosesPerDay);
    return {
      productId, productName: item.name, unitsSupplied, unitsPerDose, dosesPerDay,
      instructions: draft.instructions.trim().slice(0, 500),
      estimatedDays: days, estimatedEndDate: date,
    };
  });
}
