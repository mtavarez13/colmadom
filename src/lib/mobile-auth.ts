import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from './firebase-admin';

export const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export class MobileError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function authenticatedMobile(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) throw new MobileError(401, 'Inicia sesión.');
  let identity;
  try { identity = await adminAuth.verifyIdToken(bearer.slice(7), true); }
  catch { throw new MobileError(401, 'Sesión vencida. Vuelve a iniciar sesión.'); }
  if (identity.email_verified !== true) throw new MobileError(403, 'Verifica tu correo electrónico antes de continuar.');
  return identity;
}
export function ordersRole(profile: FirebaseFirestore.DocumentData) {
  return profile.isActive !== false && (['Admin', 'Supervisor'].includes(profile.role) ||
    (!['Driver', 'Contable', 'ContableIndependiente'].includes(profile.role) && Array.isArray(profile.allowedModules) && profile.allowedModules.includes('orders')));
}
export async function activeStore(id: string) {
  const store = (await adminDb.doc(`colmados/${id}`).get()).data();
  if (!store || store.isActive === false || store.isDeleted === true) return null;
  const rootId = store.rootColmadoId || id;
  if (!validId(rootId)) return null;
  const plan = rootId === id ? store : (await adminDb.doc(`colmados/${rootId}`).get()).data();
  if (!plan || plan.isActive === false || plan.isDeleted === true || plan.suspensionNoticeEnabled === true) return null;
  const expiry = Number(plan.trialEndAtMillis) || Date.parse(plan.trialEndDate || '');
  if (plan.subscriptionStatus !== 'Active' && !(plan.subscriptionStatus === 'Trial' && Number.isFinite(expiry) && expiry > Date.now())) return null;
  return store;
}
export async function mobileIdentity(request: NextRequest, module: 'orders' | 'session' = 'orders') {
  const identity = await authenticatedMobile(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || !(ordersRole(profile) || (module === 'session' && profile.isActive !== false && !['Driver','Contable','ContableIndependiente'].includes(profile.role) && Array.isArray(profile.allowedModules) && profile.allowedModules.includes('pos')))) throw new MobileError(403, 'Tu cuenta no tiene acceso activo a pedidos. Solicita acceso al administrador.');
  const ids = [...new Set([profile.colmadoId, ...(profile.role === 'Admin' && Array.isArray(profile.allowedColmadoIds) ? profile.allowedColmadoIds : [])])].filter(validId);
  const stores = (await Promise.all(ids.map(async id => { const store = await activeStore(id); return store ? {id, name: String(store.name || store.businessName || id)} : null; }))).filter((s): s is {id:string;name:string} => s !== null);
  return {identity, profile, stores};
}
export async function requireMobileStore(request: NextRequest, id: string) {
  if (!validId(id)) throw new MobileError(400, 'Sucursal inválida.');
  const session = await mobileIdentity(request);
  if (!session.stores.some(store => store.id === id)) throw new MobileError(403, 'Sin acceso a esta sucursal.');
  return session;
}
export function mobileError(error: unknown) {
  if (error instanceof MobileError) return NextResponse.json({error:error.message}, {status:error.status});
  if (error instanceof SyntaxError) return NextResponse.json({error:'JSON inválido.'}, {status:400});
  console.error('Mobile API failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({error:'No se pudo completar la operación.'}, {status:500});
}
export async function limitedJson(request: NextRequest) {
  const text = await request.text();
  if (text.length > 32_768) throw new MobileError(413, 'Solicitud demasiado grande.');
  return JSON.parse(text);
}
