import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { canViewBusinessBilling } from '@/lib/billing-audience';

const PLATFORM_ADMINS = new Set([
  'admin@colmadom.com',
  'martin.tavarez.gomez@gmail.com',
  'tavarezgomezmartin@gmail.com',
]);

export async function requireIdentity(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  return adminAuth.verifyIdToken(token);
}

export async function requirePlatformAdmin(request: NextRequest) {
  const identity = await requireIdentity(request);
  if (!identity.email || !PLATFORM_ADMINS.has(identity.email.toLowerCase())) throw new Error('FORBIDDEN');
  return identity;
}

export async function assertStoreNotSuspended(colmadoId: string) {
  const store = await adminDb.doc(`colmados/${colmadoId}`).get();
  if (!store.exists || store.data()?.isDeleted === true) throw new Error('FORBIDDEN');
  const rootId = String(store.data()?.rootColmadoId || colmadoId);
  const root = rootId === colmadoId ? store : await adminDb.doc(`colmados/${rootId}`).get();
  if (!root.exists || root.data()?.isDeleted === true || root.data()?.suspensionNoticeEnabled === true) throw new Error('SUBSCRIPTION_SUSPENDED');
}

export async function requireOwner(request: NextRequest) {
  const identity = await requireIdentity(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || profile.isActive === false || profile.role !== 'Admin' || !profile.colmadoId) throw new Error('FORBIDDEN');
  const colmadoId = profile.colmadoId;
  const rootColmadoId = profile.rootColmadoId || colmadoId;
  const [store, root] = await Promise.all([
    adminDb.doc(`colmados/${colmadoId}`).get(),
    adminDb.doc(`colmados/${rootColmadoId}`).get(),
  ]);
  if (!store.exists || !root.exists || store.data()?.isDeleted === true || root.data()?.isDeleted === true || store.data()?.isActive === false || root.data()?.isActive === false || root.data()?.suspensionNoticeEnabled === true) throw new Error('FORBIDDEN');
  return { identity, profile, rootColmadoId };
}

export async function requireBillingUser(request: NextRequest) {
  const identity = await requireIdentity(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || profile.isActive === false || !profile.colmadoId) throw new Error('FORBIDDEN');
  const colmadoId = String(profile.colmadoId);
  const store = await adminDb.doc(`colmados/${colmadoId}`).get();
  if (!store.exists || store.data()?.isDeleted === true || store.data()?.isActive === false) throw new Error('FORBIDDEN');
  const rootColmadoId = String(store.data()?.rootColmadoId || colmadoId);
  const root = rootColmadoId === colmadoId ? store : await adminDb.doc(`colmados/${rootColmadoId}`).get();
  if (!root.exists || root.data()?.isDeleted === true || root.data()?.isActive === false || !canViewBusinessBilling(root.data(), identity.uid, profile.role)) throw new Error('FORBIDDEN');
  return { identity, profile, rootColmadoId };
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (message === 'FIREBASE_SERVICE_ACCOUNT_INVALID') return { status: 503, message: 'La cuenta de servicio de Firebase no es válida. Revisa FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_SERVICE_ACCOUNT_BASE64 en las variables de entorno de Hostinger y vuelve a desplegar.' };
  if (/default credentials|could not load/i.test(message)) return { status: 503, message: 'Falta configurar la cuenta de servicio de Firebase en Hostinger. Añade FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_SERVICE_ACCOUNT_BASE64 en Variables de entorno y vuelve a desplegar.' };
  if (message === 'UNAUTHENTICATED') return { status: 401, message: 'Inicia sesión para continuar.' };
  if (message === 'FORBIDDEN') return { status: 403, message: 'No tienes permiso para realizar esta acción.' };
  if (message === 'SUBSCRIPTION_SUSPENDED') return { status: 403, message: 'El servicio está suspendido. Confirma el pago o contacta al administrador SaaS.' };
  if (message === 'PAYPAL_NOT_CONFIGURED') return { status: 503, message: 'PayPal requiere el Client ID y la clave secreta del servidor.' };
  if (message === 'PAYPAL_AUTH_FAILED') return { status: 502, message: 'PayPal rechazó las credenciales. Revisa que Client ID, clave secreta y entorno correspondan a la misma cuenta.' };
  return { status: 500, message: 'No se pudo completar la operación.' };
}
