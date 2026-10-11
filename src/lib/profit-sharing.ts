export function calculateProfitSharing(netProfit: number, employees: any[]) {
  const base = Math.max(0, Number.isFinite(netProfit) ? netProfit : 0);
  const allocations = employees
    .filter(employee => employee.isActive !== false)
    .map(employee => ({
      id: String(employee.id),
      name: String(employee.fullName || 'Empleado'),
      percent: Number(employee.profitSharePercent) || 0,
    }))
    .filter(employee => employee.percent > 0 && employee.percent <= 100)
    .map(employee => ({ ...employee, amount: Math.round(base * employee.percent) / 100 }));
  const totalPercent = allocations.reduce((sum, employee) => sum + employee.percent, 0);
  const totalAmount = allocations.reduce((sum, employee) => sum + employee.amount, 0);
  return { base, allocations, totalPercent, totalAmount, remaining: netProfit - totalAmount };
}
