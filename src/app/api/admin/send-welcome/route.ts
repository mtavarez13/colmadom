import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requirePlatformAdmin, apiError } from '@/lib/server-auth';
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/whatsapp-cloud';
import { queueAutomaticOwnerMessages } from '@/lib/saas-messaging';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const body = await request.json();
    const colmadoId = String(body.colmadoId || '');
    const ownerPhone = String(body.ownerPhone || '').replace(/\D/g, '');
    const name = String(body.name || 'Negocio').trim().slice(0, 120);
    const ownerName = String(body.ownerName || 'Propietario').trim().slice(0, 120);
    if (!/^[\w-]{1,150}$/.test(colmadoId) || ownerPhone.length < 10)
      return NextResponse.json({ error: 'Negocio o teléfono inválido.' }, { status: 400 });
    const store = await adminDb.doc(`colmados/${colmadoId}`).get();
    if (!store.exists || store.data()?.isDeleted === true)
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    let scheduledMessages = 0;
    try { scheduledMessages = await queueAutomaticOwnerMessages(colmadoId, String(store.data()?.createdAt || new Date().toISOString())); }
    catch (error) { console.error('No se pudo programar la bienvenida por correo', error); }
    const configured = process.env.WHATSAPP_WELCOME_CONNECTION_ID?.trim();
    const senderId = configured || String((await adminDb.doc('platformConfig/messaging').get()).data()?.senderConnectionId || '');
    if (!senderId) return NextResponse.json({ ok: true, scheduledMessages, whatsapp: 'pending', detail: 'Elige un remitente de WhatsApp en el centro de mensajería.' });
    try {
      const sent = await sendWhatsAppTemplate(senderId, ownerPhone, process.env.WHATSAPP_WELCOME_TEMPLATE || 'colmadom_bienvenida', process.env.WHATSAPP_WELCOME_LANGUAGE || 'es', [ownerName, name, '20']);
      return NextResponse.json({ ok: true, scheduledMessages, whatsapp: 'sent', messageId: sent.messageId });
    } catch {
      const sent = await sendWhatsAppText(senderId, ownerPhone, `¡Bienvenido a Colmadom Cloud! ${name} está registrado. Tu prueba de 20 días está activa. Configura inventario, usuarios y caja. Soporte: 809-458-3731.`);
      return NextResponse.json({ ok: true, scheduledMessages, whatsapp: 'sent', messageId: sent.messageId });
    }
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.status === 500 ? 'No se pudo enviar la bienvenida.' : failure.message }, { status: failure.status });
  }
}
