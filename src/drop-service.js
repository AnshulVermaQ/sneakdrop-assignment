'use strict';

const crypto = require('node:crypto');

/** All state mutations live in this one service. */
class DropService {
  constructor({ inventory = 20, holdMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
    this.inventory = inventory;
    this.holdMs = holdMs;
    this.now = now;
    this.holds = new Map();
    this.waitlist = [];
    this.purchases = new Map();
    this.webhookEvents = new Map();
    this.sequence = 0;
  }

  id(prefix) { this.sequence += 1; return `${prefix}_${this.sequence}_${crypto.randomUUID().slice(0, 8)}`; }
  purchasedBy(userId) { return this.purchases.get(userId) || 0; }
  activeHoldFor(userId) { return [...this.holds.values()].find((hold) => hold.userId === userId && hold.status === 'held'); }
  available() {
    const held = [...this.holds.values()].filter((hold) => hold.status === 'held').length;
    const sold = [...this.purchases.values()].reduce((sum, count) => sum + count, 0);
    return this.inventory - held - sold;
  }
  createHold(userId) {
    const hold = { id: this.id('hold'), userId, status: 'held', createdAt: this.now(), expiresAt: this.now() + this.holdMs };
    this.holds.set(hold.id, hold);
    return hold;
  }
  assignWaitlist() {
    const assigned = [];
    while (this.available() > 0 && this.waitlist.length) {
      const entry = this.waitlist.shift();
      if (this.purchasedBy(entry.userId) >= 2 || this.activeHoldFor(entry.userId)) continue;
      assigned.push(this.createHold(entry.userId));
    }
    return assigned;
  }
  sweepExpired() {
    const now = this.now();
    const expired = [];
    for (const hold of this.holds.values()) {
      if (hold.status === 'held' && hold.expiresAt <= now) {
        hold.status = 'expired'; hold.expiredAt = now; expired.push(hold);
      }
    }
    return { expired, assigned: expired.length ? this.assignWaitlist() : [] };
  }
  buy(userId) {
    this.sweepExpired();
    if (!userId) return { ok: false, code: 'invalid_user', message: 'A user id is required.' };
    const current = this.activeHoldFor(userId);
    if (current) return { ok: false, code: 'active_hold', message: 'This user already has a hold.', hold: current };
    if (this.purchasedBy(userId) >= 2) return { ok: false, code: 'purchase_limit', message: 'This user has already bought two pairs.' };
    const queueEntry = this.waitlist.find((entry) => entry.userId === userId);
    if (queueEntry) return { ok: true, queued: true, queuePosition: this.waitlist.indexOf(queueEntry) + 1 };
    if (this.available() > 0) return { ok: true, hold: this.createHold(userId) };
    this.waitlist.push({ id: this.id('queue'), userId, joinedAt: this.now() });
    return { ok: true, queued: true, queuePosition: this.waitlist.length };
  }
  paymentSucceeded(event) {
    this.sweepExpired();
    if (!event || !event.id || !event.holdId) return { ok: false, code: 'invalid_event', message: 'id and holdId are required.' };
    const previous = this.webhookEvents.get(event.id);
    if (previous) return { ...previous, duplicate: true };
    const hold = this.holds.get(event.holdId);
    let result;
    if (!hold) result = { ok: false, code: 'unknown_hold', message: 'Ignoring payment for an unknown hold.' };
    else if (hold.status !== 'held') result = { ok: false, code: 'hold_not_active', message: `Ignoring late payment; hold is ${hold.status}.` };
    else if (event.userId && event.userId !== hold.userId) result = { ok: false, code: 'user_mismatch', message: 'Ignoring payment with a mismatched user.' };
    else if (this.purchasedBy(hold.userId) >= 2) result = { ok: false, code: 'purchase_limit', message: 'Ignoring payment beyond the purchase limit.' };
    else {
      hold.status = 'paid'; hold.paidAt = this.now();
      this.purchases.set(hold.userId, this.purchasedBy(hold.userId) + 1);
      result = { ok: true, code: 'paid', holdId: hold.id, userId: hold.userId };
    }
    // Persist rejection too: a retry cannot resurrect an expired hold.
    this.webhookEvents.set(event.id, result);
    return result;
  }
  stateFor(userId) {
    this.sweepExpired();
    const hold = this.activeHoldFor(userId);
    const position = this.waitlist.findIndex((entry) => entry.userId === userId);
    return { inventory: this.inventory, pairsLeft: this.available(), purchased: this.purchasedBy(userId), hold: hold && { id: hold.id, expiresAt: hold.expiresAt }, queuePosition: position === -1 ? null : position + 1, queueLength: this.waitlist.length };
  }
}

module.exports = { DropService };
