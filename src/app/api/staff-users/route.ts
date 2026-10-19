import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { apiError, assertStoreNotSuspended, requireIdentity } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ownerContext(request: NextRequest, colmadoId: string) {
  const identity = await requireIdentity(request);
  const profile = (await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if (!profile || profile.isActive === false || profile.role !== 'Admin' || !profile.colmadoId) throw new Error('FORBIDDEN');
  const allowed = new Set([String(profile.colmadoId), ...(Array.isArray(profile.allowedColmadoIds) ? profile.allowedColmadoIds.map(String) : [])]);
  if (!allowed.has(colmadoId)) throw new Error('FORBIDDEN');
  if (!(await adminDb.doc(`colmados/${colmadoId}`).get()).exists) throw new Error('FORBIDDEN');
  await assertStoreNotSuspended(colmadoId);
  return { identity, profile };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action || 'create');
    const uid = String(body.uid || '').trim();
    const target = action === 'create' ? null : (await adminDb.doc(`userProfiles/${uid}`).get());
    const colmadoId = String(body.colmadoId || target?.data()?.colmadoId || '').trim();
    const { identity } = await ownerContext(request, colmadoId);

    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 120);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
      const password = String(body.password || '');
      const phone = String(body.phone || '').replace(/\D/g, '').slice(0, 15);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) return NextResponse.json({ error: 'Indica nombre, correo válido y una contraseña de al menos 6 caracteres.' }, { status: 400 });
      if (phone && (phone.length < 10 || phone.length > 15)) return NextResponse.json({ error: 'El teléfono opcional debe contener entre 10 y 15 dígitos.' }, { status: 400 });
      const user = await adminAuth.createUser({ email, password, displayName: name });
      try {
        await adminDb.doc(`userProfiles/${user.uid}`).create({
          id: user.uid, firstName: name.split(/\s+/)[0], lastName: name.split(/\s+/).slice(1).join(' '),
          email, ...(phone ? { phoneNumber: phone } : {}), colmadoId, role: 'Cajero', isActive: true,
          registrationMethod: 'Email', allowedModules: Array.isArray(body.allowedModules) ? body.allowedModules.map(String) : ['pos', 'minimarket'],
          createdBy: identity.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        await adminAuth.deleteUser(user.uid).catch(() => undefined);
        throw error;
      }
      await adminDb.collection('auditLogs').add({ actorUid: identity.uid, action: 'CASHIER_EMAIL_CREATED', targetId: user.uid, colmadoId, createdAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, uid: user.uid });
    }

    if (!target?.exists || target.data()?.role !== 'Cajero' || target.data()?.email == null || uid === identity.uid) return NextResponse.json({ error: 'El cajero no existe o no tienes permiso para modificarlo.' }, { status: 404 });
    if (action === 'update') {
      const name = String(body.name ?? target.data()?.firstName ?? '').trim().slice(0, 120);
      const phone = String(body.phone ?? target.data()?.phoneNumber ?? '').replace(/\D/g, '').slice(0, 15);
      const password = String(body.password || '');
      if (!name || (phone && (phone.length < 10 || phone.length > 15)) || (password && password.length < 6)) return NextResponse.json({ error: 'Revisa el nombre, el teléfono y la contraseña (mínimo 6 caracteres).' }, { status: 400 });
      await adminAuth.updateUser(uid, { displayName: name, ...(password ? { password } : {}) });
      await target.ref.set({ firstName: name.split(/\s+/)[0], lastName: name.split(/\s+/).slice(1).join(' '), phoneNumber: phone || '', updatedAt: new Date().toISOString() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      await adminAuth.deleteUser(uid);
      await target.ref.delete();
      await adminDb.collection('auditLogs').add({ actorUid: identity.uid, action: 'CASHIER_EMAIL_DELETED', targetId: uid, colmadoId, createdAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'auth/email-already-exists') return NextResponse.json({ error: 'Este correo ya tiene una cuenta de Colmadom Cloud. Usa otro correo.' }, { status: 409 });
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
