import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

// Run the actual packaged entry point, resolving dependencies from the release.
const release = path.resolve(process.argv[2] ?? '.release');
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const scratch = await mkdtemp(path.join(release, '.smoke-'));
let output = '';
const child = spawn(process.execPath, [path.join(release, 'apps/api/dist/server.js')], {
  cwd: scratch,
  env: { PATH: process.env.PATH, NODE_ENV: 'production', API_HOST: '127.0.0.1', API_PORT: String(port), DATABASE_PATH: path.join(scratch, 'test.db'), UPLOADS_PATH: path.join(scratch, 'uploads') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
let spawnError;
child.on('error', error => { spawnError = error; });
try {
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError || child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).ok === true) { healthy = true; break; }
    } catch {}
    await delay(100);
  }
  if (!healthy) throw new Error(`Packaged API failed its startup health check: ${spawnError ?? ''}\n${output}`);
  console.log('Packaged API startup and health check passed.');
} finally {
  if (child.exitCode === null && !spawnError) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
  }
  await rm(scratch, { recursive: true, force: true });
}
