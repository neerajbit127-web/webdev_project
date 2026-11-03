import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';

test('ExamPortal Backend Foundation Test Suite', async (t) => {
  const app = createApp();
  let server;
  let baseUrl;

  // Setup test HTTP server on random ephemeral port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  await t.test('GET /api/health should respond with API status and database check structure', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.ok(res.status === 200 || res.status === 503, `Expected 200 or 503, received ${res.status}`);

    const json = await res.json();
    assert.ok('status' in json, 'Response must contain status field');
    assert.ok('timestamp' in json, 'Response must contain timestamp');
    assert.ok('checks' in json, 'Response must contain checks object');
    assert.equal(json.checks.api.status, 'up');
    assert.ok('database' in json.checks, 'Checks must contain database property');
    assert.equal(json.checks.database.engine, 'PostgreSQL');
  });

  await t.test('GET /api/undefined-endpoint should trigger centralized 404 handler with standard error shape', async () => {
    const res = await fetch(`${baseUrl}/api/undefined-endpoint`);
    assert.equal(res.status, 404);

    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.statusCode, 404);
    assert.equal(json.error.code, 'NOT_FOUND');
    assert.ok(json.error.message.includes('/api/undefined-endpoint'));
  });

  await t.test('POST /api/health with invalid JSON should trigger 400 bad request error handler', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid-json '
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'INVALID_JSON_BODY');
  });

  await t.test('Security headers should be present via Helmet', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.ok(res.headers.has('x-content-type-options'), 'Should have X-Content-Type-Options');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

