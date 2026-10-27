import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPharmacyFollowUps, emptyPharmacySelection, estimatedRefillDate } from './pharmacy-follow-up';

test('estima reposición desde el calendario de Santo Domingo', () => {
  const result = estimatedRefillDate(new Date('2026-10-27T15:00:00Z'), 30, 1, 1);
  assert.deepEqual(result, { days: 30, date: '2026-11-26' });
  assert.deepEqual(estimatedRefillDate(new Date('2026-02-27T16:00:00Z'), 60, 2, 2), { days: 15, date: '2026-03-14' });
});

test('exige cliente registrado y pauta válida para cada artículo seguido', () => {
  const selection = emptyPharmacySelection();
  selection.doses['med-1'] = { enabled: true, unitsSupplied: '30', unitsPerDose: '1', dosesPerDay: '1', instructions: 'Según indicación entregada' };
  const cart = [{ id: 'med-1', productId: 'med-1', name: 'Suplemento' }];
  assert.throws(() => buildPharmacyFollowUps(cart, selection, new Date('2026-10-27T15:00:00Z')), /cliente registrado/);
  selection.customerId = 'cliente-1';
  const [item] = buildPharmacyFollowUps(cart, selection, new Date('2026-10-27T15:00:00Z'));
  assert.equal(item.estimatedEndDate, '2026-11-26');
  assert.equal(item.productName, 'Suplemento');
  selection.doses['med-1'].dosesPerDay = '0';
  assert.throws(() => buildPharmacyFollowUps(cart, selection, new Date()), /mayores que cero/);
});

test('no crea seguimientos si ningún artículo está seleccionado', () => {
  assert.deepEqual(buildPharmacyFollowUps([{ id: 'med-1', name: 'Producto' }], emptyPharmacySelection(), new Date()), []);
});
