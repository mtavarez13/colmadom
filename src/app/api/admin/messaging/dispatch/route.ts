import { NextRequest, NextResponse } from 'next/server';
import { processDueOwnerMessages } from '@/lib/saas-messaging';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  try {
    const result = await processDueOwnerMessages(10);
    await adminDb.doc('platformConfig/messaging').set({ cronLastRunAt: new Date().toISOString(), cronLastResult: result }, { merge: true });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la cola.' }, { status: 500 });
  }
}
