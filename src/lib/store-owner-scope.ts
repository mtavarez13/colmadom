import { adminDb } from '@/lib/firebase-admin';

export const OWNER_MODULES = [
  'minimarket', 'pos', 'driver', 'bar', 'orders', 'whatsapp', 'top-sellers',
  'hr', 'inventory', 'inventory-audit', 'suppliers', 'customers', 'pharmacy',
  'expenses', 'reconciliation', 'services', 'reports', 'fiscal', 'insights',
  'marketplace', 'business-market',
];

export async function storeOwnerScope(colmadoId: string) {
  const selected = await adminDb.doc(`colmados/${colmadoId}`).get();
  if (!selected.exists || selected.data()?.isDeleted === true) throw new Error('STORE_NOT_FOUND');

  const rootId = String(selected.data()?.rootColmadoId || selected.id);
  const root = rootId === selected.id ? selected : await adminDb.doc(`colmados/${rootId}`).get();
  if (!root.exists || root.data()?.isDeleted === true) throw new Error('STORE_NOT_FOUND');

  const branches = await adminDb.collection('colmados').where('rootColmadoId', '==', rootId).get();
  const allowedColmadoIds = [rootId, ...branches.docs
    .filter(item => item.id !== rootId && item.data().isDeleted !== true)
    .map(item => item.id)];
  return { rootId, root, allowedColmadoIds };
}
