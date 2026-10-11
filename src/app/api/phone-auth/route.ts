import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { firebaseConfig } from '@/firebase/config';

export const runtime = 'nodejs';

const PLATFORM_EMAILS = new Set([
  'admin@colmadom.com',
  'martin.tavarez.gomez@gmail.com',
  'tavarezgomezmartin@gmail.com'
]);
const STAFF_ROLES = new Set(['Supervisor', 'Cajero', 'Driver', 'Contable']);

function phoneOf(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function verifyEmailAccountByPhone(phone: string, password: string): Promise<string | null> {
  const profiles = await adminDb.collection('userProfiles').where('phoneNumber', '==', phone).get();
  const matches = profiles.docs.filter(item => item.data().email && item.data().isActive !== false);
  const uids = Array.from(new Set(matches.map(item => item.id)));
  if (uids.length !== 1) return null;
  const profile = matches.find(item => item.id === uids[0]);
  const email = String(profile?.data().email || '').trim().toLowerCase();
  if (!email) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const result = await response.json() as { localId?: string };
    return result.localId === uids[0] ? uids[0] : null;
  } catch {
    return null;
  }
}

async function caller(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) return null;
  const decoded = await adminAuth.verifyIdToken(token);
  const profile = await adminDb.doc(`userProfiles/${decoded.uid}`).get();
  return { uid: decoded.uid, platform: PLATFORM_EMAILS.has(decoded.email || ''), profile: profile.data() };
}

function canManageBranch(actor: NonNullable<Awaited<ReturnType<typeof caller>>>, colmadoId: string): boolean {
  return actor.platform || actor.profile?.role === 'Admin' &&
    (actor.profile?.colmadoId === colmadoId ||
     (Array.isArray(actor.profile?.allowedColmadoIds) && actor.profile.allowedColmadoIds.includes(colmadoId)));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action || '');
    const phone = phoneOf(body.phone);
    const password = String(body.password || '');
    if (phone.length < 10 || phone.length > 15 || (action !== 'deleteStaff' && action !== 'updateStaff' && password.length < 4) ||
        (action === 'updateStaff' && password.length > 0 && password.length < 4)) return fail('Teléfono o clave inválidos.');
    const credentialRef = adminDb.doc(`phoneCredentials/${phone}`);

    if (action === 'login') {
      const attemptRef = adminDb.doc(`phoneLoginAttempts/${phone}`);
      const attempt = (await attemptRef.get()).data();
      const now = Date.now();
      if (Number(attempt?.blockedUntil || 0) > now) return fail('Demasiados intentos. Intenta en 15 minutos.', 429);
      const wrongPassword = async () => {
        const count = Number(attempt?.resetAt || 0) > now ? Number(attempt?.count || 0) + 1 : 1;
        await attemptRef.set({ count, resetAt: now + 15 * 60_000, blockedUntil: count >= 5 ? now + 15 * 60_000 : 0 });
        return fail('Teléfono o clave incorrectos.', 401);
      };
      let credential = await credentialRef.get();
      if (!credential.exists) {
        // One-time migration of existing phone accounts. The old profile is never sent to the browser.
        const legacy = await adminDb.collection('userProfiles').where('phoneNumber', '==', phone).get();
        const matching = legacy.docs.filter(item => sameSecret(String(item.data().accessPassword || ''), password));
        if (matching.length === 0) {
          const uid = await verifyEmailAccountByPhone(phone, password);
          if (!uid) return wrongPassword();
          await attemptRef.delete().catch(() => undefined);
          return NextResponse.json({ token: await adminAuth.createCustomToken(uid) });
        }
        if (legacy.docs.some(item => item.data().accessPassword && !sameSecret(String(item.data().accessPassword), password)))
          return fail('Este teléfono tiene registros con claves distintas. Pide al administrador que los revise.', 409);
        matching.sort((a, b) => String(a.data().createdAt || '').localeCompare(String(b.data().createdAt || '')));
        const selected = matching.find(item => item.data().colmadoId) || matching[0];
        const data = selected.data();
        await adminDb.runTransaction(async tx => {
          const existing = await tx.get(credentialRef);
          if (!existing.exists) tx.create(credentialRef, {
            phoneNumber: phone, accessPassword: password, uid: selected.id,
            colmadoId: data.colmadoId || null, createdAt: new Date().toISOString()
          });
          for (const item of legacy.docs) {
            if (item.data().accessPassword !== undefined) tx.update(item.ref, { accessPassword: FieldValue.delete() });
          }
        });
        credential = await credentialRef.get();
      }
      const saved = credential.data();
      if (!saved || !sameSecret(String(saved.accessPassword), password)) return wrongPassword();
      const profile = await adminDb.doc(`userProfiles/${saved.uid}`).get();
      if (!profile.exists || profile.data()?.isActive === false) return fail('Acceso inactivo. Contacta al administrador.', 403);
      if (!saved.colmadoId && profile.data()?.colmadoId)
        await credentialRef.update({ colmadoId: profile.data()?.colmadoId });
      await attemptRef.delete().catch(() => undefined);
      return NextResponse.json({ token: await adminAuth.createCustomToken(saved.uid) });
    }

    if (action === 'register') {
      const name = String(body.name || '').trim();
      if (!name) return fail('Indica tu nombre.');
      if (!(await adminDb.collection('userProfiles').where('phoneNumber', '==', phone).limit(1).get()).empty)
        return fail('Este teléfono ya está registrado.', 409);
      const uid = randomUUID();
      await adminDb.runTransaction(async tx => {
        if ((await tx.get(credentialRef)).exists) throw new Error('PHONE_EXISTS');
        tx.create(credentialRef, { phoneNumber: phone, accessPassword: password, uid, colmadoId: null, createdAt: new Date().toISOString() });
        tx.create(adminDb.doc(`userProfiles/${uid}`), {
          id: uid, firstName: name, phoneNumber: phone, role: 'Admin', isActive: true,
          createdAt: new Date().toISOString()
        });
      });
      return NextResponse.json({ token: await adminAuth.createCustomToken(uid) });
    }

    const actor = await caller(request);
    if (!actor || (!actor.platform && actor.profile?.role !== 'Admin')) return fail('Sin permiso para administrar usuarios.', 403);
    if (action === 'createIndependentAccountant') {
      return fail('Los contadores independientes deben registrarse exclusivamente con Google.', 410);
    }
    if (action === 'createStaff') {
      const colmadoId = String(body.colmadoId || '');
      const role = String(body.role || 'Cajero');
      const requestedIds: string[] = Array.isArray(body.allowedColmadoIds) ? body.allowedColmadoIds.map(String) : [colmadoId];
      const allowedColmadoIds = role === 'Contable'
        ? Array.from(new Set(requestedIds.filter(id => canManageBranch(actor, id))))
        : [colmadoId];
      const name = String(body.name || '').trim();
      if (!name || !STAFF_ROLES.has(role) || !canManageBranch(actor, colmadoId) || allowedColmadoIds.length === 0) return fail('Datos del usuario inválidos.', 403);
      if (!(await adminDb.collection('userProfiles').where('phoneNumber', '==', phone).limit(1).get()).empty)
        return fail('Este teléfono ya está registrado.', 409);
      const driverId = role === 'Driver' ? String(body.driverId || `drv_${randomUUID()}`) : null;
      const uid = body.driverId && role === 'Driver' ? `u_${driverId}` : randomUUID();
      await adminDb.runTransaction(async tx => {
        if ((await tx.get(credentialRef)).exists) throw new Error('PHONE_EXISTS');
        tx.create(credentialRef, { phoneNumber: phone, accessPassword: password, uid, colmadoId, createdAt: new Date().toISOString() });
        tx.create(adminDb.doc(`userProfiles/${uid}`), {
          id: uid, colmadoId, firstName: name, phoneNumber: phone, role,
          ...(driverId ? { driverId } : {}),
          ...(body.email && role === 'Driver' ? { email: String(body.email).toLowerCase().trim() } : {}),
          isActive: true,
          allowedModules: role === 'Driver' ? ['driver'] : role === 'Contable' ? ['inventory-audit'] : (Array.isArray(body.allowedModules) ? body.allowedModules : []),
          ...(role === 'Contable' ? { allowedColmadoIds } : {}),
          createdAt: new Date().toISOString()
        });
        if (driverId) tx.set(adminDb.doc(`colmados/${colmadoId}/drivers/${driverId}`), {
          id: driverId, uid, colmadoId, fullName: name, phoneNumber: phone, isAvailable: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      return NextResponse.json({ ok: true });
    }
    if (action === 'updateStaff') {
      let uid = String(body.uid || '');
      let target = await adminDb.doc(`userProfiles/${uid}`).get();
      if (!target.exists && body.driverId) {
        const matches = await adminDb.collection('userProfiles').where('driverId', '==', String(body.driverId)).limit(2).get();
        if (matches.size === 1) { target = matches.docs[0]; uid = target.id; }
      }
      if (!target.exists || !STAFF_ROLES.has(target.data()?.role) ||
          !canManageBranch(actor, String(target.data()?.colmadoId || ''))) return fail('Usuario no autorizado.', 403);
      const existing = await credentialRef.get();
      if (existing.exists && existing.data()?.uid !== uid) return fail('Este teléfono ya está registrado.', 409);
      const oldPhone = phoneOf(target.data()?.phoneNumber);
      const effectivePassword = password || String(target.data()?.accessPassword || '');
      if (!effectivePassword && oldPhone !== phone) return fail('Indica una clave al cambiar el teléfono.');
      const oldCredential = oldPhone && oldPhone !== phone ? await adminDb.doc(`phoneCredentials/${oldPhone}`).get() : null;
      const batch = adminDb.batch();
      const nextRole = STAFF_ROLES.has(body.role) ? String(body.role) : String(target.data()?.role);
      const driverId = nextRole === 'Driver' ? String(target.data()?.driverId || body.driverId || `drv_${randomUUID()}`) : null;
      if (effectivePassword) batch.set(credentialRef, { phoneNumber: phone, accessPassword: effectivePassword, uid, colmadoId: target.data()?.colmadoId, updatedAt: new Date().toISOString() }, { merge: true });
      batch.update(target.ref, { firstName: String(body.name || '').trim(), phoneNumber: phone, role: nextRole,
        ...(nextRole === 'Driver' ? { allowedModules: ['driver'], allowedColmadoIds: FieldValue.delete() } : {}),
        ...(nextRole === 'Contable' ? { allowedModules: ['inventory-audit'] } : {}),
        ...(driverId ? { driverId } : {}), updatedAt: new Date().toISOString(), accessPassword: FieldValue.delete() });
      if (driverId) batch.set(adminDb.doc(`colmados/${target.data()?.colmadoId}/drivers/${driverId}`), {
        id: driverId, uid, colmadoId: target.data()?.colmadoId, fullName: String(body.name || '').trim(), phoneNumber: phone,
        isAvailable: false, updatedAt: new Date().toISOString()
      }, { merge: true });
      if (target.data()?.role === 'Driver' && nextRole !== 'Driver' && target.data()?.driverId)
        batch.delete(adminDb.doc(`colmados/${target.data()?.colmadoId}/drivers/${target.data()?.driverId}`));
      if (oldCredential?.exists && oldCredential.data()?.uid === uid) batch.delete(oldCredential.ref);
      await batch.commit();
      return NextResponse.json({ ok: true });
    }
    if (action === 'deleteStaff') {
      let uid = String(body.uid || '');
      let target = await adminDb.doc(`userProfiles/${uid}`).get();
      if (!target.exists && body.driverId) {
        const matches = await adminDb.collection('userProfiles').where('driverId', '==', String(body.driverId)).limit(2).get();
        if (matches.size === 1) { target = matches.docs[0]; uid = target.id; }
      }
      if (!target.exists || !STAFF_ROLES.has(target.data()?.role) ||
          !canManageBranch(actor, String(target.data()?.colmadoId || ''))) return fail('Usuario no autorizado.', 403);
      const existing = await credentialRef.get();
      const batch = adminDb.batch();
      batch.delete(target.ref);
      if (target.data()?.role === 'Driver' && target.data()?.driverId)
        batch.delete(adminDb.doc(`colmados/${target.data()?.colmadoId}/drivers/${target.data()?.driverId}`));
      if (existing.exists && existing.data()?.uid === uid) batch.delete(credentialRef);
      await batch.commit();
      return NextResponse.json({ ok: true });
    }
    return fail('Acción desconocida.');
  } catch (error) {
    if (error instanceof Error && error.message === 'PHONE_EXISTS') return fail('Este teléfono ya está registrado.', 409);
    if (error instanceof Error && /Could not load the default credentials|default credentials|GOOGLE_APPLICATION_CREDENTIALS|UNAUTHENTICATED|invalid-credential/i.test(error.message))
      return fail('Falta configurar las credenciales de Firebase del servidor para registrar usuarios por teléfono.', 503);
    console.error('Phone authentication error', error);
    return fail('No se pudo procesar la solicitud.', 500);
  }
}

