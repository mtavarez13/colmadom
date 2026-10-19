import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { adminDb } from './firebase-admin';
import { authenticatedMobile, activeStore, validId, MobileError } from './mobile-auth';
import { branchAllowed, posRole, Checkout, buildPosSale, PosValidationError } from './mobile-pos-core';
import { fiscalSnapshot } from './dominican-fiscal';

export async function requirePos(request: NextRequest, storeId: string) {
  if (!validId(storeId)) throw new MobileError(400,'Sucursal inválida.');
  const identity = await authenticatedMobile(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || !posRole(profile) || !branchAllowed(profile,storeId)) throw new MobileError(403,'Sin permiso de punto de venta en esta sucursal.');
  const store = await activeStore(storeId);
  if (!store || store.isActive === false) throw new MobileError(403,'Sucursal o suscripción inactiva.');
  return {identity,profile,store};
}
export function fiscalBlock(store: Record<string, any>) {
  return !!store.fiscalEnabled || (store.fiscalMode && store.fiscalMode !== 'disabled');
}
export async function checkoutPos(request: NextRequest, input: Checkout) {
  const {identity} = await requirePos(request,input.storeId);
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const saleId = `mobile_${hash(`${identity.uid}:${input.storeId}:${input.requestId}`)}`;
  const requestHash = hash(JSON.stringify(input));
  const root = adminDb.doc(`colmados/${input.storeId}`);
  const receiptRef = root.collection('mobilePosReceipts').doc(saleId);
  return adminDb.runTransaction(async tx => {
    const existing = await tx.get(receiptRef);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.userId !== identity.uid || data.requestHash !== requestHash) throw new MobileError(409,'La referencia ya corresponde a otra solicitud. Conserva el comprobante original.');
      return {sale:data.sale,replayed:true};
    }
    const [profileDoc,storeDoc] = await Promise.all([tx.get(adminDb.doc(`userProfiles/${identity.uid}`)),tx.get(root)]);
    const profile = profileDoc.data(), store = storeDoc.data();
    if (!profile || !posRole(profile) || !branchAllowed(profile,input.storeId) || !store || store.isActive === false) throw new MobileError(403,'Acceso revocado.');
    const planId = store.rootColmadoId || input.storeId;
    if (!validId(planId)) throw new MobileError(403,'Suscripción inválida.');
    const plan = planId === input.storeId ? store : (await tx.get(adminDb.doc(`colmados/${planId}`))).data();
    const expiry = Number(plan?.trialEndAtMillis) || Date.parse(plan?.trialEndDate || '');
    if (!plan || plan.suspensionNoticeEnabled === true || (plan.subscriptionStatus !== 'Active' && !(plan.subscriptionStatus === 'Trial' && expiry > Date.now()))) throw new MobileError(403,'Suscripción inactiva o suspendida por pago.');
    if (fiscalBlock(store)) throw new MobileError(422,'Esta sucursal requiere facturación fiscal. Finaliza la venta en el POS web.');
    const products = new Map<string,FirebaseFirestore.DocumentData>();
    const ids = [...new Set(input.items.map(i=>i.productId))];
    const docs = await tx.getAll(...ids.map(id=>root.collection('products').doc(id)));
    for (const doc of docs) if (doc.exists) products.set(doc.id,doc.data()!);
    const componentIds = new Set<string>();
    for (const p of products.values()) if (p.isCombo && Array.isArray(p.comboItems)) {
      if (p.comboItems.length > 80) throw new MobileError(422,'Combo demasiado grande.');
      for (const c of p.comboItems) {
        if (!validId(c.id)) throw new MobileError(422,'Combo inválido.');
        if (!products.has(c.id)) componentIds.add(c.id);
      }
    }
    if (componentIds.size + ids.length > 200) throw new MobileError(422,'Demasiados productos en una venta.');
    if (componentIds.size) for (const doc of await tx.getAll(...[...componentIds].map(id=>root.collection('products').doc(id)))) if (doc.exists) products.set(doc.id,doc.data()!);
    let calculated;
    try { calculated = buildPosSale(input,products); } catch(error) { if (error instanceof PosValidationError) throw new MobileError(422,error.message); throw error; }
    const now = new Date().toISOString();
    const sale = {
      id:saleId,storeId:input.storeId,colmadoId:input.storeId,storeName:String(store.name || ''),storeAddress:String(store.address || ''),storePhone:String(store.phoneNumber || ''),
      transactionType:'Sale',userId:identity.uid,cashierName:String(profile.firstName || 'Cajero'),createdAt:now,
      items:calculated.items,totalAmount:calculated.totalAmount,subtotalBeforeDiscount:calculated.totalAmount,discountPercent:0,discountAmount:0,discountApprovedBy:null,
      cashAmount:input.paymentMethod === 'Efectivo'?calculated.totalAmount:0,cardAmount:input.paymentMethod === 'Tarjeta'?calculated.totalAmount:0,fiadoAmount:0,
      paymentMethod:input.paymentMethod,paymentRef:input.paymentRef || '',paidAmount:calculated.paidAmount,changeGiven:calculated.changeGiven,isComplete:true,
      customerId:null,customerName:'Venta General',customerDebt:0,cashRegisterSessionId:'active_session',source:'android-pos',
      ...fiscalSnapshot(store,{items:calculated.items,discountAmount:0}),
      receiptNotice:'RECIBO NO FISCAL. Tarjeta: pago registrado externamente; esta aplicación no procesa cargos.',
    };
    for (const [id,quantity] of calculated.stock) tx.update(root.collection('products').doc(id),{quantityInStock:Math.max(0,Number(products.get(id)!.quantityInStock)-quantity),updatedAt:now});
    tx.create(root.collection('transactions').doc(saleId),sale);
    tx.create(receiptRef,{userId:identity.uid,requestHash,sale,createdAt:now});
    return {sale,replayed:false};
  });
}
