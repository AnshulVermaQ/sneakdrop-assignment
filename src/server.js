'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DropService } = require('./drop-service');

const service = new DropService();
const publicDir = path.join(__dirname, 'public');
function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}
function userId(url) { return url.searchParams.get('userId')?.trim(); }

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, service.stateFor(userId(url)));
    if (request.method === 'POST' && url.pathname === '/api/buy') {
      const result = service.buy(String((await readJson(request)).userId || '').trim());
      return json(response, result.ok ? 200 : 409, result);
    }
    if (request.method === 'POST' && url.pathname === '/api/payments/webhook') {
      const result = service.paymentSucceeded(await readJson(request));
      return json(response, result.ok ? 200 : 409, result);
    }
    if (request.method === 'POST' && url.pathname === '/api/fake-payments/charge') {
      const body = await readJson(request);
      const delayMs = Math.min(Math.max(Number(body.delayMs) || 0, 0), 30000);
      const copies = Math.min(Math.max(Number(body.copies) || 1, 1), 5);
      const eventId = body.eventId || `payment_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const deliver = () => service.paymentSucceeded({ id: eventId, holdId: body.holdId, userId: body.userId, type: 'payment.succeeded' });
      for (let index = 0; index < copies; index += 1) setTimeout(deliver, delayMs + index * 20);
      return json(response, 202, { ok: true, eventId, scheduledCopies: copies, delayMs });
    }
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    }
    return json(response, 404, { error: 'Not found' });
  } catch (error) { return json(response, 400, { error: error.message }); }
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log(`Sneakdrop is running at http://localhost:${port}`));
  setInterval(() => service.sweepExpired(), 1000).unref();
}
module.exports = { server, service };
