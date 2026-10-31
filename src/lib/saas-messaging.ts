import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendWhatsAppTemplate } from '@/lib/whatsapp-cloud';

export type MessageChannel = 'email' | 'whatsapp';
export type MessageCategory = 'welcome' | 'recommendation' | 'custom';

export type MessageTemplate = {
  id: string;
  name: string;
  channel: MessageChannel;
  category: MessageCategory;
  subject: string;
  body: string;
  metaTemplateName: string;
  metaLanguage: string;
  parameters: string[];
  autoOnSignup: boolean;
  delayDays: number;
  enabled: boolean;
};
type QueuedMessage = { campaignId: string; colmadoId: string; templateId: string; channel: MessageChannel;
  scheduledAt: string; attempts: number; leaseUntil?: number; createdAt: string; templateSnapshot?: MessageTemplate };

const variables = new Set(['nombre', 'negocio', 'dias_prueba', 'enlace', 'soporte']);
const queue = adminDb.collection('saasMessageQueue');
const deliveries = adminDb.collection('saasMessageDeliveries');
const campaigns = adminDb.collection('saasMessageCampaigns');

export function renderMessage(input: string, store: Record<string, unknown>) {
  const values: Record<string, string> = {
    nombre: String(store.ownerFullName || 'Propietario'),
    negocio: String(store.name || 'tu negocio'),
    dias_prueba: String(store.trialDays || 20),
    enlace: 'https://colmadom.hispaniolapay.com/login',
    soporte: '809-458-3731',
  };
  return input.replace(/\{([a-z_]+)\}/g, (whole, key: string) => variables.has(key) ? values[key] : whole);
}

export function emailIsConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

async function sendEmail(to: string, subject: string, body: string, category: MessageCategory) {
  if (!emailIsConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const port = Number(process.env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) throw new Error('SMTP_PORT_INVALID');
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!, port, secure: port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  const optOut = category === 'welcome' ? '' : '\n\nPara dejar de recibir recomendaciones, cambia tu preferencia en https://colmadom.hispaniolapay.com/settings';
  const fullBody = body + optOut;
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM!, to,
    subject: subject.replace(/[\r\n]/g, ' ').slice(0, 180),
    text: fullBody,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#402080">Colmadom Cloud</h2><div style="white-space:pre-line">${fullBody.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch))}</div><hr><small>Colmadom Cloud · Soporte: 809-458-3731</small></div>`,
  });
  if (!result.accepted.includes(to)) throw new Error('SMTP_RECIPIENT_REJECTED');
  return String(result.messageId || '');
}

export async function queueAutomaticOwnerMessages(colmadoId: string, createdAt: string) {
  const templates = await adminDb.collection('saasMessageTemplates').where('enabled', '==', true).get();
  const selected = templates.docs.filter(doc => {
    const value = doc.data();
    // Registration already sends the operational WhatsApp welcome immediately.
    return value.autoOnSignup === true && (value.channel === 'email' || value.category !== 'welcome');
  }).slice(0, 30);
  if (!selected.length) return 0;
  const campaignRef = campaigns.doc(`signup_${colmadoId}`);
  const batch = adminDb.batch();
  const now = new Date().toISOString();
  for (const doc of selected) {
    const delay = Math.max(0, Math.min(90, Number(doc.data().delayDays || 0)));
    const scheduledAt = new Date(new Date(createdAt).getTime() + delay * 86400000).toISOString();
    batch.create(queue.doc(`${Date.parse(scheduledAt)}_${colmadoId}_${doc.id}`), {
      campaignId: campaignRef.id, colmadoId, templateId: doc.id, channel: doc.data().channel,
      templateSnapshot: { id: doc.id, ...doc.data() },
      scheduledAt, attempts: 0, createdAt: now,
    });
  }
  batch.create(campaignRef, { id: campaignRef.id, name: 'Secuencia de registro',
    source: 'signup', status: 'scheduled', targetCount: selected.length,
    sentCount: 0, failedCount: 0, skippedCount: 0, createdAt: now });
  await batch.commit();
  return selected.length;
}

type ProcessResult = { processed: number; sent: number; failed: number; skipped: number };

export async function processDueOwnerMessages(limit = 40): Promise<ProcessResult> {
  const now = Date.now();
  const maxJobs = Math.min(100, Math.max(1, limit));
  // Fetch beyond the send cap so a concurrent worker's leased jobs do not hide ready jobs.
  const jobs = await queue.orderBy('__name__').endAt(`${now}_\uf8ff`).limit(100).get();
  const result: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const job of jobs.docs) {
    if (result.processed >= maxJobs) break;
    const claimed = await adminDb.runTransaction(async tx => {
      const current = await tx.get(job.ref), data = current.data() as QueuedMessage | undefined;
      if (!data || Date.parse(String(data.scheduledAt || '')) > Date.now() || Number(data.leaseUntil || 0) > Date.now()) return null;
      tx.update(job.ref, { leaseUntil: Date.now() + 120000, attempts: Number(data.attempts || 0) + 1 });
      return { ...data, attempts: Number(data.attempts || 0) + 1 };
    });
    if (!claimed) continue;
    result.processed++;
    let outcome: 'sent' | 'failed' | 'skipped' = 'skipped';
    let recipient = '';
    let providerMessageId = '';
    let errorMessage = '';
    try {
      const [campaign, template, store] = await Promise.all([
        campaigns.doc(claimed.campaignId).get(),
        adminDb.doc(`saasMessageTemplates/${claimed.templateId}`).get(),
        adminDb.doc(`colmados/${claimed.colmadoId}`).get(),
      ]);
      const currentTemplate = template.data();
      const config = (claimed.templateSnapshot || currentTemplate) as MessageTemplate | undefined;
      const business = store.data() || {};
      if (campaign.data()?.status === 'preparing') throw new Error('CAMPAIGN_PREPARING');
      if (!campaign.exists || campaign.data()?.status === 'cancelled' || !currentTemplate?.enabled || !config || !store.exists || business.isDeleted === true
        || config?.category !== 'welcome' && (business.isActive === false || business.subscriptionStatus === 'Suspended')) {
        errorMessage = 'Campaña, plantilla o negocio desactivado.';
      } else if (config.category !== 'welcome' && business.ownerMarketingConsent !== true) {
        errorMessage = 'El dueño no autorizó recomendaciones.';
      } else if (config.channel === 'email') {
        recipient = String(business.ownerEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('OWNER_EMAIL_MISSING');
        providerMessageId = await sendEmail(recipient, renderMessage(config.subject, business), renderMessage(config.body, business), config.category);
        outcome = 'sent';
      } else {
        const messaging = (await adminDb.doc('platformConfig/messaging').get()).data() || {};
        if (!messaging.senderConnectionId) throw new Error('WHATSAPP_SENDER_NOT_CONFIGURED');
        recipient = String(business.ownerPhone || '');
        const parameters = (config.parameters || []).map(value => renderMessage(value, business));
        const sent = await sendWhatsAppTemplate(String(messaging.senderConnectionId), recipient, config.metaTemplateName, config.metaLanguage || 'es', parameters);
        recipient = sent.phone;
        providerMessageId = sent.messageId;
        outcome = 'sent';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'No se pudo enviar.';
      outcome = 'failed';
    }
    if (outcome === 'failed' && (claimed.attempts < 3 || ['SMTP_NOT_CONFIGURED', 'WHATSAPP_SENDER_NOT_CONFIGURED', 'CAMPAIGN_PREPARING'].includes(errorMessage))) {
      const configurationMissing = ['SMTP_NOT_CONFIGURED', 'WHATSAPP_SENDER_NOT_CONFIGURED', 'CAMPAIGN_PREPARING'].includes(errorMessage);
      const retryAt = new Date(Date.now() + (errorMessage === 'CAMPAIGN_PREPARING' ? 1 : configurationMissing ? 60 : claimed.attempts * 15) * 60000).toISOString();
      const retryRef = queue.doc(`${Date.parse(retryAt)}_${randomUUID()}`);
      await adminDb.runTransaction(async tx => {
        tx.create(retryRef, { ...claimed, attempts: configurationMissing ? 0 : claimed.attempts,
          scheduledAt: retryAt, leaseUntil: 0, lastError: errorMessage.slice(0, 250) });
        tx.delete(job.ref);
      });
      continue;
    }
    await adminDb.runTransaction(async tx => {
      const campaignRef = campaigns.doc(claimed.campaignId), campaign = await tx.get(campaignRef);
      const data = campaign.data() || {};
      const key = outcome === 'sent' ? 'sentCount' : outcome === 'failed' ? 'failedCount' : 'skippedCount';
      const finished = Number(data.sentCount || 0) + Number(data.failedCount || 0) + Number(data.skippedCount || 0) + 1;
      tx.set(deliveries.doc(job.id), { campaignId: claimed.campaignId, colmadoId: claimed.colmadoId,
        templateId: claimed.templateId, recipient, channel: claimed.channel || '',
        status: outcome, attempts: claimed.attempts, providerMessageId,
        error: errorMessage.slice(0, 250), completedAt: new Date().toISOString() });
      tx.delete(job.ref);
      if (campaign.exists) tx.update(campaignRef, { [key]: FieldValue.increment(1),
        status: data.status === 'cancelled' ? 'cancelled' : finished >= Number(data.targetCount || 0) ? 'completed' : 'scheduled',
        updatedAt: new Date().toISOString() });
    });
    result[outcome]++;
  }
  return result;
}
