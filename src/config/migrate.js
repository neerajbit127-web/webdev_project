const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  console.log('[Migration] Starting database migration...');
  const schemaPath = path.join(__dirname, '../../migrations/schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error(`[Migration Error] schema.sql not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Migration] Database schema migrated successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration Error]:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
