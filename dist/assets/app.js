/*!
 * Horizon — a Komari Monitor theme: a dense, console-style public dashboard for Komari Monitor.
 * Vanilla JS, no build step. Data comes from Komari's public API:
 *   GET  /api/public, /api/nodes, /api/me, /api/task/ping
 *   GET  /api/records/load?uuid&load_type=all&hours, /api/records/ping?uuid&hours
 *   WS   /api/clients  (send "get", receive {online, data})
 * Theme settings live in Komari's theme_settings and are edited on /?view=theme-manage (manage.js).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function icon(name, cls, extra) {
    var inner = (window.KICONS || {})[name] || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' + (cls || '') + '" aria-hidden="true"' + (extra || '') + '>' + inner + '</svg>';
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function pct(used, total) { return total > 0 ? clamp(used / total * 100, 0, 100) : 0; }
  function fmtPct(v) { return (Math.round(v * 10) / 10).toFixed(1) + '%'; }
  function trimZero(s) { return s.replace(/\.0$/, ''); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  var UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  function scaleBytes(b) {
    b = Math.max(0, num(b));
    var i = 0;
    while (b >= 1024 && i < UNITS.length - 1) { b /= 1024; i++; }
    return [b, UNITS[i]];
  }
  function bytesPrecise(b) { var r = scaleBytes(b); return trimZero(r[0].toFixed(r[1] === 'B' ? 0 : 1)) + ' ' + r[1]; }
  function bytesRound(b) {
    var r = scaleBytes(b);
    var v = r[0] < 10 && r[1] !== 'B' ? trimZero(r[0].toFixed(1)) : String(Math.round(r[0]));
    return v + ' ' + r[1];
  }
  function bytesTotal(b) { var r = scaleBytes(b); return Math.round(r[0]) + ' ' + r[1]; }
  function speed(b) { return bytesRound(b) + '/s'; }
  function uptime(sec) {
    sec = num(sec);
    if (sec <= 0) return '—';
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock12(d, withSec) {
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return pad2(h) + ':' + pad2(d.getMinutes()) + (withSec ? ':' + pad2(d.getSeconds()) : '') + ' ' + ap;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function stamp(d) { return MON[d.getMonth()] + ' ' + pad2(d.getDate()) + ', ' + clock12(d, true); }

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { regionNames = null; }
  function regionCode(region) {
    if (!region) return '';
    var cps = Array.from(region).map(function (c) { return c.codePointAt(0); })
      .filter(function (cp) { return cp >= 0x1f1e6 && cp <= 0x1f1ff; });
    if (cps.length >= 2) return (String.fromCharCode(cps[0] - 0x1f1e6 + 65) + String.fromCharCode(cps[1] - 0x1f1e6 + 65)).toLowerCase();
    if (/^[a-z]{2}$/i.test(region.trim())) return region.trim().toLowerCase();
    return '';
  }
  function regionLabel(region) {
    var code = regionCode(region);
    if (code) {
      if (code === 'tw') return 'Taiwan';
      try { return (regionNames && regionNames.of(code.toUpperCase())) || code.toUpperCase(); } catch (e) { return code.toUpperCase(); }
    }
    return (region || '').trim();
  }
  function flagImg(region) {
    var code = regionCode(region);
    if (!code) return '';
    var name = esc(regionLabel(region));
    return '<img class="region-flag" alt="' + name + '" title="' + name + '" src="/flags/' + code + '.svg">';
  }

  var OS_RULES = [
    ['windows', /windows|win32|microsoft/i], ['macos', /darwin|mac ?os|osx/i], ['ubuntu', /ubuntu/i], ['debian', /debian/i],
    ['centos', /centos/i], ['almalinux', /alma/i], ['rockylinux', /rocky/i], ['fedora', /fedora/i], ['redhat', /red ?hat|rhel/i],
    ['archlinux', /arch/i], ['alpinelinux', /alpine/i], ['opensuse', /suse/i], ['freebsd', /freebsd/i], ['android', /android/i],
    ['openwrt', /openwrt|immortalwrt|lede/i], ['proxmox', /proxmox|pve/i], ['gentoo', /gentoo/i], ['nixos', /nixos/i],
    ['kalilinux', /kali/i], ['linuxmint', /mint/i], ['manjaro', /manjaro/i], ['deepin', /deepin/i], ['raspberrypi', /raspbian|raspberry/i]
  ];
  function osIcon(os, lg) {
    var key = 'linux';
    for (var i = 0; i < OS_RULES.length; i++) if (OS_RULES[i][1].test(os || '')) { key = OS_RULES[i][0]; break; }
    var o = (window.KOS || {})[key] || (window.KOS || {}).linux;
    if (!o) return '';
    return '<svg class="node-os-icon' + (lg ? ' lg' : '') + '" viewBox="0 0 24 24" role="img" aria-label="' + esc(os || key) + '"><title>' + esc(os || key) + '</title><path fill="' + (o.c || 'currentColor') + '" d="' + o.d + '"/></svg>';
  }

  var CURRENCY = { '$': 'USD', 'US$': 'USD', 'USD': 'USD', '€': 'EUR', 'EUR': 'EUR', '£': 'GBP', 'GBP': 'GBP', '¥': 'CNY', '￥': 'CNY', 'CNY': 'CNY', 'RMB': 'CNY', 'JPY': 'JPY', '円': 'JPY', 'HK$': 'HKD', 'HKD': 'HKD', '₩': 'KRW', 'KRW': 'KRW', 'C$': 'CAD', 'CAD': 'CAD', 'A$': 'AUD', 'AUD': 'AUD', 'S$': 'SGD', 'SGD': 'SGD', '₽': 'RUB', 'RUB': 'RUB', '₹': 'INR', 'INR': 'INR', 'NT$': 'TWD', 'TWD': 'TWD', 'CHF': 'CHF' };
  var SYMBOL = { USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: '¥', HKD: 'HK$', KRW: '₩', CAD: 'C$', AUD: 'A$', SGD: 'S$', RUB: '₽', INR: '₹', TWD: 'NT$', CHF: 'CHF ' };
  // value of one unit, in USD (fallback when the live-rate API is unreachable)
  var DEFAULT_RATES = { USD: 1, EUR: 1.08, GBP: 1.27, CNY: 0.14, JPY: 0.0067, HKD: 0.128, KRW: 0.00073, CAD: 0.73, AUD: 0.66, SGD: 0.74, RUB: 0.011, INR: 0.012, TWD: 0.031, CHF: 1.13 };
  function currencyCode(c) { c = (c || '$').trim(); return CURRENCY[c] || CURRENCY[c.toUpperCase()] || c.toUpperCase(); }
  function money(v, code) {
    var s = Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2);
    return (SYMBOL[code] || (code + ' ')) + s;
  }
  function cycleInfo(days) {
    days = num(days);
    if (days <= 0) return null;
    var table = [[7, 'Wk', 'Weekly'], [30, 'Mo', 'Monthly'], [31, 'Mo', 'Monthly'], [60, '2Mo', 'Bi-monthly'], [90, 'Qtr', 'Quarterly'], [92, 'Qtr', 'Quarterly'], [180, '6Mo', 'Semi-annual'], [182, '6Mo', 'Semi-annual'], [183, '6Mo', 'Semi-annual'], [365, 'Yr', 'Yearly'], [366, 'Yr', 'Yearly'], [730, '2Yr', '2-year'], [1095, '3Yr', '3-year'], [1825, '5Yr', '5-year']];
    for (var i = 0; i < table.length; i++) if (table[i][0] === days) return { short: table[i][1], long: table[i][2] };
    if (days % 365 === 0) return { short: (days / 365) + 'Yr', long: (days / 365) + '-year' };
    if (days % 30 === 0) return { short: (days / 30) + 'Mo', long: (days / 30) + '-month' };
    return { short: days + 'd', long: days + '-day' };
  }
  function parseTags(t) { return (t || '').split(';').map(function (s) { return s.replace(/<[^>]*>\s*$/, '').trim(); }).filter(Boolean); }
  function dateYMD(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // ---------------------------------------------------------------
  // theme settings (schema shared with manage.js)
  // ---------------------------------------------------------------
  var DEFAULTS = {
    // 01 appearance / branding
    defaultAppearance: 'system', productLabel: 'MONITOR', logoUrl: '', nodesTitle: 'Cluster Infrastructure Nodes', showFooter: true,
    // 02 views
    desktopView: 'standard', mobileView: 'standard', cardDensity: 'dense',
    // 03 background
    enableBackground: true, backgroundMediaType: 'image', backgroundImage: '', backgroundImageMobile: '', backgroundVideo: '', backgroundVideoDark: '',
    backgroundFit: 'cover', backgroundAlign: 'center', surfaceOpacity: 100, enableAmbientEffect: false, ambientEffect: 'sakura',
    // 04 home
    enableHeaderAutoHide: false, headerVisibleSeconds: 10, showHomeOverview: true, showGroupFilter: true, showRegionFilter: true,
    showCardGroup: true, groupSections: false, enableHomeSort: true, homeSortField: 'default', homeSortDirection: 'asc', groupOrder: [],
    hideAdminEntryWhenLoggedOut: false,
    showOverviewRatings: true, ratingStyle: 'general', showTrafficRating: true, showBandwidthRating: true, showAssetRating: true,
    trafficRatingLabels: '', bandwidthRatingLabels: '', assetRatingLabels: '',
    // 05 hidden
    hiddenNodes: [],
    // 06 card items
    showConnections: true, showSwap: true, compactShowTrafficTotal: true, compactShowBilling: true, compactShowUptime: true,
    // 07 traffic cycle
    trafficMode: 'agent', trafficResetDefault: 'expiry', trafficResetUtcOffset: 8, showResetCountdown: true,
    trafficResetDays: {}, trafficCalib: {}, trafficAutoCheckpoint: false, trafficCheckpointHours: 12,
    // 08 cost
    showCostsToGuests: true, showRemainingValue: true, baseCurrency: 'USD', costRateApiUrl: 'https://api.frankfurter.dev/v2/rates?base=USD',
    costIgnoredNodes: [], expiryWarningDays: 30,
    // 08 latency
    showProbes: true, probeCount: 3, cardProbeTaskIds: [], cardProbeNodeTaskIds: {}, latencyGoodMs: 150, latencyWarnMs: 400,
    showLossLines: true, lossMarkerStyle: 'line', lossLineOpacity: 75, connectGapsDefault: false,
    // 09 advanced
    refreshIntervalMs: 2000
  };
  var LEGACY = { product_label: 'productLabel', logo_url: 'logoUrl', nodes_title: 'nodesTitle', show_footer: 'showFooter', card_density: 'cardDensity', group_sections: 'groupSections',
    show_group_in_title: 'showCardGroup', show_country_filter: 'showRegionFilter', show_group_filter: 'showGroupFilter', show_probes: 'showProbes', probe_count: 'probeCount',
    card_probe_tasks: 'cardProbeTaskIds', latency_good_ms: 'latencyGoodMs', latency_warn_ms: 'latencyWarnMs', show_remaining_value: 'showRemainingValue', base_currency: 'baseCurrency',
    expiry_warning_days: 'expiryWarningDays', refresh_interval_ms: 'refreshIntervalMs' };
  var RATING_PRESETS = {
    general: { traffic: 'Light,Regular,Heavy,Massive', bandwidth: 'Idle,Light,Active,Burst', asset: 'Starter,Standard,Premium,Whale' },
    cultivation: { traffic: '初行,入道,御风,破空', bandwidth: '凝息,运转,疾行,瞬身', asset: '练气,筑基,结丹,元婴' }
  };
  var SORT_FIELDS = [['default', 'Default'], ['name', 'Name'], ['region', 'Region'], ['cpu', 'CPU'], ['memory', 'Memory'], ['disk', 'Storage'], ['netRate', 'Net Rate'], ['traffic', 'Traffic'], ['uptime', 'Uptime'], ['price', 'Price'], ['expiry', 'Expiry']];
  var SORT_NATURAL = { default: 'asc', name: 'asc', region: 'asc', expiry: 'asc' };

  function toList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean);
    if (typeof v === 'string') {
      var s = v.trim();
      if (s.charAt(0) === '[') { try { return toList(JSON.parse(s)); } catch (e) { /* fallthrough */ } }
      return s.split(/[\n,，]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return [];
  }
  function toObj(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) { try { var o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    return {};
  }
  function normalizeSettings(raw) {
    raw = raw || {};
    var src = {};
    Object.keys(raw).forEach(function (k) { src[LEGACY[k] || k] = raw[k]; });
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var d = DEFAULTS[k], v = src[k];
      if (v === undefined || v === null || (v === '' && typeof d !== 'string')) { out[k] = Array.isArray(d) ? d.slice() : (d && typeof d === 'object') ? {} : d; return; }
      if (typeof d === 'boolean') out[k] = v === true || v === 'true' || v === 1 || v === '1';
      else if (typeof d === 'number') { var n = Number(v); out[k] = isFinite(n) ? n : d; }
      else if (Array.isArray(d)) out[k] = toList(v);
      else if (d && typeof d === 'object') out[k] = toObj(v);
      else out[k] = String(v);
    });
    out.surfaceOpacity = clamp(Math.round(out.surfaceOpacity), 0, 100);
    out.headerVisibleSeconds = clamp(Math.round(out.headerVisibleSeconds), 1, 3600);
    out.probeCount = clamp(Math.round(out.probeCount) || 3, 1, 6);
    out.lossLineOpacity = clamp(Math.round(out.lossLineOpacity), 10, 100);
    out.refreshIntervalMs = clamp(out.refreshIntervalMs || 2000, 1000, 60000);
    out.trafficResetUtcOffset = clamp(out.trafficResetUtcOffset, -12, 14);
    out.trafficCheckpointHours = clamp(Math.round(out.trafficCheckpointHours) || 12, 1, 168);
    if (!/^(agent|theme)$/.test(out.trafficMode)) out.trafficMode = 'agent';
    if (!/^(asc|desc)$/.test(out.homeSortDirection)) out.homeSortDirection = SORT_NATURAL[out.homeSortField] || 'desc';
    return out;
  }
  function ratingLabels(kind, T) {
    var preset = (RATING_PRESETS[T.ratingStyle] || RATING_PRESETS.general)[kind].split(',');
    var custom = String(T[kind + 'RatingLabels'] || '').split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
    return preset.map(function (l, i) { return custom[i] || l; });
  }

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('unauthorized'); e.status = r.status; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function unwrap(j) { return j && typeof j === 'object' && 'data' in j && 'status' in j ? j.data : j; }
  var api = {
    settings: function () { return getJSON('/api/public').then(unwrap); },
    nodes: function () { return getJSON('/api/nodes').then(unwrap); },
    me: function () { return getJSON('/api/me').then(unwrap).catch(function () { return { logged_in: false }; }); },
    pingTasks: function () { return getJSON('/api/task/ping').then(unwrap).catch(function () { return []; }); },
    load: function (uuid, hours) { return getJSON('/api/records/load?uuid=' + encodeURIComponent(uuid) + '&load_type=all&hours=' + hours).then(unwrap); },
    ping: function (uuid, hours) { return getJSON('/api/records/ping?uuid=' + encodeURIComponent(uuid) + '&hours=' + hours).then(unwrap); },
    saveSettings: function (theme, data) {
      return fetch('/api/admin/theme/settings?theme=' + encodeURIComponent(theme), {
        method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || (j && j.status === 'error')) throw new Error((j && j.message) || ('HTTP ' + r.status));
          return j;
        });
      });
    }
  };

  // ---------------------------------------------------------------
  // state
  // ---------------------------------------------------------------
  var S = {
    settings: {}, raw: {}, T: normalizeSettings({}), me: { logged_in: false },
    allNodes: [], nodes: [], byId: {}, online: {}, live: {}, wsState: 'connecting',
    pingTasks: [], pings: {},
    filter: { country: '', group: '' },
    sort: { field: 'default', dir: 'asc' },
    view: 'standard',
    scheme: 'system',
    rates: DEFAULT_RATES, ratesLive: false,
    traffic: {}, trafficLoading: {},
    modal: null
  };
  var SCHEME_KEY = 'komari-horizon-scheme';
  function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }
  function canSeeCosts() { return S.me.logged_in || S.T.showCostsToGuests; }

  // ---------------------------------------------------------------
  // color scheme
  // ---------------------------------------------------------------
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() { return document.documentElement.classList.contains('dark'); }
  function applyScheme() {
    var dark = S.scheme === 'dark' || (S.scheme === 'system' && mql && mql.matches);
    document.documentElement.className = dark ? 'dark' : 'light';
    document.querySelectorAll('.color-scheme-toggle button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.scheme === S.scheme)); });
    applyBackground();
    if (S.modal) { renderModalCharts(); renderProbeChart(); }
  }
  if (mql && mql.addEventListener) mql.addEventListener('change', function () { if (S.scheme === 'system') applyScheme(); });

  // ---------------------------------------------------------------
  // background, opacity, ambient effects
  // ---------------------------------------------------------------
  function pickLD(v) {
    var p = String(v || '').split('|').map(function (s) { return s.trim(); });
    return (isDark() && p[1]) ? p[1] : p[0];
  }
  function safeUrl(u) { u = String(u || '').trim(); return /^(https?:\/\/|\/)/i.test(u) ? u : ''; }
  function applyBackground() {
    var app = $('.monitor-app'), layer = $('#bg-layer');
    if (!app || !layer) return;
    var T = S.T, img = '', video = '';
    if (T.enableBackground) {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var saveData = navigator.connection && navigator.connection.saveData;
      var wide = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
      if (T.backgroundMediaType === 'video' && wide && !reduce && !saveData) video = safeUrl(isDark() && T.backgroundVideoDark ? T.backgroundVideoDark : T.backgroundVideo);
      img = safeUrl(pickLD(isMobile() && T.backgroundImageMobile ? T.backgroundImageMobile : T.backgroundImage));
    }
    var has = !!(img || video);
    app.classList.toggle('has-bg', has);
    app.classList.toggle('has-veil', has && T.surfaceOpacity < 95);
    app.style.setProperty('--sop', has ? String(T.surfaceOpacity / 100) : '1');
    var pos = T.backgroundAlign === 'top' ? 'center top' : T.backgroundAlign === 'bottom' ? 'center bottom' : 'center center';
    var key = [img, video, T.backgroundFit, pos].join('|');
    if (layer.dataset.key === key) return;
    layer.dataset.key = key;
    if (video) {
      layer.style.backgroundImage = '';
      layer.innerHTML = '<video autoplay muted loop playsinline preload="metadata"' + (img ? ' poster="' + esc(img) + '"' : '') + ' style="object-fit:' + (T.backgroundFit === 'auto' ? 'none' : T.backgroundFit) + ';object-position:' + pos + '"><source src="' + esc(video) + '"></video>';
    } else if (img) {
      layer.innerHTML = '';
      layer.style.backgroundImage = 'url("' + img.replace(/"/g, '%22') + '")';
      layer.style.backgroundSize = T.backgroundFit;
      layer.style.backgroundPosition = pos;
    } else { layer.innerHTML = ''; layer.style.backgroundImage = ''; }
  }

  var ambient = { raf: 0, parts: [], w: 0, h: 0, t: 0, onResize: null };
  function startAmbient() {
    var T = S.T, cv = $('#ambient');
    cancelAnimationFrame(ambient.raf);
    if (ambient.onResize) window.removeEventListener('resize', ambient.onResize);
    if (!cv) return;
    if (!T.enableAmbientEffect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cv.hidden = true; return; }
    cv.hidden = false;
    var ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    ambient.onResize = function () { ambient.w = innerWidth; ambient.h = innerHeight; cv.width = ambient.w * dpr; cv.height = ambient.h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    ambient.onResize(); window.addEventListener('resize', ambient.onResize);
    var kind = T.ambientEffect, mobile = isMobile();
    var count = { sakura: 34, rain: 120, snow: 70, leaves: 24, confetti: 60, fireworks: 0 }[kind] || 30;
    if (mobile) count = Math.round(count / 2);
    var R = Math.random;
    var palette = { sakura: ['#f9a8d4', '#fbcfe8', '#f472b6'], leaves: ['#ea580c', '#d97706', '#b45309', '#ca8a04'], confetti: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] };
    function spawn(top) {
      var p = { x: R() * ambient.w, y: top ? -20 - R() * 60 : R() * ambient.h, r: 0, rot: R() * Math.PI * 2, vr: (R() - .5) * .04, sway: R() * Math.PI * 2 };
      if (kind === 'rain') { p.vy = 9 + R() * 6; p.vx = -1.5; p.len = 10 + R() * 14; }
      else if (kind === 'snow') { p.vy = .4 + R() * .9; p.vx = 0; p.r = 1 + R() * 2.4; }
      else if (kind === 'confetti') { p.vy = 1.2 + R() * 1.8; p.vx = 0; p.r = 3 + R() * 3; p.c = palette.confetti[(R() * 6) | 0]; p.vr = (R() - .5) * .2; }
      else { p.vy = .6 + R() * 1.1; p.vx = 0; p.r = (kind === 'leaves' ? 5 : 4) + R() * 4; p.c = (palette[kind] || palette.sakura)[(R() * 3) | 0]; }
      return p;
    }
    ambient.parts = [];
    for (var i = 0; i < count; i++) ambient.parts.push(spawn(false));
    var bursts = [];
    function frame() {
      ambient.raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      ambient.t++;
      ctx.clearRect(0, 0, ambient.w, ambient.h);
      if (kind === 'fireworks') {
        if (ambient.t % (mobile ? 70 : 45) === 1) {
          var cx = ambient.w * (.15 + R() * .7), cy = ambient.h * (.12 + R() * .35), hue = (R() * 360) | 0, n = mobile ? 28 : 48;
          for (var k = 0; k < n; k++) { var a = Math.PI * 2 * k / n, sp = 1.5 + R() * 2.2; bursts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 60 + R() * 30, max: 90, c: 'hsl(' + hue + ',90%,60%)' }); }
        }
        bursts = bursts.filter(function (b) { return b.life > 0; });
        bursts.forEach(function (b) {
          b.x += b.vx; b.y += b.vy; b.vy += .035; b.vx *= .985; b.life--;
          ctx.globalAlpha = Math.max(0, b.life / b.max); ctx.fillStyle = b.c;
          ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        return;
      }
      var dark = isDark();
      ambient.parts.forEach(function (p, idx) {
        p.sway += .02; p.rot += p.vr;
        p.x += p.vx + (kind === 'rain' ? 0 : Math.sin(p.sway) * .5);
        p.y += p.vy;
        if (p.y > ambient.h + 30 || p.x < -40 || p.x > ambient.w + 40) ambient.parts[idx] = spawn(true);
        if (kind === 'rain') {
          ctx.strokeStyle = dark ? 'rgba(148,163,184,.35)' : 'rgba(71,85,105,.25)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 2, p.y + p.len); ctx.stroke();
        } else if (kind === 'snow') {
          ctx.fillStyle = dark ? 'rgba(255,255,255,.8)' : 'rgba(148,163,184,.7)';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = .85; ctx.fillStyle = p.c;
          if (kind === 'confetti') ctx.fillRect(-p.r, -p.r / 2.4, p.r * 2, p.r / 1.2);
          else { ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * (kind === 'leaves' ? .45 : .62), 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
      });
    }
    frame();
  }

  // ---------------------------------------------------------------
  // layout shell
  // ---------------------------------------------------------------
  function shell() {
    var T = S.T;
    var site = S.settings.sitename || 'Komari';
    var logo = safeUrl(T.logoUrl);
    var showAdmin = S.me.logged_in || !T.hideAdminEntryWhenLoggedOut;
    $('#root').innerHTML =
      '<div class="monitor-app" data-layout="' + esc(T.cardDensity) + '">' +
        '<div class="bg-layer" id="bg-layer" aria-hidden="true"></div><div class="bg-veil" aria-hidden="true"></div>' +
        '<canvas class="ambient-layer" id="ambient" aria-hidden="true" hidden></canvas>' +
        '<header class="monitor-header" data-product="' + esc(T.productLabel) + '">' +
          '<div class="container header-inner">' +
            '<a class="brand" href="/">' +
              '<span class="brand-logo">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : icon('zap', '', ' style="fill:#fff"')) + '</span>' +
              '<span class="brand-name">' + esc(site) + '</span>' +
              (T.productLabel ? '<span class="brand-slash">/</span><span class="brand-product">' + esc(T.productLabel) + '</span>' : '') +
            '</a>' +
            '<div class="header-actions">' +
              '<div class="connection monitor-control is-connecting" role="status" id="conn"><span class="dot" aria-hidden="true"></span><span class="label">Connecting</span><span class="sep" aria-hidden="true">·</span><span class="clock" id="clock">' + clock12(new Date(), true) + '</span></div>' +
              '<div class="color-scheme-toggle" role="group" aria-label="Color scheme">' +
                ['light:sun:Light', 'dark:moon:Dark', 'system:monitor:System'].map(function (s) {
                  var p = s.split(':');
                  return '<button type="button" data-scheme="' + p[0] + '" aria-label="' + p[2] + '" title="' + p[2] + '" aria-pressed="' + (S.scheme === p[0]) + '">' + icon(p[1]) + '<span>' + p[2] + '</span></button>';
                }).join('') +
              '</div>' +
              (S.me.logged_in ? '<a href="/?view=theme-manage" class="icon-btn monitor-control monitor-hover" title="Theme settings" aria-label="Theme settings">' + icon('settings') + '</a>' : '') +
              (showAdmin ? '<a href="/admin" class="control-room" id="admin-link">' + (S.me.logged_in ? 'Control Room' : 'Admin Login') + icon('arrow-right') + '</a>' : '') +
            '</div>' +
          '</div>' +
        '</header>' +
        '<main class="monitor-page" id="page"></main>' +
        '<dialog class="gemini-modal node-details-modal monitor-surface-primary" id="modal" aria-labelledby="modal-title"></dialog>' +
      '</div>';
    var header = $('.monitor-header');
    var setH = function () { $('.monitor-app').style.setProperty('--monitor-header-height', header.offsetHeight + 'px'); };
    setH(); window.addEventListener('resize', setH);
    if (T.enableHeaderAutoHide && new URLSearchParams(location.search).get('view') !== 'theme-manage') setTimeout(function () { header.classList.add('is-hidden'); }, T.headerVisibleSeconds * 1000);
    applyBackground();
    startAmbient();
    window.addEventListener('resize', function () { applyBackground(); });
  }

  function dashboardMarkup() {
    var T = S.T;
    return (T.showHomeOverview ? '<section class="container stats-wrap"><div class="stats-grid" id="stats"></div></section>' : '<div style="height:8px"></div>') +
      '<div class="container toolbar-wrap"><div class="monitor-node-toolbar monitor-divider">' +
        '<div class="toolbar-title"><div class="icon">' + icon('server') + '</div><h2>' + esc(T.nodesTitle) + '</h2>' +
        '<div class="view-toggle monitor-control" role="group" aria-label="Card view">' +
          '<button type="button" data-view="standard" title="Standard cards" aria-label="Standard cards">' + icon('layout-grid') + '</button>' +
          '<button type="button" data-view="compact" title="Compact cards" aria-label="Compact cards">' + icon('rows-3') + '</button>' +
        '</div></div>' +
        '<div class="quick-filters" id="filters"></div>' +
      '</div></div>' +
      '<div class="container grid-wrap"><section class="node-grid" id="grid"></section></div>' +
      (T.showFooter ? '<footer class="footer">Powered by <a href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener">Komari Monitor</a></footer>' : '');
  }

  function bindEvents() {
    var root = $('#root');
    root.addEventListener('click', onClick);
    root.addEventListener('change', function (e) {
      if (e.target.id === 'sort-field') {
        S.sort.field = e.target.value; S.sort.dir = SORT_NATURAL[S.sort.field] || 'desc';
        lsSet('komari-horizon-sort', S.sort.field + ':' + S.sort.dir);
        renderFilters(); renderGrid();
      }
    });
    root.addEventListener('keydown', function (e) {
      var card = e.target.closest && e.target.closest('.node-monitor-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal(card.dataset.uuid); }
    });
    var dlg = $('#modal');
    dlg.addEventListener('close', function () { S.modal = null; dlg.innerHTML = ''; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  function onClick(e) {
    var t = e.target;
    if (t.closest('.manage-root')) return; // the settings page handles its own clicks
    var b = t.closest('[data-scheme]');
    if (b) { S.scheme = b.dataset.scheme; lsSet(SCHEME_KEY, S.scheme); applyScheme(); return; }
    var v = t.closest('[data-view]');
    if (v) { S.view = v.dataset.view; lsSet('komari-horizon-view-' + (isMobile() ? 'm' : 'd'), S.view); renderGrid(); return; }
    if (t.closest('#sort-dir')) {
      S.sort.dir = S.sort.dir === 'asc' ? 'desc' : 'asc';
      lsSet('komari-horizon-sort', S.sort.field + ':' + S.sort.dir);
      renderFilters(); renderGrid(); return;
    }
    var f = t.closest('[data-filter]');
    if (f) { var kind = f.dataset.filter, val = f.dataset.value; S.filter[kind] = S.filter[kind] === val ? '' : val; renderAll(); return; }
    if (t.closest('[data-close]')) { $('#modal').close(); return; }
    var mm = t.closest('[data-metric]');
    if (mm && S.modal) { S.modal.metric = mm.dataset.metric; S.modal.hover = null; renderModalCharts(); return; }
    var rr = t.closest('[data-range]');
    if (rr && S.modal) { setHistoryRange(Number(rr.dataset.range)); return; }
    var pr = t.closest('[data-prange]');
    if (pr && S.modal) { setProbeRange(Number(pr.dataset.prange)); return; }
    var pt = t.closest('[data-ptoggle]');
    if (pt && S.modal) { var key = pt.dataset.ptoggle; S.modal[key] = !S.modal[key]; renderProbeChart(); return; }
    var ps = t.closest('[data-series]');
    if (ps && S.modal) { var id = ps.dataset.series; S.modal.hiddenSeries[id] = !S.modal.hiddenSeries[id]; renderProbeChart(); return; }
    var card = t.closest('.node-monitor-card');
    if (card) openModal(card.dataset.uuid);
  }
  function syncViewToggle() {
    document.querySelectorAll('.view-toggle button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === S.view)); });
  }

  // ---------------------------------------------------------------
  // derived data
  // ---------------------------------------------------------------
  function matchesList(n, list) {
    if (!list || !list.length) return false;
    var name = String(n.name || '').toLowerCase(), id = String(n.uuid || '').toLowerCase();
    return list.some(function (x) { x = String(x).toLowerCase(); return x === name || x === id; });
  }
  function groupRank(g) { var i = S.T.groupOrder.indexOf(g); return i < 0 ? 1e6 : i; }
  function sortValue(n, field) {
    var r = rep(n.uuid) || {};
    switch (field) {
      case 'name': return String(n.name || '').toLowerCase();
      case 'region': return regionLabel(n.region).toLowerCase();
      case 'cpu': return num(r.cpu && r.cpu.usage);
      case 'memory': return pct(num(r.ram && r.ram.used), num(r.ram && r.ram.total) || num(n.mem_total));
      case 'disk': return pct(num(r.disk && r.disk.used), num(r.disk && r.disk.total) || num(n.disk_total));
      case 'netRate': return num(r.network && r.network.up) + num(r.network && r.network.down);
      case 'traffic': { var tt = trafficOf(n); return tt.up + tt.down; }
      case 'uptime': return num(r.uptime);
      case 'price': return billing(n).monthlyBase;
      case 'expiry': { var e = n.expired_at ? new Date(n.expired_at).getTime() : NaN; return isFinite(e) && e > 0 ? e : 9e15; }
      default: return num(n.weight);
    }
  }
  function visibleNodes() {
    var list = S.nodes.filter(function (n) {
      if (S.filter.country && regionCode(n.region) !== S.filter.country && (n.region || '') !== S.filter.country) return false;
      if (S.filter.group && (n.group || '') !== S.filter.group) return false;
      return true;
    });
    var field = S.T.enableHomeSort ? S.sort.field : S.T.homeSortField;
    var dir = (S.T.enableHomeSort ? S.sort.dir : S.T.homeSortDirection) === 'desc' ? -1 : 1;
    if (field === 'price' && !canSeeCosts()) field = 'default';
    var idx = {}; S.nodes.forEach(function (n, i) { idx[n.uuid] = i; });
    list.sort(function (a, b) {
      if (S.T.groupSections) {
        var g = groupRank(a.group || '') - groupRank(b.group || ''); if (g) return g;
        var gs = String(a.group || '').localeCompare(String(b.group || '')); if (gs) return gs;
      }
      if (field !== 'default') { var oa = isOnline(a.uuid) ? 0 : 1, ob = isOnline(b.uuid) ? 0 : 1; if (oa !== ob) return oa - ob; }
      var va = sortValue(a, field), vb = sortValue(b, field);
      var c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return c * dir || idx[a.uuid] - idx[b.uuid];
    });
    return list;
  }
  function rep(uuid) { return S.live[uuid] || null; }
  function isOnline(uuid) { return !!S.online[uuid]; }

  function toBase(amount, code) {
    var base = String(S.T.baseCurrency || 'USD').toUpperCase();
    var from = S.rates[code], to = S.rates[base];
    if (!from || !to) return null;
    return amount * from / to;
  }

  function billing(n) {
    var code = currencyCode(n.currency);
    var price = num(n.price);
    var exp = n.expired_at ? new Date(n.expired_at) : null;
    if (exp && (isNaN(exp.getTime()) || exp.getFullYear() < 2000)) exp = null;
    var daysLeft = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
    var lifetime = exp && exp.getFullYear() >= 2099;
    var cyc = cycleInfo(n.billing_cycle);
    var showCost = canSeeCosts();
    var status = 'none', text = '', title = '';
    if (showCost) {
      if (price === -1) { text = 'Free'; title = 'Free'; }
      else if (price > 0) { text = money(price, code) + (cyc ? '/' + cyc.short : ''); title = 'Billing Amount: ' + code + ' ' + price.toFixed(2) + (cyc ? ' · ' + cyc.long : ''); }
    }
    if (lifetime) { text = text ? text + ' · Lifetime' : 'Lifetime'; title = (title ? title + ' · ' : '') + 'Lifetime'; status = 'active'; }
    else if (exp) {
      if (daysLeft < 0) { status = 'expired'; text = (text ? text + ' · ' : '') + 'Expired ' + Math.abs(daysLeft) + 'd ago'; }
      else { status = daysLeft <= (S.T.expiryWarningDays || 30) ? 'upcoming' : 'active'; text = (text ? text + ' · ' : '') + daysLeft + 'd left'; }
      title = (title ? title + ' · ' : '') + 'Expires ' + dateYMD(exp) + ' · ' + (daysLeft < 0 ? Math.abs(daysLeft) + ' days ago' : daysLeft + ' days left');
    }
    var remaining = 0;
    if (price > 0 && exp && !lifetime && daysLeft > 0 && num(n.billing_cycle) > 0) remaining = price * Math.min(1, daysLeft / num(n.billing_cycle));
    var monthly = price > 0 && num(n.billing_cycle) > 0 ? price / num(n.billing_cycle) * 30 : 0;
    var mb = monthly ? toBase(monthly, code) : 0;
    return { text: text, title: title || text, status: status, remaining: remaining, code: code, monthlyBase: mb == null ? monthly : mb };
  }

  // ---------------------------------------------------------------
  // traffic cycles: reset day, calibration, cycle usage from Komari's counter history
  // ---------------------------------------------------------------
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function resetDayFor(n) {
    var T = S.T, custom = num((T.trafficResetDays || {})[n.uuid]);
    if (custom === -1) return 0;
    if (custom >= 1 && custom <= 31) return Math.round(custom);
    var def = String(T.trafficResetDefault || 'expiry');
    if (def === 'none') return 0;
    if (def === 'expiry') {
      var e = n.expired_at ? new Date(n.expired_at) : null;
      if (!e || isNaN(e.getTime()) || e.getFullYear() < 2000 || e.getFullYear() >= 2099) return 0;
      return new Date(e.getTime() + S.T.trafficResetUtcOffset * 3600e3).getUTCDate();
    }
    var d = Math.round(num(def));
    return d >= 1 && d <= 31 ? d : 0;
  }
  // cycle boundaries in the configured UTC offset (so every visitor sees the same cycle)
  function cycleBounds(day, now) {
    if (!day) return null;
    var shift = S.T.trafficResetUtcOffset * 3600e3, l = new Date(now + shift), y = l.getUTCFullYear(), m = l.getUTCMonth();
    var at = function (mm) { return Date.UTC(y, mm, Math.min(day, dim(y, mm))) - shift; };
    var thisStart = at(m), start, next;
    if (now >= thisStart) { start = thisStart; next = at(m + 1); } else { start = at(m - 1); next = thisStart; }
    return { start: start, next: next, day: day, daysLeft: Math.max(0, Math.ceil((next - now) / 86400e3)) };
  }
  function calibFor(n) {
    var c = (S.T.trafficCalib || {})[n.uuid];
    if (!c || !c.at) return null;
    var t = new Date(c.at).getTime();
    return isFinite(t) ? { t: t, up: num(c.up), down: num(c.down), cu: c.cu == null ? null : num(c.cu), cd: c.cd == null ? null : num(c.cd), auto: !!c.auto } : null;
  }
  function counterDelta(prev, cur) { return cur >= prev ? cur - prev : cur; }
  // decides how a node's cycle usage is computed
  function trafficPlan(n, now) {
    var cyc = cycleBounds(resetDayFor(n), now || Date.now()), c = calibFor(n);
    var calibValid = c && (!cyc || c.t >= cyc.start);
    var engine = calibValid || (S.T.trafficMode === 'theme' && !!cyc);
    var winStart = calibValid ? c.t : cyc ? cyc.start : null;
    return { cyc: cyc, calib: calibValid ? c : null, engine: engine, winStart: winStart, key: engine ? winStart + ':' + (calibValid ? c.up + ':' + c.down + ':' + c.cu + ':' + c.cd : 'cycle') : 'agent' };
  }
  function trafficOf(n) {
    var r = rep(n.uuid) || {}, net = r.network || {};
    var liveUp = num(net.totalUp), liveDown = num(net.totalDown);
    var plan = trafficPlan(n), st = S.traffic[n.uuid];
    var out = { up: liveUp, down: liveDown, approx: false, engine: plan.engine, cyc: plan.cyc, calib: plan.calib, pending: false, mode: plan.engine ? 'cycle' : 'agent' };
    if (!plan.engine) return out;
    if (!st || st.key !== plan.key) { out.pending = true; if (plan.calib) { out.up = plan.calib.up; out.down = plan.calib.down; } return out; }
    var hasLive = !!(r.network && (liveUp || liveDown));
    out.up = st.offUp + st.sumUp + (st.lastUp != null && hasLive ? counterDelta(st.lastUp, liveUp) : 0);
    out.down = st.offDown + st.sumDown + (st.lastDown != null && hasLive ? counterDelta(st.lastDown, liveDown) : 0);
    out.approx = st.approx;
    return out;
  }
  var BILL_LABEL = { max: ['MAX', 'Billed on the larger of in / out'], min: ['MIN', 'Billed on the smaller of in / out'], sum: ['SUM', 'Billed on in + out'], up: ['OUT', 'Billed on outbound only'], down: ['IN', 'Billed on inbound only'] };
  function trafficUsedBy(type, t) {
    var up = t.up, dn = t.down;
    if (!BILL_LABEL[type]) type = 'max';
    return type === 'sum' ? up + dn : type === 'min' ? Math.min(up, dn) : type === 'up' ? up : type === 'down' ? dn : Math.max(up, dn);
  }
  function trafficUsed(n, t) { return trafficUsedBy(String(n.traffic_limit_type || 'max').toLowerCase(), t); }
  function loadTrafficFor(n, force) {
    var now = Date.now(), plan = trafficPlan(n, now), st = S.traffic[n.uuid];
    if (!plan.engine) { delete S.traffic[n.uuid]; return Promise.resolve(); }
    if (!force && st && st.key === plan.key && now - st.at < 10 * 60e3) return Promise.resolve();
    if (S.trafficLoading[n.uuid]) return S.trafficLoading[n.uuid];
    var hours = Math.min(24 * 62, Math.max(1, Math.ceil((now - plan.winStart) / 3600e3) + 1));
    var p = getJSON('/api/records/load?uuid=' + encodeURIComponent(n.uuid) + '&load_type=network&hours=' + hours).then(unwrap).then(function (res) {
      var recs = (res && res.records || []).map(function (x) { return { t: new Date(x.time).getTime(), up: num(x.net_total_up), down: num(x.net_total_down) }; })
        .filter(function (x) { return x.t >= plan.winStart; }).sort(function (a, b) { return a.t - b.t; });
      var c = plan.calib, sumUp = 0, sumDown = 0, approx = false;
      var dts = []; for (var j = 1; j < recs.length; j++) dts.push(recs[j].t - recs[j - 1].t);
      dts.sort(function (a, b) { return a - b; });
      var tolerance = Math.max(30 * 60e3, 2 * (dts.length ? dts[Math.floor(dts.length / 2)] : 0));
      var lastUp = c && c.cu != null ? c.cu : null, lastDown = c && c.cd != null ? c.cd : null;
      recs.forEach(function (x, i) {
        if (lastUp == null) {
          // no counter snapshot at the window start: begin at the first sample; a late first sample means the retention is shorter than the cycle
          if (x.t - plan.winStart > tolerance) approx = true;
          lastUp = x.up; lastDown = x.down; return;
        }
        sumUp += counterDelta(lastUp, x.up); sumDown += counterDelta(lastDown, x.down);
        lastUp = x.up; lastDown = x.down;
      });
      if (!recs.length && lastUp == null) approx = true;
      S.traffic[n.uuid] = { key: plan.key, at: Date.now(), offUp: c ? c.up : 0, offDown: c ? c.down : 0, sumUp: sumUp, sumDown: sumDown, lastUp: lastUp, lastDown: lastDown, approx: approx, firstT: recs.length ? recs[0].t : null };
    }).catch(function () { /* keep previous */ }).then(function () { delete S.trafficLoading[n.uuid]; });
    S.trafficLoading[n.uuid] = p;
    return p;
  }
  function loadTraffic(force) {
    return Promise.all(S.allNodes.map(function (n) { return loadTrafficFor(n, force); })).then(function () { withAnchor(function () { renderStats(); renderGrid(); }); maybeCheckpoint(); });
  }
  // optional: logged-in admins periodically persist the running cycle usage as a calibration point,
  // so cycles survive a Komari record retention that is shorter than the billing cycle
  var checkpointDone = false;
  function maybeCheckpoint() {
    var T = S.T;
    if (checkpointDone || !S.me.logged_in || !T.trafficAutoCheckpoint || new URLSearchParams(location.search).get('view')) return;
    var now = Date.now(), changed = false, calib = JSON.parse(JSON.stringify(T.trafficCalib || {}));
    S.allNodes.forEach(function (n) {
      var plan = trafficPlan(n, now), st = S.traffic[n.uuid], r = rep(n.uuid);
      if (!plan.engine || !st || st.key !== plan.key || !r || !r.network || !isOnline(n.uuid)) return;
      if (plan.calib && now - plan.calib.t < T.trafficCheckpointHours * 3600e3) return;
      var t = trafficOf(n);
      if (t.pending) return;
      calib[n.uuid] = { at: new Date(now).toISOString(), up: Math.round(t.up), down: Math.round(t.down), cu: num(r.network.totalUp), cd: num(r.network.totalDown), auto: true };
      changed = true;
    });
    checkpointDone = true;
    if (!changed) return;
    var payload = {}; Object.keys(S.raw || {}).forEach(function (k) { payload[k] = S.raw[k]; });
    payload.trafficCalib = calib;
    api.saveSettings(S.settings.theme || 'horizon', payload).then(function () { S.raw = payload; S.T.trafficCalib = calib; }).catch(function () { /* silent */ });
  }

  // ---------------------------------------------------------------
  // top stats
  // ---------------------------------------------------------------
  function ratingTag(kind, value, thresholds) {
    var T = S.T;
    if (!T.showOverviewRatings || !T['show' + kind.charAt(0).toUpperCase() + kind.slice(1) + 'Rating']) return '';
    var lvl = value <= thresholds[0] ? 0 : value <= thresholds[1] ? 1 : value <= thresholds[2] ? 2 : 3;
    return '<span class="rating-tag lvl-' + lvl + '">' + esc(ratingLabels(kind, T)[lvl]) + '</span>';
  }
  function renderStats() {
    var box = $('#stats'); if (!box) return;
    var T = S.T;
    var nodes = visibleNodes();
    var total = nodes.length, online = 0, cores = 0, cpuSum = 0, cpuN = 0;
    var memU = 0, memT = 0, diskU = 0, diskT = 0, rx = 0, tx = 0, tin = 0, tout = 0;
    var base = String(T.baseCurrency || 'USD').toUpperCase(), value = 0;
    nodes.forEach(function (n) {
      var r = rep(n.uuid), on = isOnline(n.uuid);
      if (on) online++;
      if (r && on) {
        cores += num(r.cpu && r.cpu.cores) || num(n.cpu_cores);
        cpuSum += num(r.cpu && r.cpu.usage); cpuN++;
        memU += num(r.ram && r.ram.used); memT += num(r.ram && r.ram.total) || num(n.mem_total);
        diskU += num(r.disk && r.disk.used); diskT += num(r.disk && r.disk.total) || num(n.disk_total);
        rx += num(r.network && r.network.down); tx += num(r.network && r.network.up);
      } else { cores += num(n.cpu_cores); memT += num(n.mem_total); diskT += num(n.disk_total); }
      if (r) { var tr = trafficOf(n); tin += tr.down; tout += tr.up; }
      if (!matchesList(n, T.costIgnoredNodes)) {
        var b = billing(n);
        if (b.remaining > 0) { var cv = toBase(b.remaining, b.code); value += cv == null ? 0 : cv; }
      }
    });
    var cpuAvg = cpuN ? cpuSum / cpuN : 0;
    var health = total ? online / total * 100 : 0;
    var healthCls = health >= 100 ? '' : health >= 50 ? ' warn' : ' bad';
    var healthTxt = health >= 100 ? '100% Nominal' : Math.round(health) + '% ' + (health >= 50 ? 'Degraded' : 'Critical');
    var GB = 1024 * 1024 * 1024, MBPS = 125000;
    // asset thresholds are defined in CNY (as in LuminaPlus) and converted to the display currency
    var cny = function (v) { return S.rates.CNY && S.rates[base] ? v * S.rates.CNY / S.rates[base] : v / 7; };

    var panels = [];
    panels.push(panel('Cluster Status', '<span class="dot" style="background:' + (online === total && total ? 'var(--emerald-500)' : online ? 'var(--amber-500)' : 'var(--red-500)') + '"></span>',
      '<div class="stat-main"><span class="stat-value">' + online + '</span><span class="stat-unit xs">/ ' + total + ' Online</span></div>' +
      '<div class="stat-foot' + healthCls + '">' + icon(health >= 100 ? 'shield-check' : 'triangle-alert') + '<span>' + healthTxt + '</span></div>'));
    panels.push(panel('Compute Load', '<span class="meta">' + cores + ' vCPUs</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(cpuAvg) + '</span><span class="stat-unit">Avg</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-blue" style="width:' + cpuAvg + '%"></div></div>'));
    panels.push(panel('Memory', '<span class="meta">' + bytesTotal(memT) + '</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(pct(memU, memT)) + '</span><span class="stat-unit">Allocated</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-emerald" style="width:' + pct(memU, memT) + '%"></div></div>'));
    panels.push(panel('Storage', '<span class="meta">' + bytesTotal(diskT) + '</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(pct(diskU, diskT)) + '</span><span class="stat-unit">Filled</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-amber" style="width:' + pct(diskU, diskT) + '%"></div></div>'));
    panels.push(panel('Throughput', '<span class="dot" style="background:var(--blue-500)"></span>',
      '<div class="transfer-grid"><span class="k rx">' + icon('arrow-down') + ' RX</span><span class="v">' + speed(rx) + '</span>' +
      '<span class="k tx">' + icon('arrow-up') + ' TX</span><span class="v">' + speed(tx) + '</span></div>' +
      ratingTag('bandwidth', rx + tx, [1 * MBPS, 10 * MBPS, 100 * MBPS])));
    panels.push(panel('Cycle Traffic', '<span class="meta">Total</span>',
      '<div class="transfer-grid"><span class="k">Total In</span><span class="v">' + bytesPrecise(tin) + '</span>' +
      '<span class="k">Total Out</span><span class="v">' + bytesPrecise(tout) + '</span></div>' +
      ratingTag('traffic', tin + tout, [500 * GB, 2000 * GB, 10000 * GB])));
    if (T.showRemainingValue && canSeeCosts()) {
      panels.push('<div class="public-stat-panel remaining-value-card monitor-surface-primary"><div class="remaining-label">Remaining Value</div>' +
        '<div class="stat-value" style="margin-top:8px">' + (SYMBOL[base] || '') + value.toFixed(2) + '</div>' +
        '<span class="remaining-cur" role="status" title="Estimated remaining service value in ' + esc(base) + (S.ratesLive ? ' (live rates)' : ' (approximate rates)') + '.">' + esc(base) + '</span>' +
        ratingTag('asset', value, [cny(500), cny(1500), cny(3000)]) + '</div>');
    }
    setHTML(box, panels.join(''));
  }
  function panel(title, meta, body) {
    return '<div class="public-stat-panel monitor-surface-primary monitor-hover"><div class="stat-heading"><span class="title">' + esc(title) + '</span>' + meta + '</div>' + body + '</div>';
  }

  // ---------------------------------------------------------------
  // filters + sort
  // ---------------------------------------------------------------
  function renderFilters() {
    var box = $('#filters'); if (!box) return;
    var T = S.T, countries = {}, groups = {};
    S.nodes.forEach(function (n) {
      var c = regionCode(n.region) || (n.region || '').trim();
      if (c) { countries[c] = countries[c] || { n: 0, region: n.region }; countries[c].n++; }
      var g = (n.group || '').trim();
      if (g) groups[g] = (groups[g] || 0) + 1;
    });
    var html = '';
    var ck = Object.keys(countries).sort();
    if (ck.length > 1 && T.showRegionFilter) {
      html += '<div class="filter-group" role="group" aria-label="Country filters">' + ck.map(function (c) {
        var label = regionLabel(countries[c].region);
        var inner = regionCode(countries[c].region) ? flagImg(countries[c].region) : esc(c);
        return '<button type="button" class="filter-btn" data-filter="country" data-value="' + esc(c) + '" aria-pressed="' + (S.filter.country === c) + '" aria-label="Filter by ' + esc(label) + '" title="' + esc(label) + ' · ' + countries[c].n + ' node' + (countries[c].n > 1 ? 's' : '') + '"><span aria-hidden="true">' + inner + '</span></button>';
      }).join('') + '</div>';
    }
    var gk = Object.keys(groups).sort(function (a, b) { return groupRank(a) - groupRank(b) || groups[b] - groups[a] || a.localeCompare(b); });
    if (gk.length > 0 && T.showGroupFilter) {
      html += '<div class="filter-group" role="group" aria-label="Group filters">' + gk.map(function (g) {
        return '<button type="button" class="filter-btn" data-filter="group" data-value="' + esc(g) + '" aria-pressed="' + (S.filter.group === g) + '" aria-label="Filter by group ' + esc(g) + '" title="' + esc(g) + ' · ' + groups[g] + ' node' + (groups[g] > 1 ? 's' : '') + '"><span>' + esc(g) + '</span></button>';
      }).join('') + '</div>';
    }
    if (T.enableHomeSort) {
      var fields = SORT_FIELDS.filter(function (f) { return f[0] !== 'price' || canSeeCosts(); });
      html += '<div class="filter-group sort-group"><label class="sort-select filter-btn" title="Sort nodes">' + icon('arrow-up-down') +
        '<select id="sort-field" aria-label="Sort by">' + fields.map(function (f) { return '<option value="' + f[0] + '"' + (S.sort.field === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="filter-btn" id="sort-dir" aria-label="Sort direction" title="' + (S.sort.dir === 'asc' ? 'Ascending' : 'Descending') + '">' + icon(S.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') + '</button></div>';
    }
    setHTML(box, html);
  }

  // ---------------------------------------------------------------
  // node cards
  // ---------------------------------------------------------------
  function latClass(v) {
    if (v == null) return 'lat-none';
    if (v < 0) return 'lat-bad';
    var good = S.T.latencyGoodMs || 150, warn = S.T.latencyWarnMs || 400;
    return v < good ? 'lat-good' : v < warn ? 'lat-mid' : 'lat-bad';
  }
  function barClass(v) { var c = latClass(v); return c === 'lat-good' ? 'ok' : c === 'lat-mid' ? 'mid' : c === 'lat-bad' ? 'bad' : ''; }
  function tasksFor(uuid) {
    return S.pingTasks.filter(function (t) { return (t.clients || []).indexOf(uuid) >= 0; })
      .sort(function (a, b) { return num(a.weight) - num(b.weight) || num(a.id) - num(b.id); });
  }
  function cardTasksFor(uuid) {
    var T = S.T, assigned = tasksFor(uuid), byId = {};
    assigned.forEach(function (t) { byId[String(t.id)] = t; });
    var override = toList((T.cardProbeNodeTaskIds || {})[uuid]);
    var pick = override.length ? override : T.cardProbeTaskIds;
    var list = pick.length ? pick.map(function (id) { return byId[String(id)]; }).filter(Boolean) : assigned;
    return list.slice(0, T.probeCount);
  }

  function probeSummary(n) {
    if (!S.T.showProbes) return '';
    var list = cardTasksFor(n.uuid), data = S.pings[n.uuid] || {};
    if (!list.length) return '';
    return '<section class="probe-summary" aria-label="Network probes"><div class="probe-grid" style="grid-template-columns:repeat(' + Math.max(3, list.length) + ',minmax(0,1fr))">' + list.map(function (t) {
      var recs = (data[t.id] || []).slice(-10);
      var last = recs.length ? recs[recs.length - 1].v : null;
      var fails = recs.filter(function (r) { return r.v < 0; }).length;
      var bars = '';
      for (var i = 0; i < 10; i++) {
        var r = recs[i - (10 - recs.length)];
        bars += r ? '<span class="' + barClass(r.v) + '" title="' + (r.v < 0 ? 'Packet loss' : r.v + ' ms') + '"></span>' : '<span></span>';
      }
      return '<div class="probe-card monitor-surface-secondary">' +
        '<div class="probe-top"><span class="probe-name">' + esc(t.name) + '</span><span class="probe-type">' + esc(t.type || 'icmp') + '</span></div>' +
        '<div class="probe-stats"><div><span class="k">Latency</span><span class="lat ' + latClass(last) + '">' + (last == null ? '—' : last < 0 ? 'Loss' : last + ' ms') + '</span></div>' +
        '<div><span class="k">Failures</span><span class="fail">' + fails + ' / ' + recs.length + '</span></div></div>' +
        '<div class="probe-bars monitor-divider" aria-label="Last ' + recs.length + ' checks: ' + fails + ' failed">' + bars + '</div>' +
      '</div>';
    }).join('') + '</div></section>';
  }

  function nodeView(n) {
    var r = rep(n.uuid) || {};
    return {
      r: r, on: isOnline(n.uuid),
      cpu: num(r.cpu && r.cpu.usage),
      memU: num(r.ram && r.ram.used), memT: num(r.ram && r.ram.total) || num(n.mem_total),
      diskU: num(r.disk && r.disk.used), diskT: num(r.disk && r.disk.total) || num(n.disk_total),
      swapU: num(r.swap && r.swap.used), swapT: num(r.swap && r.swap.total) || num(n.swap_total),
      net: r.network || {}, load: r.load || {}, conn: r.connections || {},
      cores: num(r.cpu && r.cpu.cores) || num(n.cpu_cores),
      group: S.T.showCardGroup ? (n.group || '').trim() : ''
    };
  }

  function footerHTML(n, opts) {
    var tags = opts && opts.noTags ? [] : parseTags(n.tags);
    var bill = opts && opts.noBilling ? { text: '' } : billing(n);
    if (!tags.length && !bill.text) return '';
    return '<div class="node-asset-footer monitor-divider">' +
      (tags.length ? '<div class="node-tags" aria-label="Tags">' + tags.map(function (t) { return '<span class="node-tag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (bill.text ? '<span class="node-asset-summary" data-expiry-status="' + bill.status + '" title="' + esc(bill.title) + '" aria-label="' + esc(bill.title) + '">' + esc(bill.text) + '</span>' : '') +
    '</div>';
  }

  function resList(n, V) {
    return '<div class="res-list">' +
      '<div><div class="res-row"><span class="res-label">' + icon('cpu', 'c-blue') + '<span class="model" title="' + esc(n.cpu_name) + '">' + esc(n.cpu_name || 'CPU') + '</span>' + (V.cores ? '<span class="cores">× ' + V.cores + '</span>' : '') + '</span>' +
        '<div class="res-values"><span class="pct">' + fmtPct(V.cpu) + '</span></div></div>' +
        '<div class="bar"><div class="g-blue" style="width:' + clamp(V.cpu, 0, 100) + '%"></div></div></div>' +
      '<div><div class="res-row"><span class="res-label">' + icon('layers', 'c-emerald') + ' Memory</span>' +
        '<div class="res-values"><span class="sub">' + bytesPrecise(V.memU) + ' / ' + bytesTotal(V.memT) + '</span><span class="pct">' + fmtPct(pct(V.memU, V.memT)) + '</span></div></div>' +
        '<div class="bar"><div class="g-emerald" style="width:' + pct(V.memU, V.memT) + '%"></div></div></div>' +
      '<div><div class="res-row"><span class="res-label">' + icon('hard-drive', 'c-amber') + ' Storage</span>' +
        '<div class="res-values"><span class="sub">' + bytesRound(V.diskU) + ' / ' + bytesTotal(V.diskT) + '</span><span class="pct">' + fmtPct(pct(V.diskU, V.diskT)) + '</span></div></div>' +
        '<div class="bar"><div class="g-amber" style="width:' + pct(V.diskU, V.diskT) + '%"></div></div></div>' +
    '</div>';
  }
  function mini(ic, cls, title, right, rows) {
    return '<div class="mini monitor-surface-secondary"><div class="mini-head"><span class="t">' + icon(ic, cls) + ' ' + esc(title) + '</span>' + right + '</div><div class="mini-rows">' + rows + '</div></div>';
  }
  function miniRow(k, v, cls) { return '<div class="mini-row' + (cls ? ' ' + cls : '') + '">' + k + '<span class="v">' + v + '</span></div>'; }

  function resetTitle(tr) {
    var parts = [];
    parts.push(tr.engine ? 'Traffic counted by the theme for the current cycle' : 'Traffic = Komari agent counter');
    if (tr.cyc) { var d = new Date(tr.cyc.next); parts.push('Next reset ' + dateYMD(d) + ' (day ' + tr.cyc.day + ', ' + (tr.cyc.daysLeft === 0 ? 'today' : 'in ' + tr.cyc.daysLeft + ' days') + ')'); }
    if (tr.calib) parts.push('Calibrated ' + new Date(tr.calib.t).toLocaleString() + (tr.calib.auto ? ' (auto checkpoint)' : ''));
    if (tr.approx) parts.push('Approximate: record history does not cover the whole cycle');
    return parts.join(' · ');
  }
  function cardHTML(n) {
    var T = S.T, V = nodeView(n), net = V.net, region = n.region || '';
    var tr = trafficOf(n), limit = num(n.traffic_limit), ax = tr.approx || tr.pending ? '≈ ' : '';
    var trafficTitle = 'Cycle I/O', quota = '';
    var billType = limit > 0 ? String(n.traffic_limit_type || 'max').toLowerCase() : 'sum';
    var usedBytes = trafficUsedBy(billType, tr);
    var trafficRight = '<span class="r used" title="' + esc(BILL_LABEL[billType][1] + ' · ' + resetTitle(tr)) + '"><em>' + BILL_LABEL[billType][0] + '</em>' + ax + bytesPrecise(usedBytes) + '</span>';
    if (limit > 0) {
      var usedPct = pct(usedBytes, limit), rawPct = usedBytes / limit * 100;
      var pctTxt = (rawPct >= 10 || rawPct === 0 ? Math.round(rawPct) : rawPct.toFixed(1)) + '% of ' + bytesTotal(limit);
      quota = '<div class="quota" title="' + esc(bytesPrecise(usedBytes) + ' / ' + bytesTotal(limit) + ' · ' + BILL_LABEL[billType][1]) + '">' +
        '<div class="bar"><div class="' + (rawPct >= 90 ? 'g-red' : rawPct >= 70 ? 'g-amber' : 'g-blue') + '" style="width:' + usedPct + '%"></div></div>' +
        '<span class="quota-pct' + (rawPct >= 90 ? ' hot' : rawPct >= 70 ? ' warm' : '') + '">' + pctTxt + '</span></div>';
    }
    var resetChip = T.showResetCountdown && tr.cyc ? '<span class="chip" title="' + esc(resetTitle(tr)) + '">' + icon('rotate-ccw') + (tr.cyc.daysLeft === 0 ? 'Today' : tr.cyc.daysLeft + 'd') + '</span>' : '';
    var h = '<div><div class="node-head monitor-divider"><div class="node-head-row"><div class="node-ident">' +
      '<div class="node-os monitor-chip">' + osIcon(n.os) + '</div>' +
      '<h3 class="node-title"><span class="node-status-dot" aria-hidden="true"></span><span class="node-name">' + esc(n.name) + '</span>' +
      (V.group ? '<span class="node-provider-sep" aria-hidden="true">·</span><span class="node-provider">' + esc(V.group) + '</span>' : '') +
      '</h3></div>' +
      '<span role="img" aria-label="' + (V.on ? 'No active alerts' : 'Node offline') + '" class="node-alert-status' + (V.on ? '' : ' warn') + '">' + icon(V.on ? 'bell' : 'wifi-off') + '</span></div>' +
      '<div class="node-meta" aria-label="Machine metadata">' +
        (region ? '<span class="chip">' + flagImg(region) + ' ' + esc(regionLabel(region)) + '</span>' : '') +
        (n.arch ? '<span class="chip">' + esc(n.arch) + '</span>' : '') +
        (n.virtualization ? '<span class="chip">' + esc(n.virtualization) + '</span>' : '') +
        '<span class="chip" aria-label="Uptime">' + icon(V.on ? 'clock' : 'cloud-off') + (V.on ? uptime(V.r.uptime) : 'Offline') + '</span>' + resetChip +
      '</div></div>';
    h += resList(n, V);
    var minis = [
      mini('activity', 'c-blue', 'Net Rate', '<span class="r">REALTIME</span>',
        miniRow('<span class="k rx">' + icon('arrow-down') + ' RX</span>', speed(net.down)) + miniRow('<span class="k tx">' + icon('arrow-up') + ' TX</span>', speed(net.up))),
      mini('network', 'c-indigo', trafficTitle, trafficRight,
        miniRow('<span class="k">Total In</span>', ax + bytesPrecise(tr.down)) + miniRow('<span class="k">Total Out</span>', ax + bytesPrecise(tr.up)) + quota)
    ];
    if (T.showSwap) minis.push(mini('hard-drive', 'c-amber', 'Swap', '<span class="r">' + (V.swapT > 0 ? fmtPct(pct(V.swapU, V.swapT)) : 'OFF') + '</span>',
      miniRow('<span class="k">Used</span>', V.swapT > 0 ? bytesPrecise(V.swapU) : '—') + miniRow('<span class="k">Total</span>', V.swapT > 0 ? bytesTotal(V.swapT) : 'Disabled')));
    minis.push(mini('boxes', 'c-purple', 'Workload', '<span class="pill">' + num(V.r.process) + ' Procs</span>',
      miniRow('<span class="k" title="Load average 1m · 5m · 15m">Load</span>', [V.load.load1, V.load.load5, V.load.load15].map(function (x) { return '<b>' + num(x).toFixed(2) + '</b>'; }).join('<i class="sep">·</i>'), 'wl') +
      (T.showConnections ? miniRow('<span class="k">Sockets</span>', '<b>' + num(V.conn.tcp) + '<small>TCP</small></b><i class="sep">·</i><b>' + num(V.conn.udp) + '<small>UDP</small></b>', 'wl') : miniRow('<span class="k">Uptime</span>', V.on ? uptime(V.r.uptime) : '—'))));
    h += '<div class="mini-grid">' + minis.join('') + '</div>';
    h += probeSummary(n) + '</div>';
    return h + footerHTML(n);
  }

  function compactHTML(n) {
    var T = S.T, V = nodeView(n), net = V.net;
    var meter = function (label, val, cls) {
      return '<div class="cm"><div class="cm-top"><span>' + label + '</span><b>' + fmtPct(val) + '</b></div><div class="bar"><div class="' + cls + '" style="width:' + clamp(val, 0, 100) + '%"></div></div></div>';
    };
    var h = '<div><div class="node-head-row"><div class="node-ident">' +
      '<div class="node-os monitor-chip">' + osIcon(n.os) + '</div>' +
      '<h3 class="node-title"><span class="node-status-dot" aria-hidden="true"></span>' + (n.region ? flagImg(n.region) + ' ' : '') + '<span class="node-name">' + esc(n.name) + '</span>' +
      (V.group ? '<span class="node-provider-sep" aria-hidden="true">·</span><span class="node-provider">' + esc(V.group) + '</span>' : '') + '</h3></div>' +
      (T.compactShowUptime ? '<span class="chip">' + icon(V.on ? 'clock' : 'cloud-off') + (V.on ? uptime(V.r.uptime) : 'Offline') + '</span>' : '') + '</div>' +
      '<div class="cm-grid">' + meter('CPU', V.cpu, 'g-blue') + meter('MEM', pct(V.memU, V.memT), 'g-emerald') + meter('DISK', pct(V.diskU, V.diskT), 'g-amber') + '</div>' +
      '<div class="cm-net"><span class="rx">' + icon('arrow-down') + speed(net.down) + '</span><span class="tx">' + icon('arrow-up') + speed(net.up) + '</span>' +
      (T.compactShowTrafficTotal ? (function () { var tr = trafficOf(n), lim = num(n.traffic_limit); var bt = lim > 0 ? String(n.traffic_limit_type || 'max').toLowerCase() : 'sum'; return '<span class="muted" title="' + esc(resetTitle(tr)) + '">' + (BILL_LABEL[bt] ? BILL_LABEL[bt][0] : 'MAX') + ' ' + (tr.approx || tr.pending ? '≈' : '') + bytesPrecise(trafficUsedBy(bt, tr)) + (lim > 0 ? ' / ' + bytesTotal(lim) + ' · ' + Math.round(pct(trafficUsedBy(bt, tr), lim)) + '%' : '') + (T.showResetCountdown && tr.cyc ? ' · ↻' + tr.cyc.daysLeft + 'd' : '') + '</span>'; })() : '') +
      (T.showConnections ? '<span class="muted">' + num(V.conn.tcp) + 'T · ' + num(V.conn.udp) + 'U</span>' : '') + '</div></div>';
    return h + footerHTML(n, { noTags: true, noBilling: !T.compactShowBilling });
  }

  var cardCache = {};
  function renderGrid() {
    var grid = $('#grid'); if (!grid) return;
    var nodes = visibleNodes();
    syncViewToggle();
    if (!nodes.length) {
      grid.dataset.order = '';
      setHTML(grid, '<div class="empty-state">' + (S.nodes.length ? 'No nodes match the current filters' : 'No nodes yet') + '</div>');
      cardCache = {};
      return;
    }
    var groupBy = S.T.groupSections;
    var order = S.view + '|' + nodes.map(function (n) { return n.uuid; }).join(',') + (groupBy ? '|g' : '');
    if (grid.dataset.order !== order) {
      grid.dataset.order = order; grid._h = null;
      cardCache = {};
      grid.classList.toggle('is-compact', S.view === 'compact');
      var html = '', lastGroup = null;
      nodes.forEach(function (n) {
        if (groupBy) {
          var g = (n.group || '').trim() || 'Ungrouped';
          if (g !== lastGroup) { html += '<div class="group-title">' + esc(g) + '</div>'; lastGroup = g; }
        }
        html += '<div role="button" tabindex="0" data-uuid="' + esc(n.uuid) + '" class="node-monitor-card monitor-surface-primary monitor-hover' + (S.view === 'compact' ? ' is-compact' : '') + '"></div>';
      });
      grid.innerHTML = html;
    }
    nodes.forEach(function (n) {
      var el = grid.querySelector('[data-uuid="' + CSS.escape(n.uuid) + '"]');
      if (!el) return;
      var on = isOnline(n.uuid);
      el.classList.toggle('is-offline', !on);
      el.setAttribute('aria-label', 'Inspect ' + n.name + ': ' + (on ? 'Online' : 'Offline'));
      var html = S.view === 'compact' ? compactHTML(n) : cardHTML(n);
      if (cardCache[n.uuid] !== html) { patchHTML(el, html); cardCache[n.uuid] = html; }
    });
  }
  function setHTML(el, html) { if (el && el._h !== html) { patchHTML(el, html); el._h = html; } }

  // Minimal DOM patcher: updates text / attributes in place and only replaces nodes whose shape changed.
  // Keeping the existing nodes stops mobile Safari's scroll anchoring from drifting on every live refresh.
  var patchTpl = document.createElement('template');
  function patchHTML(el, html) {
    if (!el.firstChild) { el.innerHTML = html; return; }
    patchTpl.innerHTML = html;
    patchChildren(el, patchTpl.content);
  }
  function patchChildren(cur, next) {
    var a = cur.firstChild, b = next.firstChild;
    while (b) {
      var nb = b.nextSibling;
      if (!a) { cur.appendChild(b); b = nb; continue; }
      var na = a.nextSibling;
      if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { cur.replaceChild(b, a); }
      else if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; }
      else if (a.nodeType === 1) {
        patchAttrs(a, b);
        if (a.nodeName === 'svg' || a.namespaceURI === 'http://www.w3.org/2000/svg') { if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML; }
        else patchChildren(a, b);
      }
      a = na; b = nb;
    }
    while (a) { var rm = a; a = a.nextSibling; cur.removeChild(rm); }
  }
  function patchAttrs(a, b) {
    var i, at;
    for (i = a.attributes.length - 1; i >= 0; i--) { at = a.attributes[i].name; if (!b.hasAttribute(at)) a.removeAttribute(at); }
    for (i = 0; i < b.attributes.length; i++) { at = b.attributes[i]; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
  }

  // Manual scroll anchoring (browser anchoring is disabled in CSS): keep the first card that is
  // visible below the sticky header at the same screen position across a re-render.
  function withAnchor(fn) {
    var header = $('.monitor-header'), topLine = header ? header.getBoundingClientRect().bottom : 0, anchor = null, before = 0;
    if (window.scrollY > 0) {
      var cards = document.querySelectorAll('.node-monitor-card');
      for (var i = 0; i < cards.length; i++) { var r = cards[i].getBoundingClientRect(); if (r.bottom > topLine + 1) { anchor = cards[i]; before = r.top; break; } }
    }
    fn();
    if (anchor && anchor.isConnected) { var d = anchor.getBoundingClientRect().top - before; if (Math.abs(d) >= 1) window.scrollBy(0, d); }
  }
  function renderAll() { withAnchor(function () { renderStats(); renderFilters(); renderGrid(); }); if (S.modal) renderModalHead(); }

  // ---------------------------------------------------------------
  // live data
  // ---------------------------------------------------------------
  var ws = null, wsTimer = null, retry = 0;
  function setConn(state) {
    S.wsState = state;
    var el = $('#conn'); if (!el) return;
    el.classList.toggle('is-connecting', state === 'connecting');
    el.classList.toggle('is-offline', state === 'offline');
    $('.label', el).textContent = state === 'live' ? 'Live Stream' : state === 'offline' ? 'Reconnecting' : 'Connecting';
  }
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    try { ws = new WebSocket(proto + location.host + '/api/clients'); } catch (e) { scheduleReconnect(); return; }
    setConn('connecting');
    ws.onopen = function () {
      retry = 0; ws.send('get'); clearInterval(wsTimer);
      wsTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('get'); }, S.T.refreshIntervalMs);
    };
    ws.onmessage = function (ev) {
      var j; try { j = JSON.parse(ev.data); } catch (e) { return; }
      var d = j && j.data; if (!d) return;
      setConn('live');
      var online = {};
      (d.online || []).forEach(function (u) { online[u] = true; });
      S.online = online; S.live = d.data || {};
      renderAll();
    };
    ws.onclose = function () { clearInterval(wsTimer); setConn('offline'); scheduleReconnect(); };
    ws.onerror = function () { try { ws.close(); } catch (e) { /* noop */ } };
  }
  function scheduleReconnect() { retry++; setTimeout(connect, Math.min(15000, 1000 * Math.pow(1.6, retry))); }

  function loadPings() {
    if (!S.T.showProbes || !S.pingTasks.length) return Promise.resolve();
    var targets = S.nodes.filter(function (n) { return cardTasksFor(n.uuid).length; });
    return Promise.all(targets.map(function (n) {
      return api.ping(n.uuid, 1).then(function (res) {
        var by = {};
        (res && res.records || []).forEach(function (r) { (by[r.task_id] = by[r.task_id] || []).push({ t: new Date(r.time).getTime(), v: r.value }); });
        Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.t - b.t; }); });
        S.pings[n.uuid] = by;
      }).catch(function () { /* ignore */ });
    })).then(function () { withAnchor(renderGrid); });
  }

  // live exchange rates (frankfurter-style payloads: {rates:{EUR:0.92}} or [{quote,rate}]), cached 12h
  function loadRates() {
    var url = safeUrl(S.T.costRateApiUrl);
    if (!url || !canSeeCosts()) return Promise.resolve();
    var key = 'komari-horizon-rates:' + url;
    try {
      var c = JSON.parse(lsGet(key, 'null'));
      if (c && Date.now() - c.at < 12 * 3600e3) { applyRates(c.rates); return Promise.resolve(); }
    } catch (e) { /* ignore */ }
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('rates'); return r.json(); }).then(function (j) {
      var perUsd = { USD: 1 };
      if (Array.isArray(j)) j.forEach(function (it) { if (it && it.quote && num(it.rate) > 0) perUsd[String(it.quote).toUpperCase()] = num(it.rate); });
      else if (j && j.rates) Object.keys(j.rates).forEach(function (k) { if (num(j.rates[k]) > 0) perUsd[k.toUpperCase()] = num(j.rates[k]); });
      var usdValue = {};
      Object.keys(perUsd).forEach(function (k) { usdValue[k] = 1 / perUsd[k]; });
      usdValue.USD = 1;
      if (Object.keys(usdValue).length < 3) throw new Error('rates');
      lsSet(key, JSON.stringify({ at: Date.now(), rates: usdValue }));
      applyRates(usdValue);
    }).catch(function () { /* keep fallback */ });
  }
  function applyRates(r) {
    var merged = {}; Object.keys(DEFAULT_RATES).forEach(function (k) { merged[k] = DEFAULT_RATES[k]; });
    Object.keys(r || {}).forEach(function (k) { if (num(r[k]) > 0) merged[k] = num(r[k]); });
    S.rates = merged; S.ratesLive = true;
    withAnchor(function () { renderStats(); renderGrid(); });
  }

  // ---------------------------------------------------------------
  // modal
  // ---------------------------------------------------------------
  var RANGES = [[1, '1h'], [8, '8h'], [24, '24h'], [168, '7d']];
  function axisTime(t, hours) { var d = new Date(t); return hours > 24 ? MON[d.getMonth()] + ' ' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : clock12(d); }
  var METRICS = [['cpu', 'cpu'], ['memory', 'memory'], ['network', 'network'], ['load', 'load'], ['storage', 'Storage']];
  var SERIES_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626'];
  var SERIES_DASH = ['', '6 3', '2 3', '8 3 2 3', '1 2', '10 4', '4 4', '12 3 3 3'];

  function openModal(uuid) {
    var n = S.byId[uuid]; if (!n) return;
    S.modal = { uuid: uuid, metric: 'cpu', range: 1, prange: 1, records: null, probe: null, hover: null, phover: null, hiddenSeries: {}, loading: true,
      lossLines: S.T.showLossLines, connectGaps: S.T.connectGapsDefault };
    var dlg = $('#modal');
    dlg.innerHTML =
      '<div class="modal-in"><header class="modal-head monitor-surface-primary" id="modal-head"></header>' +
      '<div class="modal-body">' +
        '<section class="history monitor-surface-secondary" aria-busy="true" id="history"></section>' +
        '<section class="latency-probe-chart stack-3" id="probes" aria-labelledby="probe-h"></section>' +
        '<section class="stack-3"><div class="section-h"><h3>Incident &amp; Heartbeat Log</h3></div><div id="incident"></div></section>' +
      '</div></div>';
    renderModalHead(); renderModalCharts(); renderProbeChart(); renderIncident();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    setHistoryRange(1); setProbeRange(1);
  }

  function renderModalHead() {
    var m = S.modal; if (!m) return;
    var n = S.byId[m.uuid]; if (!n) return;
    var on = isOnline(m.uuid), parts = [];
    if (n.region) parts.push(flagImg(n.region) + ' ' + esc(regionLabel(n.region)));
    if (n.group && S.T.showCardGroup) parts.push(esc(n.group));
    if (n.arch) parts.push(esc(n.arch));
    setHTML($('#modal-head'),
      '<div class="modal-ident"><div class="modal-os monitor-chip">' + osIcon(n.os, true) + '</div><div style="min-width:0">' +
        '<div class="modal-title-row"><h2 id="modal-title">' + esc(n.name) + '</h2><span class="status-dot' + (on ? '' : ' off') + '" aria-label="' + (on ? 'Online' : 'Offline') + '"></span></div>' +
        '<p class="modal-sub">' + parts.join(' · ') + '</p>' +
      '</div></div>' +
      '<button type="button" data-close aria-label="Close node details" class="modal-close monitor-control monitor-hover">' + icon('x') + '</button>');
  }
  function renderIncident() {
    var n = S.byId[S.modal.uuid], html = '';
    if (n && n.public_remark) html += '<div class="remark monitor-surface-secondary" style="margin-bottom:12px">' + esc(n.public_remark) + '</div>';
    html += '<p class="log-empty monitor-surface-secondary">' + (isOnline(S.modal.uuid) ? 'No public alert events' : 'Node is currently offline — last report ' + lastSeen(S.modal.uuid)) + '</p>';
    setHTML($('#incident'), html);
  }
  function lastSeen(uuid) { var r = rep(uuid); if (!r || !r.updated_at) return 'unknown'; var d = new Date(r.updated_at); return isNaN(d) ? 'unknown' : d.toLocaleString(); }

  function setHistoryRange(h) {
    var m = S.modal; if (!m) return;
    m.range = h; m.loading = true; m.hover = null;
    renderModalCharts();
    var uuid = m.uuid;
    api.load(uuid, h).then(function (res) {
      if (!S.modal || S.modal.uuid !== uuid || S.modal.range !== h) return;
      var recs = (res && res.records || []).map(function (r) {
        return { t: new Date(r.time).getTime(), cpu: num(r.cpu), ram: num(r.ram), ramT: num(r.ram_total), disk: num(r.disk), diskT: num(r.disk_total), rx: num(r.net_in), tx: num(r.net_out), load: num(r.load) };
      }).sort(function (a, b) { return a.t - b.t; });
      S.modal.records = downsample(recs, 360); S.modal.loading = false; renderModalCharts();
    }).catch(function () { if (!S.modal) return; S.modal.records = []; S.modal.loading = false; renderModalCharts(); });
  }
  function downsample(arr, max) {
    if (arr.length <= max) return arr;
    var size = arr.length / max, out = [];
    for (var i = 0; i < max; i++) {
      var bucket = arr.slice(Math.floor(i * size), Math.floor((i + 1) * size));
      if (!bucket.length) continue;
      var o = { t: bucket[bucket.length - 1].t };
      Object.keys(bucket[0]).forEach(function (k) { if (k === 't') return; var sum = 0; bucket.forEach(function (b) { sum += b[k]; }); o[k] = sum / bucket.length; });
      out.push(o);
    }
    return out;
  }

  function metricDef(metric, recs) {
    var accent = '#3b82f6';
    var pctAxis = function (v) { return Math.round(v) + '%'; };
    if (metric === 'cpu') return { title: 'CPU', series: [{ id: 'cpu', color: accent, get: function (r) { return r.cpu; } }], min: 0, max: 100, fmt: fmtPct, axis: pctAxis };
    if (metric === 'memory') return { title: 'MEMORY', series: [{ id: 'memory', color: accent, get: function (r) { return pct(r.ram, r.ramT); } }], min: 0, max: 100, fmt: fmtPct, axis: pctAxis };
    if (metric === 'storage') return { title: 'STORAGE', series: [{ id: 'storage', color: '#f59e0b', get: function (r) { return pct(r.disk, r.diskT); } }], min: 0, max: 100, fmt: fmtPct, axis: pctAxis };
    if (metric === 'load') {
      var lm = 0; recs.forEach(function (r) { lm = Math.max(lm, r.load); });
      return { title: 'LOAD', legend: [['1m', '#3b82f6']], series: [{ id: 'load1', color: '#3b82f6', get: function (r) { return r.load; } }], min: 0, max: Math.max(lm * 1.15, 0.05), fmt: function (v) { return '1m ' + v.toFixed(2); }, axis: function (v) { return v.toFixed(2); } };
    }
    var nm = 0; recs.forEach(function (r) { nm = Math.max(nm, r.rx, r.tx); });
    var nmax = Math.max(nm * 1.1, 1024);
    return { title: 'NETWORK', mirrored: true, legend: [['RX', '#3b82f6'], ['TX', '#10b981']],
      series: [{ id: 'rx_rate', color: '#3b82f6', get: function (r) { return r.rx; } }, { id: 'tx_rate', color: '#10b981', get: function (r) { return -r.tx; } }],
      min: -nmax, max: nmax, fmt: null, axis: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + speed(Math.abs(v)); } };
  }

  function renderModalCharts() {
    var m = S.modal; if (!m) return;
    var box = $('#history'); if (!box) return;
    box.setAttribute('aria-busy', String(!!m.loading));
    var recs = m.records || [], def = metricDef(m.metric, recs);
    var top = '<div class="history-bar monitor-divider"><div class="seg" role="group" aria-label="Historical metric">' +
        METRICS.map(function (x) { return '<button type="button" data-metric="' + x[0] + '" aria-pressed="' + (m.metric === x[0]) + '">' + x[1] + '</button>'; }).join('') +
      '</div><div class="range" role="group" aria-label="History range">' +
        RANGES.map(function (h) { return '<button type="button" data-range="' + h[0] + '" aria-pressed="' + (m.range === h[0]) + '">' + h[1] + '</button>'; }).join('') +
      '</div></div>';
    var body = m.loading && !recs.length ? '<div class="chart-empty">Loading telemetry…</div>' : !recs.length ? '<div class="chart-empty">No history recorded for this range</div>' : null;
    var idx = m.hover == null ? recs.length - 1 : m.hover;
    var readout = recs.length ? readoutText(def, recs[idx], m.metric) : '—';
    box.innerHTML = top + '<div class="chart-block"><div class="chart-top"><span class="t">' + icon('zap') + esc(def.title) + ' Performance Horizon</span>' +
      '<output class="chart-readout" id="hist-out">' + esc(readout) + '</output></div>' +
      '<div class="history-chart-viewport monitor-surface-tertiary" id="hist-vp">' + (body || '') + '</div>' +
      '<div class="chart-foot"><span>' + (recs.length ? axisTime(recs[0].t, m.range) : '') + '</span><span>Interactive Telemetry · ' + (m.range > 1 ? 'Averaged buckets · ' : '') + 'Hover or use arrow keys</span><span>' + (recs.length ? axisTime(recs[recs.length - 1].t, m.range) : '') + '</span></div>' +
      (def.legend ? '<div class="chart-legend">' + def.legend.map(function (l) { return '<span style="color:' + l[1] + '">' + l[0] + '</span>'; }).join('') + '</div>' : '') + '</div>';
    if (!body) drawHistory(def, recs);
  }
  function readoutText(def, r, metric) {
    if (!r) return '—';
    var d = stamp(new Date(r.t));
    if (metric === 'network') return d + ': RX ' + speed(r.rx) + ' · TX ' + speed(r.tx);
    return d + ': ' + def.fmt(def.series[0].get(r));
  }

  function drawHistory(def, recs) {
    var vp = $('#hist-vp');
    var W = Math.max(320, Math.round(vp.clientWidth - 24)), H = 190, L = 44, R = W - 12, T = 16, B = 166, n = recs.length;
    var t0 = recs[0].t, t1 = recs[n - 1].t || t0 + 1;
    var xs = function (t) { return t1 === t0 ? (L + R) / 2 : L + (t - t0) / (t1 - t0) * (R - L); };
    var ys = function (v) { return B - (clamp(v, def.min, def.max) - def.min) / (def.max - def.min) * (B - T); };
    var gid = 'g' + Math.random().toString(36).slice(2, 7);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' + esc(def.title.toLowerCase()) + ' history chart. Use arrow keys to inspect samples." aria-describedby="hist-out" id="hist-svg"><defs>';
    def.series.forEach(function (se) {
      var neg = def.mirrored && se.id === 'tx_rate';
      s += '<linearGradient id="' + gid + se.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + se.color + '" stop-opacity="' + (neg ? 0 : 0.25) + '"/><stop offset="100%" stop-color="' + se.color + '" stop-opacity="' + (neg ? 0.25 : 0) + '"/></linearGradient>';
    });
    s += '</defs>';
    for (var i = 0; i <= 4; i++) {
      var v = def.max - (def.max - def.min) * i / 4, y = T + (B - T) * i / 4, zero = def.mirrored ? i === 2 : i === 4;
      s += '<g><line x1="' + L + '" x2="' + R + '" y1="' + y + '" y2="' + y + '" class="' + (zero ? 'svg-zero' : 'svg-grid') + '" stroke-width="' + (zero ? 1.5 : 1) + '"' + (zero ? '' : ' stroke-dasharray="3 3"') + '/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" class="svg-label">' + esc(def.axis(v)) + '</text></g>';
    }
    var base = def.mirrored ? ys(0) : B;
    def.series.forEach(function (se) {
      var line = '', pts = [];
      recs.forEach(function (r, k) { var x = xs(r.t), y2 = ys(se.get(r)); pts.push([x, y2]); line += (k ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y2.toFixed(2); });
      var area = line + ' L ' + pts[pts.length - 1][0].toFixed(2) + ' ' + base + ' L ' + pts[0][0].toFixed(2) + ' ' + base + ' Z';
      s += '<g data-history-series="' + se.id + '"><path d="' + area + '" fill="url(#' + gid + se.id + ')"/><path d="' + line + '" stroke="' + se.color + '" stroke-width="2" fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
      if (pts.length <= 120) pts.forEach(function (p) { s += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="2.5" fill="' + se.color + '" opacity="0.6"/>'; });
      s += '</g>';
    });
    s += '<g id="hist-cursor"></g></svg>';
    vp.innerHTML = s;
    var svg = $('#hist-svg');
    function setIdx(k) {
      S.modal.hover = k;
      var r = recs[k], x = xs(r.t);
      var c = '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + B + '" class="svg-cursor" stroke-dasharray="3 3"/>';
      def.series.forEach(function (se) { c += '<circle cx="' + x + '" cy="' + ys(se.get(r)) + '" r="3.5" fill="' + se.color + '" class="svg-dot-stroke" stroke-width="1.5"/>'; });
      $('#hist-cursor').innerHTML = c;
      $('#hist-out').textContent = readoutText(def, r, S.modal.metric);
    }
    function nearest(clientX) {
      var rect = svg.getBoundingClientRect(), x = (clientX - rect.left) / rect.width * W, best = 0, bd = Infinity;
      for (var k = 0; k < n; k++) { var d = Math.abs(xs(recs[k].t) - x); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    svg.addEventListener('pointermove', function (e) { setIdx(nearest(e.clientX)); });
    svg.addEventListener('pointerleave', function () { S.modal.hover = null; $('#hist-cursor').innerHTML = ''; $('#hist-out').textContent = readoutText(def, recs[n - 1], S.modal.metric); });
    svg.addEventListener('keydown', function (e) {
      var k = S.modal.hover == null ? n - 1 : S.modal.hover;
      if (e.key === 'ArrowLeft') k = Math.max(0, k - 1); else if (e.key === 'ArrowRight') k = Math.min(n - 1, k + 1);
      else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = n - 1; else return;
      e.preventDefault(); setIdx(k);
    });
    if (S.modal.hover != null && S.modal.hover < n) setIdx(S.modal.hover);
  }

  // ---- probes (with packet-loss dashed lines) ----
  function setProbeRange(h) {
    var m = S.modal; if (!m) return;
    m.prange = h; m.ploading = true; m.phover = null;
    renderProbeChart();
    var uuid = m.uuid;
    api.ping(uuid, h).then(function (res) {
      if (!S.modal || S.modal.uuid !== uuid || S.modal.prange !== h) return;
      var by = {}, loss = {};
      (res && res.records || []).forEach(function (r) {
        var t = new Date(r.time).getTime();
        (by[r.task_id] = by[r.task_id] || []).push({ t: t, v: r.value });
        // loss markers come from the raw samples, independent of the latency downsampling
        if (r.value < 0) (loss[r.task_id] = loss[r.task_id] || []).push(t);
      });
      Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.t - b.t; }); by[k] = downsampleProbe(by[k], h > 24 ? 600 : 400); });
      S.modal.probe = { by: by, loss: loss, tasks: (res && res.tasks) || [] };
      S.modal.ploading = false;
      renderProbeChart();
    }).catch(function () { if (S.modal) { S.modal.probe = { by: {}, loss: {}, tasks: [] }; S.modal.ploading = false; renderProbeChart(); } });
  }
  function downsampleProbe(arr, max) {
    if (arr.length <= max) return arr;
    var size = arr.length / max, out = [];
    for (var i = 0; i < max; i++) {
      var b = arr.slice(Math.floor(i * size), Math.floor((i + 1) * size));
      if (!b.length) continue;
      var ok = b.filter(function (x) { return x.v >= 0; });
      out.push({ t: b[b.length - 1].t, v: ok.length ? ok.reduce(function (s, x) { return s + x.v; }, 0) / ok.length : -1 });
    }
    return out;
  }
  function probeTaskList() {
    var m = S.modal, known = tasksFor(m.uuid).slice(), ids = {};
    known.forEach(function (t) { ids[t.id] = true; });
    var by = (m.probe && m.probe.by) || {};
    Object.keys(by).forEach(function (id) {
      if (!ids[id]) {
        var t = ((m.probe && m.probe.tasks) || []).filter(function (x) { return String(x.id) === String(id); })[0];
        known.push({ id: Number(id), name: t ? t.name : 'Task ' + id, type: t ? t.type : '' }); ids[id] = true;
      }
    });
    return known;
  }

  function renderProbeChart() {
    var m = S.modal; if (!m) return;
    var box = $('#probes'); if (!box) return;
    var tasks = probeTaskList(), by = (m.probe && m.probe.by) || {}, lossBy = (m.probe && m.probe.loss) || {};
    var html = '<div class="section-h"><h3 id="probe-h">Latency Probes</h3><div class="probe-tools" role="group" aria-label="Probe chart options">' +
      '<button type="button" class="obtn' + (m.lossLines ? ' sel' : '') + '" data-ptoggle="lossLines" aria-pressed="' + !!m.lossLines + '" title="Draw a dashed vertical line at every lost probe, coloured by task">Loss lines</button>' +
      '<button type="button" class="obtn' + (m.connectGaps ? ' sel' : '') + '" data-ptoggle="connectGaps" aria-pressed="' + !!m.connectGaps + '" title="Off: show breaks at outages / lost probes. On: bridge the gaps — loss lines are still drawn.">Connect gaps</button>' +
      '<span class="probe-tools-sep" aria-hidden="true"></span>' +
      RANGES.map(function (h) { return '<button type="button" class="obtn' + (m.prange === h[0] ? ' sel' : '') + '" data-prange="' + h[0] + '" aria-pressed="' + (m.prange === h[0]) + '">' + h[1] + '</button>'; }).join('') +
      '</div></div>';
    if (!tasks.length) { box.innerHTML = html + '<p class="log-empty monitor-surface-secondary">No latency probes assigned to this node</p>'; return; }
    html += '<div class="probe-panel monitor-surface-secondary"><div class="probe-series" role="group" aria-label="Probe series">' +
      tasks.map(function (t, i) {
        var hidden = !!m.hiddenSeries[t.id], lc = (lossBy[t.id] || []).length;
        return '<button type="button" class="obtn series" data-series="' + t.id + '" aria-label="' + esc(t.name) + ' series" aria-pressed="' + !hidden + '"><span class="n" style="color:' + SERIES_COLORS[i % SERIES_COLORS.length] + '">' + (i + 1) + '</span><span>' + esc(t.name) + '</span><span class="s">' + esc((t.type || 'icmp').toUpperCase()) + ' · ' + (t.interval ? t.interval + 's' : 'Auto') + (lc ? ' · <b class="loss-count">' + lc + ' loss</b>' : '') + '</span></button>';
      }).join('') + '</div>' +
      '<output class="probe-readout" id="probe-out"></output><div class="probe-chart-viewport" id="probe-vp"></div>' +
      '<div class="probe-foot"><span id="probe-start"></span><span>Raw checks · ' + (m.lossLines && S.T.lossMarkerStyle !== 'cross' ? '┆ Packet loss' : '× Packet loss') + ' · Hover or use arrow keys</span><span id="probe-end"></span></div></div>';
    box.innerHTML = html;

    var vp = $('#probe-vp');
    var series = tasks.map(function (t, i) { return { t: t, i: i, color: SERIES_COLORS[i % SERIES_COLORS.length], dash: SERIES_DASH[i % SERIES_DASH.length], data: by[t.id] || [], loss: lossBy[t.id] || [] }; })
      .filter(function (s) { return !m.hiddenSeries[s.t.id]; });
    var all = [];
    series.forEach(function (s) { s.data.forEach(function (p) { all.push(p); }); });
    if (m.ploading && !all.length) { vp.innerHTML = '<div class="chart-empty" style="height:192px">Loading probes…</div>'; return; }
    if (!all.length) { vp.innerHTML = '<div class="chart-empty" style="height:192px">No probe samples for this range</div>'; $('#probe-out').textContent = ''; return; }

    var t0 = Infinity, t1 = -Infinity, vmax = 0;
    all.forEach(function (p) { t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); if (p.v > vmax) vmax = p.v; });
    if (t1 === t0) t1 = t0 + 1;
    vmax = Math.max(1, Math.ceil(vmax));
    var W = Math.max(320, Math.round(vp.clientWidth)), H = 190, L = 52, R = W - 12, T = 16, B = 166;
    var xs = function (t) { return L + (t - t0) / (t1 - t0) * (R - L); };
    var ys = function (v) { return B - clamp(v, 0, vmax) / vmax * (B - T); };
    var style = S.T.lossMarkerStyle, showLines = m.lossLines && style !== 'cross', showCross = !m.lossLines || style !== 'line';
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="Latency probe history in milliseconds. Use left and right arrows, Home or End to inspect samples." aria-describedby="probe-out" id="probe-svg">';
    for (var i = 0; i <= 4; i++) {
      var y = B - (B - T) * i / 4;
      s += '<g><line x1="' + L + '" x2="' + R + '" y1="' + y + '" y2="' + y + '" class="svg-grid"' + (i ? ' stroke-dasharray="3 3"' : '') + '/><text x="' + (L - 8) + '" y="' + (y + 3) + '" text-anchor="end" class="svg-label">' + Math.round(vmax * i / 4) + '</text></g>';
    }
    s += '<text x="6" y="10" class="svg-label">ms</text>';

    // packet-loss dashed lines: one column per pixel; tasks sharing a column interleave their dashes
    if (showLines) {
      var columns = {};
      series.forEach(function (se) {
        se.loss.forEach(function (t) {
          if (t < t0 || t > t1) return;
          var x = Math.round(xs(t));
          (columns[x] = columns[x] || {})[se.i] = se;
        });
      });
      s += '<g class="loss-lines" opacity="' + (S.T.lossLineOpacity / 100) + '">';
      Object.keys(columns).forEach(function (x) {
        var list = Object.keys(columns[x]).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return columns[x][k]; });
        list.forEach(function (se, j) {
          s += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + B + '" stroke="' + se.color + '" stroke-width="1" stroke-dasharray="4 ' + (8 * list.length - 4) + '" stroke-dashoffset="' + (-j * 8) + '"><title>' + esc(se.t.name) + ' · packet loss</title></line>';
        });
      });
      s += '</g>';
    }

    series.forEach(function (se) {
      var d = '', pen = false, fails = '';
      var dts = []; for (var k = 1; k < se.data.length; k++) dts.push(se.data[k].t - se.data[k - 1].t);
      dts.sort(function (a, b) { return a - b; });
      var med = dts.length ? dts[Math.floor(dts.length / 2)] : 0, prevT = null;
      se.data.forEach(function (p) {
        var x = xs(p.t);
        if (!m.connectGaps && prevT != null && med && p.t - prevT > med * 3) pen = false;
        prevT = p.t;
        if (p.v < 0) {
          if (!m.connectGaps) pen = false;
          if (showCross) fails += 'M ' + (x - 3).toFixed(1) + ' ' + (B + 5) + ' l 6 6 m -6 0 l 6 -6 ';
          return;
        }
        d += (pen ? ' L ' : ' M ') + x.toFixed(2) + ' ' + ys(p.v).toFixed(2);
        pen = true;
      });
      s += '<g data-probe-series="' + se.t.id + '"><path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="2"' + (se.dash ? ' stroke-dasharray="' + se.dash + '"' : '') + ' vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
        (fails ? '<path d="' + fails + '" stroke="' + se.color + '" stroke-width="1.5" fill="none"/>' : '') + '</g>';
    });
    s += '<line id="probe-cursor" x1="' + R + '" x2="' + R + '" y1="' + T + '" y2="' + B + '" class="svg-cursor" stroke-dasharray="3 3"/></svg>';
    vp.innerHTML = s;
    $('#probe-start').textContent = m.prange > 24 ? axisTime(t0, m.prange) : new Date(t0).toLocaleTimeString('en-US');
    $('#probe-end').textContent = m.prange > 24 ? axisTime(t1, m.prange) : new Date(t1).toLocaleTimeString('en-US');

    var dense = series.reduce(function (a, b) { return b.data.length > a.data.length ? b : a; }, series[0]).data;
    function readAt(t) {
      var parts = series.map(function (se) {
        var best = null, bd = Infinity;
        se.data.forEach(function (p) { var dd = Math.abs(p.t - t); if (dd < bd) { bd = dd; best = p; } });
        if (!best) return null;
        return esc(se.t.name) + ': ' + (best.v < 0 ? '<span class="lat-bad">loss</span>' : (Math.round(best.v * 10) / 10).toFixed(1) + ' ms');
      }).filter(Boolean);
      return new Date(t).toLocaleString('en-US') + ' · ' + parts.join(' · ');
    }
    var svg = $('#probe-svg'), cur = $('#probe-cursor'), out = $('#probe-out');
    function setT(k, user) { if (user) m.phover = k; var t = dense[k].t, x = xs(t); cur.setAttribute('x1', x); cur.setAttribute('x2', x); out.innerHTML = readAt(t); }
    setT(m.phover != null && m.phover < dense.length ? m.phover : dense.length - 1);
    svg.addEventListener('pointermove', function (e) {
      var rect = svg.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * W, best = 0, bd = Infinity;
      dense.forEach(function (p, k) { var dd = Math.abs(xs(p.t) - x); if (dd < bd) { bd = dd; best = k; } });
      setT(best, true);
    });
    svg.addEventListener('pointerleave', function () { m.phover = null; setT(dense.length - 1); });
    svg.addEventListener('keydown', function (e) {
      var k = m.phover == null ? dense.length - 1 : m.phover;
      if (e.key === 'ArrowLeft') k = Math.max(0, k - 1); else if (e.key === 'ArrowRight') k = Math.min(dense.length - 1, k + 1);
      else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = dense.length - 1; else return;
      e.preventDefault(); setT(k, true);
    });
  }

  var resizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (S.modal) { renderModalCharts(); renderProbeChart(); } }, 150);
  });

  // ---------------------------------------------------------------
  // boot
  // ---------------------------------------------------------------
  function privateNotice() {
    $('#root').innerHTML = '<div class="monitor-app"><main class="monitor-page"><div class="container" style="padding-top:96px">' +
      '<div class="banner monitor-surface-primary">This status page is private.<br><br><a class="control-room" style="display:inline-flex" href="/admin">Admin Login' + icon('arrow-right') + '</a></div></div></main></div>';
  }
  function setNodes(list) {
    S.allNodes = (list || []).slice().sort(function (a, b) { return num(a.weight) - num(b.weight) || String(a.name).localeCompare(String(b.name)); });
    S.nodes = S.allNodes.filter(function (n) { return !matchesList(n, S.T.hiddenNodes); });
    S.byId = {}; S.allNodes.forEach(function (n) { S.byId[n.uuid] = n; });
  }

  function openManage() {
    var page = $('#page');
    if (!S.me.logged_in) {
      page.innerHTML = '<div class="container" style="padding-top:64px"><div class="banner monitor-surface-primary">主题设置仅管理员可用，请先登录。<br><br><a class="control-room" style="display:inline-flex" href="/admin">Admin Login' + icon('arrow-right') + '</a></div></div>';
      return;
    }
    var sc = document.createElement('script');
    sc.src = '/assets/manage.js?v=1.4.0';
    sc.onload = function () { window.KHorizonManage(page, KC); };
    sc.onerror = function () { page.innerHTML = '<div class="container"><div class="banner monitor-surface-primary">无法加载 manage.js</div></div>'; };
    document.head.appendChild(sc);
  }

  // shared with manage.js
  var KC = {
    S: S, api: api, esc: esc, icon: icon, DEFAULTS: DEFAULTS, normalizeSettings: normalizeSettings, RATING_PRESETS: RATING_PRESETS,
    SORT_FIELDS: SORT_FIELDS, SORT_NATURAL: SORT_NATURAL, regionLabel: regionLabel, flagImg: flagImg, tasksFor: tasksFor, toList: toList,
    applyPreview: function (T) { S.T = T; applyBackground(); startAmbient(); },
    // traffic helpers for the settings page (evaluate with a draft settings object)
    trafficWith: function (T, n) { var keep = S.T; S.T = T; try { return trafficOf(n); } finally { S.T = keep; } },
    resetDayWith: function (T, n) { var keep = S.T; S.T = T; try { return resetDayFor(n); } finally { S.T = keep; } },
    cycleWith: function (T, n) { var keep = S.T; S.T = T; try { return cycleBounds(resetDayFor(n), Date.now()); } finally { S.T = keep; } },
    loadTrafficWith: function (T, n) { var keep = S.T; S.T = T; var p = loadTrafficFor(n, true); S.T = keep; return p; },
    liveTotals: function (uuid) { var r = rep(uuid); return r && r.network ? { up: num(r.network.totalUp), down: num(r.network.totalDown) } : null; },
    bytesPrecise: bytesPrecise, dateYMD: dateYMD
  };

  function boot() {
    Promise.all([api.settings().catch(function (e) { if (e.status) throw e; return {}; }), api.me()]).then(function (res) {
      S.settings = res[0] || {};
      S.raw = S.settings.theme_settings || {};
      S.T = normalizeSettings(S.raw);
      S.me = res[1] || { logged_in: false };
      if (S.settings.private_site && !S.me.logged_in) { privateNotice(); return; }
      S.scheme = lsGet(SCHEME_KEY, '') || S.T.defaultAppearance;
      S.view = lsGet('komari-horizon-view-' + (isMobile() ? 'm' : 'd'), '') || (isMobile() ? S.T.mobileView : S.T.desktopView);
      var savedSort = lsGet('komari-horizon-sort', '').split(':');
      S.sort = S.T.enableHomeSort && savedSort[0] ? { field: savedSort[0], dir: savedSort[1] === 'desc' ? 'desc' : 'asc' } : { field: S.T.homeSortField, dir: S.T.homeSortDirection };
      shell();
      bindEvents();
      applyScheme();
      setInterval(function () { var c = $('#clock'); if (c) c.textContent = clock12(new Date(), true); }, 1000);
      var manage = new URLSearchParams(location.search).get('view') === 'theme-manage';
      return Promise.all([api.nodes(), api.pingTasks()]).then(function (r) {
        setNodes(r[0]);
        S.pingTasks = r[1] || [];
        if (manage) { connect(); loadTraffic(); openManage(); return; }
        $('#page').innerHTML = dashboardMarkup();
        renderAll();
        connect();
        loadPings();
        loadRates();
        setTimeout(function () { loadTraffic(); }, 1500);
        setInterval(function () { loadTraffic(); }, 10 * 60e3);
        setInterval(loadPings, 60000);
        setInterval(function () { api.nodes().then(function (list) { if (list) { setNodes(list); renderAll(); } }).catch(function () { /* keep last */ }); }, 5 * 60000);
      });
    }).catch(function (e) {
      if (e && e.status) privateNotice();
      else $('#root').innerHTML = '<div class="monitor-app"><main class="monitor-page"><div class="container"><div class="banner monitor-surface-primary">Failed to load dashboard data. ' + esc(e && e.message) + '</div></div></main></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
