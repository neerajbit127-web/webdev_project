import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await res.json();
    console.log(`HTTP Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Request failed:', err);
  } finally {
    server.close();
    await closePool();
  }
}

main();

