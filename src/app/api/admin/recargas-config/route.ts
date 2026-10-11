import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requirePlatformAdmin } from '@/lib/server-auth';
import { normalizeRecargasEnvironment, recargasPublicError, recargasRequest, validateRecargasBaseUrl } from '@/services/recargas-dominicanas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PLATFORM_CONFIG = 'privateRecargasPlatformConfig/general';
const COMMISSION_KEYS = ['topup', 'dataPlan', 'pin', 'payInvoice', 'serviceTopup'] as const;

async function admin(request: NextRequest) {
  const identity = await requirePlatformAdmin(request);
  return { identity, ref: adminDb.doc(PLATFORM_CONFIG) };
}

function publicConfig(data: any) {
  const environment = normalizeRecargasEnvironment(data.activeEnvironment);
  const safeEnvironment = (name: 'test' | 'production') => {
    const saved = data[name] || {};
    return {
      configured: Boolean(saved.userName && saved.password),
      userName: saved.userName || '',
      passwordConfigured: Boolean(saved.password),
      baseUrl: saved.baseUrl || (name === 'production' ? 'https://api.recargasdominicanas.do/api' : ''),
      lastTestStatus: saved.lastTestStatus || '', lastTestAt: saved.lastTestAt || '',
    };
  };
  return {
    enabled: data.enabled === true, activeEnvironment: environment,
    test: safeEnvironment('test'), production: safeEnvironment('production'),
    commissions: Object.fromEntries(COMMISSION_KEYS.map(key => [key, Math.max(0, Number(data.commissions?.[key] || 0))])),
  };
}

export async function GET(request: NextRequest) {
  try {
    await admin(request);
    const data = (await adminDb.doc(PLATFORM_CONFIG).get()).data() || {};
    const colmadoId = String(request.nextUrl.searchParams.get('colmadoId') || '').trim();
    let wallet: any = null;
    if (colmadoId) {
      const store = (await adminDb.doc(`colmados/${colmadoId}`).get()).data();
      if (!store) return NextResponse.json({ error: 'Colmado no encontrado.' }, { status: 404 });
      const ledger = await adminDb.collection(`colmados/${colmadoId}/recargasWalletLedger`).orderBy('createdAt', 'desc').limit(20).get();
      wallet = { colmadoId, name: store.name || store.businessName || colmadoId, balance: Math.max(0, Number(store.recargasWalletBalance || 0)), ledger: ledger.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    }
    return NextResponse.json({ ...publicConfig(data), wallet });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { identity, ref } = await admin(request);
    const body = await request.json();
    const current = (await ref.get()).data() || {};
    const environment = normalizeRecargasEnvironment(body.activeEnvironment);
    const next: Record<string, any> = {};
    for (const name of ['test', 'production'] as const) {
      const incoming = body[name] || {};
      const previous = current[name] || {};
      const userName = String(incoming.userName || previous.userName || '').trim().slice(0, 160);
      const password = String(incoming.password || '') || previous.password || '';
      const requestedBaseUrl = incoming.baseUrl || previous.baseUrl || (name === 'production' ? 'https://api.recargasdominicanas.do/api' : '');
      const baseUrl = (userName || password || requestedBaseUrl) ? validateRecargasBaseUrl(requestedBaseUrl, name) : '';
      if ((userName || password) && (!userName || !password)) return NextResponse.json({ error: `Completa usuario y contraseña del ambiente ${name === 'test' ? 'de pruebas' : 'de producción'}.` }, { status: 400 });
      next[name] = { ...previous, userName, password, baseUrl };
    }
    const commissions: Record<string, number> = {};
    for (const key of COMMISSION_KEYS) {
      const amount = Number(body.commissions?.[key] ?? current.commissions?.[key] ?? 0);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10000) return NextResponse.json({ error: 'Las comisiones deben estar entre RD$0 y RD$10,000.' }, { status: 400 });
      commissions[key] = Math.round(amount * 100) / 100;
    }
    const enabled = body.enabled === true;
    if (enabled && !next[environment]?.userName) return NextResponse.json({ error: 'Configura las credenciales de la cuenta central para el ambiente seleccionado antes de habilitar el canal.' }, { status: 400 });
    await ref.set({ ...next, commissions, enabled, activeEnvironment: environment, managedBy: 'SAAS_ADMIN', updatedBy: identity.uid, updatedAt: new Date().toISOString() }, { merge: true });
    await adminDb.collection('auditLogs').add({ actorUid: identity.uid, action: 'RECARGAS_PLATFORM_CONFIGURED', enabled, environment, commissions, createdAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, ...publicConfig({ ...current, ...next, commissions, enabled, activeEnvironment: environment }) });
  } catch (error) {
    if (error instanceof Error && ['RECARGAS_TEST_URL_REQUIRED', 'RECARGAS_URL_INVALID'].includes(error.message)) {
      const failure = recargasPublicError(error);
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { identity, ref } = await admin(request);
    const body = await request.json();
    if (body.action === 'credit') {
      const colmadoId = String(body.colmadoId || '').trim();
      const amount = Number(body.amount);
      const note = String(body.note || '').trim().slice(0, 300);
      if (!colmadoId || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return NextResponse.json({ error: 'Selecciona un colmado e indica un monto válido.' }, { status: 400 });
      const storeRef = adminDb.doc(`colmados/${colmadoId}`);
      const ledgerRef = storeRef.collection('recargasWalletLedger').doc();
      const now = new Date().toISOString();
      let balance = 0;
      await adminDb.runTransaction(async transaction => {
        const store = await transaction.get(storeRef);
        if (!store.exists) throw new Error('FORBIDDEN');
        balance = Math.max(0, Number(store.data()?.recargasWalletBalance || 0)) + Math.round(amount * 100) / 100;
        transaction.set(storeRef, { recargasWalletBalance: balance, recargasWalletUpdatedAt: now }, { merge: true });
        transaction.set(ledgerRef, { id: ledgerRef.id, type: 'ADMIN_CREDIT', amount: Math.round(amount * 100) / 100, balanceAfter: balance, note, allocatedBy: identity.uid, createdAt: now });
      });
      await adminDb.collection('auditLogs').add({ actorUid: identity.uid, action: 'RECARGAS_WALLET_CREDITED', targetId: colmadoId, amount, note, createdAt: now });
      const ledger = await storeRef.collection('recargasWalletLedger').orderBy('createdAt', 'desc').limit(20).get();
      return NextResponse.json({ ok: true, balance, ledger: ledger.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }
    const environment = normalizeRecargasEnvironment(body.environment);
    const current = (await ref.get()).data() || {};
    const config = current[environment] || {};
    const userName = String(body.userName || config.userName || '').trim();
    const password = String(body.password || config.password || '');
    const baseUrl = validateRecargasBaseUrl(body.baseUrl || config.baseUrl || (environment === 'production' ? 'https://api.recargasdominicanas.do/api' : ''), environment);
    if (!userName || !password) return NextResponse.json({ error: 'Completa usuario y contraseña de la cuenta central para probar este ambiente.' }, { status: 400 });
    const credentials = { userName, password, baseUrl };
    await recargasRequest(credentials, '/auth/is-auth?version=1');
    const [business, products] = await Promise.all([recargasRequest<any>(credentials, '/business-user/business'), recargasRequest<any[]>(credentials, '/business/products')]);
    const now = new Date().toISOString();
    await ref.set({ [environment]: { ...config, userName, password, baseUrl, lastTestStatus: 'Connected', lastTestAt: now, productCount: Array.isArray(products) ? products.length : 0 }, updatedBy: identity.uid, updatedAt: now }, { merge: true });
    return NextResponse.json({ ok: true, testedAt: now, businessName: business?.name || '', productCount: Array.isArray(products) ? products.length : 0 });
  } catch (error) {
    if (error instanceof Error && ['RECARGAS_TEST_URL_REQUIRED', 'RECARGAS_URL_INVALID'].includes(error.message)) {
      const failure = recargasPublicError(error);
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    if (error instanceof Error && error.message === 'RECARGAS_AUTH_FAILED') return NextResponse.json({ error: 'Recargas Dominicanas rechazó el usuario o la contraseña del ambiente seleccionado.' }, { status: 401 });
    const failure = recargasPublicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
