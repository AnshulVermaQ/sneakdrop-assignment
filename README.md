# Sneakdrop

A dependency-free Node.js implementation of a limited sneaker drop. It makes
the oversell invariant explicit: every active hold and completed purchase is
accounted for before another hold is granted.

## Quick start

```powershell
npm test
npm start
```

Visit [http://localhost:3000](http://localhost:3000). Full run instructions,
API examples, and production considerations are in [NOTES.md](NOTES.md).

## Included behaviour

- 20-pair inventory with five-minute holds
- one concurrent hold per user and a lifetime maximum of two purchases
- FIFO wait list, automatically reassigned when a hold expires
- fake delayed payment delivery, including duplicate events
- webhook idempotency and late-payment rejection
- a plain status page with inventory, countdown, and wait-list position

The test suite includes a 1,000-shopper contention case plus expiration,
idempotency, and purchase-limit coverage.
