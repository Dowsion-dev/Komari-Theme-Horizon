// Minimal mock of Komari's public API for local theme testing (no deps).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIST = process.argv[2];
const PORT = Number(process.argv[3] || 8787);
const GB = 1024 ** 3, MB = 1024 ** 2, TB = 1024 ** 4;

const defs = [
  ['VM.Standard.A1.Flex.SEL', '🇰🇷', 'Oracle', 'debian 13', 'Neoverse-N1', 2, 12 * GB, 196 * GB, 'arm64', 'kvm', -1, 0, null, ''],
  ['VM.Standard.A1.Flex.QUN', '🇰🇷', 'Oracle', 'Debian GNU/Linux 12', 'Neoverse-N1', 4, 23 * GB, 196 * GB, 'arm64', 'kvm', -1, 0, null, ''],
  ['VM.Standard.A1.Flex.OSA', '🇯🇵', 'Oracle', 'Ubuntu 24.04 LTS', 'Neoverse-N1', 4, 23 * GB, 196 * GB, 'arm64', 'kvm', -1, 0, null, ''],
  ['HKG.AS3.Pro.VICTORIA', '🇭🇰', 'DMIT', 'debian 12', 'AMD EPYC 7713P', 1, 2 * GB, 59 * GB, 'amd64', 'kvm', 298.88, 365, 99, 'ready to sell'],
  ['LAX.EB.WEE', '🇺🇸', 'DMIT', 'debian 12', 'AMD EPYC 9654', 2, 2 * GB, 40 * GB, 'amd64', 'kvm', 199, 365, 77, 'ready to sell'],
  ['HostDzire-IN-1', '🇮🇳', 'HostDzire', 'Ubuntu 22.04', 'Intel Xeon E5-2680 v4', 2, 4 * GB, 80 * GB, 'amd64', 'kvm', 25, 30, 9, ''],
  ['HostDzire-IN-2', '🇮🇳', 'HostDzire', 'AlmaLinux 9', 'Intel Xeon E5-2680 v4', 2, 4 * GB, 80 * GB, 'amd64', 'kvm', 25, 365, 221, ''],
  ['HostDzire-US', '🇺🇸', 'HostDzire', 'debian 12', 'AMD Ryzen 9 5950X', 4, 8 * GB, 160 * GB, 'amd64', 'kvm', 45.68, 365, 271, ''],
  ['HostDzire-DE', '🇩🇪', 'HostDzire', 'Rocky Linux 9', 'AMD Ryzen 9 7950X', 4, 8 * GB, 120 * GB, 'amd64', 'kvm', 41.29, 365, 57, 'GSL'],
  ['GreenCloud-JP', '🇯🇵', 'GreenCloud', 'debian 12', 'AMD EPYC 7B13', 2, 4 * GB, 60 * GB, 'amd64', 'kvm', 16.96, 365, 339, 'MAIL'],
  ['GreenCloud-SG', '🇸🇬', 'GreenCloud', 'Alpine Linux v3.20', 'AMD EPYC 7B13', 1, 1 * GB, 20 * GB, 'amd64', 'kvm', 24, 365, 192, ''],
  ['Bage-HK', '🇭🇰', 'Bage', 'Ubuntu 24.04', 'Intel Xeon Platinum 8272CL', 2, 2 * GB, 40 * GB, 'amd64', 'kvm', 7.4, 30, 19, ''],
  ['Bandwagon-LA', '🇺🇸', 'Bandwagon', 'CentOS Stream 9', 'Intel Xeon Gold 6148', 2, 2 * GB, 40 * GB, 'amd64', 'kvm', 172.89, 1095, 712, 'Prod;Panel'],
  ['HostBrr-NL', '🇳🇱', 'HostBrr', 'Arch Linux', 'AMD EPYC 9634', 2, 4 * GB, 50 * GB, 'amd64', 'lxc', 29.2, 30, 331, ''],
  ['netcup-RS-1000', '🇩🇪', 'netcup', 'debian 13', 'AMD EPYC 9634', 4, 8 * GB, 256 * GB, 'amd64', 'kvm', 41.01, 365, 326, 'runner'],
  ['Win-Box', '🇬🇧', '', 'Windows Server 2022', 'Intel Core i5-12400', 6, 16 * GB, 512 * GB, 'amd64', '', 0, 0, null, ''],
];
const cur = { 'HostBrr-NL': '€', 'netcup-RS-1000': '€', 'Bandwagon-LA': '€', 'GreenCloud-JP': '€', 'Bage-HK': '€', 'GreenCloud-SG': '€' };
const nodes = defs.map((d, i) => ({
  uuid: 'node-' + String(i).padStart(2, '0') + '-' + crypto.createHash('md5').update(d[0]).digest('hex').slice(0, 8),
  name: d[0], region: d[1], group: d[2], os: d[3], cpu_name: d[4], cpu_cores: d[5], mem_total: d[6], disk_total: d[7], swap_total: i % 3 ? 1 * GB : 0,
  arch: d[8], virtualization: d[9], price: d[10], billing_cycle: d[11],
  expired_at: d[12] == null ? (d[10] === -1 ? null : null) : new Date(Date.now() + d[12] * 86400000).toISOString(),
  currency: cur[d[0]] || '$', tags: d[13], weight: i, hidden: false, traffic_limit: i === 4 ? 2 * TB : i === 0 ? 20 * GB : i === 1 ? 15 * GB : i === 2 ? 1 * TB : 0, traffic_limit_type: ['sum', 'up', 'max', 'max', 'max'][i] || 'max',
  public_remark: i === 0 ? 'Always Free tier ARM instance.' : '', gpu_name: '', kernel_version: '6.1.0', created_at: '2025-01-01T00:00:00Z',
}));
const offline = new Set([nodes[15].uuid]);
const tasks = [
  { id: 1, name: 'Cloudflare', type: 'http', interval: 60, weight: 0, clients: nodes.slice(0, 15).map(n => n.uuid) },
  { id: 2, name: 'Naver', type: 'http', interval: 60, weight: 1, clients: nodes.slice(0, 3).map(n => n.uuid) },
  { id: 3, name: 'CT', type: 'tcp', interval: 60, weight: 2, clients: nodes.slice(0, 9).map(n => n.uuid) },
  { id: 4, name: 'CU', type: 'tcp', interval: 60, weight: 3, clients: nodes.slice(1, 9).map(n => n.uuid) },
  { id: 5, name: 'CM', type: 'icmp', interval: 60, weight: 4, clients: nodes.slice(1, 9).map(n => n.uuid) },
];
let themeSettings = process.env.SETTINGS ? JSON.parse(process.env.SETTINGS) : {};
const boot = Date.now() - 86400000 * 3;
const RET_DAYS = Number(process.env.RETENTION_DAYS || 40);
// cumulative agent counters: node i rebooted (3+i) days ago, and once more 20 days before that
const T0 = Date.now();
const bootOf = (i) => T0 - (3 + i) * 86400000;
const rateUp = (i) => (i + 1) * 20 * 1024, rateDown = (i) => (i + 1) * 26 * 1024;
function counter(i, t, rate) { const b = bootOf(i); const start = t >= b ? b : b - 20 * 86400000; return Math.max(0, (t - start) / 1000 * rate); }
const rnd = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
function report(n, i) {
  const t = Date.now() / 1000;
  return {
    cpu: { name: n.cpu_name, cores: n.cpu_cores, arch: n.arch, usage: Math.max(0.1, 3 + 4 * Math.sin(t / 30 + i) + i * 0.8) },
    ram: { total: n.mem_total, used: n.mem_total * (0.05 + 0.3 * rnd(i + 1)) },
    swap: { total: n.swap_total, used: n.swap_total * 0.1 },
    load: { load1: 0.1 * i, load5: 0.08 * i, load15: 0.05 * i },
    disk: { total: n.disk_total, used: n.disk_total * (0.06 + 0.4 * rnd(i + 7)) },
    network: { up: 2000 + 90000 * rnd(i + Math.floor(t / 3)), down: 1000 + 120000 * rnd(i + 3 + Math.floor(t / 3)), totalUp: counter(i, Date.now(), rateUp(i)), totalDown: counter(i, Date.now(), rateDown(i)) },
    connections: { tcp: 10 + i * 9, udp: 3 + i * 2 }, uptime: Math.floor((Date.now() - bootOf(i)) / 1000), process: 80 + i * 7, message: '',
    updated_at: new Date().toISOString(),
  };
}
const ok = (data) => JSON.stringify({ status: 'success', message: '', data });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname, q = u.searchParams;
  const json = (s) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(s); };
  if (p === '/api/public') return json(ok({ sitename: 'Horizon', description: 'demo', private_site: false, theme: 'horizon', theme_settings: themeSettings, record_preserve_time: RET_DAYS * 24 }));
  if (p === '/api/me') return json(JSON.stringify(process.env.ADMIN ? { username: 'admin', logged_in: true } : { username: 'Guest', logged_in: false }));
  if (p === '/api/admin/theme/settings' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => { try { themeSettings = JSON.parse(body); json(ok(null)); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ status: 'error', message: 'bad json' })); } });
    return;
  }
  if (p === '/api/nodes') return json(ok(nodes));
  if (p === '/api/task/ping') return json(ok(tasks.map(({ clients, ...t }) => ({ ...t, clients }))));
  if (p === '/api/records/load') {
    const uuid = q.get('uuid'), hours = Number(q.get('hours') || 1), i = nodes.findIndex(n => n.uuid === uuid), n = nodes[i];
    const now = Date.now(), recs = [], step = Math.max(60, Math.ceil(hours * 3600 / 500));
    for (let t = Math.max(now - hours * 3600e3, now - RET_DAYS * 86400e3); t <= now; t += step * 1000) {
      if (q.get('load_type') === 'network') { recs.push({ client: uuid, time: new Date(t).toISOString(), net_in: 0, net_out: 0, net_total_up: counter(i, t, rateUp(i)), net_total_down: counter(i, t, rateDown(i)) }); continue; }
      const k = t / 1000;
      recs.push({ client: uuid, time: new Date(t).toISOString(), cpu: Math.max(0.2, 3 + 3 * Math.sin(k / 600 + i) + (rnd(k) > .97 ? 30 : 0)), ram: n.mem_total * (0.3 + 0.05 * Math.sin(k / 900)), ram_total: n.mem_total,
        disk: n.disk_total * 0.2, disk_total: n.disk_total, net_in: 800 + 2000 * rnd(k + 1), net_out: 1000 + 1500 * rnd(k + 2), load: Math.abs(0.3 * Math.sin(k / 700)) });
    }
    return json(ok({ records: recs, count: recs.length }));
  }
  if (p === '/api/records/ping') {
    const uuid = q.get('uuid'), hours = Number(q.get('hours') || 1), now = Date.now(), recs = [];
    const mine = tasks.filter(t => t.clients.includes(uuid));
    mine.forEach((t, j) => {
      const base = [16, 27, 270, 105, 95][t.id - 1];
      for (let tt = now - hours * 3600e3; tt <= now; tt += (hours <= 1 ? 60 : 300) * 1000) {
        const r = rnd(tt / 1000 + t.id * 13 + uuid.length);
        recs.push({ task_id: t.id, time: new Date(tt).toISOString(), value: r > (t.id === 3 ? 0.95 : 0.975) ? -1 : Math.round(base + r * base * 0.25 + (r > 0.96 ? base * 4 : 0)), client: uuid });
      }
    });
    return json(ok({ count: recs.length, records: recs, tasks: mine.map(t => ({ id: t.id, name: t.name, interval: t.interval, loss: 0 })) }));
  }
  if (p === '/api/clients') { res.writeHead(400); return res.end('ws only'); }
  // static
  let f = path.join(DIST, decodeURIComponent(p));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// tiny websocket server for /api/clients
server.on('upgrade', (req, sock) => {
  if (!req.url.startsWith('/api/clients')) return sock.destroy();
  const key = req.headers['sec-websocket-key'];
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const send = (str) => {
    const payload = Buffer.from(str); let hdr;
    if (payload.length < 126) hdr = Buffer.from([0x81, payload.length]);
    else if (payload.length < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 126; hdr.writeUInt16BE(payload.length, 2); }
    else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(payload.length), 2); }
    sock.write(Buffer.concat([hdr, payload]));
  };
  sock.on('data', (buf) => {
    const op = buf[0] & 0x0f; if (op === 8) return sock.end();
    let len = buf[1] & 0x7f, off = 2; if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
    const mask = buf.slice(off, off + 4), data = buf.slice(off + 4, off + 4 + len).map((b, i) => b ^ mask[i % 4]);
    if (data.toString().startsWith('get')) {
      const d = {}; nodes.forEach((n, i) => { d[n.uuid] = report(n, i); });
      send(JSON.stringify({ status: 'success', data: { online: nodes.filter(n => !offline.has(n.uuid)).map(n => n.uuid), data: d } }));
    }
  });
  sock.on('error', () => {});
});
server.listen(PORT, () => console.log('mock on ' + PORT));
