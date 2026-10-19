import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { assertStoreNotSuspended } from '@/lib/server-auth';

export const runtime = 'nodejs';

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (!token) return NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 });
    const identity = await adminAuth.verifyIdToken(token);
    const body = await request.json();
    const colmadoId = String(body.colmadoId || '');
    const productId = String(body.productId || '');
    const masterKey = String(body.masterKey || '');
    const profileSnap = await adminDb.doc(`userProfiles/${identity.uid}`).get();
    const profile = profileSnap.data();
    const allowed = profile?.isActive !== false && ['Admin', 'Supervisor', 'Contable'].includes(String(profile?.role || '')) &&
      (profile?.colmadoId === colmadoId || (Array.isArray(profile?.allowedColmadoIds) && profile.allowedColmadoIds.includes(colmadoId)));
    if (!allowed) return NextResponse.json({ error: 'No tienes acceso a este colmado.' }, { status: 403 });
    await assertStoreNotSuspended(colmadoId);

    const storeRef = adminDb.doc(`colmados/${colmadoId}`);
    const productRef = adminDb.doc(`colmados/${colmadoId}/products/${productId}`);
    const reportRef = adminDb.collection(`colmados/${colmadoId}/inventoryAuditReports`).doc();
    await adminDb.runTransaction(async tx => {
      const [storeSnap, productSnap] = await Promise.all([tx.get(storeRef), tx.get(productRef)]);
      if (!storeSnap.exists || !productSnap.exists) throw new Error('NOT_FOUND');
      if (!equalSecret(String(storeSnap.data()?.masterKey || ''), masterKey)) throw new Error('MASTER_KEY');
      const product = productSnap.data() || {};
      const newStock = Number(body.newStock);
      const newCost = Number(body.newCost);
      const newPrice = Number(body.newPrice);
      if (![newStock, newCost, newPrice].every(Number.isFinite) || newStock < 0 || newCost < 0 || newPrice < 0) throw new Error('INVALID_VALUES');
      const now = new Date().toISOString();
      const previousStock = Number(product.quantityInStock || 0);
      tx.update(productRef, { quantityInStock: newStock, basePrice: newCost, salePrice: newPrice, updatedAt: now });
      tx.create(reportRef, {
        kind: 'item-adjustment', colmadoId, productId, productName: String(product.name || body.productName || ''),
        barcode: String(product.barcode || body.barcode || ''), auditorUid: identity.uid,
        auditorName: String(profile?.firstName || identity.email || 'Usuario'), auditorRole: String(profile?.role || ''),
        createdAt: now, previousStock, newStock, difference: newStock - previousStock,
        previousCost: Number(product.basePrice || 0), newCost, previousPrice: Number(product.salePrice || 0), newPrice,
      });
    });
    return NextResponse.json({ ok: true, reportId: reportRef.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SUBSCRIPTION_SUSPENDED') return NextResponse.json({ error: 'Servicio suspendido hasta confirmar el pago.' }, { status: 403 });
    const status = code === 'MASTER_KEY' ? 403 : code === 'NOT_FOUND' ? 404 : 400;
    const message = code === 'MASTER_KEY' ? 'Clave maestra incorrecta.' : code === 'INVALID_VALUES' ? 'Los valores indicados no son válidos.' : 'No se pudo registrar la auditoría.';
    return NextResponse.json({ error: message }, { status });
  }
}
