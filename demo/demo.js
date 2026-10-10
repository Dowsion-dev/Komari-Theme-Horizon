/*
 * Horizon demo — a simulated Komari backend that runs in the browser.
 * Intercepts fetch('/api/*') and WebSocket('/api/clients') so the unmodified theme can run on a static host.
 * All numbers are generated deterministically from the clock: every visitor sees the same cluster.
 */
(function () {
  'use strict';
  var GB = 1073741824, MB = 1048576, KB = 1024, H = 3600e3, D = 86400e3;
  var OFFSET = 8 * H; // traffic cycles in UTC+8
  var SETTINGS_KEY = 'horizon-demo-settings';
  var T0 = Date.now();

  // ---- deterministic noise ------------------------------------------------
  function hash(a, b) {
    var h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  function smooth(seed, x) { // value noise in [0,1)
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(seed, i) * (1 - u) + hash(seed, i + 1) * u;
  }
  // evening peak for China-facing routes (UTC+8 20:00–23:00)
  function peak(t) { var h = ((t + OFFSET) % D) / H; return Math.exp(-Math.pow((h - 21.5) / 2.2, 2)); }
  function daily(t, phase) { return 0.5 + 0.5 * Math.sin(((t + OFFSET) % D) / D * 2 * Math.PI + (phase || 0)); }

  // ---- the cluster --------------------------------------------------------
  // p: ping baselines [CT, CU, CM, Google, Cloudflare] (0 = not probed), loss: per-mille loss chance per task
  // use: cycle usage at page load [down, up] in GB, spd: average live rate [down, up] in KB/s
  var NODES = [
    // 线路机 —— 回国优化线路
    { name: 'Po0-SHA.Spring', region: '🇨🇳', group: '线路机', os: 'Debian GNU/Linux 12 (bookworm)', cpu: 'AMD EPYC 7K62 48-Core Processor', cores: 2, mem: 2, disk: 20, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 1188, cur: '¥', cycle: 365, exp: 213, limit: 500, ltype: 'up', reset: 15, tags: 'Po0;华东;IPLC;BGP',
      cpuB: 9, ramF: 0.46, diskF: 0.41, swapF: 0.18, procs: 121, tcp: 186, udp: 24, up: 41, use: [92, 186], spd: [380, 1450],
      p: [4, 9, 7, 31, 28], loss: [0, 2, 0, 0, 0], remark: '上海 IPLC 中转入口：内网专线直连香港 / 日本落地。' },
    { name: 'Tencent-CAN.Lighthouse', region: '🇨🇳', group: '线路机', os: 'Ubuntu 22.04.4 LTS', cpu: 'Intel(R) Xeon(R) Platinum 8255C CPU @ 2.50GHz', cores: 2, mem: 2, disk: 50, swap: 0, arch: 'amd64', virt: 'kvm',
      price: 99, cur: '¥', cycle: 365, exp: 47, limit: 512, ltype: 'max', reset: 3, tags: '腾讯云;华南;BGP',
      cpuB: 14, ramF: 0.63, diskF: 0.52, swapF: 0, procs: 143, tcp: 312, udp: 41, up: 18, use: [458, 131], spd: [2600, 820],
      p: [9, 14, 11, 38, 33], loss: [0, 0, 3, 0, 0] },
    { name: 'DMIT-HKG.Pro.VICTORIA', region: '🇭🇰', group: '线路机', os: 'Debian GNU/Linux 12 (bookworm)', cpu: 'AMD EPYC 7713P 64-Core Processor', cores: 1, mem: 2, disk: 59, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 298.88, cur: '$', cycle: 365, exp: 182, limit: 800, ltype: 'sum', reset: 9, tags: 'DMIT;亚太;CN2GIA;CMI',
      cpuB: 6, ramF: 0.38, diskF: 0.27, swapF: 0.06, procs: 98, tcp: 241, udp: 19, up: 63, use: [214, 198], spd: [900, 860],
      p: [38, 41, 33, 2, 2], loss: [1, 1, 1, 0, 0] },
    { name: 'DMIT-TYO.Pro.SHINAGAWA', region: '🇯🇵', group: '线路机', os: 'Debian GNU/Linux 13 (trixie)', cpu: 'AMD EPYC 7443P 24-Core Processor', cores: 2, mem: 2, disk: 40, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 239.9, cur: '$', cycle: 365, exp: 96, limit: 800, ltype: 'sum', reset: 21, tags: 'DMIT;亚太;CN2GIA',
      cpuB: 4, ramF: 0.31, diskF: 0.22, swapF: 0.02, procs: 92, tcp: 128, udp: 12, up: 27, use: [61, 57], spd: [260, 240],
      p: [72, 79, 88, 2, 2], loss: [1, 2, 4, 0, 0] },
    { name: 'BWH-LAX.DC6.SLA', region: '🇺🇸', group: '线路机', os: 'AlmaLinux 9.4 (Seafoam Ocelot)', cpu: 'Intel(R) Xeon(R) Gold 6148 CPU @ 2.40GHz', cores: 2, mem: 2, disk: 40, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 239.99, cur: '$', cycle: 365, exp: 288, limit: 1024, ltype: 'sum', reset: 27, tags: 'BWH;美西;CN2GIA;9929;CMIN2',
      cpuB: 11, ramF: 0.52, diskF: 0.48, swapF: 0.11, procs: 134, tcp: 405, udp: 33, up: 89, use: [318, 296], spd: [1800, 1700],
      p: [132, 141, 156, 1, 1], loss: [2, 3, 6, 0, 0] },
    { name: 'RakSmart-SJC.CN2', region: '🇺🇸', group: '线路机', os: 'Ubuntu 20.04.6 LTS', cpu: 'Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz', cores: 1, mem: 1, disk: 25, swap: 0.5, arch: 'amd64', virt: 'kvm',
      price: 3.99, cur: '$', cycle: 30, exp: 4, limit: 1024, ltype: 'max', reset: 0, tags: 'RakSmart;美西;CN2GT',
      cpuB: 23, ramF: 0.81, diskF: 0.71, swapF: 0.52, procs: 87, tcp: 96, udp: 9, up: 5, use: [971, 402], spd: [3400, 1200],
      p: [168, 196, 231, 2, 2], loss: [8, 22, 35, 0, 0], remark: '月付机，4 天后到期，流量已接近上限。' },
    { name: 'AkkoCloud-FRA.CN2.A2', region: '🇩🇪', group: '线路机', os: 'Debian GNU/Linux 12 (bookworm)', cpu: 'AMD Ryzen 9 7950X 16-Core Processor', cores: 2, mem: 2, disk: 30, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 449, cur: '¥', cycle: 365, exp: 141, limit: 800, ltype: 'sum', reset: 12, tags: 'AkkoCloud;欧洲;CN2GIA;9929;CMIN2',
      cpuB: 5, ramF: 0.34, diskF: 0.19, swapF: 0.03, procs: 101, tcp: 77, udp: 8, up: 33, use: [121, 112], spd: [420, 400],
      p: [176, 183, 191, 2, 1], loss: [3, 4, 6, 0, 0] },

    // 落地机 —— 原生 IP / 大流量
    { name: 'RFCHost-TYO.Golden', region: '🇯🇵', group: '落地机', os: 'Alpine Linux v3.20', cpu: 'Intel(R) Xeon(R) Gold 6338 CPU @ 2.00GHz', cores: 1, mem: 1, disk: 15, swap: 0, arch: 'amd64', virt: 'lxc',
      price: 39.9, cur: '$', cycle: 365, exp: 251, limit: 2000, ltype: 'sum', reset: 1, tags: 'RFCHost;日本;原生IP;流媒体',
      cpuB: 17, ramF: 0.58, diskF: 0.33, swapF: 0, procs: 46, tcp: 512, udp: 66, up: 112, use: [688, 641], spd: [7800, 7300],
      p: [96, 182, 74, 2, 2], loss: [6, 18, 4, 0, 0] },
    { name: 'AetherCloud-LAX.Prime', region: '🇺🇸', group: '落地机', os: 'Debian GNU/Linux 12 (bookworm)', cpu: 'AMD EPYC 9654 96-Core Processor', cores: 2, mem: 2, disk: 40, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 4.86, cur: '$', cycle: 92, exp: 63, limit: 1024, ltype: 'max', reset: 0, tags: 'AetherCloud;美西;原生IP',
      cpuB: 8, ramF: 0.42, diskF: 0.29, swapF: 0.09, procs: 104, tcp: 268, udp: 31, up: 52, use: [402, 377], spd: [2400, 2300],
      p: [178, 226, 247, 1, 1], loss: [12, 30, 26, 0, 0] },
    { name: 'Oracle-FRA.A1.Flex', region: '🇩🇪', group: '落地机', os: 'Ubuntu 24.04.1 LTS', cpu: 'Neoverse-N1', cores: 4, mem: 24, disk: 200, swap: 0, arch: 'arm64', virt: 'kvm',
      price: -1, cur: '$', cycle: 0, exp: null, limit: 10240, ltype: 'up', reset: 1, tags: 'Oracle;欧洲;ARM;Always Free',
      cpuB: 19, ramF: 0.37, diskF: 0.24, swapF: 0, procs: 211, tcp: 158, udp: 22, up: 146, use: [1350, 1980], spd: [3900, 5600],
      p: [248, 263, 289, 3, 2], loss: [15, 24, 41, 0, 0], remark: 'Oracle Cloud 永久免费 ARM 实例。' },
    { name: 'Akile-HKG.Native', region: '🇭🇰', group: '落地机', os: 'Rocky Linux 9.4 (Blue Onyx)', cpu: 'Intel(R) Xeon(R) Platinum 8272CL CPU @ 2.60GHz', cores: 1, mem: 1, disk: 10, swap: 0.5, arch: 'amd64', virt: 'kvm',
      price: 45, cur: '€', cycle: 0, exp: 'lifetime', limit: 500, ltype: 'max', reset: 5, tags: 'Akile;亚太;原生IP;Lifetime',
      cpuB: 3, ramF: 0.49, diskF: 0.58, swapF: 0.21, procs: 64, tcp: 89, udp: 7, up: 74, use: [143, 96], spd: [560, 380],
      p: [47, 58, 44, 2, 2], loss: [2, 5, 3, 0, 0] },

    // 家宽 —— 住宅宽带
    { name: 'Comcast-SJC.Residential', region: '🇺🇸', group: '家宽', os: 'Proxmox VE 8.2.4', cpu: 'Intel(R) Celeron(R) N5105 @ 2.00GHz', cores: 4, mem: 16, disk: 512, swap: 8, arch: 'amd64', virt: '',
      price: 70, cur: '$', cycle: 30, exp: 17, limit: 0, ltype: 'max', reset: 0, tags: 'Comcast;美西;Residential;PVE',
      cpuB: 21, ramF: 0.72, diskF: 0.61, swapF: 0.08, procs: 386, tcp: 642, udp: 118, up: 37, use: [1580, 312], spd: [6100, 1200],
      p: [161, 178, 204, 9, 8], loss: [9, 14, 19, 1, 1] },
    { name: 'Verizon-NYC.Static', region: '🇺🇸', group: '家宽', os: 'Debian GNU/Linux 12 (bookworm)', cpu: 'AMD EPYC 7B13', cores: 2, mem: 4, disk: 60, swap: 1, arch: 'amd64', virt: 'kvm',
      price: 1430, cur: '¥', cycle: 365, exp: 319, limit: 2000, ltype: 'sum', reset: 18, tags: 'AaITR;美东;Residential;Static',
      cpuB: 7, ramF: 0.41, diskF: 0.36, swapF: 0.05, procs: 112, tcp: 204, udp: 17, up: 58, use: [452, 431], spd: [1700, 1650],
      p: [214, 233, 258, 3, 3], loss: [10, 17, 23, 0, 0] },
    { name: 'CT-HGH.SoftRouter', region: '🇨🇳', group: '家宽', os: 'ImmortalWrt 23.05.3', cpu: 'ARMv8 Processor rev 4 (Cortex-A53)', cores: 4, mem: 1, disk: 8, swap: 0, arch: 'arm64', virt: '',
      price: 0, cur: '¥', cycle: 0, exp: null, limit: 0, ltype: 'max', reset: 0, tags: '电信;华东;Residential;NAT',
      cpuB: 12, ramF: 0.56, diskF: 0.44, swapF: 0, procs: 132, tcp: 1240, udp: 386, up: 12, use: [2210, 186], spd: [9200, 900],
      p: [6, 18, 21, 0, 0], loss: [1, 4, 6, 0, 0], remark: '家里的软路由，旁路由跑探针。' },
    { name: 'SoftBank-OSA.Home', region: '🇯🇵', group: '家宽', os: 'Raspberry Pi OS (Raspbian) 12', cpu: 'Cortex-A72', cores: 4, mem: 8, disk: 128, swap: 0.1, arch: 'arm64', virt: '',
      price: 0, cur: '¥', cycle: 0, exp: null, limit: 0, ltype: 'max', reset: 0, tags: 'SoftBank;日本;Residential',
      cpuB: 6, ramF: 0.3, diskF: 0.2, swapF: 0, procs: 160, tcp: 80, udp: 10, up: 0, use: [0, 0], spd: [0, 0],
      p: [0, 0, 0, 0, 0], loss: [0, 0, 0, 0, 0], offline: true }
  ];
  var TASKS = [
    { id: 1, name: 'LocalCT', type: 'tcp', interval: 60 },
    { id: 2, name: 'LocalCU', type: 'tcp', interval: 60 },
    { id: 3, name: 'LocalCM', type: 'tcp', interval: 60 },
    { id: 4, name: 'Google', type: 'icmp', interval: 60 },
    { id: 5, name: 'Cloudflare', type: 'icmp', interval: 60 }
  ];

  function uuidOf(i, name) {
    var h = 0; for (var k = 0; k < name.length; k++) h = (Math.imul(h, 31) + name.charCodeAt(k)) | 0;
    var hex = ('00000000' + (h >>> 0).toString(16)).slice(-8);
    return hex + '-demo-4' + ('00' + i).slice(-3) + '-a' + hex.slice(0, 3) + '-' + ('000000000000' + (i * 7919 + 1013904223).toString(16)).slice(-12);
  }
  NODES.forEach(function (d, i) { d.i = i; d.uuid = uuidOf(i, d.name); d.seed = 101 + i * 37; });

  // traffic cycles (same rules as the theme's reset day, in UTC+8)
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function cycleStart(day, t) {
    var l = new Date(t + OFFSET), y = l.getUTCFullYear(), m = l.getUTCMonth();
    var at = function (mm) { return Date.UTC(y, mm, Math.min(day, dim(y, mm))) - OFFSET; };
    return t >= at(m) ? at(m) : at(m - 1);
  }
  function expiryOf(d) {
    if (d.exp === 'lifetime') return Date.UTC(2099, 11, 31);
    if (d.exp == null) return null;
    // stable date: anchored to the start of today (UTC+8) so it doesn't drift during a visit
    return Math.floor((T0 + OFFSET) / D) * D - OFFSET + d.exp * D + 10 * H;
  }
  function resetDay(d) {
    if (d.reset) return d.reset;
    var e = expiryOf(d);
    return e && new Date(e).getUTCFullYear() < 2099 ? new Date(e + OFFSET).getUTCDate() : 1;
  }
  // agent-style cumulative counter that restarts at every cycle boundary, so "探针计数" and "按重置日统计" agree
  function counter(d, t, dir) {
    var day = resetDay(d), cs = cycleStart(day, T0), target = d.use[dir] * GB;
    if (!target) return 0;
    var span = Math.max(T0 - cs, 6 * H), rate = target / span;
    var start = cycleStart(day, t);
    if (start >= cs) return Math.max(0, target + (t - T0) * rate);
    var prevSpan = cs - start; // earlier cycles: roughly the same pace
    return Math.max(0, (t - start) * rate * (0.85 + 0.3 * hash(d.seed + dir, Math.floor(start / D))));
  }

  // ---- metrics ------------------------------------------------------------
  function cpuAt(d, t) {
    var base = d.cpuB * (0.7 + 0.6 * daily(t, d.i));
    var wob = (smooth(d.seed, t / 9e5) - 0.5) * d.cpuB * 0.8;
    var spike = hash(d.seed + 5, Math.floor(t / 3e5)) > 0.985 ? 35 + 40 * hash(d.seed + 6, Math.floor(t / 3e5)) : 0;
    return Math.max(0.3, Math.min(100, base + wob + spike));
  }
  function ramAt(d, t) { return Math.min(0.97, d.ramF * (0.93 + 0.12 * smooth(d.seed + 1, t / 3.6e6))); }
  function netAt(d, t, dir) { // bytes/s
    var avg = d.spd[dir] * KB; if (!avg) return 0;
    var shape = 0.45 + 0.9 * daily(t, 1.2 + d.i) * (0.6 + 0.8 * peak(t));
    var burst = hash(d.seed + 9 + dir, Math.floor(t / 6e4)) > 0.97 ? 3 : 1;
    return avg * shape * (0.7 + 0.6 * smooth(d.seed + 2 + dir, t / 1.2e5)) * burst;
  }
  function loadAt(d, t) { return d.cores * cpuAt(d, t) / 100 * 1.6 + 0.02; }
  function bootAt(d) { return T0 - d.up * D - d.i * 4111e3; }

  function report(d) {
    var t = Date.now(), s = t / 1000;
    var cpu = cpuAt(d, t) + (hash(d.seed + 3, Math.floor(s / 2)) - 0.5) * 2;
    var l1 = loadAt(d, t);
    return {
      cpu: { name: d.cpu, cores: d.cores, arch: d.arch, usage: Math.max(0.2, cpu) },
      ram: { total: d.mem * GB, used: d.mem * GB * ramAt(d, t) },
      swap: { total: d.swap * GB, used: d.swap * GB * d.swapF },
      load: { load1: l1 * (0.9 + 0.2 * hash(d.seed, Math.floor(s / 2))), load5: loadAt(d, t - 3e5), load15: loadAt(d, t - 9e5) },
      disk: { total: d.disk * GB, used: d.disk * GB * (d.diskF + (t - T0) / D * 0.002) },
      network: {
        up: netAt(d, t, 1) * (0.8 + 0.4 * hash(d.seed + 11, Math.floor(s / 2))),
        down: netAt(d, t, 0) * (0.8 + 0.4 * hash(d.seed + 12, Math.floor(s / 2))),
        totalUp: counter(d, t, 1), totalDown: counter(d, t, 0)
      },
      connections: { tcp: Math.round(d.tcp * (0.9 + 0.2 * smooth(d.seed + 4, s / 60))), udp: Math.round(d.udp * (0.85 + 0.3 * smooth(d.seed + 5, s / 60))) },
      uptime: Math.floor((t - bootAt(d)) / 1000), process: d.procs + Math.round(4 * smooth(d.seed + 6, s / 30)), message: '',
      updated_at: new Date(t).toISOString()
    };
  }

  function node(d) {
    var e = expiryOf(d);
    return {
      uuid: d.uuid, name: d.name, region: d.region, group: d.group, os: d.os, cpu_name: d.cpu, cpu_cores: d.cores,
      mem_total: d.mem * GB, disk_total: d.disk * GB, swap_total: d.swap * GB, arch: d.arch, virtualization: d.virt,
      price: d.price, billing_cycle: d.cycle, currency: d.cur, expired_at: e ? new Date(e).toISOString() : null,
      tags: d.tags, weight: d.i, hidden: false, traffic_limit: d.limit * GB, traffic_limit_type: d.ltype,
      public_remark: d.remark || '', gpu_name: '', kernel_version: d.arch === 'arm64' ? '6.6.31' : '6.1.0-23-amd64', created_at: '2025-03-01T00:00:00Z'
    };
  }

  // ---- history records ----------------------------------------------------
  var RET_H = 30 * 24;
  function loadRecords(d, hours, type) {
    hours = Math.min(Math.max(1, hours), RET_H);
    var now = Date.now(), step = Math.max(60, Math.ceil(hours * 3600 / 500)) * 1000;
    var from = Math.max(now - hours * H, bootAt(d) - 6 * H, T0 - RET_H * H), recs = [];
    if (d.offline) now = T0 - 5 * H - 17 * 6e4;
    for (var t = Math.ceil(from / step) * step; t <= now; t += step) {
      var r = { client: d.uuid, time: new Date(t).toISOString() };
      r.net_total_up = counter(d, t, 1); r.net_total_down = counter(d, t, 0);
      r.net_in = netAt(d, t, 0); r.net_out = netAt(d, t, 1);
      if (type !== 'network') {
        r.cpu = cpuAt(d, t); r.gpu = 0;
        r.ram = d.mem * GB * ramAt(d, t); r.ram_total = d.mem * GB;
        r.swap = d.swap * GB * d.swapF; r.swap_total = d.swap * GB;
        r.load = loadAt(d, t);
        r.temp = 0;
        r.disk = d.disk * GB * (d.diskF + (t - T0) / D * 0.002); r.disk_total = d.disk * GB;
        r.connections = Math.round(d.tcp * (0.8 + 0.4 * smooth(d.seed + 4, t / 6e5))); r.connections_udp = Math.round(d.udp * (0.8 + 0.4 * smooth(d.seed + 5, t / 6e5)));
        r.process = d.procs;
      }
      recs.push(r);
    }
    return { records: recs, count: recs.length };
  }
  function pingValue(d, k, t) {
    var base = d.p[k]; if (!base) return null;
    var lossP = d.loss[k] / 1000 * (1 + 2.5 * peak(t));
    var bucket = Math.floor(t / 6e4);
    if (hash(d.seed * 7 + k, bucket) < lossP) return -1;
    var cn = k < 3, congestion = cn ? base * 0.35 * peak(t) * (d.group === '线路机' ? 0.4 : 1.4) : 0;
    var jitter = (smooth(d.seed * 3 + k, t / 9e5) - 0.5) * base * 0.12 + hash(d.seed * 5 + k, bucket) * base * 0.06;
    var spike = hash(d.seed * 11 + k, bucket) > 0.992 ? base * (0.8 + hash(k, bucket)) : 0;
    return Math.max(1, Math.round((base + congestion + jitter + spike) * 10) / 10);
  }
  function pingRecords(d, hours) {
    hours = Math.min(Math.max(1, hours), RET_H);
    var now = Date.now(), step = (hours <= 1 ? 60 : hours <= 8 ? 120 : hours <= 24 ? 300 : 900) * 1000, recs = [], tasks = [];
    if (d.offline) return { count: 0, records: [], tasks: [] };
    TASKS.forEach(function (tk, k) {
      if (!d.p[k]) return;
      var lost = 0, n = 0;
      for (var t = Math.ceil((now - hours * H) / step) * step; t <= now; t += step) {
        var v = pingValue(d, k, t); n++; if (v === -1) lost++;
        recs.push({ task_id: tk.id, time: new Date(t).toISOString(), value: v, client: d.uuid });
      }
      tasks.push({ id: tk.id, name: tk.name, interval: tk.interval, loss: n ? Math.round(lost / n * 1000) / 10 : 0 });
    });
    return { count: recs.length, records: recs, tasks: tasks };
  }

  // ---- theme settings (demo defaults + this visitor's saved changes) -------
  var resetDays = {};
  NODES.forEach(function (d) { if (d.reset) resetDays[d.uuid] = d.reset; });
  var DEMO_SETTINGS = {
    productLabel: 'DEMO', defaultAppearance: 'system', defaultLanguage: 'auto',
    groupSections: true, groupOrder: ['线路机', '落地机', '家宽'], showCardGroup: false,
    baseCurrency: 'CNY', expiryWarningDays: 30, showRemainingValue: true,
    cardProbeTaskIds: ['1', '2', '3'], probeCount: 3, latencyGoodMs: 150, latencyWarnMs: 250,
    trafficMode: 'agent', trafficResetDefault: 'expiry', trafficResetUtcOffset: 8, trafficResetDays: resetDays,
    showLossLines: true, lossMarkerStyle: 'line', lossLineOpacity: 75, ratingStyle: 'general'
  };
  function savedSettings() { try { var s = localStorage.getItem(SETTINGS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function currentSettings() { return savedSettings() || JSON.parse(JSON.stringify(DEMO_SETTINGS)); }

  // ---- fetch interception -------------------------------------------------
  function respond(body, status) {
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  function ok(data) { return { status: 'success', message: '', data: data }; }
  function byUuid(u) { for (var i = 0; i < NODES.length; i++) if (NODES[i].uuid === u) return NODES[i]; return null; }

  function handle(u, init) {
    var p = u.pathname.replace(/^.*?(\/api\/)/, '/api/'), q = u.searchParams, method = (init && init.method || 'GET').toUpperCase();
    if (p === '/api/public') return respond(ok({ sitename: 'Horizon', description: 'Horizon theme demo for Komari Monitor', private_site: false, theme: 'horizon', theme_settings: currentSettings(), record_preserve_time: RET_H }));
    if (p === '/api/me') return respond({ username: 'demo', logged_in: true });
    if (p === '/api/nodes') return respond(ok(NODES.map(node)));
    if (p === '/api/task/ping') return respond(ok(TASKS.map(function (t, k) {
      return { id: t.id, name: t.name, type: t.type, interval: t.interval, weight: k, clients: NODES.filter(function (d) { return d.p[k]; }).map(function (d) { return d.uuid; }) };
    })));
    if (p === '/api/records/load') { var d = byUuid(q.get('uuid')); return d ? respond(ok(loadRecords(d, Number(q.get('hours') || 1), q.get('load_type')))) : respond(ok({ records: [], count: 0 })); }
    if (p === '/api/records/ping') { var d2 = byUuid(q.get('uuid')); return d2 ? respond(ok(pingRecords(d2, Number(q.get('hours') || 1)))) : respond(ok({ records: [], count: 0, tasks: [] })); }
    if (p === '/api/admin/theme/settings' && method === 'POST') {
      try { var body = JSON.parse(init.body); localStorage.setItem(SETTINGS_KEY, JSON.stringify(body)); return respond(ok(null)); }
      catch (e) { return respond({ status: 'error', message: '演示站：设置保存在本机浏览器失败（' + e.message + '）' }, 400); }
    }
    return respond({ status: 'error', message: 'not available in the demo' }, 404);
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    try {
      var u = new URL(url, location.href);
      if (u.origin === location.origin && /\/api\//.test(u.pathname)) return handle(u, init);
    } catch (e) { /* fall through */ }
    return realFetch(input, init);
  };

  // ---- WebSocket /api/clients ---------------------------------------------
  var RealWS = window.WebSocket;
  function FakeWS(url) {
    var self = this;
    this.url = url; this.readyState = 0; this.protocol = ''; this.extensions = ''; this.binaryType = 'blob';
    setTimeout(function () { if (self.readyState !== 0) return; self.readyState = 1; if (self.onopen) self.onopen({ type: 'open' }); }, 120);
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  FakeWS.prototype.send = function (msg) {
    var self = this;
    if (this.readyState !== 1 || String(msg).indexOf('get') !== 0) return;
    setTimeout(function () {
      if (self.readyState !== 1 || !self.onmessage) return;
      var data = {}, online = [];
      NODES.forEach(function (d) { if (d.offline) return; online.push(d.uuid); data[d.uuid] = report(d); });
      self.onmessage({ type: 'message', data: JSON.stringify({ status: 'success', data: { online: online, data: data } }) });
    }, 30);
  };
  FakeWS.prototype.close = function () { var self = this; if (this.readyState === 3) return; this.readyState = 3; setTimeout(function () { if (self.onclose) self.onclose({ type: 'close', code: 1000 }); }, 0); };
  FakeWS.prototype.addEventListener = function (type, fn) { this['on' + type] = fn; };
  FakeWS.prototype.removeEventListener = function () {};
  window.WebSocket = function (url, protocols) {
    if (/\/api\/clients/.test(String(url))) return new FakeWS(url);
    return protocols ? new RealWS(url, protocols) : new RealWS(url);
  };
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { window.WebSocket[k] = i; });

  // ---- demo ribbon --------------------------------------------------------
  var REPO = 'https://github.com/Dowsion-dev/Komari-Theme-Horizon';
  function ribbon() {
    if (new URLSearchParams(location.search).get('view') === 'theme-manage') return;
    var css = document.createElement('style');
    css.textContent =
      '.hz-demo{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);' +
      'padding:7px 8px 7px 14px;border-radius:999px;font:500 12px/1.2 ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'color:#e4e4e7;background:rgba(24,24,27,.86);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 30px rgba(0,0,0,.25);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
      '.hz-demo b{color:#fff;font-weight:650;letter-spacing:.02em}.hz-demo .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.hz-demo a,.hz-demo button{flex:none;color:#18181b;background:#fff;border:0;border-radius:999px;padding:5px 10px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}' +
      '.hz-demo button{background:transparent;color:#a1a1aa;padding:5px 6px}.hz-demo button:hover{color:#fff}' +
      '@media (max-width:520px){.hz-demo .long{display:none}}';
    document.head.appendChild(css);
    var el = document.createElement('div'), lang = '';
    try { lang = localStorage.getItem('komari-horizon-lang') || ''; } catch (e) { /* ignore */ }
    var zh = lang ? lang === 'zh' : /^zh/i.test(navigator.language || '');
    el.className = 'hz-demo';
    el.innerHTML = '<span class="t"><b>' + (zh ? '演示站' : 'Demo') + '</b><span class="long">' + (zh ? ' · 数据为浏览器内模拟，设置只保存在本机' : ' · simulated data; settings stay in this browser') + '</span></span>' +
      (savedSettings() ? '<button type="button" data-reset>' + (zh ? '恢复默认' : 'Reset') + '</button>' : '') +
      '<a href="' + REPO + '" target="_blank" rel="noopener">GitHub</a><button type="button" data-close aria-label="' + (zh ? '关闭' : 'Close') + '">✕</button>';
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) el.remove();
      if (e.target.closest('[data-reset]')) { try { localStorage.removeItem(SETTINGS_KEY); } catch (x) { /* ignore */ } location.reload(); }
    });
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ribbon); else ribbon();
})();
