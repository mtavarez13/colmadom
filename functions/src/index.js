'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { makeWorker } = require('./worker');
initializeApp();
const db = getFirestore();
const worker = makeWorker({ db, messaging: getMessaging() });
exports.mobileOrderPush = onDocumentCreated({ document: 'mobileOrderOutbox/{eventId}', region: 'us-central1', retry: true, timeoutSeconds: 60, maxInstances: 20 }, event => event.data ? worker.process(event.data.ref) : undefined);
// Recovery does not depend only on the Eventarc retry window. Expired leases are
// reclaimable, and old events become terminal even after a process crash.
exports.recoverMobileOrderPush = onSchedule({ schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 540, maxInstances: 1, retryCount: 3 }, async () => {
  let cursor;
  while (true) {
    let query = db.collection('mobileOrderOutbox').where('status', '==', 'pending').orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const event of page.docs) {
      try { await worker.process(event.ref); }
      catch { logger.warn('Mobile push pending', { eventId: event.id }); }
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 100) break;
  }
});
