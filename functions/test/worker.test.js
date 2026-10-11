'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeWorker, eligible, subscriptionActive, sameDevice, claimState, LEASE_MS, MAX_ATTEMPTS, retryDelay } = require('../src/worker');
function fixture(send = async () => 'message-id', beforeGet = () => {}) {
  const data = new Map([
    ['mobileOrderOutbox/e1', { colmadoId: 'b1', orderId: 'o1', source: 'catalog', status: 'pending' }],
    ['mobileDevices/d1', { uid: 'u1', token: 't1', platform: 'android', colmadoIds: ['b1'], updatedAtMillis: 1 }],
    ['userProfiles/u1', { role: 'Admin', colmadoId: 'b1' }],
    ['colmados/b1', { rootColmadoId: 'root' }],
    ['colmados/root', { subscriptionStatus: 'Active' }]
  ]);
  let clock = 1000000, counter = 0, calls = [], queue = Promise.resolve();
  const snapshot = path => ({ id: path.split('/').pop(), ref: doc(path), data: () => data.has(path) ? structuredClone(data.get(path)) : undefined });
  const collection = path => ({
    doc: name => doc(`${path}/${name}`),
    get: async () => ({ docs: [...data.keys()].filter(key => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1).map(snapshot) }),
    where: (field, op, value) => ({ get: async () => ({ docs: (await collection(path).get()).docs.filter(s => s.data()[field]?.includes(value)) }) })
  });
  const doc = path => ({ id: path.split('/').pop(), path, collection: name => collection(`${path}/${name}`) });
  const db = { doc, collection, runTransaction: fn => {
    const job = queue.then(async () => {
      const changes = [];
      const result = await fn({ get: async ref => { beforeGet(ref.path, data); return snapshot(ref.path); }, set: (ref, value, opts) => changes.push(() => data.set(ref.path, { ...(opts?.merge ? data.get(ref.path) : {}), ...value })), update: (ref, value) => changes.push(() => data.set(ref.path, { ...data.get(ref.path), ...value })), delete: ref => changes.push(() => data.delete(ref.path)) });
      changes.forEach(change => change()); return result;
    });
    queue = job.catch(() => {}); return job;
  } };
  const worker = makeWorker({ db, now: () => clock, id: () => `claim-${++counter}`, messaging: { send: async message => { calls.push(message); return send(message, data); } } });
  return { ...worker, data, calls, db, event: doc('mobileOrderOutbox/e1'), advance: ms => { clock += ms; } };
}
test('role and branch access is fail closed', () => {
  for (const role of ['Driver', 'Contable', 'ContableIndependiente']) assert.equal(eligible({ role, colmadoId: 'b', allowedModules: ['orders'] }, 'b'), false);
  assert.equal(eligible({ role: 'Cashier', colmadoId: 'b', allowedModules: ['orders'] }, 'b'), true);
  assert.equal(eligible({ role: 'Admin', colmadoId: 'b', allowedColmadoIds: ['c'] }, 'c'), true);
  assert.equal(eligible({ role: 'Admin', allowedColmadoIds: ['c'] }, 'c'), true);
  assert.equal(eligible({ role: 'Supervisor', colmadoId: 'b', allowedColmadoIds: ['c'] }, 'c'), false);
  assert.equal(eligible({ role: 'Admin', colmadoId: 'b', isActive: false }, 'b'), false);
});
test('subscription Active or unexpired valid Trial only', () => {
  assert.equal(subscriptionActive({ subscriptionStatus: 'Active' }, 0), true);
  for (const subscriptionStatus of ['Pending', 'Suspended', undefined]) assert.equal(subscriptionActive({ subscriptionStatus }, 0), false);
  assert.equal(subscriptionActive({ subscriptionStatus: 'Trial', trialEndAtMillis: 1000 }, 500), true);
  assert.equal(subscriptionActive({ subscriptionStatus: 'Trial', trialEndAtMillis: Infinity }, 0), false);
  assert.equal(subscriptionActive({ subscriptionStatus: 'Trial', trialEndDate: 'bad' }, 0), false);
  assert.equal(subscriptionActive({ subscriptionStatus: 'Trial', trialEndDate: '2026-01-01' }, 0), true);
});
test('leases recover, backoff respected, attempts bounded', () => {
  const state = claimState({}, 100, 'a');
  assert.equal(claimState(state.write, 101, 'b').claimed, undefined);
  assert.equal(claimState(state.write, 100 + LEASE_MS, 'b').claimed, true);
  assert.equal(claimState({ status: 'retry', nextAttemptMillis: 900 }, 800, 'b').claimed, undefined);
  assert.equal(claimState({ attempts: MAX_ATTEMPTS }, 100, 'b').write.status, 'failed');
  assert.equal(retryDelay(12), 600000);
});
test('duplicate concurrent events send once; exact data only payload', async () => {
  const f = fixture();
  await Promise.allSettled([f.process(f.event), f.process(f.event)]);
  await f.process(f.event);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].data, { type: 'new_order', colmadoId: 'b1', orderId: 'o1', eventId: 'e1' });
  assert.equal(f.calls[0].notification, undefined);
  assert.equal(f.data.get(f.event.path).status, 'completed');
});
test('transient FCM failure retries after backoff', async () => {
  let attempts = 0;
  const f = fixture(async () => { if (++attempts === 1) throw { code: 'messaging/server-unavailable' }; });
  await assert.rejects(f.process(f.event));
  await assert.rejects(f.process(f.event));
  assert.equal(f.calls.length, 1);
  f.advance(10000); await f.process(f.event);
  assert.equal(f.calls.length, 2);
  assert.equal(f.data.get('mobileOrderOutbox/e1/deliveries/d1').status, 'sent');
});
test('manual excluded and revoked role/subscription blocked', async () => {
  for (const edit of [d => d.get('mobileOrderOutbox/e1').source = 'manual', d => d.get('userProfiles/u1').role = 'Driver', d => d.get('colmados/root').subscriptionStatus = 'Suspended']) {
    const f = fixture(); edit(f.data); await f.process(f.event); assert.equal(f.calls.length, 0);
  }
});
test('invalid token cleanup respects concurrent owner/version changes', async () => {
  for (const changed of [true, false]) {
    const f = fixture(async (_message, data) => {
      if (changed) data.set('mobileDevices/d1', { ...data.get('mobileDevices/d1'), uid: 'new-owner', updatedAtMillis: 2 });
      throw { code: 'messaging/registration-token-not-registered' };
    });
    await f.process(f.event);
    assert.equal(f.data.has('mobileDevices/d1'), changed);
  }
  assert.equal(sameDevice({ uid: 'u', token: 't', updatedAtMillis: 1 }, { uid: 'u', token: 't', updatedAtMillis: 2 }), false);
});
test('crashed sending lease is reclaimed', async () => {
  const f = fixture();
  f.data.set('mobileOrderOutbox/e1/deliveries/d1', { status: 'sending', claimId: 'crashed', attempts: 1, leaseUntilMillis: 1000000 + LEASE_MS });
  await assert.rejects(f.process(f.event)); assert.equal(f.calls.length, 0);
  f.advance(LEASE_MS); await f.process(f.event); assert.equal(f.calls.length, 1);
});

test('authorization is rechecked after claiming', async () => {
  let reads = 0;
  const f = fixture(undefined, (path, data) => {
    if (path === 'userProfiles/u1' && ++reads === 2) data.get(path).isActive = false;
  });
  await f.process(f.event);
  assert.equal(f.calls.length, 0);
  assert.equal(f.data.get('mobileOrderOutbox/e1/deliveries/d1').reason, 'authorization_changed');
});
test('obsolete finalizer cannot overwrite a newer claim', async () => {
  const f = fixture(async (_message, data) => {
    data.set('mobileOrderOutbox/e1/deliveries/d1', { status: 'sending', claimId: 'new-worker', leaseUntilMillis: 999999999 });
  });
  await assert.rejects(f.process(f.event));
  assert.equal(f.data.get('mobileOrderOutbox/e1/deliveries/d1').claimId, 'new-worker');
  assert.equal(f.data.get('mobileOrderOutbox/e1/deliveries/d1').status, 'sending');
});
test('old events become expired instead of remaining pending forever', async () => {
  const f = fixture();
  f.data.get(f.event.path).createdAt = '1970-01-01T00:00:00.000Z';
  f.advance(21 * 60 * 60 * 1000);
  await f.process(f.event);
  assert.equal(f.data.get(f.event.path).status, 'expired');
  assert.equal(f.calls.length, 0);
});
