import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { sendWhatsAppText } from '@/lib/whatsapp-cloud';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (!token) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
    const identity = await adminAuth.verifyIdToken(token);
    const profile = (await adminDb.doc('userProfiles/' + identity.uid).get()).data();
    if (!profile || profile.isActive === false || profile.role === 'Driver' || !profile.colmadoId ||
        (!['Admin', 'Supervisor'].includes(String(profile.role)) && !profile.allowedModules?.includes('whatsapp')))
      return NextResponse.json({ error: 'No tienes acceso al WhatsApp de este colmado.' }, { status: 403 });
    const colmadoId = String(profile.colmadoId);
    const body = await request.json();
    const customerId = String(body.customerId || '');
    const text = String(body.body || '').trim();
    if (!/^[A-Za-z0-9_-]{3,100}$/.test(customerId) || !text || text.length > 4096)
      return NextResponse.json({ error: 'Cliente o mensaje inválido.' }, { status: 400 });
    const customer = (await adminDb.doc('colmados/' + colmadoId + '/customers/' + customerId).get()).data();
    if (!customer?.phoneNumber) return NextResponse.json({ error: 'El cliente no tiene teléfono.' }, { status: 404 });
    const sent = await sendWhatsAppText(colmadoId, customer.phoneNumber, text);
    const messageId = randomUUID();
    await adminDb.doc('colmados/' + colmadoId + '/customers/' + customerId + '/messages/' + messageId).set({
      id: messageId, metaMessageId: sent.messageId, body: text, senderId: identity.uid,
      direction: 'Outbound', status: 'Sent', createdAt: new Date().toISOString()
    });
    return NextResponse.json({ ok: true, messageId: sent.messageId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo enviar el mensaje.' }, { status: 400 });
  }
}
