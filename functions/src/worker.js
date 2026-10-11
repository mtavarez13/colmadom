'use strict';
const { randomUUID } = require('node:crypto');
const LEASE_MS = 120000;
const MAX_ATTEMPTS = 12;
const MAX_AGE_MS = 20 * 60 * 60 * 1000;
const TERMINAL = new Set(['sent', 'skipped', 'failed']);
const INVALID_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function eligible(profile, colmadoId) {
  if (!profile || profile.isActive === false) return false;
  if (['Driver', 'Contable', 'ContableIndependiente'].includes(profile.role)) return false;
  if (!['Admin', 'Supervisor'].includes(profile.role) && !(Array.isArray(profile.allowedModules) && profile.allowedModules.includes('orders'))) return false;
  return profile.colmadoId === colmadoId || (profile.role === 'Admin' && Array.isArray(profile.allowedColmadoIds) && profile.allowedColmadoIds.includes(colmadoId));
}
function subscriptionActive(store, now) {
  if (!store) return false;
  const expiry = Number(store.trialEndAtMillis) || Date.parse(store.trialEndDate || '');
  return store.subscriptionStatus === 'Active' || (store.subscriptionStatus === 'Trial' && Number.isFinite(expiry) && expiry > now);
}
function sameDevice(a, b) {
  return !!a && !!b && a.uid === b.uid && a.token === b.token && a.updatedAtMillis === b.updatedAtMillis;
}
function claimState(previous, now, claimId) {
  if (TERMINAL.has(previous?.status)) return { terminal: true };
  if ((previous?.leaseUntilMillis || 0) > now || (previous?.nextAttemptMillis || 0) > now) return { terminal: false };
  if ((previous?.attempts || 0) >= MAX_ATTEMPTS) return { terminal: true, write: { status: 'failed', reason: 'attempts_exhausted', leaseUntilMillis: 0 } };
  return { terminal: false, claimed: true, write: { status: 'sending', claimId, attempts: (previous?.attempts || 0) + 1, leaseUntilMillis: now + LEASE_MS, nextAttemptMillis: 0 } };
}
function retryDelay(attempts) { return Math.min(600000, 10000 * 2 ** Math.max(0, attempts - 1)); }
function makeWorker({ db, messaging, now = Date.now, id = randomUUID }) {
  async function authorized(reader, deviceRef, event) {
    const deviceSnap = await reader.get(deviceRef), device = deviceSnap.data();
    if (!device || device.platform !== 'android' || !validId(device.uid) || typeof device.token !== 'string' || !device.token || !Array.isArray(device.colmadoIds) || !device.colmadoIds.includes(event.colmadoId)) return null;
    const profile = (await reader.get(db.doc(`userProfiles/${device.uid}`))).data();
    if (!eligible(profile, event.colmadoId)) return null;
    const branch = (await reader.get(db.doc(`colmados/${event.colmadoId}`))).data();
    if (!branch) return null;
    const rootId = branch.rootColmadoId || event.colmadoId;
    if (!validId(rootId)) return null;
    const root = rootId === event.colmadoId ? branch : (await reader.get(db.doc(`colmados/${rootId}`))).data();
    return subscriptionActive(root, now()) ? device : null;
  }
  async function deliver(eventRef, event, deviceId) {
    const deviceRef = db.doc(`mobileDevices/${deviceId}`), ref = eventRef.collection('deliveries').doc(deviceId), claimId = id();
    const claim = await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data();
      const state = claimState(previous, now(), claimId);
      if (!state.claimed) { if (state.write) tx.set(ref, state.write, { merge: true }); return state; }
      const device = await authorized(tx, deviceRef, event);
      if (!device) { tx.set(ref, { status: 'skipped', reason: 'unauthorized', leaseUntilMillis: 0 }, { merge: true }); return { terminal: true }; }
      tx.set(ref, { ...state.write, uid: device.uid, updatedAtMillis: now() }, { merge: true });
      return { ...state, device };
    });
    if (!claim.claimed) return claim.terminal;
    // Re-read ownership and permissions immediately before crossing the FCM boundary.
    const current = await db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      if (latest?.claimId !== claimId || latest.leaseUntilMillis <= now()) return null;
      return authorized(tx, deviceRef, event);
    });
    let status = 'skipped', reason = 'authorization_changed';
    let invalid = false;
    if (sameDevice(current, claim.device)) {
      try {
        await messaging.send({ token: current.token, data: { type: 'new_order', colmadoId: event.colmadoId, orderId: event.orderId, eventId: eventRef.id }, android: { priority: 'high', ttl: MAX_AGE_MS } });
        status = 'sent'; reason = 'fcm_accepted';
      } catch (error) {
        reason = typeof error?.code === 'string' ? error.code : 'messaging/unknown-error';
        invalid = INVALID_TOKEN.has(reason);
        status = invalid || claim.write.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
      }
    }
    return db.runTransaction(async tx => {
      const saved = (await tx.get(ref)).data();
      if (saved?.claimId !== claimId) return TERMINAL.has(saved?.status);
      const latestDevice = invalid ? (await tx.get(deviceRef)).data() : null;
      if (invalid && sameDevice(latestDevice, claim.device)) tx.delete(deviceRef);
      tx.set(ref, { status, reason, leaseUntilMillis: 0, nextAttemptMillis: status === 'retry' ? now() + retryDelay(claim.write.attempts) : 0, updatedAtMillis: now() }, { merge: true });
      return TERMINAL.has(status);
    });
  }
  async function process(eventRef) {
    const event = await db.runTransaction(async tx => {
      const snapshot = await tx.get(eventRef), data = snapshot.data();
      if (!data || data.status !== 'pending') return null;
      if (!['catalog', 'whatsapp-bot'].includes(data.source) || !validId(data.colmadoId) || !validId(data.orderId)) {
        tx.update(eventRef, { status: 'ignored', reason: 'invalid_event_or_source' }); return null;
      }
      const startedAtMillis = data.startedAtMillis || now();
      const created = typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Date.parse(data.createdAt || '');
      if (now() - (Number.isFinite(created) ? Math.min(created, startedAtMillis) : startedAtMillis) >= MAX_AGE_MS) {
        tx.update(eventRef, { status: 'expired', completedAtMillis: now() }); return null;
      }
      if (!data.startedAtMillis) tx.update(eventRef, { startedAtMillis });
      return data;
    });
    if (!event) return;
    const [devices, deliveries] = await Promise.all([
      db.collection('mobileDevices').where('colmadoIds', 'array-contains', event.colmadoId).get(), eventRef.collection('deliveries').get()
    ]);
    const ids = [...new Set([...devices.docs, ...deliveries.docs].map(doc => doc.id))];
    let complete = true;
    // Small parallel batches bound FCM requests. Throwing keeps Eventarc retries alive.
    for (let i = 0; i < ids.length; i += 10) {
      const outcomes = await Promise.all(ids.slice(i, i + 10).map(deviceId => deliver(eventRef, event, deviceId)));
      if (outcomes.some(done => !done)) complete = false;
    }
    if (!complete) throw new Error('Pending delivery; retry after lease/backoff');
    await db.runTransaction(async tx => {
      const current = (await tx.get(eventRef)).data();
      if (current?.status === 'pending') tx.update(eventRef, { status: 'completed', completedAtMillis: now() });
    });
  }
  return { process, deliver };
}
module.exports = { makeWorker, eligible, subscriptionActive, sameDevice, claimState, retryDelay, LEASE_MS, MAX_ATTEMPTS, MAX_AGE_MS };
