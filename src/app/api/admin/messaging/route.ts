import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requirePlatformAdmin } from '@/lib/server-auth';
import { emailIsConfigured, MessageCategory, MessageChannel, processDueOwnerMessages } from '@/lib/saas-messaging';

export const runtime = 'nodejs';
const templatesRef = adminDb.collection('saasMessageTemplates');
const campaignsRef = adminDb.collection('saasMessageCampaigns');
const queueRef = adminDb.collection('saasMessageQueue');

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const [templates, campaigns, deliveries, stores, channels, config] = await Promise.all([
      templatesRef.orderBy('createdAt', 'desc').limit(100).get(),
      campaignsRef.orderBy('createdAt', 'desc').limit(50).get(),
      adminDb.collection('saasMessageDeliveries').orderBy('completedAt', 'desc').limit(100).get(),
      adminDb.collection('colmados').get(),
      adminDb.collection('whatsappConnections').where('status', '==', 'Connected').get(),
      adminDb.doc('platformConfig/messaging').get(),
    ]);
    return NextResponse.json({
      templates: templates.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      campaigns: campaigns.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      deliveries: deliveries.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      stores: stores.docs.filter(doc => doc.data().isDeleted !== true && (!doc.data().rootColmadoId || doc.data().rootColmadoId === doc.id))
        .map(doc => ({ id: doc.id, name: doc.data().name || '', ownerEmail: doc.data().ownerEmail || '', ownerPhone: doc.data().ownerPhone || '', ownerMarketingConsent: doc.data().ownerMarketingConsent === true })),
      channels: channels.docs.map(doc => ({ id: doc.id, displayPhone: doc.data().displayPhone || '', verifiedName: doc.data().verifiedName || '' })),
      senderConnectionId: config.data()?.senderConnectionId || '',
      smtpConfigured: emailIsConfigured(),
      cronConfigured: (process.env.CRON_SECRET || '').length >= 24,
      cronLastRunAt: config.data()?.cronLastRunAt || '',
    });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);
    const body = await request.json();
    const action = String(body.action || '');
    const now = new Date().toISOString();
    if (action === 'sender') {
      const senderConnectionId = String(body.senderConnectionId || '');
      if (senderConnectionId && !/^[\w-]{1,150}$/.test(senderConnectionId)) return NextResponse.json({ error: 'Canal inválido.' }, { status: 400 });
      if (senderConnectionId && (await adminDb.doc(`whatsappConnections/${senderConnectionId}`).get()).data()?.status !== 'Connected')
        return NextResponse.json({ error: 'Selecciona un canal conectado.' }, { status: 400 });
      await adminDb.doc('platformConfig/messaging').set({ senderConnectionId, updatedAt: now, updatedBy: admin.uid }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'save_template') {
      const id = body.id ? String(body.id) : randomUUID();
      const channel = String(body.channel || '') as MessageChannel;
      const category = String(body.category || '') as MessageCategory;
      const name = String(body.name || '').trim();
      const subject = String(body.subject || '').trim();
      const text = String(body.body || '').trim();
      const metaTemplateName = String(body.metaTemplateName || '').trim();
      const metaLanguage = String(body.metaLanguage || 'es').trim();
      const parameters = Array.isArray(body.parameters) ? body.parameters.map((value: unknown) => String(value).trim()).filter(Boolean) : [];
      const delayDays = Number(body.delayDays || 0);
      if (channel === 'whatsapp' && category === 'welcome' && body.autoOnSignup === true)
        return NextResponse.json({ error: 'La bienvenida de WhatsApp se envía al registrar. Programa por esta vía solo recomendaciones u otras plantillas.' }, { status: 400 });
      if (!/^[\w-]{1,150}$/.test(id) || !['email', 'whatsapp'].includes(channel) || !['welcome', 'recommendation', 'custom'].includes(category)
        || name.length < 2 || name.length > 100 || text.length < 10 || text.length > 4000 || !Number.isInteger(delayDays) || delayDays < 0 || delayDays > 90
        || channel === 'email' && (subject.length < 2 || subject.length > 180)
        || channel === 'whatsapp' && (!/^[a-z0-9_]{2,100}$/.test(metaTemplateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(metaLanguage) || parameters.length > 10 || parameters.some((value: string) => value.length > 200)))
        return NextResponse.json({ error: 'Revisa nombre, texto, asunto o plantilla aprobada por Meta.' }, { status: 400 });
      const ref = templatesRef.doc(id), previous = await ref.get();
      if (!previous.exists && (await templatesRef.limit(101).get()).size >= 100)
        return NextResponse.json({ error: 'Límite de 100 plantillas alcanzado.' }, { status: 409 });
      await ref.set({ name, channel, category, subject: channel === 'email' ? subject : '', body: text,
        metaTemplateName: channel === 'whatsapp' ? metaTemplateName : '', metaLanguage,
        parameters: channel === 'whatsapp' ? parameters : [], autoOnSignup: body.autoOnSignup === true,
        delayDays, enabled: body.enabled === true, createdAt: previous.data()?.createdAt || now,
        updatedAt: now, updatedBy: admin.uid }, { merge: true });
      return NextResponse.json({ ok: true, id });
    }
    if (action === 'schedule') {
      if ((process.env.CRON_SECRET || '').length < 24) return NextResponse.json({ error: 'Configura la tarea programada antes de agendar campañas.' }, { status: 409 });
      const templateId = String(body.templateId || ''), template = await templatesRef.doc(templateId).get();
      if (!template.exists || template.data()?.enabled !== true) return NextResponse.json({ error: 'Activa la plantilla antes de programar.' }, { status: 400 });
      const value = template.data()!;
      const scheduledAt = new Date(String(body.scheduledAt || ''));
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60000 || scheduledAt.getTime() > Date.now() + 366 * 86400000)
        return NextResponse.json({ error: 'Indica una fecha dentro de los próximos 12 meses.' }, { status: 400 });
      if (value.channel === 'email' && !emailIsConfigured()) return NextResponse.json({ error: 'Configura SMTP en Hostinger antes de programar correos.' }, { status: 409 });
      if (value.channel === 'whatsapp') {
        const sender = (await adminDb.doc('platformConfig/messaging').get()).data()?.senderConnectionId;
        if (!sender || (await adminDb.doc(`whatsappConnections/${sender}`).get()).data()?.status !== 'Connected')
          return NextResponse.json({ error: 'Elige un número de WhatsApp SaaS conectado.' }, { status: 409 });
      }
      const requested = body.allOwners === true ? null : body.storeIds;
      if (requested !== null && (!Array.isArray(requested) || requested.length > 500 || requested.some((id: unknown) => typeof id !== 'string' || !/^[\w-]{1,150}$/.test(id))))
        return NextResponse.json({ error: 'Selecciona negocios válidos.' }, { status: 400 });
      const selectedIds = requested === null ? null : [...new Set(requested as string[])];
      const stores = selectedIds === null ? (await adminDb.collection('colmados').get()).docs
        : selectedIds.length ? await adminDb.getAll(...selectedIds.map(id => adminDb.doc(`colmados/${id}`))) : [];
      const recipients = stores.filter(store => store.exists && store.data()?.isDeleted !== true && (!store.data()?.rootColmadoId || store.data()?.rootColmadoId === store.id)
        && (value.category === 'welcome' || store.data()?.ownerMarketingConsent === true)
        && (value.channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(store.data()?.ownerEmail || '')) : /^\+?[\d\s()-]{10,20}$/.test(String(store.data()?.ownerPhone || ''))));
      if (!recipients.length) return NextResponse.json({ error: 'No hay dueños con contacto válido y autorización para esta plantilla.' }, { status: 409 });
      if (recipients.length > 500) return NextResponse.json({ error: 'Selecciona hasta 500 negocios por campaña.' }, { status: 400 });
      const campaign = campaignsRef.doc(), campaignData = { id: campaign.id, name: String(body.name || value.name).trim().slice(0, 100), templateId,
        source: 'manual', status: 'preparing', targetCount: recipients.length, sentCount: 0, failedCount: 0, skippedCount: 0,
        scheduledAt: scheduledAt.toISOString(), createdAt: now, createdBy: admin.uid };
      await campaign.create(campaignData);
      try {
        for (let offset = 0; offset < recipients.length; offset += 400) {
          const batch = adminDb.batch();
          recipients.slice(offset, offset + 400).forEach(store => batch.create(queueRef.doc(`${scheduledAt.getTime()}_${campaign.id}_${store.id}`), {
            campaignId: campaign.id, colmadoId: store.id, templateId, channel: value.channel,
            templateSnapshot: { id: templateId, ...value },
            scheduledAt: scheduledAt.toISOString(), attempts: 0, createdAt: now }));
          await batch.commit();
        }
        await campaign.update({ status: 'scheduled' });
      } catch (error) {
        await campaign.update({ status: 'cancelled', error: 'No se pudo preparar la cola.' });
        throw error;
      }
      return NextResponse.json({ ok: true, campaignId: campaign.id, targetCount: recipients.length });
    }
    if (action === 'cancel') {
      const id = String(body.campaignId || '');
      if (!/^[\w-]{1,150}$/.test(id)) return NextResponse.json({ error: 'Campaña inválida.' }, { status: 400 });
      const ref = campaignsRef.doc(id), campaign = await ref.get();
      if (!campaign.exists || campaign.data()?.source !== 'manual' || campaign.data()?.status === 'completed')
        return NextResponse.json({ error: 'La campaña no se puede cancelar.' }, { status: 409 });
      await ref.update({ status: 'cancelled', cancelledAt: now, cancelledBy: admin.uid });
      return NextResponse.json({ ok: true });
    }
    if (action === 'run_due') return NextResponse.json({ ok: true, ...await processDueOwnerMessages(10) });
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.status === 500 ? 'No se pudo completar la operación.' : failure.message }, { status: failure.status });
  }
}
