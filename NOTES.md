# Sneakdrop notes

## Run locally

Requirements: Node.js 20 or newer. Node 24 was used for testing. No database,
package installation, or environment variables are required.

```powershell
npm test
npm start
```

Open [http://localhost:3000](http://localhost:3000). Use a different user ID in
another browser or tab to act as another shopper. Buy receives a hold or joins
the FIFO line. Fake pay schedules two copies of the same payment event to
exercise webhook idempotency.

## Design notes

- Every state-changing operation goes through `DropService`. In this
  single-process demo its synchronous mutations make the inventory check and
  hold creation atomic: 1,000 buy attempts result in exactly 20 holds.
- Holds last five minutes. The server sweeps expiry every second and before
  each API operation, so released stock goes to the first eligible queued user.
- Each webhook event has a unique ID. Accepted and rejected results are saved,
  so duplicate or late delivery cannot create a second order or revive a hold.
- This is intentionally an in-memory single-instance demonstration. A
  multi-instance production deployment should use transactions and row locks
  (or conditional decrements), plus unique active-hold and webhook-event keys.

## HTTP API

- `POST /api/buy` with `{ "userId": "buyer-1" }`
- `GET /api/state?userId=buyer-1`
- `POST /api/payments/webhook` with an event ID, hold ID, and user ID
- `POST /api/fake-payments/charge` schedules delayed duplicate delivery.
