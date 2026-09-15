#!/usr/bin/env node
/**
 * Dev/preview PostgreSQL manager (user-space, no root required).
 *
 * Runs a REAL PostgreSQL server (embedded-postgres binaries) under the
 * container user so local development and the live preview both use
 * PostgreSQL — matching the production Supabase architecture exactly.
 *
 *   node scripts/dev-postgres.mjs start|stop|status
 *
 * Data dir: /workspace/.pgdata (gitignored). Port: 54329.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '.pgdata');
const PORT = 54329;
const DB_NAME = 'hive_importer';
const USER = 'hive_importer';
const PASSWORD = 'hive_importer_dev_pw'; // dev-only credentials, non-secret, local to the container

const cmd = process.argv[2] ?? 'start';

function makeClient() {
  return new Client({
    host: '127.0.0.1',
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DB_NAME,
    connectionTimeoutMillis: 2000,
  });
}

async function isUp() {
  try {
    const c = makeClient();
    await c.connect();
    await c.query('SELECT 1');
    await c.end();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (cmd === 'status') {
    console.log((await isUp()) ? 'postgres: up' : 'postgres: down');
    process.exit((await isUp()) ? 0 : 1);
  }

  if (cmd === 'stop') {
    try {
      const pg = new EmbeddedPostgres({
        databaseDir: DATA_DIR,
        user: USER,
        password: PASSWORD,
        port: PORT,
        persistent: true,
      });
      await pg.stop();
      console.log('postgres: stopped');
    } catch (e) {
      console.log('postgres: not running (or already stopped)');
    }
    process.exit(0);
  }

  if (cmd === 'start') {
    if (await isUp()) {
      // Already running (e.g. after a container resume) — stay in the foreground
      // so the service manager sees a healthy, long-lived process (exit(0) would
      // make procmgr restart-loop).
      console.log('postgres: already up; attaching foreground keepalive');
      const keepAlive = setInterval(() => {}, 1 << 30);
      ['SIGTERM', 'SIGINT'].forEach((sig) =>
        process.on(sig, () => {
          clearInterval(keepAlive);
          process.exit(0);
        })
      );
      return;
    }
    const pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: USER,
      password: PASSWORD,
      port: PORT,
      persistent: true,
      onError: (msgOrError) => console.error('[pg]', String(msgOrError)),
    });
    // Initialize the data dir only if it doesn't already exist.
    if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      await pg.initialise();
    }
    await pg.start();
    try {
      await pg.createDatabase(DB_NAME);
    } catch {
      // already exists — fine
    }
    // Keep the process in the foreground (service managers require it).
    const keepAlive = setInterval(() => {}, 1 << 30);
    console.log(`postgres: up on 127.0.0.1:${PORT} (db=${DB_NAME})`);
    ['SIGTERM', 'SIGINT'].forEach((sig) =>
      process.on(sig, async () => {
        clearInterval(keepAlive);
        try { await pg.stop(); } catch {}
        process.exit(0);
      })
    );
    return;
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((e) => {
  console.error('postgres manager error:', e?.message ?? e);
  process.exit(1);
});
