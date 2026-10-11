export type ProductResult = {
  id: string; name: string; category: string; qtySold: number;
  totalRevenue: number; totalCost: number; profit: number; completeCost: boolean;
};

export function reportDateKey(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value?.toDate === 'function' ? value.toDate()
    : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000)
    : new Date(value);
  return date && !Number.isNaN(date.getTime())
    ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : '';
}

const saleTypes = new Set(['Sale', 'BarSale', 'OrderDelivery']);
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const lineGross = (item: any) => {
  const qty = amount(item.quantity);
  return Math.max(0, amount(item.lineTotal ?? item.amountInDop ?? (amount(item.price ?? item.unitPrice) * qty)));
};

export function buildAccountingReport(transactions: any[], entries: any[], products: any[], start: string, end: string, isAutonomous = false) {
  const salesTransactions = transactions.filter(tx => !tx.isAnnulled && saleTypes.has(String(tx.transactionType || '')) &&
    reportDateKey(tx.createdAt) >= start && reportDateKey(tx.createdAt) <= end);
  const byProduct = new Map<string, ProductResult>();
  let sales = 0, cogs = 0, cardSales = 0, missingCostTransactions = 0, missingItemsTransactions = 0;
  for (const tx of salesTransactions) {
    const revenue = Math.max(0, amount(tx.totalAmount));
    sales += revenue;
    cardSales += Math.max(0, amount(tx.cardAmount !== undefined ? tx.cardAmount :
      ['Tarjeta', 'Card'].includes(tx.paymentMethod) ? revenue : 0));
    const items = Array.isArray(tx.items) ? tx.items : [];
    const gross = items.reduce((sum: number, item: any) => sum + lineGross(item), 0);
    if (!items.length || gross <= 0) missingItemsTransactions++;
    const reportedCost = tx.totalCost === undefined || tx.totalCost === null ? null : Math.max(0, amount(tx.totalCost));
    const knownCost = items.reduce((sum: number, item: any) => sum +
      (item.costPrice === undefined || item.costPrice === null ? 0 : Math.max(0, amount(item.costPrice)) * amount(item.quantity)), 0);
    const missingItems = items.filter((item: any) => item.costPrice === undefined || item.costPrice === null || amount(item.costPrice) <= 0);
    const missingGross = missingItems.reduce((sum: number, item: any) => sum + lineGross(item), 0);
    const unresolvedCost = missingItems.length > 0 && (reportedCost === null || reportedCost <= knownCost);
    if (unresolvedCost || (reportedCost === null && !items.length)) missingCostTransactions++;
    const txCost = reportedCost ?? knownCost;
    cogs += txCost;
    for (const item of items) {
      const qty = amount(item.quantity);
      const grossLine = lineGross(item);
      if (qty <= 0 || grossLine <= 0) continue;
      const id = String(item.productId || item.sourceProductId || item.barcode || item.name || item.productName || item.id || 'sin-id');
      const current = byProduct.get(id) || { id, name: String(item.name || item.productName || 'Artículo'),
        category: String(item.category || 'Varios'), qtySold: 0, totalRevenue: 0, totalCost: 0, profit: 0, completeCost: true };
      const lineRevenue = gross > 0 ? revenue * grossLine / gross : 0;
      const hasCost = item.costPrice !== undefined && item.costPrice !== null && amount(item.costPrice) > 0;
      const lineCost = hasCost ? amount(item.costPrice) * qty : reportedCost !== null && missingGross > 0
        ? Math.max(0, reportedCost - knownCost) * grossLine / missingGross : 0;
      current.qtySold += qty;
      current.totalRevenue += lineRevenue;
      current.totalCost += lineCost;
      current.profit += lineRevenue - lineCost;
      if (!hasCost && lineCost <= 0) current.completeCost = false;
      byProduct.set(id, current);
    }
  }

  const periodEntries = entries.filter(entry => {
    const key = reportDateKey(entry.entryDate || entry.createdAt);
    return key >= start && key <= end && !(isAutonomous && entry.excludeFromAccounting);
  });
  let expenses = 0, payroll = 0, losses = 0, stockInvestment = 0;
  for (const entry of periodEntries) {
    const value = Math.abs(amount(entry.amount));
    if (entry.entryType === 'ProductExpense' || entry.category === 'Reinversión de Stock') stockInvestment += value;
    else if (entry.isPayroll || entry.entryType === 'PayrollExpense') payroll += value;
    else if (entry.category === 'Pérdidas' || entry.category === 'Vencidos') losses += value;
    else if (String(entry.entryType || '').includes('Expense')) expenses += value;
  }
  const productResults = [...byProduct.values()];
  const stock = products.filter(product => !product.isCombo).reduce((total, product) => {
    const qty = Math.max(0, amount(product.quantityInStock));
    const cost = Math.max(0, amount(product.basePrice));
    const price = Math.max(0, amount(product.salePrice));
    total.investment += qty * cost;
    total.potentialRevenue += qty * price;
    total.units += qty;
    if (qty > 0 && cost <= 0) total.uncostedProducts++;
    return total;
  }, { investment: 0, potentialRevenue: 0, units: 0, uncostedProducts: 0 });
  const grossProfit = sales - cogs;
  const totalOpEx = expenses + payroll + losses;
  const netProfit = grossProfit - totalOpEx;
  return {
    stats: { sales, cogs, cardSales, expenses, stockInvestment, payroll, losses, totalOpEx,
      grossProfit, netProfit, count: salesTransactions.length,
      grossMargin: sales > 0 ? grossProfit / sales * 100 : 0, netMargin: sales > 0 ? netProfit / sales * 100 : 0,
      missingCostTransactions, missingItemsTransactions },
    inventory: { ...stock, margin: stock.potentialRevenue - stock.investment },
    productResults,
    topSold: [...productResults].sort((a, b) => b.qtySold - a.qtySold).slice(0, 3),
    topProfitable: productResults.filter(product => product.completeCost)
      .sort((a, b) => b.profit - a.profit).slice(0, 3)
  };
}
