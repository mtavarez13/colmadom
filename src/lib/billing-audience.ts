/** The explicit audience replaces the legacy owner/supervisor default. */
export function canViewBusinessBilling(
  store: { billingUserIds?: unknown } | null | undefined,
  uid: string | null | undefined,
  role: string | null | undefined,
): boolean {
  if (!uid) return false;
  if (Array.isArray(store?.billingUserIds)) return store.billingUserIds.includes(uid);
  return role === 'Admin' || role === 'Supervisor';
}
