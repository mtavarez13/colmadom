import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
  if (!store.exists || !root.exists || store.data()?.isDeleted === true || root.data()?.isDeleted === true || store.data()?.isActive === false || root.data()?.isActive === false) throw new Error('FORBIDDEN');
  return { identity, profile, rootColmadoId };
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (message === 'FIREBASE_SERVICE_ACCOUNT_INVALID') return { status: 503, message: 'La cuenta de servicio de Firebase configurada no es válida. Importa nuevamente FIREBASE_SERVICE_ACCOUNT_BASE64 y vuelve a desplegar.' };
  if (/default credentials|could not load/i.test(message)) return { status: 503, message: 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en las variables de entorno de Hostinger. Importa el archivo .env privado y vuelve a desplegar.' };
  if (message === 'UNAUTHENTICATED') return { status: 401, message: 'Inicia sesión para continuar.' };
  if (message === 'FORBIDDEN') return { status: 403, message: 'No tienes permiso para realizar esta acción.' };
  return { status: 500, message: 'No se pudo completar la operación.' };
}
