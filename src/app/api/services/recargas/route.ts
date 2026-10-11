import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requireIdentity } from '@/lib/server-auth';
import { normalizeRecargasEnvironment, recargasPublicError, recargasRequest, type RecargasEnvironment } from '@/services/recargas-dominicanas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PLATFORM_CONFIG = 'privateRecargasPlatformConfig/general';
const COMMISSION_KEYS = ['topup', 'dataPlan', 'pin', 'payInvoice', 'serviceTopup'] as const;

async function userContext(request: NextRequest) {
  const identity = await requireIdentity(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || profile.isActive === false || !profile.colmadoId) throw new Error('FORBIDDEN');
  const role = String(profile.role || '');
  const allowed = Array.isArray(profile.allowedModules) ? profile.allowedModules : [];
  if (!['Admin', 'Owner', 'Dueño', 'Cashier', 'Cajero'].includes(role) && !allowed.includes('services')) throw new Error('FORBIDDEN');
  const colmadoId = String(profile.rootColmadoId || profile.colmadoId);
  const [config, store] = await Promise.all([
    adminDb.doc(PLATFORM_CONFIG).get(), adminDb.doc(`colmados/${colmadoId}`).get(),
  ]);
  const settings = config.data() || {};
  if (settings.enabled !== true) throw new Error('RECARGAS_DISABLED');
  const environment = normalizeRecargasEnvironment(settings.activeEnvironment);
  const credentials = settings[environment] || {};
  if (!credentials.userName || !credentials.password) throw new Error('RECARGAS_CREDENTIALS_MISSING');
  return { identity, profile, colmadoId, store: store.data() || {}, settings, environment, credentials };
}

async function callProvider(credentials: any, environment: RecargasEnvironment, path: string, options?: { method?: string; body?: unknown }) {
  if (environment === 'test' && !credentials.baseUrl) throw new Error('RECARGAS_TEST_URL_REQUIRED');
  return recargasRequest(credentials, path, options);
}

function commission(settings: any, action: string) {
  return Math.max(0, Number(settings.commissions?.[action] || 0));
}

function walletBalance(context: any) { return Math.max(0, Number(context.store.recargasWalletBalance || 0)); }

export async function GET(request: NextRequest) {
  try {
    const context = await userContext(request);
    const { settings, environment, credentials } = context;
    const action = request.nextUrl.searchParams.get('action') || 'products';
    const balance = walletBalance(context);
    if (action === 'wallet') return NextResponse.json({ environment, walletBalance: balance, commissions: settings.commissions || {} });
    if (action === 'products') {
      const products = await callProvider(credentials, environment, '/business/products');
      return NextResponse.json({ environment, products: Array.isArray(products) ? products : [], walletBalance: balance, commissions: settings.commissions || {} });
    }
    if (action === 'business') {
      const business = await callProvider(credentials, environment, '/business-user/business');
      return NextResponse.json({ environment, business: { name: business?.name || 'Cuenta central de Recargas Dominicanas' }, walletBalance: balance });
    }
    if (action === 'transactions') {
      const page = Math.max(1, Math.min(1000, Number(request.nextUrl.searchParams.get('page') || 1)));
      const size = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get('size') || 25)));
      const snapshot = await adminDb.collection(`colmados/${context.colmadoId}/transactions`).where('provider', '==', 'RECARGAS_DOMINICANAS').limit(250).get();
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return NextResponse.json({ environment, transactions: { data: rows.slice((page - 1) * size, page * size), total: rows.length }, walletBalance: balance });
    }
    const productId = Number(request.nextUrl.searchParams.get('productId'));
    const phone = String(request.nextUrl.searchParams.get('phone') || '').replace(/\D/g, '').slice(0, 15);
    const nic = String(request.nextUrl.searchParams.get('nic') || '').trim().slice(0, 80);
    if (!Number.isInteger(productId) || productId < 1) return NextResponse.json({ error: 'Selecciona un producto válido.' }, { status: 400 });
    if (action === 'data-plans') {
      if (phone.length < 10) return NextResponse.json({ error: 'Escribe un teléfono válido.' }, { status: 400 });
      const plans = await callProvider(credentials, environment, `/transactions/data-plans/${productId}/${encodeURIComponent(phone)}`);
      return NextResponse.json({ environment, plans: Array.isArray(plans) ? plans : [], walletBalance: balance });
    }
    if (action === 'invoice') {
      if (!nic) return NextResponse.json({ error: 'Escribe el número de contrato o NIC.' }, { status: 400 });
      const invoice = await callProvider(credentials, environment, `/transactions/invoice/${productId}/${encodeURIComponent(nic)}`);
      return NextResponse.json({ environment, invoice, walletBalance: balance });
    }
    if (action === 'topup-holder') {
      if (phone.length < 5) return NextResponse.json({ error: 'Escribe un número de contrato válido.' }, { status: 400 });
      const holder = await callProvider(credentials, environment, `/transactions/topup?productId=${productId}&number=${encodeURIComponent(phone)}`);
      return NextResponse.json({ environment, holder, walletBalance: balance });
    }
    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'RECARGAS_DISABLED') return NextResponse.json({ error: 'Recargas Dominicanas todavía no está habilitado por el administrador SaaS.' }, { status: 403 });
    if (error instanceof Error && ['RECARGAS_TEST_URL_REQUIRED', 'RECARGAS_URL_INVALID', 'RECARGAS_CREDENTIALS_MISSING', 'RECARGAS_AUTH_FAILED'].includes(error.message)) {
      const failure = recargasPublicError(error);
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    const failure = apiError(error);
    if (failure.status !== 500) return NextResponse.json({ error: failure.message }, { status: failure.status });
    const providerFailure = recargasPublicError(error);
    return NextResponse.json({ error: providerFailure.message }, { status: providerFailure.status });
  }
}

export async function POST(request: NextRequest) {
  let reservation: { storeRef: any; ledgerRef: any; colmadoId: string; amount: number; uid: string; transactionId: string } | null = null;
  let providerSucceeded = false;
  try {
    const context = await userContext(request);
    const body = await request.json();
    const { environment, settings, credentials } = context;
    const action = String(body.action || 'topup');
    const productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId < 1) return NextResponse.json({ error: 'Selecciona un producto válido.' }, { status: 400 });
    const phone = String(body.phone || '').replace(/\D/g, '').slice(0, 15);
    const number = String(body.number || '').replace(/\D/g, '').slice(0, 40);
    const nic = String(body.nic || '').trim().slice(0, 80);
    const amount = Number(body.amount);
    const validAmount = Number.isFinite(amount) && amount > 0 && amount <= 100000;
    const pathByAction: Record<string, string> = { topup: '/business-user/send-transaction', serviceTopup: '/transactions/send-service-topup', dataPlan: '/transactions/send-data-plan', pin: '/transactions/send-pin', payInvoice: '/transactions/pay-invoice' };
    if (!pathByAction[action]) return NextResponse.json({ error: 'Operación no reconocida.' }, { status: 400 });
    let providerBody: Record<string, unknown>;
    let targetNumber = phone || number;
    let amountToRecord = amount;
    let description = '';
    if (action === 'topup') {
      if (phone.length < 10 || !validAmount) return NextResponse.json({ error: 'Revisa el teléfono y el monto de la recarga.' }, { status: 400 });
      providerBody = { productId, phone, amount }; description = `Recarga móvil a ${phone}`;
    } else if (action === 'serviceTopup') {
      if (number.length < 5 || !validAmount) return NextResponse.json({ error: 'Revisa el contrato o número de servicio y el monto.' }, { status: 400 });
      providerBody = { productId, number, amount }; targetNumber = number; description = `Recarga de servicio ${number}`;
    } else if (action === 'dataPlan') {
      const planId = String(body.planId || '').trim().slice(0, 120);
      if (phone.length < 10 || !planId || !validAmount) return NextResponse.json({ error: 'Selecciona un paquetico y revisa el teléfono y precio del plan.' }, { status: 400 });
      providerBody = { productId, phone, planId }; description = `Paquetico móvil a ${phone}`;
    } else if (action === 'pin') {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0 || price > 100000) return NextResponse.json({ error: 'Selecciona un precio válido para el PIN.' }, { status: 400 });
      amountToRecord = price; providerBody = { productId, price }; description = 'Compra de PIN prepagado';
    } else {
      if (!nic || !validAmount) return NextResponse.json({ error: 'Revisa el NIC y el monto de la factura.' }, { status: 400 });
      providerBody = { productId, nic, amount }; targetNumber = nic; description = `Pago de factura ${nic}`;
    }
    if (action === 'dataPlan') {
      const catalog = await callProvider(credentials, environment, `/transactions/data-plans/${productId}/${encodeURIComponent(phone)}`);
      const plan = Array.isArray(catalog) ? catalog.find((entry: any) => String(entry.id) === String(providerBody.planId)) : null;
      const catalogPrice = Number(plan?.price);
      if (!plan || !Number.isFinite(catalogPrice) || catalogPrice <= 0 || Math.abs(catalogPrice - amountToRecord) > 0.01) return NextResponse.json({ error: 'El paquetico cambió de precio o ya no está disponible. Consulta los planes de nuevo.' }, { status: 409 });
      amountToRecord = catalogPrice;
    }
    if (action === 'payInvoice') {
      const invoice = await callProvider(credentials, environment, `/transactions/invoice/${productId}/${encodeURIComponent(nic)}`);
      const invoiceAmount = Number((invoice as any)?.amount);
      if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || amountToRecord > invoiceAmount) return NextResponse.json({ error: 'El monto no coincide con la factura pendiente del proveedor. Consulta la factura de nuevo.' }, { status: 409 });
    }
    const fee = commission(settings, action);
    const charge = Math.round((amountToRecord + fee) * 100) / 100;
    const storeRef = adminDb.doc(`colmados/${context.colmadoId}`);
    const ledgerRef = storeRef.collection('recargasWalletLedger').doc();
    const now = new Date().toISOString();
    const operationRef = adminDb.collection(`colmados/${context.colmadoId}/transactions`).doc();
    await adminDb.runTransaction(async transaction => {
      const store = await transaction.get(storeRef);
      const balance = Math.max(0, Number(store.data()?.recargasWalletBalance || 0));
      if (!store.exists || balance < charge) throw new Error('RECARGAS_INSUFFICIENT_FUNDS');
      const nextBalance = Math.round((balance - charge) * 100) / 100;
      transaction.set(storeRef, { recargasWalletBalance: nextBalance, recargasWalletUpdatedAt: now }, { merge: true });
      transaction.set(ledgerRef, { id: ledgerRef.id, type: 'SALE_PENDING', amount: -charge, serviceAmount: amountToRecord, commission: fee, balanceAfter: nextBalance, transactionId: operationRef.id, reservedBy: context.identity.uid, createdAt: now });
    });
    reservation = { storeRef, ledgerRef, colmadoId: context.colmadoId, amount: charge, uid: context.identity.uid, transactionId: operationRef.id };

    let result: any;
    try {
      result = await callProvider(credentials, environment, pathByAction[action], { method: 'POST', body: providerBody });
      if (result?.cancelled === true) throw new Error('RECARGAS_TRANSACTION_CANCELLED');
      providerSucceeded = true;
    } catch (error) {
      const hold = reservation;
      if (hold) await adminDb.runTransaction(async transaction => {
        const store: any = await transaction.get(hold.storeRef as any);
        const ledger: any = await transaction.get(hold.ledgerRef as any);
        if (ledger.data()?.type !== 'SALE_PENDING') return;
        const balance = Math.max(0, Number(store.data()?.recargasWalletBalance || 0)) + hold.amount;
        transaction.set(hold.storeRef, { recargasWalletBalance: balance, recargasWalletUpdatedAt: new Date().toISOString() }, { merge: true });
        transaction.set(hold.ledgerRef, { type: 'SALE_REFUNDED', balanceAfter: balance, refundedAt: new Date().toISOString(), failure: error instanceof Error ? error.message : 'provider_error' }, { merge: true });
      });
      reservation = null;
      throw error;
    }
    const reference = String(result?.id ?? result?.reference ?? `rd-${Date.now()}`);
    const providerProfit = Math.max(0, Number(result?.profit || 0));
    const itemName = String(result?.product?.name || (action === 'dataPlan' ? 'Paquetico' : action === 'pin' ? 'PIN prepagado' : action === 'payInvoice' ? 'Pago de factura' : 'Recarga móvil'));
    if (!Number.isFinite(amountToRecord) || amountToRecord <= 0) amountToRecord = Number(result?.amount || 0);
    await operationRef.set({
      id: operationRef.id, colmadoId: context.colmadoId, transactionType: 'Sale', serviceType: action,
      provider: 'RECARGAS_DOMINICANAS', providerEnvironment: environment, providerTransactionId: reference,
      description: `${description} · ${itemName}`, totalAmount: charge, providerAmount: amountToRecord, commission: fee,
      providerProfit, netProfit: fee, productName: itemName,
      items: [{ name: `${itemName}${targetNumber ? ` · ${targetNumber}` : ''}`, quantity: 1, price: charge, costPrice: amountToRecord, lineTotal: charge, profit: fee, isService: true }],
      cashAmount: charge, cardAmount: 0, paymentMethod: 'PrepaidWallet', isComplete: true, status: result?.cancelled ? 'CANCELLED' : 'COMPLETED',
      userId: context.identity.uid, cashierName: String(context.profile.firstName || 'Cajero'), customerPhone: targetNumber, productId,
      cashRegisterSessionId: 'active_session', createdAt: now, updatedAt: now,
    });
    const hold = reservation;
    if (hold) await hold.ledgerRef.set({ type: 'SALE_COMPLETED', providerReference: reference, completedAt: new Date().toISOString() }, { merge: true });
    reservation = null;
    const balance = Math.max(0, Number((await storeRef.get()).data()?.recargasWalletBalance || 0));
    return NextResponse.json({ ok: true, transaction: result, walletBalance: balance, serviceAmount: amountToRecord, commission: fee, chargedAmount: charge });
  } catch (error) {
    const hold = reservation;
    if (hold && !providerSucceeded) await adminDb.runTransaction(async transaction => {
      const store: any = await transaction.get(hold.storeRef as any);
      const ledger: any = await transaction.get(hold.ledgerRef as any);
      if (ledger.data()?.type !== 'SALE_PENDING') return;
      const balance = Math.max(0, Number(store.data()?.recargasWalletBalance || 0)) + hold.amount;
      transaction.set(hold.storeRef, { recargasWalletBalance: balance, recargasWalletUpdatedAt: new Date().toISOString() }, { merge: true });
      transaction.set(hold.ledgerRef, { type: 'SALE_REFUNDED', balanceAfter: balance, refundedAt: new Date().toISOString() }, { merge: true });
    }).catch(() => undefined);
    if (error instanceof Error && error.message === 'RECARGAS_DISABLED') return NextResponse.json({ error: 'Recargas Dominicanas todavía no está habilitado por el administrador SaaS.' }, { status: 403 });
    if (error instanceof Error && error.message === 'RECARGAS_INSUFFICIENT_FUNDS') return NextResponse.json({ error: 'Saldo prepago insuficiente. Solicita una recarga de saldo al administrador.' }, { status: 402 });
    if (error instanceof Error && error.message === 'RECARGAS_TRANSACTION_CANCELLED') return NextResponse.json({ error: 'El proveedor canceló la operación; el saldo reservado fue devuelto.' }, { status: 409 });
    if (error instanceof Error && ['RECARGAS_TEST_URL_REQUIRED', 'RECARGAS_URL_INVALID', 'RECARGAS_CREDENTIALS_MISSING', 'RECARGAS_AUTH_FAILED'].includes(error.message)) {
      const failure = recargasPublicError(error); return NextResponse.json({ error: failure.message }, { status: failure.status });
    }
    const failure = apiError(error);
    if (failure.status !== 500) return NextResponse.json({ error: failure.message }, { status: failure.status });
    const providerFailure = recargasPublicError(error);
    return NextResponse.json({ error: providerFailure.message }, { status: providerFailure.status });
  }
}
