import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function firebaseCredential() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (encoded || raw) {
    try {
      let value = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : raw!;
      // Some control panels preserve surrounding quotes or encode the JSON twice.
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
      let parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) throw new Error('missing fields');
      return cert(parsed);
    } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_INVALID'); }
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  return applicationDefault();
}

const app = getApps()[0] || initializeApp({
  credential: firebaseCredential(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-7468507886-b3c95',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'studio-7468507886-b3c95.firebasestorage.app'
});

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminBucket = getStorage(app).bucket();
