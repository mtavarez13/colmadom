import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { connectionRef } from '@/lib/whatsapp-cloud';
import { getMetaConfig } from '@/lib/meta-config';
import { assertStoreNotSuspended } from '@/lib/server-auth';

export const runtime = 'nodejs';

async function owner(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) throw new Error('AUTH');
  const identity = await adminAuth.verifyIdToken(token);
  const profile = (await adminDb.doc('userProfiles/' + identity.uid).get()).data();
  if (!profile || profile.role !== 'Admin' || profile.isActive === false || !profile.colmadoId) throw new Error('OWNER');
  await assertStoreNotSuspended(profile.colmadoId);
  return { uid: identity.uid, email: String(identity.email||'').toLowerCase(), colmadoId: String(profile.colmadoId) };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'No se pudo conectar con Meta.';
  return NextResponse.json({ error: message === 'AUTH' ? 'Inicia sesión.' : message === 'OWNER' ? 'Solo el dueño puede administrar WhatsApp.' : message },
    { status: message === 'AUTH' ? 401 : message === 'OWNER' ? 403 : 400 });
}

export async function GET(request: NextRequest) {
  try {
    const { colmadoId } = await owner(request);
    const data = (await connectionRef(colmadoId).get()).data();
    const meta=await getMetaConfig(),missing=[!meta.appId?'META_APP_ID':'',!meta.appSecret?'META_APP_SECRET':'',!meta.configId?'META_EMBEDDED_SIGNUP_CONFIG_ID':'',!meta.verifyToken?'META_WEBHOOK_VERIFY_TOKEN':''].filter(Boolean);
    const publicOrigin=(meta.publicAppUrl||request.nextUrl.origin).replace(/\/$/,'');
    return NextResponse.json({
      configured: missing.length === 0, missing,
      voiceProviderConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||process.env.GOOGLE_GENAI_API_KEY),
      managedBySaas: true,
      webhookUrl: publicOrigin + '/api/whatsapp/webhook', webhookVerifyTokenConfigured: Boolean(meta.verifyToken),
      connection: data ? { status: data.status, displayPhone: data.displayPhone, verifiedName: data.verifiedName,
        autoReplyEnabled: data.autoReplyEnabled === true, welcomeMessage: data.welcomeMessage || '', posNotificationsEnabled: data.posNotificationsEnabled === true, voiceRepliesEnabled:data.voiceRepliesEnabled===true,voiceName:data.voiceName||'Aoede',lastVoiceError:data.lastVoiceError||'',connectedAt: data.connectedAt } : null
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { colmadoId } = await owner(request);
    const body = await request.json();
    const action = String(body.action || '');
    const ref = connectionRef(colmadoId);
    if (action !== 'settings') return NextResponse.json({error:'La conexión de WhatsApp Cloud solo puede ser configurada por el administrador SaaS.'},{status:403});
    if (!(await ref.get()).exists) return NextResponse.json({ error: 'El administrador SaaS debe conectar primero el número de este colmado.' }, { status: 409 });
    const welcomeMessage = String(body.welcomeMessage || '').trim().slice(0, 1000);
    if (body.autoReplyEnabled && !welcomeMessage) return NextResponse.json({ error: 'Escribe la respuesta automática.' }, { status: 400 });
    const allowedVoices=new Set(['Aoede','Leda','Achernar','Vindemiatrix','Sulafat']),voiceName=allowedVoices.has(String(body.voiceName))?String(body.voiceName):'Aoede';
    await ref.update({ autoReplyEnabled: body.autoReplyEnabled === true, welcomeMessage, posNotificationsEnabled: body.posNotificationsEnabled === true,voiceRepliesEnabled:body.voiceRepliesEnabled===true,voiceName,updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
