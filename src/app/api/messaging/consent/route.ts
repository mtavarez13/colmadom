import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requireOwner } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { identity, rootColmadoId } = await requireOwner(request);
    const body = await request.json();
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Preferencia inválida.' }, { status: 400 });
    const now = new Date().toISOString();
    await adminDb.runTransaction(async tx => {
      const ref = adminDb.doc(`colmados/${rootColmadoId}`), store = await tx.get(ref);
      if (!store.exists || store.data()?.isDeleted === true) throw new Error('FORBIDDEN');
      tx.update(ref, { ownerMarketingConsent: body.enabled, ownerMarketingConsentUpdatedAt: now, ownerMarketingConsentBy: identity.uid });
      tx.create(adminDb.collection('auditLogs').doc(), { actorUid: identity.uid, action: 'OWNER_MARKETING_CONSENT_CHANGED',
        targetId: rootColmadoId, enabled: body.enabled, createdAt: now });
    });
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
