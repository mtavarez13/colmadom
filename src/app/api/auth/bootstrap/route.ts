import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requireIdentity } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    if (!identity.email || !identity.email_verified) return NextResponse.json({ error: 'Verifica tu correo antes de continuar.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const ref = adminDb.doc(`userProfiles/${identity.uid}`);
    const existing = await ref.get();
    const now = new Date().toISOString();
    if (!existing.exists) {
      const duplicate = await adminDb.collection('userProfiles').where('email', '==', identity.email.toLowerCase()).limit(1).get();
      if (!duplicate.empty && duplicate.docs[0].id !== identity.uid) return NextResponse.json({ error: 'Este correo ya está vinculado a otra cuenta.' }, { status: 409 });
      const name = String(body.name || identity.name || identity.email.split('@')[0]).trim();
      const independentAccountant=body.accountType==='independent-accountant'&&identity.firebase?.sign_in_provider==='google.com';
      await ref.create({
        id: identity.uid, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '),
        email: identity.email.toLowerCase(), role: independentAccountant?'ContableIndependiente':'Admin', roleCode: independentAccountant?'INDEPENDENT_ACCOUNTANT':'OWNER', isActive: true,
        ...(independentAccountant?{allowedModules:[],accountApprovalStatus:'PendingModuleApproval'}:{subscriptionStatus:'PRUEBA'}),
        registrationMethod: identity.firebase?.sign_in_provider === 'google.com' ? 'Google' : 'Email',
        createdAt: now, updatedAt: now, lastLoginAt: now,
      });
    } else {
      await ref.update({ lastLoginAt: now, updatedAt: now });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
