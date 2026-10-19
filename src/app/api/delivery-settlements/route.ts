import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { assertStoreNotSuspended } from '@/lib/server-auth';

export const runtime = 'nodejs';

function reply(error: string, status: number) { return NextResponse.json({ error }, { status }); }
function cents(value: unknown) { return Math.round(Number(value || 0) * 100); }

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (!token) return reply('Inicia sesión para continuar.', 401);
    const identity = await adminAuth.verifyIdToken(token);
    const profileSnap = await adminDb.doc(`userProfiles/${identity.uid}`).get();
    const profile = profileSnap.data();
    if (!profile || profile.isActive === false || !profile.colmadoId) return reply('Usuario sin sucursal activa.', 403);
    const body = await request.json();
    const action = String(body.action || '');
    const colmadoId = String(profile.colmadoId);
    await assertStoreNotSuspended(colmadoId);
    const now = new Date().toISOString();

    if (action === 'request') {
      if (profile.role !== 'Driver' || !profile.driverId) return reply('Solo Delivery puede solicitar un desembolso.', 403);
      const snap = await adminDb.collection(`colmados/${colmadoId}/transactions`).where('driverId', '==', profile.driverId).get();
      const held = snap.docs.filter(item => item.data().driverUid === identity.uid && item.data().cashSettlementStatus === 'Held');
      if (!held.length) return reply('No tienes efectivo disponible para desembolsar.', 409);
      if (held.length > 100) return reply('Hay demasiadas entregas. Contacta al administrador para dividir el desembolso.', 409);
      const settlementRef = adminDb.collection(`colmados/${colmadoId}/deliverySettlements`).doc();
      const amountCents = await adminDb.runTransaction(async tx => {
        const fresh = await Promise.all(held.map(item => tx.get(item.ref)));
        if (fresh.some(item => item.data()?.cashSettlementStatus !== 'Held' || item.data()?.driverUid !== identity.uid))
          throw new Error('DELIVERIES_CHANGED');
        const total = fresh.reduce((sum, item) => sum + cents(item.data()?.cashAmount), 0);
        if (total <= 0) throw new Error('NO_CASH');
        tx.create(settlementRef, {
          id: settlementRef.id, colmadoId, driverId: profile.driverId, driverUid: identity.uid,
          driverName: profile.firstName || 'Delivery', amount: total / 100,
          transactionIds: held.map(item => item.id), status: 'Pending', createdAt: now, updatedAt: now
        });
        held.forEach(item => tx.update(item.ref, { cashSettlementStatus: 'Pending', settlementId: settlementRef.id, updatedAt: now }));
        return total;
      });
      return NextResponse.json({ ok: true, settlementId: settlementRef.id, amount: amountCents / 100 });
    }

    if (action === 'accept') {
      if (!['Cajero', 'Admin'].includes(String(profile.role))) return reply('Solo el cajero o dueño puede aceptar el dinero.', 403);
      const settlementId = String(body.settlementId || '');
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(settlementId)) return reply('Desembolso inválido.', 400);
      const settlementRef = adminDb.doc(`colmados/${colmadoId}/deliverySettlements/${settlementId}`);
      const entryRef = adminDb.doc(`colmados/${colmadoId}/bookkeepingEntries/delivery_settlement_${settlementId}`);
      const amountCents = await adminDb.runTransaction(async tx => {
        const settlement = await tx.get(settlementRef);
        const data = settlement.data();
        if (!data || data.status !== 'Pending' || data.colmadoId !== colmadoId || !Array.isArray(data.transactionIds) || !data.transactionIds.length)
          throw new Error('SETTLEMENT_CHANGED');
        const refs = data.transactionIds.map((id: string) => adminDb.doc(`colmados/${colmadoId}/transactions/${id}`));
        const deliveries = await Promise.all(refs.map((ref: FirebaseFirestore.DocumentReference) => tx.get(ref)));
        const existingEntry = await tx.get(entryRef);
        if (existingEntry.exists || deliveries.some(item => item.data()?.cashSettlementStatus !== 'Pending' || item.data()?.settlementId !== settlementId || item.data()?.driverUid !== data.driverUid))
          throw new Error('SETTLEMENT_CHANGED');
        const total = deliveries.reduce((sum, item) => sum + cents(item.data()?.cashAmount), 0);
        if (total <= 0 || total !== cents(data.amount)) throw new Error('AMOUNT_MISMATCH');
        tx.update(settlementRef, { status: 'Accepted', acceptedBy: identity.uid, acceptedByName: profile.firstName || 'Cajero', acceptedAt: now, updatedAt: now });
        refs.forEach((ref: FirebaseFirestore.DocumentReference) => tx.update(ref, { cashSettlementStatus: 'Accepted', settledAt: now, updatedAt: now }));
        tx.create(entryRef, {
          id: entryRef.id, colmadoId, entryType: 'DeliverySettlement', description: `EFECTIVO DELIVERY: ${data.driverName || data.driverId}`,
          amount: total / 100, driverId: data.driverId, settlementId, transactionIds: data.transactionIds,
          userId: identity.uid, userName: profile.firstName || 'Cajero', cashRegisterSessionId: 'active_session',
          entryDate: now, createdAt: now, updatedAt: now
        });
        return total;
      });
      return NextResponse.json({ ok: true, amount: amountCents / 100 });
    }

    return reply('Acción desconocida.', 400);
  } catch (error) {
    if (error instanceof Error && error.message === 'SUBSCRIPTION_SUSPENDED') return reply('Servicio suspendido hasta confirmar el pago.', 403);
    if (error instanceof Error && ['DELIVERIES_CHANGED', 'SETTLEMENT_CHANGED', 'AMOUNT_MISMATCH', 'NO_CASH'].includes(error.message))
      return reply('El estado o monto cambió. Actualiza la pantalla e intenta de nuevo.', 409);
    console.error('Delivery settlement error', error);
    return reply('No se pudo procesar el desembolso.', 500);
  }
}
