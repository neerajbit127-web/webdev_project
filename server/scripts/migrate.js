import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

/**
 * Initializes schema_migrations tracking table.
 */
async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(100) UNIQUE NOT NULL,
      batch INTEGER NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Runs pending UP migrations.
 */
async function migrateUp(client) {
  console.log('[MIGRATION] Checking for pending UP migrations...');

  await ensureMigrationTable(client);

  const { rows } = await client.query('SELECT version FROM schema_migrations;');
  const appliedVersions = new Set(rows.map(r => r.version));

  // Determine current highest batch number
  const { rows: batchRows } = await client.query('SELECT COALESCE(MAX(batch), 0) AS max_batch FROM schema_migrations;');
  const nextBatch = parseInt(batchRows[0].max_batch, 10) + 1;

  // Find all *.up.sql files sorted alphabetically
  const upFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.up.sql'))
    .sort();

  let appliedCount = 0;

  for (const file of upFiles) {
    const version = file.replace(/\.up\.sql$/, '');
    if (appliedVersions.has(version)) {
      continue;
    }

    appliedCount++;
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`[MIGRATION UP] Applying: ${file} (Batch ${nextBatch})...`);
    const start = Date.now();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, batch) VALUES ($1, $2);',
        [version, nextBatch]
      );
      await client.query('COMMIT');
      console.log(`[MIGRATION SUCCESS] Applied ${file} in ${Date.now() - start}ms.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[MIGRATION FAILED] Error executing ${file}:`, err.message);
      throw err;
    }
  }

  if (appliedCount === 0) {
    console.log('[MIGRATION] Database schema is already up to date. No migrations to apply.');
  } else {
    console.log(`[MIGRATION] Successfully executed ${appliedCount} migration(s).`);
  }
}

/**
 * Rolls back the latest batch of migrations using *.down.sql.
 */
async function migrateRollback(client) {
  console.log('[MIGRATION] Initiating rollback of last migration batch...');

  await ensureMigrationTable(client);

  // Find latest batch
  const { rows: batchRows } = await client.query('SELECT COALESCE(MAX(batch), 0) AS max_batch FROM schema_migrations;');
  const latestBatch = parseInt(batchRows[0].max_batch, 10);

  if (latestBatch === 0) {
    console.log('[MIGRATION] No migrations to rollback.');
    return;
  }

  const { rows: targetMigrations } = await client.query(
    'SELECT version FROM schema_migrations WHERE batch = $1 ORDER BY id DESC;',
    [latestBatch]
  );

  for (const record of targetMigrations) {
    const downFile = `${record.version}.down.sql`;
    const downFilePath = path.join(migrationsDir, downFile);

    if (!fs.existsSync(downFilePath)) {
      throw new Error(`Rollback script not found for version: ${record.version} (${downFile})`);
    }

    const sql = fs.readFileSync(downFilePath, 'utf8');
    console.log(`[MIGRATION DOWN] Reverting: ${record.version} (${downFile})...`);
    const start = Date.now();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1;', [record.version]);
      await client.query('COMMIT');
      console.log(`[MIGRATION SUCCESS] Reverted ${record.version} in ${Date.now() - start}ms.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[MIGRATION FAILED] Error reverting ${record.version}:`, err.message);
      throw err;
    }
  }

  console.log(`[MIGRATION] Successfully rolled back batch ${latestBatch}.`);
}

/**
 * Reports status of applied vs pending migrations.
 */
async function migrateStatus(client) {
  await ensureMigrationTable(client);

  const { rows: applied } = await client.query('SELECT version, batch, applied_at FROM schema_migrations ORDER BY id ASC;');
  const appliedMap = new Map(applied.map(r => [r.version, r]));

  const allUpFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.up.sql'))
    .sort();

  console.log('\n--- ExamPortal Migration Status ---');
  for (const file of allUpFiles) {
    const version = file.replace(/\.up\.sql$/, '');
    if (appliedMap.has(version)) {
      const record = appliedMap.get(version);
      console.log(`[APPLIED]  ${version} (Batch ${record.batch}, ${new Date(record.applied_at).toLocaleString()})`);
    } else {
      console.log(`[PENDING]  ${version}`);
    }
  }
  console.log('-----------------------------------\n');
}

/**
 * CLI Entry point
 */
async function main() {
  const command = (process.argv[2] || 'up').toLowerCase();

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('\n[DATABASE CONNECTION ERROR]');
    console.error(`Could not connect to PostgreSQL: ${err.message}`);
    console.error('Please verify that:');
    console.error(' 1. PostgreSQL is installed and actively running on your machine.');
    console.error(' 2. The credentials and DATABASE_URL in server/.env are configured.');
    console.error(' 3. The target database exists.\n');
    process.exit(1);
  }

  try {
    if (command === 'up') {
      await migrateUp(client);
    } else if (command === 'down' || command === 'rollback') {
      await migrateRollback(client);
    } else if (command === 'status') {
      await migrateStatus(client);
    } else {
      console.error(`Unknown migration command: "${command}". Use "up", "rollback", or "status".`);
      process.exitCode = 1;
    }
  } catch (err) {
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await closePool();
  }
}

main();
