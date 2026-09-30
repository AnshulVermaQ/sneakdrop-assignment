'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DropService } = require('../src/drop-service');
function clock(start = 1000) { let value = start; return { now: () => value, advance: (ms) => { value += ms; } }; }

test('simultaneous buy attempts never create more holds than inventory', () => {
  const service = new DropService({ inventory: 20 });
  const results = Array.from({ length: 1000 }, (_, i) => service.buy(`user-${i}`));
  assert.equal(results.filter((result) => result.hold).length, 20);
  assert.equal(results.filter((result) => result.queued).length, 980);
  assert.equal(service.available(), 0);
});
test('expired hold is reassigned to the first eligible person in FIFO order', () => {
  const time = clock(); const service = new DropService({ inventory: 1, holdMs: 100, now: time.now });
  const first = service.buy('first').hold; service.buy('second'); service.buy('third'); time.advance(101);
  const sweep = service.sweepExpired();
  assert.equal(sweep.expired[0].id, first.id); assert.equal(sweep.assigned[0].userId, 'second');
  assert.equal(service.stateFor('second').queuePosition, null); assert.equal(service.stateFor('third').queuePosition, 1);
});
test('payment webhook is idempotent and cannot pay an expired hold', () => {
  const time = clock(); const service = new DropService({ inventory: 2, holdMs: 100, now: time.now });
  const paid = service.buy('buyer').hold;
  assert.equal(service.paymentSucceeded({ id: 'evt-1', holdId: paid.id, userId: 'buyer' }).code, 'paid');
  assert.equal(service.paymentSucceeded({ id: 'evt-1', holdId: paid.id, userId: 'buyer' }).duplicate, true);
  assert.equal(service.purchasedBy('buyer'), 1);
  const late = service.buy('late').hold; time.advance(101);
  assert.equal(service.paymentSucceeded({ id: 'evt-late', holdId: late.id, userId: 'late' }).code, 'hold_not_active');
  assert.equal(service.purchasedBy('late'), 0);
});
test('a customer cannot have two simultaneous holds or buy more than two pairs', () => {
  const service = new DropService({ inventory: 3 }); const first = service.buy('buyer').hold;
  assert.equal(service.buy('buyer').code, 'active_hold'); service.paymentSucceeded({ id: 'one', holdId: first.id, userId: 'buyer' });
  const second = service.buy('buyer').hold; service.paymentSucceeded({ id: 'two', holdId: second.id, userId: 'buyer' });
  assert.equal(service.buy('buyer').code, 'purchase_limit');
});
