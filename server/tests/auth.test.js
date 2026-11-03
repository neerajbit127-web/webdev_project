import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';

test('Authentication rejects incomplete or invalid login requests without issuing demo tokens', async (t) => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  async function login(body) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, json: await response.json() };
  }

  await t.test('missing password is rejected before database access', async () => {
    const { status, json } = await login({
      identifier: 'teacher@example.com',
      role: 'TEACHER'
    });
    assert.equal(status, 400);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
    assert.equal(json.data, undefined);
  });

  await t.test('invalid role is rejected', async () => {
    const { status, json } = await login({
      identifier: 'teacher@example.com',
      password: 'some-password',
      role: 'SUPERUSER'
    });
    assert.equal(status, 400);
    assert.equal(json.error.code, 'INVALID_ROLE');
  });


});
