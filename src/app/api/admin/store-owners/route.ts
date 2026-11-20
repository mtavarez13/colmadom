import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { apiError, requirePlatformAdmin } from '@/lib/server-auth';
import { OWNER_MODULES, storeOwnerScope } from '@/lib/store-owner-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORM_EMAILS = new Set(['admin@colmadom.com', 'martin.tavarez.gomez@gmail.com', 'tavarezgomezmartin@gmail.com']);
const respond = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const snapshot = await adminDb.collection('userProfiles').where('role', '==', 'Admin').get();
    const owners = snapshot.docs.filter(item => item.data().colmadoId && !PLATFORM_EMAILS.has(String(item.data().email || '').toLowerCase())).map(item => {
      const data = item.data();
      return {
        uid: item.id,
        colmadoId: String(data.rootColmadoId || data.colmadoId),
        name: [data.firstName, data.lastName].filter(Boolean).join(' ') || data.email || 'Dueño',
        email: data.email || '',
        phoneNumber: data.phoneNumber || '',
        isActive: data.isActive !== false,
        accountReady: !item.id.startsWith('owner_'),
      };
    });
    return NextResponse.json({ owners });
  } catch (error) {
    const failure = apiError(error);
    return respond(failure.message, failure.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requirePlatformAdmin(request);
    const body = await request.json();
    const mode = String(body.mode || 'create');
    const colmadoId = String(body.colmadoId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const phoneNumber = String(body.phoneNumber || '').replace(/\D/g, '');
    const password = String(body.password || '');

    if (!['create', 'link'].includes(mode)) return respond('Acción no reconocida.', 400);
    if (!colmadoId || colmadoId.includes('/') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond('Selecciona un colmado y escribe un correo válido.', 400);
    if (PLATFORM_EMAILS.has(email)) return respond('Esta cuenta está reservada para administrar la plataforma.', 400);
    if (phoneNumber && (phoneNumber.length < 10 || phoneNumber.length > 15)) return respond('El teléfono debe tener entre 10 y 15 dígitos.', 400);
    if (mode === 'create' && (!name || password.length < 8)) return respond('Escribe el nombre y una contraseña de al menos 8 caracteres.', 400);

    const { rootId, root, allowedColmadoIds } = await storeOwnerScope(colmadoId);
    const duplicateProfiles = await adminDb.collection('userProfiles').where('email', '==', email).get();
    const legacyProfiles = duplicateProfiles.docs.filter(item => item.id.startsWith('owner_') && item.data().colmadoId === rootId);
    const otherProfiles = duplicateProfiles.docs.filter(item => !legacyProfiles.some(legacy => legacy.id === item.id));
    if (otherProfiles.length > 1) return respond('Este correo aparece en varias cuentas. Revisa los usuarios antes de vincularlo.', 409);

    let authUser;
    let created = false;
    if (mode === 'create') {
      if (otherProfiles.length) return respond('El correo ya pertenece a una cuenta. Usa «Vincular usuario existente».', 409);
      try {
        authUser = await adminAuth.createUser({ email, password, displayName: name });
        created = true;
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/email-already-exists') return respond('El correo ya tiene acceso. Usa «Vincular usuario existente».', 409);
        throw error;
      }
    } else {
      try {
        authUser = await adminAuth.getUserByEmail(email);
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/user-not-found') return respond('No existe una cuenta con ese correo. Usa «Registrar dueño nuevo».', 404);
        throw error;
      }
    }

    const uid = authUser.uid;
    const profileRef = adminDb.doc(`userProfiles/${uid}`);
    try {
      const profile = (await profileRef.get()).data();
      const conflictingProfile = otherProfiles.find(item => item.id !== uid);
      if (conflictingProfile) return respond('El correo pertenece a otro perfil. Revisa la lista de usuarios.', 409);
      if (profile?.role === 'ContableIndependiente') return respond('La cuenta de contador independiente no se puede convertir en dueño.', 409);
      if (profile?.rootColmadoId && String(profile.rootColmadoId) !== rootId) return respond('Esta cuenta ya pertenece a otro colmado.', 409);
      if (profile?.colmadoId && !allowedColmadoIds.includes(String(profile.colmadoId))) return respond('Esta cuenta ya pertenece a otro colmado.', 409);

      const fullName = name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || authUser.displayName || email.split('@')[0];
      const parts = fullName.trim().split(/\s+/);
      const now = new Date().toISOString();
      const updates = {
        id: uid, firstName: parts[0], lastName: parts.slice(1).join(' '), email,
        phoneNumber: phoneNumber || profile?.phoneNumber || '',
        role: 'Admin', roleCode: 'OWNER', colmadoId: rootId, rootColmadoId: rootId,
        allowedColmadoIds, allowedModules: OWNER_MODULES, isActive: true, registrationMethod: profile?.registrationMethod || (mode === 'create' ? 'Email' : 'Existing'),
        updatedAt: now, updatedBy: identity.uid,
        ...(!profile ? { createdAt: now, createdBy: identity.uid } : {}),
        ...(profile ? { accessPassword: FieldValue.delete() } : {}),
      };
      const batch = adminDb.batch();
      batch.set(profileRef, updates, { merge: true });
      legacyProfiles.forEach(item => batch.delete(item.ref));
      if (!root.data()?.ownerEmail) batch.update(root.ref, { ownerEmail: email, updatedAt: now });
      batch.set(adminDb.collection('auditLogs').doc(), {
        actorUid: identity.uid, action: created ? 'STORE_OWNER_CREATED' : 'STORE_OWNER_LINKED',
        targetId: uid, colmadoId: rootId, createdAt: now,
      });
      if (!created && authUser.disabled) await adminAuth.updateUser(uid, { disabled: false });
      await batch.commit();
      return NextResponse.json({ ok: true, uid, colmadoId: rootId, allowedColmadoIds });
    } catch (error) {
      if (created) await adminAuth.deleteUser(uid).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') return respond('El colmado no existe o fue eliminado.', 404);
    const failure = apiError(error);
    return respond(failure.message, failure.status);
  }
}
