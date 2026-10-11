'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore, memoryLocalCache } from 'firebase/firestore';

// Singleton instances to prevent multiple initializations and internal assertion failures
let firebaseAppInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

/**
 * Initializes and returns the Firebase services.
 * Uses a singleton pattern to ensure stability across re-renders and hot reloads.
 */
export function initializeFirebase() {
  if (firebaseAppInstance && firestoreInstance && authInstance) {
    return {
      firebaseApp: firebaseAppInstance,
      auth: authInstance,
      firestore: firestoreInstance
    };
  }

  const apps = getApps();
  if (apps.length > 0) {
    firebaseAppInstance = apps[0];
  } else {
    try {
      // Attempt to initialize via Firebase App Hosting environment variables
      firebaseAppInstance = initializeApp();
    } catch (e) {
      // Fallback to client config object
      firebaseAppInstance = initializeApp(firebaseConfig);
    }
  }

  // Initialize Auth singleton
  authInstance = getAuth(firebaseAppInstance);

  // Initialize Firestore with settings optimized for cloud dev environments
  try {
    firestoreInstance = initializeFirestore(firebaseAppInstance, {
      experimentalForceLongPolling: true,
      // Memory cache prevents IndexedDB lock issues in cloud workstations
      localCache: memoryLocalCache(),
    });
  } catch (e) {
    // If already initialized, retrieve existing instance
    firestoreInstance = getFirestore(firebaseAppInstance);
  }

  return {
    firebaseApp: firebaseAppInstance,
    auth: authInstance,
    firestore: firestoreInstance
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
