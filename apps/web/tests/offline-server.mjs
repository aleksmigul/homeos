// A real origin for service-worker tests. Browser request interception cannot
// reliably mock the worker's own network requests. No production API is used.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const image = await readFile(new URL('../public/apple-touch-icon.png', import.meta.url));
const version = JSON.parse(await readFile(path.join(root, 'version.json'), 'utf8'));
let plans;
let failTravel = false;
function reset() {
  failTravel = false;
  plans = Object.fromEntries(['a', 'b'].map(account => [account, [1, 2].map(index => ({
    id: `${account}-trip-${index}`, title: `${account.toUpperCase()} trip ${index}`, startDate: '2026-11-13', endDate: '2026-11-13', rowCount: 1, updatedAt: '2026-11-13T00:00:00Z',
    rows: [{ id: `${account}-day-${index}`, planId: `${account}-trip-${index}`, date: '2026-11-13', theme: `Day ${index}`, hotel: 'Offline Hotel', notes: `# Saved itinerary ${index}\n\nTrip ${index} directions.\n\n![Map](/api/saved-attachments/${account}-photo-${index})\n`, sortOrder: 0, updatedAt: '2026-11-13T00:00:00Z' }],
  }))]));
}
reset();
const json = (response, body, status = 200, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store', ...headers }); response.end(gzipSync(JSON.stringify(body))); };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5180');
    const account = /(?:^|; )account=([^;]+)/.exec(request.headers.cookie ?? '')?.[1] ?? 'a';
    const user = { email: `${account}@example.com`, name: `Tester ${account.toUpperCase()}`, developer: true };
    if (url.pathname === '/__test/reset') { reset(); return json(response, {}); }
    if (url.pathname === '/__test/fail-travel') { failTravel = true; return json(response, {}); }
    if (url.pathname === '/api/health') return json(response, { ok: true });
    if (url.pathname === '/api/version') return json(response, version);
    if (url.pathname === '/api/auth/config') return json(response, { googleClientId: '' });
    if (url.pathname === '/api/auth/logout') return json(response, {}, 200, { 'Set-Cookie': 'account=out; Path=/; SameSite=Lax' });
    if (url.pathname === '/api/auth/me') return json(response, account === 'out' ? { error: 'Authentication required' } : { user }, account === 'out' ? 401 : 200);
    if (url.pathname === '/api/auth/accounts') return json(response, { accounts: [{ email: 'a@example.com' }, { email: 'b@example.com' }] });
    if (url.pathname === '/api/auth/switch-account') {
      let body = ''; for await (const chunk of request) body += chunk;
      const next = JSON.parse(body).email.split('@')[0];
      return json(response, { user: { email: `${next}@example.com`, name: `Tester ${next.toUpperCase()}`, developer: true } }, 200, { 'Set-Cookie': `account=${next}; Path=/; SameSite=Lax` });
    }
    if (url.pathname === '/api/travel-plans') return json(response, failTravel ? { error: 'Travel temporarily unavailable' } : { travelPlans: plans[account] ?? [] }, failTravel ? 503 : 200);
    const plan = plans[account]?.find(plan => url.pathname === `/api/travel-plans/${plan.id}` || url.pathname === `/api/travel-plans/${plan.id}/emails`);
    if (plan) return json(response, url.pathname.endsWith('/emails') ? { emails: [{ id: `${account}-email`, subject: 'Reservation confirmation', sender: 'hotel@example.com', recipients: [user.email], receivedAt: plan.updatedAt, attachments: [], text: `Booking for ${plan.title}. Confirmation 12345.`, html: null }] } : { travelPlan: plan });
    if (url.pathname.startsWith('/api/travel-rows/') && request.method === 'PATCH') {
      const row = plans[account].flatMap(plan => plan.rows).find(row => url.pathname.endsWith('/' + row.id));
      let body = ''; for await (const chunk of request) body += chunk;
      Object.assign(row, JSON.parse(body));
      return json(response, { travelRow: row });
    }
    if (url.pathname.startsWith('/api/saved-attachments/')) { response.writeHead(200, { 'Content-Type': 'image/png' }); return response.end(image); }
    if (url.pathname === '/api/todo-lists') return json(response, { error: 'Unrelated module unavailable' }, 500);
    if (url.pathname.startsWith('/api/')) return json(response, { checklists: [], streams: [], current: [], archived: [], emails: [], chores: [], configured: true, address: 'travel@example.com' });
    const filename = url.pathname === '/' || !path.extname(url.pathname) ? path.join(root, 'index.html') : path.resolve(root, '.' + url.pathname);
    if (!filename.startsWith(root)) { response.writeHead(403); return response.end(); }
    const body = await readFile(filename);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[path.extname(filename)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }); response.end(body);
  } catch (error) { json(response, { error: error.message }, 500); }
}).listen(5180, '127.0.0.1');
