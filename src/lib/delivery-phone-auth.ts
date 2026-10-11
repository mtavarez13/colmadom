import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { doc, writeBatch, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

export function deliveryPhoneEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `phone-${digits}@users.colmadom.app`;
}

export async function registerDeliveryWithFirebase(input: {
  db: Firestore; colmadoId: string; driverId: string; name: string; phone: string;
  password: string; vehicleType?: string; email?: string;
}): Promise<string> {
  if (input.password.length < 6) throw new Error('Para registrar Delivery usa una clave de al menos 6 caracteres.');
  const phone = input.phone.replace(/\D/g, '');
  const secondaryApp = initializeApp(firebaseConfig, `delivery-registration-${Date.now()}-${Math.random()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, deliveryPhoneEmail(phone), input.password);
    createdUser = credential.user;
    const now = new Date().toISOString();
    const batch = writeBatch(input.db);
    batch.set(doc(input.db, 'userProfiles', createdUser.uid), {
      id: createdUser.uid, colmadoId: input.colmadoId, firstName: input.name.trim(),
      phoneNumber: phone, role: 'Driver', driverId: input.driverId, allowedModules: ['driver'],
      isActive: true, createdAt: now, phoneAuthMode: 'firebaseEmail'
    });
    batch.set(doc(input.db, 'phoneCredentials', phone), {
      phoneNumber: phone, accessPassword: input.password, uid: createdUser.uid,
      colmadoId: input.colmadoId, createdAt: now
    });
    batch.set(doc(input.db, 'colmados', input.colmadoId, 'drivers', input.driverId), {
      id: input.driverId, uid: createdUser.uid, colmadoId: input.colmadoId,
      fullName: input.name.trim(), phoneNumber: phone, email: input.email?.trim().toLowerCase() || '',
      vehicleType: input.vehicleType || 'Motor', isAvailable: false, rating: 5,
      createdAt: now, updatedAt: now
    });
    await batch.commit();
    return createdUser.uid;
  } catch (error) {
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    if (error instanceof Error && /email-already-in-use/.test(error.message))
      throw new Error('Este teléfono ya está registrado.');
    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}
