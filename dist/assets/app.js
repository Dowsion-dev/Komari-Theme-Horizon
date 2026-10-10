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
  // UI language ('en' | 'zh', see S.lang): _t(english, chinese) returns the visible string
  function _t(en, zh) { return S.lang === 'zh' ? zh : en; }

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
    if (S.lang === 'zh') return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + (withSec ? ':' + pad2(d.getSeconds()) : '');
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return pad2(h) + ':' + pad2(d.getMinutes()) + (withSec ? ':' + pad2(d.getSeconds()) : '') + ' ' + ap;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function stamp(d) { return S.lang === 'zh' ? (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + clock12(d, true) : MON[d.getMonth()] + ' ' + pad2(d.getDate()) + ', ' + clock12(d, true); }
  function dateTime(d) { return d.toLocaleString(_t('en-US', 'zh-CN'), { hour12: S.lang !== 'zh' }); }

  var regionNames = { en: null, zh: null };
  try { regionNames.en = new Intl.DisplayNames(['en'], { type: 'region' }); regionNames.zh = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); } catch (e) { /* older browsers: show codes */ }
  var ZH_REGION = { hk: '香港', mo: '澳门', tw: '台湾' };
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
      if (code === 'tw') return _t('Taiwan', '台湾');
      if (S.lang === 'zh' && ZH_REGION[code]) return ZH_REGION[code];
      var rn = regionNames[S.lang === 'zh' ? 'zh' : 'en'];
      try { return (rn && rn.of(code.toUpperCase())) || code.toUpperCase(); } catch (e) { return code.toUpperCase(); }
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
    var table = [[7, 'Wk', 'Weekly', '周', '周付'], [30, 'Mo', 'Monthly', '月', '月付'], [31, 'Mo', 'Monthly', '月', '月付'], [60, '2Mo', 'Bi-monthly', '2月', '双月付'],
      [90, 'Qtr', 'Quarterly', '季', '季付'], [92, 'Qtr', 'Quarterly', '季', '季付'], [180, '6Mo', 'Semi-annual', '半年', '半年付'], [182, '6Mo', 'Semi-annual', '半年', '半年付'],
      [183, '6Mo', 'Semi-annual', '半年', '半年付'], [365, 'Yr', 'Yearly', '年', '年付'], [366, 'Yr', 'Yearly', '年', '年付'], [730, '2Yr', '2-year', '2年', '两年付'],
      [1095, '3Yr', '3-year', '3年', '三年付'], [1825, '5Yr', '5-year', '5年', '五年付']];
    for (var i = 0; i < table.length; i++) if (table[i][0] === days) return { short: _t(table[i][1], table[i][3]), long: _t(table[i][2], table[i][4]) };
    if (days % 365 === 0) return { short: _t((days / 365) + 'Yr', (days / 365) + '年'), long: _t((days / 365) + '-year', (days / 365) + ' 年付') };
    if (days % 30 === 0) return { short: _t((days / 30) + 'Mo', (days / 30) + '月'), long: _t((days / 30) + '-month', (days / 30) + ' 个月付') };
    return { short: _t(days + 'd', days + '天'), long: _t(days + '-day', days + ' 天付') };
  }
  function parseTags(t) { return (t || '').split(';').map(function (s) { return s.replace(/<[^>]*>\s*$/, '').trim(); }).filter(Boolean); }
  function dateYMD(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // ---------------------------------------------------------------
  // fonts: presets + custom stylesheet / font file, applied as --font-sans / --font-mono
  // ---------------------------------------------------------------
  var GF = 'https://fonts.googleapis.com/css2?display=swap&family=';
  var JSD = 'https://cdn.jsdelivr.net/npm/';
  var SANS_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  var MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "PingFang SC", "Microsoft YaHei", monospace';
  var FONT_SANS = {
    default: { label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans"', css: [GF + 'Plus+Jakarta+Sans:wght@400;500;600;700;800'] },
    system: { label: 'System UI', family: '', css: [] },
    inter: { label: 'Inter', family: '"Inter"', css: [GF + 'Inter:wght@400;500;600;700;800'] },
    noto: { label: 'Noto Sans SC', family: '"Noto Sans SC"', css: [GF + 'Noto+Sans+SC:wght@400;500;700'] },
    harmony: { label: 'HarmonyOS Sans SC', family: '"HarmonyOS Sans SC"', css: [JSD + 'harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Regular.css', JSD + 'harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Bold.css'] },
    misans: { label: 'MiSans', family: '"MiSans"', css: [JSD + 'misans@4.1.0/lib/Normal/MiSans-Regular.min.css', JSD + 'misans@4.1.0/lib/Normal/MiSans-Semibold.min.css'] },
    wenkai: { label: 'LXGW WenKai Screen', family: '"LXGW WenKai Screen"', css: [JSD + 'lxgw-wenkai-screen-webfont@1.7.0/style.css'] },
    custom: { label: 'Custom', family: '', css: [] }
  };
  var FONT_MONO = {
    default: { label: 'JetBrains Mono', family: '"JetBrains Mono"', css: [GF + 'JetBrains+Mono:wght@400;500;600'] },
    system: { label: 'System Mono', family: '', css: [] },
    fira: { label: 'Fira Code', family: '"Fira Code"', css: [GF + 'Fira+Code:wght@400;500;600'] },
    plex: { label: 'IBM Plex Mono', family: '"IBM Plex Mono"', css: [GF + 'IBM+Plex+Mono:wght@400;500;600'] },
    sans: { label: 'Same as body', family: '', css: [] },
    custom: { label: 'Custom', family: '', css: [] }
  };
  function quoteFamily(f) {
    return String(f || '').split(',').map(function (x) { x = x.trim().replace(/^["']|["']$/g, ''); return x ? '"' + x.replace(/["\\<>;{}]/g, '') + '"' : ''; }).filter(Boolean).join(', ');
  }
  // resolves the settings into stylesheets to load, generated @font-face rules and the two font stacks
  function fontPlan(T) {
    var css = [], faces = [];
    function pick(table, key, url, fam, fallback, role) {
      var p = table[key] || table.default, family = p.family;
      if (key === 'custom') {
        family = quoteFamily(fam);
        var u = String(url || '').trim();
        if (/^(https?:)?\/\//i.test(u) || u.charAt(0) === '/') {
          if (/\.(woff2?|ttf|otf)(\?.*)?$/i.test(u)) {
            var name = family ? family.split(',')[0].replace(/"/g, '') : 'Horizon ' + role;
            if (!family) family = '"' + name + '"';
            faces.push('@font-face{font-family:"' + name + '";src:url("' + u.replace(/["\\]/g, '') + '");font-display:swap;font-weight:100 900}');
          } else css.push(u);
        }
      } else css = css.concat(p.css);
      return (family ? family + ', ' : '') + fallback;
    }
    var sans = pick(FONT_SANS, T.fontSans, T.fontSansUrl, T.fontSansFamily, SANS_FALLBACK, 'Sans');
    var mono = T.fontMono === 'sans' ? sans : pick(FONT_MONO, T.fontMono, T.fontMonoUrl, T.fontMonoFamily, MONO_FALLBACK, 'Mono');
    return { css: css.filter(function (u, i, a) { return a.indexOf(u) === i; }), faces: faces, sans: sans, mono: mono };
  }
  var FONT_KEY = 'komari-horizon-font';
  function applyFonts(T, persist) {
    var plan = fontPlan(T), head = document.head;
    var want = {}; plan.css.forEach(function (u) { want[u] = true; });
    Array.prototype.slice.call(document.querySelectorAll('link[data-hz-font]')).forEach(function (l) { if (!want[l.getAttribute('href')]) l.remove(); else delete want[l.getAttribute('href')]; });
    Object.keys(want).forEach(function (u) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.setAttribute('data-hz-font', ''); head.appendChild(l); });
    var st = document.getElementById('hz-font-faces');
    if (!st) { st = document.createElement('style'); st.id = 'hz-font-faces'; head.appendChild(st); }
    st.textContent = plan.faces.join('\n');
    var rs = document.documentElement.style;
    rs.setProperty('--font-sans', plan.sans); rs.setProperty('--font-mono', plan.mono);
    // cached so index.html can load the same fonts before the first paint on the next visit
    if (persist) lsSet(FONT_KEY, JSON.stringify(plan));
  }

  // custom browser-tab icon (cached so index.html can set it before the first paint)
  var ICON_KEY = 'komari-horizon-favicon', defaultIcon = null;
  function applyFavicon(T, persist) {
    var link = document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    if (defaultIcon == null) defaultIcon = link.getAttribute('data-default') || link.getAttribute('href') || '/favicon.svg';
    link.setAttribute('data-default', defaultIcon);
    var u = safeUrl(T.faviconUrl) || (/^data:image\//i.test(String(T.faviconUrl || '').trim()) ? String(T.faviconUrl).trim() : '');
    link.removeAttribute('type');
    link.setAttribute('href', u || defaultIcon);
    if (persist) { if (u) lsSet(ICON_KEY, u); else try { localStorage.removeItem(ICON_KEY); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------
  // theme settings (schema shared with manage.js)
  // ---------------------------------------------------------------
  var DEFAULTS = {
    // 01 appearance / branding
    defaultAppearance: 'system', productLabel: 'MONITOR', logoUrl: '', nodesTitle: 'Cluster Infrastructure Nodes', showFooter: true,
    footerContent: '', footerContentEn: '', faviconUrl: '',
    defaultLanguage: 'auto', showLanguageToggle: true,
    fontSans: 'default', fontMono: 'default', fontSansUrl: '', fontSansFamily: '', fontMonoUrl: '', fontMonoFamily: '',
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
    trafficMode: 'agent', trafficResetDefault: 'expiry', trafficResetUtcOffset: 8, trafficResetTz: {}, showResetCountdown: true,
    trafficResetDays: {}, trafficCalib: {}, trafficAutoCheckpoint: false, trafficCheckpointHours: 12,
    // 08 cost
    showCostsToGuests: true, showRemainingValue: true, baseCurrency: 'USD', costRateApiUrl: 'https://api.frankfurter.dev/v2/rates?base=USD',
    costIgnoredNodes: [], expiryWarningDays: 30,
    // 08 latency
    showProbes: true, probeCount: 3, cardProbeTaskIds: [], cardProbeNodeTaskIds: {}, latencyGoodMs: 150, latencyWarnMs: 400,
    showLossLines: true, lossMarkerStyle: 'line', lossLineOpacity: 75, connectGapsDefault: false, smoothProbesDefault: false,
    // 09 advanced
    refreshIntervalMs: 2000
  };
  var LEGACY = { product_label: 'productLabel', logo_url: 'logoUrl', nodes_title: 'nodesTitle', show_footer: 'showFooter', card_density: 'cardDensity', group_sections: 'groupSections',
    show_group_in_title: 'showCardGroup', show_country_filter: 'showRegionFilter', show_group_filter: 'showGroupFilter', show_probes: 'showProbes', probe_count: 'probeCount',
    card_probe_tasks: 'cardProbeTaskIds', latency_good_ms: 'latencyGoodMs', latency_warn_ms: 'latencyWarnMs', show_remaining_value: 'showRemainingValue', base_currency: 'baseCurrency',
    expiry_warning_days: 'expiryWarningDays', refresh_interval_ms: 'refreshIntervalMs' };
  var RATING_PRESETS = {
    general: { traffic: 'Light,Regular,Heavy,Massive', bandwidth: 'Idle,Light,Active,Burst', asset: 'Starter,Standard,Premium,Whale' },
    generalZh: { traffic: '轻度,常规,重度,海量', bandwidth: '空闲,轻载,活跃,爆发', asset: '入门,标准,顶级,富佬' },
    cultivation: { traffic: '初行,入道,御风,破空', bandwidth: '凝息,运转,疾行,瞬身', asset: '练气,筑基,结丹,元婴' }
  };
  var SORT_FIELDS = [['default', 'Default', '默认'], ['name', 'Name', '名称'], ['region', 'Region', '地区'], ['cpu', 'CPU', 'CPU'], ['memory', 'Memory', '内存'], ['disk', 'Storage', '硬盘'], ['netRate', 'Net Rate', '实时速率'], ['traffic', 'Traffic', '流量'], ['uptime', 'Uptime', '在线时长'], ['price', 'Price', '价格'], ['expiry', 'Expiry', '到期']];
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
    if (!/^(auto|zh|en)$/.test(out.defaultLanguage)) out.defaultLanguage = 'auto';
    if (!FONT_SANS[out.fontSans]) out.fontSans = 'default';
    if (!FONT_MONO[out.fontMono]) out.fontMono = 'default';
    if (!/^(asc|desc)$/.test(out.homeSortDirection)) out.homeSortDirection = SORT_NATURAL[out.homeSortField] || 'desc';
    return out;
  }
  function ratingLabels(kind, T) {
    var style = T.ratingStyle === 'cultivation' ? 'cultivation' : S.lang === 'zh' ? 'generalZh' : 'general';
    var preset = RATING_PRESETS[style][kind].split(',');
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
    traffic: {}, trafficLoading: {}, speedHist: {},
    modal: null,
    lang: 'en'
  };
  var LANG_KEY = 'komari-horizon-lang';
  function pickLang() {
    var saved = S.T.showLanguageToggle ? lsGet(LANG_KEY, '') : '';
    if (saved === 'zh' || saved === 'en') return saved;
    if (S.T.defaultLanguage === 'zh' || S.T.defaultLanguage === 'en') return S.T.defaultLanguage;
    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }
  function applyLangAttr() { document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en'; }
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
  function headerInner() {
    var T = S.T;
    var site = S.settings.sitename || 'Komari';
    var logo = safeUrl(T.logoUrl);
    var showAdmin = S.me.logged_in || !T.hideAdminEntryWhenLoggedOut;
    var conn = S.wsState === 'live' ? ['', _t('Live Stream', '实时连接')] : S.wsState === 'offline' ? [' is-offline', _t('Reconnecting', '重新连接')] : [' is-connecting', _t('Connecting', '连接中')];
    return '<div class="container header-inner">' +
            '<a class="brand" href="/">' +
              '<span class="brand-logo">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : icon('zap', '', ' style="fill:#fff"')) + '</span>' +
              '<span class="brand-name">' + esc(site) + '</span>' +
              (T.productLabel ? '<span class="brand-slash">/</span><span class="brand-product">' + esc(T.productLabel) + '</span>' : '') +
            '</a>' +
            '<div class="header-actions">' +
              '<div class="connection monitor-control' + conn[0] + '" role="status" id="conn"><span class="dot" aria-hidden="true"></span><span class="label">' + conn[1] + '</span><span class="sep" aria-hidden="true">·</span><span class="clock" id="clock">' + clock12(new Date(), true) + '</span></div>' +
              '<div class="color-scheme-toggle" role="group" aria-label="' + _t('Color scheme', '外观') + '">' +
                [['light', 'sun', _t('Light', '浅色')], ['dark', 'moon', _t('Dark', '深色')], ['system', 'monitor', _t('System', '跟随系统')]].map(function (p) {
                  return '<button type="button" data-scheme="' + p[0] + '" aria-label="' + p[2] + '" title="' + p[2] + '" aria-pressed="' + (S.scheme === p[0]) + '">' + icon(p[1]) + '<span>' + p[2] + '</span></button>';
                }).join('') +
              '</div>' +
              (T.showLanguageToggle ? langToggle() : '') +
              (S.me.logged_in ? '<a href="/?view=theme-manage" class="icon-btn monitor-control monitor-hover" title="' + _t('Theme settings', '主题设置') + '" aria-label="' + _t('Theme settings', '主题设置') + '">' + icon('settings') + '</a>' : '') +
              (showAdmin ? '<a href="/admin" class="control-room" id="admin-link">' + (S.me.logged_in ? _t('Admin Panel', '控制台') : _t('Admin Login', '后台登录')) + icon('arrow-right') + '</a>' : '') +
            '</div>' +
          '</div>';
  }
  function langToggle() {
    return '<div class="lang-toggle monitor-control" role="group" aria-label="Language / 语言">' +
      [['zh', '中'], ['en', 'EN']].map(function (p) { return '<button type="button" data-lang="' + p[0] + '" aria-pressed="' + (S.lang === p[0]) + '" title="' + (p[0] === 'zh' ? '中文' : 'English') + '">' + p[1] + '</button>'; }).join('') + '</div>';
  }
  function shell() {
    var T = S.T;
    $('#root').innerHTML =
      '<div class="monitor-app" data-layout="' + esc(T.cardDensity) + '">' +
        '<div class="bg-layer" id="bg-layer" aria-hidden="true"></div><div class="bg-veil" aria-hidden="true"></div>' +
        '<canvas class="ambient-layer" id="ambient" aria-hidden="true" hidden></canvas>' +
        '<header class="monitor-header" data-product="' + esc(T.productLabel) + '">' + headerInner() + '</header>' +
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
        '<div class="toolbar-title"><div class="icon">' + icon('server') + '</div><h2>' + esc(T.nodesTitle === DEFAULTS.nodesTitle ? _t(T.nodesTitle, '集群节点') : T.nodesTitle) + '</h2>' +
        '<div class="view-toggle monitor-control" role="group" aria-label="' + _t('Card view', '卡片视图') + '">' +
          '<button type="button" data-view="standard" title="' + _t('Standard cards', '标准卡片') + '" aria-label="' + _t('Standard cards', '标准卡片') + '">' + icon('layout-grid') + '</button>' +
          '<button type="button" data-view="compact" title="' + _t('Compact cards', '小卡片') + '" aria-label="' + _t('Compact cards', '小卡片') + '">' + icon('rows-3') + '</button>' +
        '</div></div>' +
        '<div class="quick-filters" id="filters"></div>' +
      '</div></div>' +
      '<div class="container grid-wrap"><section class="node-grid" id="grid"></section></div>' +
      (T.showFooter ? '<footer class="footer">' + footerContent(T) + '</footer>' : '');
  }

  // footer: admin-written content (a small HTML subset, sanitised) with {year} / {sitename} placeholders
  var DEFAULT_FOOTER = 'Powered by <a href="https://github.com/komari-monitor/komari">Komari Monitor</a>';
  var FOOTER_TAGS = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, SMALL: 1, SPAN: 1, BR: 1, CODE: 1, IMG: 1, U: 1, S: 1 };
  function sanitizeFooter(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || !FOOTER_TAGS[c.nodeName]) {
          if (c.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE)$/.test(c.nodeName)) { walk(c); while (c.firstChild) node.insertBefore(c.firstChild, c); }
          node.removeChild(c); return;
        }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var n = a.name.toLowerCase(), v = a.value;
          var ok = (n === 'href' && c.nodeName === 'A' && safeUrl(v)) || (n === 'src' && c.nodeName === 'IMG' && safeUrl(v)) ||
            n === 'title' || n === 'alt' || (n === 'target' && v === '_blank') || (n === 'style' && !/url\s*\(|expression|@import/i.test(v)) || n === 'width' || n === 'height';
          if (!ok) c.removeAttribute(a.name);
        });
        if (c.nodeName === 'A') { c.setAttribute('rel', 'noopener'); if (!c.hasAttribute('target') && /^https?:/i.test(c.getAttribute('href') || '')) c.setAttribute('target', '_blank'); }
        walk(c);
      });
    })(tpl.content);
    var box = document.createElement('div'); box.appendChild(tpl.content); return box.innerHTML;
  }
  function footerContent(T) {
    var raw = String((S.lang === 'en' && T.footerContentEn.trim() ? T.footerContentEn : T.footerContent) || '').trim();
    if (!raw) raw = S.lang === 'zh' ? '基于 <a href="https://github.com/komari-monitor/komari">Komari Monitor</a>' : DEFAULT_FOOTER;
    raw = raw.replace(/\{year\}/g, String(new Date().getFullYear())).replace(/\{sitename\}/g, esc(S.settings.sitename || 'Komari')).replace(/\r?\n/g, '<br>');
    return sanitizeFooter(raw);
  }

  // small floating tooltip for elements with data-tip (probe cells); native titles are too slow / tiny there
  var tipEl = null, tipFor = null;
  function showTip(el) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'hz-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipFor = el; tipEl.textContent = el.getAttribute('data-tip'); tipEl.style.display = 'block';
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8), y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    tipEl.style.left = Math.round(x) + 'px'; tipEl.style.top = Math.round(y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; tipFor = null; }
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) { if (t !== tipFor || !tipEl || tipEl.style.display === 'none') showTip(t); } else if (tipFor) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

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
    var lg = t.closest('[data-lang]');
    if (lg) { setLang(lg.dataset.lang); return; }
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
    var pm = t.closest('[data-pmode]');
    if (pm && S.modal) { S.modal.pmode = pm.dataset.pmode; S.modal.phover = null; renderProbeChart(); return; }
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
      if (price === -1) { text = _t('Free', '免费'); title = text; }
      else if (price > 0) { text = money(price, code) + (cyc ? '/' + cyc.short : ''); title = _t('Billing Amount: ', '账单金额：') + code + ' ' + price.toFixed(2) + (cyc ? ' · ' + cyc.long : ''); }
    }
    var LT = _t('Lifetime', '永久');
    if (lifetime) { text = text ? text + ' · ' + LT : LT; title = (title ? title + ' · ' : '') + LT; status = 'active'; }
    else if (exp) {
      if (daysLeft < 0) { status = 'expired'; text = (text ? text + ' · ' : '') + _t('Expired ' + Math.abs(daysLeft) + 'd ago', '已过期 ' + Math.abs(daysLeft) + ' 天'); }
      else { status = daysLeft <= (S.T.expiryWarningDays || 30) ? 'upcoming' : 'active'; text = (text ? text + ' · ' : '') + _t(daysLeft + 'd left', '剩 ' + daysLeft + ' 天'); }
      title = (title ? title + ' · ' : '') + _t('Expires ', '到期 ') + dateYMD(exp) + ' · ' + (daysLeft < 0 ? _t(Math.abs(daysLeft) + ' days ago', Math.abs(daysLeft) + ' 天前') : _t(daysLeft + ' days left', '剩余 ' + daysLeft + ' 天'));
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
      return new Date(e.getTime() + tzFor(n) * 3600e3).getUTCDate();
    }
    var d = Math.round(num(def));
    return d >= 1 && d <= 31 ? d : 0;
  }
  // cycle boundaries in the configured UTC offset (so every visitor sees the same cycle)
  // time zone used for a node's cycle boundaries: its own setting, else the global one
  function tzFor(n) {
    var v = n && (S.T.trafficResetTz || {})[n.uuid];
    v = v === '' || v == null ? NaN : Number(v);
    return isFinite(v) && v >= -12 && v <= 14 ? v : S.T.trafficResetUtcOffset;
  }
  // the reset date as seen in the cycle's own time zone
  function cycleYMD(c) { var d = new Date(c.next + c.tz * 3600e3); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function tzLabel(v) { var h = Math.floor(Math.abs(v)), m = Math.round((Math.abs(v) - h) * 60); return 'UTC' + (v < 0 ? '−' : '+') + h + (m ? ':' + pad2(m) : ''); }
  function cycleBounds(day, now, tz) {
    if (!day) return null;
    if (tz == null) tz = S.T.trafficResetUtcOffset;
    var shift = tz * 3600e3, l = new Date(now + shift), y = l.getUTCFullYear(), m = l.getUTCMonth();
    var at = function (mm) { return Date.UTC(y, mm, Math.min(day, dim(y, mm))) - shift; };
    var thisStart = at(m), start, next;
    if (now >= thisStart) { start = thisStart; next = at(m + 1); } else { start = at(m - 1); next = thisStart; }
    return { start: start, next: next, day: day, tz: tz, daysLeft: Math.max(0, Math.ceil((next - now) / 86400e3)) };
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
    var cyc = cycleBounds(resetDayFor(n), now || Date.now(), tzFor(n)), c = calibFor(n);
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
  var BILL_LABEL = { max: ['MAX', 'Billed on the larger of in / out', '按入站 / 出站中较大者计费'], min: ['MIN', 'Billed on the smaller of in / out', '按入站 / 出站中较小者计费'], sum: ['SUM', 'Billed on in + out', '按入站 + 出站计费'], up: ['OUT', 'Billed on outbound only', '仅按出站计费'], down: ['IN', 'Billed on inbound only', '仅按入站计费'] };
  function billTitle(type) { var b = BILL_LABEL[type] || BILL_LABEL.max; return _t(b[1], b[2]); }
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
    var healthTxt = health >= 100 ? _t('100% Nominal', '100% 正常') : Math.round(health) + '% ' + (health >= 50 ? _t('Degraded', '降级') : _t('Critical', '严重'));
    var GB = 1024 * 1024 * 1024, MBPS = 125000;
    // asset thresholds are defined in CNY (as in LuminaPlus) and converted to the display currency
    var cny = function (v) { return S.rates.CNY && S.rates[base] ? v * S.rates.CNY / S.rates[base] : v / 7; };

    var panels = [];
    panels.push(panel(_t('Cluster Status', '集群状态'), '<span class="dot" style="background:' + (online === total && total ? 'var(--emerald-500)' : online ? 'var(--amber-500)' : 'var(--red-500)') + '"></span>',
      '<div class="stat-main"><span class="stat-value">' + online + '</span><span class="stat-unit xs">/ ' + total + _t(' Online', ' 在线') + '</span></div>' +
      '<div class="stat-foot' + healthCls + '">' + icon(health >= 100 ? 'shield-check' : 'triangle-alert') + '<span>' + healthTxt + '</span></div>'));
    panels.push(panel(_t('Compute Load', '计算负载'), '<span class="meta">' + cores + ' vCPUs</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(cpuAvg) + '</span><span class="stat-unit">' + _t('Avg', '平均') + '</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-blue" style="width:' + cpuAvg + '%"></div></div>'));
    panels.push(panel(_t('Memory', '内存'), '<span class="meta">' + bytesTotal(memT) + '</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(pct(memU, memT)) + '</span><span class="stat-unit">' + _t('Allocated', '已用') + '</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-emerald" style="width:' + pct(memU, memT) + '%"></div></div>'));
    panels.push(panel(_t('Storage', '硬盘'), '<span class="meta">' + bytesTotal(diskT) + '</span>',
      '<div class="stat-main"><span class="stat-value">' + fmtPct(pct(diskU, diskT)) + '</span><span class="stat-unit">' + _t('Filled', '已用') + '</span></div>' +
      '<div class="stat-bar monitor-rail"><div class="g-amber" style="width:' + pct(diskU, diskT) + '%"></div></div>'));
    panels.push(panel(_t('Throughput', '实时速率'), '<span class="dot" style="background:var(--blue-500)"></span>',
      '<div class="transfer-grid"><span class="k rx">' + icon('arrow-down') + ' RX</span><span class="v">' + speed(rx) + '</span>' +
      '<span class="k tx">' + icon('arrow-up') + ' TX</span><span class="v">' + speed(tx) + '</span></div>' +
      ratingTag('bandwidth', rx + tx, [1 * MBPS, 10 * MBPS, 100 * MBPS])));
    panels.push(panel(_t('Cycle Traffic', '周期流量'), '<span class="meta">' + _t('Total', '合计') + '</span>',
      '<div class="transfer-grid"><span class="k">' + _t('Total In', '总入站') + '</span><span class="v">' + bytesPrecise(tin) + '</span>' +
      '<span class="k">' + _t('Total Out', '总出站') + '</span><span class="v">' + bytesPrecise(tout) + '</span></div>' +
      ratingTag('traffic', tin + tout, [500 * GB, 2000 * GB, 10000 * GB])));
    if (T.showRemainingValue && canSeeCosts()) {
      panels.push('<div class="public-stat-panel remaining-value-card monitor-surface-primary"><div class="remaining-label">' + _t('Remaining Value', '剩余价值') + '</div>' +
        '<div class="stat-value" style="margin-top:8px">' + (SYMBOL[base] || '') + value.toFixed(2) + '</div>' +
        '<span class="remaining-cur" role="status" title="' + _t('Estimated remaining service value in ' + esc(base) + (S.ratesLive ? ' (live rates).' : ' (approximate rates).'), '按' + (S.ratesLive ? '实时' : '近似') + '汇率折算的剩余服务价值（' + esc(base) + '）') + '">' + esc(base) + '</span>' +
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
      html += '<div class="filter-group region-group" role="group" aria-label="' + _t('Country filters', '地区筛选') + '">' + ck.map(function (c) {
        var label = regionLabel(countries[c].region);
        var inner = regionCode(countries[c].region) ? flagImg(countries[c].region) : esc(c);
        return '<button type="button" class="filter-btn" data-filter="country" data-value="' + esc(c) + '" aria-pressed="' + (S.filter.country === c) + '" aria-label="' + _t('Filter by ', '筛选 ') + esc(label) + '" title="' + esc(label) + ' · ' + nodeCount(countries[c].n) + '"><span aria-hidden="true">' + inner + '</span></button>';
      }).join('') + '</div>';
    }
    var gk = Object.keys(groups).sort(function (a, b) { return groupRank(a) - groupRank(b) || groups[b] - groups[a] || a.localeCompare(b); });
    if (gk.length > 0 && T.showGroupFilter) {
      html += '<div class="filter-group group-group" role="group" aria-label="' + _t('Group filters', '分组筛选') + '">' + gk.map(function (g) {
        return '<button type="button" class="filter-btn" data-filter="group" data-value="' + esc(g) + '" aria-pressed="' + (S.filter.group === g) + '" aria-label="' + _t('Filter by group ', '筛选分组 ') + esc(g) + '" title="' + esc(g) + ' · ' + nodeCount(groups[g]) + '"><span>' + esc(g) + '</span></button>';
      }).join('') + '</div>';
    }
    if (T.enableHomeSort) {
      var fields = SORT_FIELDS.filter(function (f) { return f[0] !== 'price' || canSeeCosts(); });
      html += '<div class="filter-group sort-group"><label class="sort-select filter-btn" title="' + _t('Sort nodes', '节点排序') + '">' + icon('arrow-up-down') +
        '<select id="sort-field" aria-label="' + _t('Sort by', '排序方式') + '">' + fields.map(function (f) { return '<option value="' + f[0] + '"' + (S.sort.field === f[0] ? ' selected' : '') + '>' + _t(f[1], f[2]) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="filter-btn" id="sort-dir" aria-label="' + _t('Sort direction', '排序方向') + '" title="' + (S.sort.dir === 'asc' ? _t('Ascending', '升序') : _t('Descending', '降序')) + '">' + icon(S.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') + '</button></div>';
    }
    setHTML(box, html);
    balanceRegions(); balanceGroups();
  }
  function nodeCount(n) { return _t(n + ' node' + (n > 1 ? 's' : ''), n + ' 个节点'); }
  // flag buttons: rows are filled evenly (e.g. 9 → 5 + 4 instead of 8 + 1); on mobile they stretch
  // into a grid that spans the whole row, flags centred
  function balanceRegions() {
    var grp = $('#filters .region-group'); if (!grp) return;
    grp.style.maxWidth = ''; grp.style.removeProperty('--rcols'); grp.classList.add('is-measuring');
    var btns = grp.children, n = btns.length, w = n ? btns[0].getBoundingClientRect().width : 0;
    grp.classList.remove('is-measuring');
    var avail = grp.parentNode.clientWidth, gap = parseFloat(getComputedStyle(grp).columnGap) || 6;
    if (!n || !avail || !w) return;
    var perRow = Math.max(1, Math.floor((avail + gap) / (w + gap)));
    var rows = Math.ceil(n / perRow), even = Math.ceil(n / rows);
    if (isMobile()) { grp.style.setProperty('--rcols', String(even)); return; }
    if (n > perRow) grp.style.maxWidth = (even * (w + gap) - gap + 0.5) + 'px';
  }
  // group buttons share one width (the widest label); on mobile they form an even grid across the row
  function balanceGroups() {
    var grp = $('#filters .group-group'); if (!grp) return;
    grp.style.removeProperty('--gw'); grp.style.removeProperty('--gcols'); grp.classList.add('is-measuring');
    var btns = grp.children, n = btns.length, w = 0;
    for (var i = 0; i < n; i++) w = Math.max(w, btns[i].getBoundingClientRect().width);
    grp.classList.remove('is-measuring');
    if (!n || !w) return;
    grp.style.setProperty('--gw', Math.ceil(w) + 'px');
    if (!isMobile()) return;
    var avail = grp.parentNode.clientWidth, gap = parseFloat(getComputedStyle(grp).columnGap) || 6;
    var perRow = Math.max(1, Math.floor((avail + gap) / (w + gap)));
    var rows = Math.ceil(n / perRow);
    grp.style.setProperty('--gcols', String(Math.ceil(n / rows)));
  }
  window.addEventListener('resize', function () { balanceRegions(); balanceGroups(); });

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

  // last hour of a task in 20 buckets of 3 minutes (aligned to the clock so they don't shift on every refresh)
  var PB_N = 20, PB_SPAN = 3 * 60e3;
  function probeWindow(recs) {
    var end = Math.ceil(Date.now() / PB_SPAN) * PB_SPAN, start = end - PB_N * PB_SPAN, b = [], total = 0, lost = 0, last = null;
    for (var i = 0; i < PB_N; i++) b.push({ t: start + i * PB_SPAN, sum: 0, n: 0, lost: 0, min: Infinity, max: -Infinity });
    (recs || []).forEach(function (r) {
      if (r.t < start || r.t >= end) return;
      var k = b[Math.floor((r.t - start) / PB_SPAN)];
      total++;
      if (r.v < 0) { k.lost++; lost++; } else { k.sum += r.v; k.n++; k.min = Math.min(k.min, r.v); k.max = Math.max(k.max, r.v); }
      last = r.v;
    });
    b.forEach(function (k) { var c = k.n + k.lost; k.avg = k.n ? k.sum / k.n : c ? -1 : null; k.loss = c ? k.lost / c : 0; });
    return { buckets: b, total: total, lost: lost, loss: total ? lost / total * 100 : null, last: last };
  }
  function lossClass(p) { return p == null ? 'lat-none' : p < 1 ? 'lat-good' : p < 5 ? 'lat-mid' : 'lat-bad'; }
  function fmtLoss(p) { return p == null ? '—' : (p >= 10 ? Math.round(p) : (Math.round(p * 10) / 10).toFixed(1)) + '%'; }
  function fmtMs(v) { return v == null ? '—' : v < 0 ? _t('Loss', '丢包') : (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + ' ms'; }
  function hm(t) { var d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  function probeSummary(n) {
    if (!S.T.showProbes) return '';
    var list = cardTasksFor(n.uuid), data = S.pings[n.uuid] || {};
    if (!list.length) return '';
    return '<section class="probe-summary" aria-label="' + _t('Network probes', '网络探测') + '"><div class="probe-grid" style="grid-template-columns:repeat(' + Math.max(3, list.length) + ',minmax(0,1fr))">' + list.map(function (t) {
      var w = probeWindow(data[t.id]);
      var bars = w.buckets.map(function (k) {
        var cls = k.avg == null ? '' : k.avg < 0 || k.loss >= 0.5 ? 'bad' : barClass(k.avg);
        var c = k.n + k.lost, tip = esc(t.name) + ' · ' + hm(k.t) + '–' + hm(k.t + PB_SPAN) + '\n';
        if (!c) tip += _t('No checks in this slot', '该时段没有检测数据');
        else {
          tip += k.n ? _t('Avg ', '平均 ') + fmtMs(k.avg) + (k.n > 1 ? _t('  (min ', '（最低 ') + fmtMs(k.min) + _t(' / max ', ' / 最高 ') + fmtMs(k.max) + _t(')', '）') : '') : _t('All checks lost', '全部丢包');
          tip += '\n' + _t(c + ' checks · ' + k.lost + ' lost (' + fmtLoss(k.loss * 100) + ')', '检测 ' + c + ' 次 · 丢包 ' + k.lost + ' 次（' + fmtLoss(k.loss * 100) + '）');
        }
        return '<span class="' + cls + '" data-tip="' + tip + '"></span>';
      }).join('');
      return '<div class="probe-card monitor-surface-secondary">' +
        '<div class="probe-top"><span class="probe-name">' + esc(t.name) + '</span><span class="probe-type">' + esc(t.type || 'icmp') + '</span></div>' +
        '<div class="probe-stats"><div><span class="k">' + _t('Latency', '延迟') + '</span><span class="lat ' + latClass(w.last) + '">' + fmtMs(w.last) + '</span></div>' +
        '<div><span class="k">' + _t('Loss', '丢包率') + '</span><span class="fail ' + lossClass(w.loss) + '">' + fmtLoss(w.loss) + '</span></div></div>' +
        '<div class="probe-bars monitor-divider" aria-label="' + _t('Last hour in 3-minute averages, loss ', '最近 1 小时（每格 3 分钟平均），丢包率 ') + fmtLoss(w.loss) + '">' + bars + '</div>' +
      '</div>';
    }).join('') + '</div></section>';
  }
  // compact cards: one line per probe task — name, latest latency, loss over the last hour
  function compactProbes(n) {
    if (!S.T.showProbes) return '';
    var list = cardTasksFor(n.uuid), data = S.pings[n.uuid] || {};
    if (!list.length) return '';
    // all tasks on one line: short latency ("38ms") and loss ("0%", "1.7%") keep each cell narrow
    var ms = function (v) { return v == null ? '—' : v < 0 ? _t('loss', '丢包') : Math.round(v) + 'ms'; };
    var lp = function (p) { return p == null ? '—' : p === 0 ? '0%' : fmtLoss(p); };
    return '<div class="cm-probes" style="grid-template-columns:repeat(' + list.length + ',minmax(0,1fr))">' + list.map(function (t) {
      var w = probeWindow(data[t.id]);
      return '<span class="cp" title="' + esc(t.name + ' · ' + fmtMs(w.last) + ' · ' + _t('loss ', '丢包率 ') + fmtLoss(w.loss)) + '"><b>' + esc(t.name) + '</b><i class="' + latClass(w.last) + '">' + ms(w.last) + '</i><em class="' + lossClass(w.loss) + '">' + lp(w.loss) + '</em></span>';
    }).join('') + '</div>';
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
      (tags.length ? '<div class="node-tags" aria-label="' + _t('Tags', '标签') + '">' + tags.map(function (t) { return '<span class="node-tag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (bill.text ? '<span class="node-asset-summary" data-expiry-status="' + bill.status + '" title="' + esc(bill.title) + '" aria-label="' + esc(bill.title) + '">' + esc(bill.text) + '</span>' : '') +
    '</div>';
  }

  function resList(n, V) {
    return '<div class="res-list">' +
      '<div><div class="res-row"><span class="res-label">' + icon('cpu', 'c-blue') + '<span class="model" title="' + esc(n.cpu_name) + '">' + esc(n.cpu_name || 'CPU') + '</span>' + (V.cores ? '<span class="cores">× ' + V.cores + '</span>' : '') + '</span>' +
        '<div class="res-values"><span class="pct">' + fmtPct(V.cpu) + '</span></div></div>' +
        '<div class="bar"><div class="g-blue" style="width:' + clamp(V.cpu, 0, 100) + '%"></div></div></div>' +
      '<div><div class="res-row"><span class="res-label">' + icon('layers', 'c-emerald') + ' ' + _t('Memory', '内存') + '</span>' +
        '<div class="res-values"><span class="sub">' + bytesPrecise(V.memU) + ' / ' + bytesTotal(V.memT) + '</span><span class="pct">' + fmtPct(pct(V.memU, V.memT)) + '</span></div></div>' +
        '<div class="bar"><div class="g-emerald" style="width:' + pct(V.memU, V.memT) + '%"></div></div></div>' +
      '<div><div class="res-row"><span class="res-label">' + icon('hard-drive', 'c-amber') + ' ' + _t('Storage', '硬盘') + '</span>' +
        '<div class="res-values"><span class="sub">' + bytesRound(V.diskU) + ' / ' + bytesTotal(V.diskT) + '</span><span class="pct">' + fmtPct(pct(V.diskU, V.diskT)) + '</span></div></div>' +
        '<div class="bar"><div class="g-amber" style="width:' + pct(V.diskU, V.diskT) + '%"></div></div></div>' +
    '</div>';
  }
  // CPU / memory / disk / load as a 2×2 grid of tiles: value on the right, detail line, usage bar
  function loadPct(V) { return V.cores > 0 ? num(V.load.load1) / V.cores * 100 : num(V.load.load1) * 100; }
  function resTiles(n, V) {
    var T = S.T, l1 = num(V.load.load1);
    var tile = function (ic, label, value, unit, sub, subTitle, p, cls) {
      return '<div class="rt"><div class="rt-top"><span class="rt-k">' + icon(ic) + label + '</span><span class="rt-v">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</span></div>' +
        '<div class="rt-sub" title="' + esc(subTitle || '') + '">' + sub + '</div>' +
        '<div class="bar rt-bar"><div class="' + cls + '" style="width:' + clamp(p, 0, 100) + '%"></div></div></div>';
    };
    var pctNum = function (v) { return (Math.round(v * 100) / 100).toFixed(v >= 10 ? 1 : 2); };
    var memP = pct(V.memU, V.memT), diskP = pct(V.diskU, V.diskT);
    var loadSub = T.showConnections ? num(V.conn.tcp) + ' TCP · ' + num(V.conn.udp) + ' UDP' : '5m ' + num(V.load.load5).toFixed(2) + ' · 15m ' + num(V.load.load15).toFixed(2);
    return '<div class="res-tiles">' +
      tile('cpu', 'CPU', pctNum(V.cpu), '%', (V.cores ? _t(V.cores + ' cores', V.cores + ' 核') : '') + (n.cpu_name ? ' · ' + esc(n.cpu_name) : ''), n.cpu_name, V.cpu, 'g-blue') +
      tile('memory-stick', _t('Memory', '内存'), pctNum(memP), '%', bytesPrecise(V.memU) + ' / ' + bytesPrecise(V.memT), '', memP, 'g-purple') +
      tile('hard-drive', _t('Disk', '磁盘'), pctNum(diskP), '%', bytesPrecise(V.diskU) + ' / ' + bytesPrecise(V.diskT), '', diskP, 'g-amber') +
      tile('gauge', _t('Load', '负载'), l1.toFixed(2), '', loadSub, _t('Load average 1m · 5m · 15m: ', '平均负载 1 / 5 / 15 分钟：') + [l1, num(V.load.load5), num(V.load.load15)].map(function (x) { return x.toFixed(2); }).join(' · ') + ' · ' + num(V.r.process) + _t(' processes', ' 个进程'), loadPct(V), 'g-pink') +
    '</div>';
  }
  function mini(ic, cls, title, right, rows) {
    return '<div class="mini ' + (ic === 'boxes' ? 'workload ' : '') + 'monitor-surface-secondary"><div class="mini-head"><span class="t">' + icon(ic, cls) + ' ' + esc(title) + '</span>' + right + '</div><div class="mini-rows">' + rows + '</div></div>';
  }
  function miniRow(k, v, cls) { return '<div class="mini-row' + (cls ? ' ' + cls : '') + '">' + k + '<span class="v">' + v + '</span></div>'; }

  // "7.95" + "KB/s": three significant digits, unit split off for the big live number
  function speedParts(b) {
    var r = scaleBytes(b), v = r[0];
    return [r[1] === 'B' ? String(Math.round(v)) : v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v)), r[1] + '/s'];
  }
  // recent live rates as a row of dots: bigger / stronger = faster (relative to the visible window)
  var TRAIL_N = 16;
  function dotTrail(arr) {
    var a = arr.slice(-TRAIL_N), max = 0, out = '';
    a.forEach(function (v) { if (v > max) max = v; });
    for (var i = 0; i < TRAIL_N; i++) {
      var v = a[i - (TRAIL_N - a.length)];
      if (v == null) { out += '<i></i>'; continue; }
      var k = max > 0 ? v / max : 0;
      out += '<i class="on" style="--k:' + k.toFixed(2) + '"></i>';
    }
    return '<span class="nb-dots" aria-hidden="true">' + out + '</span>';
  }

  function resetTitle(tr) {
    var parts = [];
    parts.push(tr.engine ? _t('Traffic counted by the theme for the current cycle', '本周期流量由主题统计') : _t('Traffic = Komari agent counter', '流量 = Komari 探针计数'));
    if (tr.cyc) { var d = cycleYMD(tr.cyc); parts.push(_t('Next reset ' + d + ' (day ' + tr.cyc.day + ', ' + (tr.cyc.daysLeft === 0 ? 'today' : 'in ' + tr.cyc.daysLeft + ' days') + ')', '下次重置 ' + d + '（每月 ' + tr.cyc.day + ' 日，' + (tr.cyc.daysLeft === 0 ? '今天' : tr.cyc.daysLeft + ' 天后') + '）') + ' · ' + tzLabel(tr.cyc.tz)); }
    if (tr.calib) parts.push(_t('Calibrated ', '校准于 ') + dateTime(new Date(tr.calib.t)) + (tr.calib.auto ? _t(' (auto checkpoint)', '（自动存档）') : ''));
    if (tr.approx) parts.push(_t('Approximate: record history does not cover the whole cycle', '近似值：记录未覆盖整个周期'));
    return parts.join(' · ');
  }
  function cardHTML(n) {
    var T = S.T, V = nodeView(n), net = V.net, region = n.region || '';
    var tr = trafficOf(n), limit = num(n.traffic_limit), ax = tr.approx || tr.pending ? '≈ ' : '';
    var trafficTitle = _t('Cycle I/O', '周期流量'), quota = '';
    var billType = limit > 0 ? String(n.traffic_limit_type || 'max').toLowerCase() : 'sum';
    var usedBytes = trafficUsedBy(billType, tr);
    var trafficRight = '<span class="r used" title="' + esc(billTitle(billType) + ' · ' + resetTitle(tr)) + '"><em>' + BILL_LABEL[billType][0] + '</em>' + ax + bytesPrecise(usedBytes) + '</span>';
    if (limit > 0) {
      var usedPct = pct(usedBytes, limit), rawPct = usedBytes / limit * 100;
      var pctTxt = (rawPct >= 10 || rawPct === 0 ? Math.round(rawPct) : rawPct.toFixed(1)) + _t('% of ', '% / ') + bytesTotal(limit);
      quota = '<div class="quota" title="' + esc(bytesPrecise(usedBytes) + ' / ' + bytesTotal(limit) + ' · ' + billTitle(billType)) + '">' +
        '<div class="bar"><div class="' + (rawPct >= 90 ? 'g-red' : rawPct >= 70 ? 'g-amber' : 'g-blue') + '" style="width:' + usedPct + '%"></div></div>' +
        '<span class="quota-pct' + (rawPct >= 90 ? ' hot' : rawPct >= 70 ? ' warm' : '') + '">' + pctTxt + '</span></div>';
    } else {
      // unmetered: a full, softly striped bar and "used / ∞" (desktop only, see .quota-inf in app.css)
      quota = '<div class="quota quota-inf" title="' + esc(_t('Unmetered traffic', '不限流量') + ' · ' + bytesPrecise(usedBytes)) + '">' +
        '<div class="bar"><div class="g-inf" style="width:100%"></div></div>' +
        '<span class="quota-pct">' + bytesPrecise(usedBytes) + ' / ∞</span></div>';
    }
    var resetChip = T.showResetCountdown && tr.cyc ? '<span class="chip" title="' + esc(resetTitle(tr)) + '">' + icon('rotate-ccw') + (tr.cyc.daysLeft === 0 ? _t('Today', '今天') : tr.cyc.daysLeft + 'd') + '</span>' : '';
    var h = '<div><div class="node-head monitor-divider"><div class="node-head-row"><div class="node-ident">' +
      '<div class="node-os monitor-chip">' + osIcon(n.os) + '</div>' +
      '<h3 class="node-title"><span class="node-status-dot" aria-hidden="true"></span><span class="node-name">' + esc(n.name) + '</span>' +
      (V.group ? '<span class="node-provider-sep" aria-hidden="true">·</span><span class="node-provider">' + esc(V.group) + '</span>' : '') +
      '</h3></div>' +
      '<span role="img" aria-label="' + (V.on ? _t('No active alerts', '无告警') : _t('Node offline', '节点离线')) + '" class="node-alert-status' + (V.on ? '' : ' warn') + '">' + icon(V.on ? 'bell' : 'wifi-off') + '</span></div>' +
      '<div class="node-meta" aria-label="' + _t('Machine metadata', '机器信息') + '">' +
        (region ? '<span class="chip">' + flagImg(region) + ' ' + esc(regionLabel(region)) + '</span>' : '') +
        (n.arch ? '<span class="chip">' + esc(n.arch) + '</span>' : '') +
        (n.virtualization ? '<span class="chip">' + esc(n.virtualization) + '</span>' : '') +
        '<span class="chip" aria-label="' + _t('Uptime', '在线时长') + '">' + icon(V.on ? 'clock' : 'cloud-off') + (V.on ? uptime(V.r.uptime) : _t('Offline', '离线')) + '</span>' + resetChip +
      '</div></div>';
    h += resTiles(n, V);
    // live rate + cycle traffic in one block: upload | download, each with a dot trail of recent rates and its cycle total
    var hist = S.speedHist[n.uuid] || { up: [], down: [] };
    var side = function (dir) {
      var up = dir === 'up', p = speedParts(up ? net.up : net.down);
      return '<div class="nb-side ' + (up ? 'tx' : 'rx') + '">' +
        '<div class="nb-top"><span class="nb-k">' + icon(up ? 'arrow-up' : 'arrow-down') + (up ? _t('Upload', '上行') : _t('Download', '下行')) + '</span>' +
          '<span class="nb-v">' + p[0] + '<small>' + p[1] + '</small></span></div>' +
        '<div class="nb-trail">' + dotTrail(up ? hist.up : hist.down) + '<span class="nb-live">' + _t('live', '实时') + '</span></div>' +
        '<div class="nb-total"><span class="nb-k">' + icon('globe') + (up ? _t('Out', '出站') : _t('In', '入站')) + '</span><b>' + ax + bytesPrecise(up ? tr.up : tr.down) + '</b></div>' +
      '</div>';
    };
    var minis = [
      '<div class="mini netbox monitor-surface-secondary' + (quota ? ' has-quota' : '') + '"><div class="mini-head"><span class="t">' + icon('network', 'c-indigo') + ' ' + esc(trafficTitle) + '</span>' + trafficRight + '</div>' +
        '<div class="nb-cols">' + side('up') + side('down') + '</div>' + quota + '</div>'
    ];
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
      '<h3 class="node-title"><span class="node-status-dot" aria-hidden="true"></span>' + (n.region ? flagImg(n.region) + ' ' : '') + '<span class="node-name">' + esc(n.name) + '</span></h3></div>' +
      (T.compactShowUptime ? '<span class="chip">' + icon(V.on ? 'clock' : 'cloud-off') + (V.on ? uptime(V.r.uptime) : _t('Offline', '离线')) + '</span>' : '') + '</div>' +
      '<div class="cm-grid">' + meter('CPU', V.cpu, 'g-blue') + meter(_t('MEM', '内存'), pct(V.memU, V.memT), 'g-emerald') + meter(_t('DISK', '硬盘'), pct(V.diskU, V.diskT), 'g-amber') +
        '<div class="cm" title="' + _t('Load average (1m), bar = load / cores', '1 分钟平均负载，进度 = 负载 / 核心数') + '"><div class="cm-top"><span>' + _t('LOAD', '负载') + '</span><b>' + num(V.load.load1).toFixed(2) + '</b></div><div class="bar"><div class="g-pink" style="width:' + clamp(loadPct(V), 0, 100) + '%"></div></div></div></div>' +
      compactProbes(n) +
      '<div class="cm-net"><div class="cm-line"><span class="rx">' + icon('arrow-down') + speed(net.down) + '</span><span class="tx">' + icon('arrow-up') + speed(net.up) + '</span></div>' +
      (T.compactShowTrafficTotal ? '<div class="cm-line">' : '') +
      (T.compactShowTrafficTotal ? (function () { var tr = trafficOf(n), lim = num(n.traffic_limit); var bt = lim > 0 ? String(n.traffic_limit_type || 'max').toLowerCase() : 'sum'; return '<span class="muted" title="' + esc(resetTitle(tr)) + '">' + (BILL_LABEL[bt] ? BILL_LABEL[bt][0] : 'MAX') + ' ' + (tr.approx || tr.pending ? '≈' : '') + bytesPrecise(trafficUsedBy(bt, tr)) + (lim > 0 ? ' / ' + bytesTotal(lim) + ' · ' + Math.round(pct(trafficUsedBy(bt, tr), lim)) + '%' : '') + (T.showResetCountdown && tr.cyc ? ' · ↻' + tr.cyc.daysLeft + 'd' : '') + '</span>'; })() : '') +
      (T.compactShowTrafficTotal ? '</div>' : '') + '</div></div>';
    return h + footerHTML(n, { noTags: true, noBilling: !T.compactShowBilling });
  }

  var cardCache = {};
  function renderGrid() {
    var grid = $('#grid'); if (!grid) return;
    var nodes = visibleNodes();
    syncViewToggle();
    if (!nodes.length) {
      grid.dataset.order = '';
      setHTML(grid, '<div class="empty-state">' + (S.nodes.length ? _t('No nodes match the current filters', '没有符合筛选条件的节点') : _t('No nodes yet', '暂无节点')) + '</div>');
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
          var g = (n.group || '').trim() || _t('Ungrouped', '未分组');
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
      el.setAttribute('aria-label', _t('Inspect ', '查看 ') + n.name + ': ' + (on ? _t('Online', '在线') : _t('Offline', '离线')));
      var html = S.view === 'compact' ? compactHTML(n) : cardHTML(n);
      if (cardCache[n.uuid] !== html) { patchHTML(el, html); cardCache[n.uuid] = html; }
    });
    fitProbeBars(grid);
  }
  // the 20 probe cells get whole device pixels each (fitProbeBars picks cell + gap so the row stays full width);
  // fractional widths made some cells look thicker than others
  function fitProbeBars(root) {
    var dpr = window.devicePixelRatio || 1, minGap = dpr >= 2 ? 3 : 2;
    (root || document).querySelectorAll('.probe-bars').forEach(function (el) {
      var W = Math.floor(el.getBoundingClientRect().width * dpr), cells = el.children, n = cells.length;
      if (!W || n < 2) return;
      // identical cell width in device pixels; the remainder is spread over the gaps (±1 device px, invisible)
      var mg = minGap, c = Math.floor((W - (n - 1) * mg) / n);
      while (c < 3 * Math.ceil(dpr / 2) && mg > 1) { mg--; c = Math.floor((W - (n - 1) * mg) / n); } // narrow cards: thinner gaps first
      c = Math.max(1, c);
      var G = W - n * c, base = Math.floor(G / (n - 1)), extra = G - base * (n - 1);
      var key = W + ':' + c;
      if (el._fit === key && cells[0].style.width) return;
      el._fit = key;
      for (var i = 0; i < n; i++) {
        var g = i ? base + (Math.floor(i * extra / (n - 1)) - Math.floor((i - 1) * extra / (n - 1))) : 0;
        cells[i].style.width = c / dpr + 'px';
        cells[i].style.marginLeft = g / dpr + 'px';
      }
    });
  }
  window.addEventListener('resize', function () { fitProbeBars(); });
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
    $('.label', el).textContent = state === 'live' ? _t('Live Stream', '实时连接') : state === 'offline' ? _t('Reconnecting', '重新连接') : _t('Connecting', '连接中');
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
      Object.keys(S.live).forEach(function (u) {
        var nw = S.live[u] && S.live[u].network; if (!nw) return;
        var h = S.speedHist[u] || (S.speedHist[u] = { up: [], down: [] });
        h.up.push(num(nw.up)); h.down.push(num(nw.down));
        if (h.up.length > TRAIL_N) { h.up.shift(); h.down.shift(); }
      });
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
  var HIST_RANGES = RANGES.concat([[720, '30d']]); // load / network history also offers 30 days
  function axisTime(t, hours) {
    var d = new Date(t);
    if (hours <= 24) return clock12(d);
    return (S.lang === 'zh' ? (d.getMonth() + 1) + '/' + d.getDate() : MON[d.getMonth()] + ' ' + pad2(d.getDate())) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  var METRICS = [['cpu', 'cpu', 'CPU'], ['memory', 'memory', '内存'], ['network', 'network', '网络'], ['load', 'load', '负载'], ['storage', 'Storage', '硬盘']];
  var SERIES_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626'];
  var SERIES_DASH = ['', '6 3', '2 3', '8 3 2 3', '1 2', '10 4', '4 4', '12 3 3 3'];

  function openModal(uuid) {
    var n = S.byId[uuid]; if (!n) return;
    S.modal = { uuid: uuid, metric: 'cpu', range: 1, prange: 1, records: null, probe: null, hover: null, phover: null, hiddenSeries: {}, loading: true,
      lossLines: S.T.showLossLines, connectGaps: S.T.connectGapsDefault, smooth: S.T.smoothProbesDefault, pmode: 'latency' };
    var dlg = $('#modal');
    dlg.innerHTML =
      '<div class="modal-in"><header class="modal-head monitor-surface-primary" id="modal-head"></header>' +
      '<div class="modal-body">' +
        '<section class="history monitor-surface-secondary" aria-busy="true" id="history"></section>' +
        '<section class="latency-probe-chart stack-3" id="probes" aria-labelledby="probe-h"></section>' +
        '<section class="stack-3"><div class="section-h"><h3>' + _t('Incident &amp; Heartbeat Log', '事件与心跳日志') + '</h3></div><div id="incident"></div></section>' +
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
        '<div class="modal-title-row"><h2 id="modal-title">' + esc(n.name) + '</h2><span class="status-dot' + (on ? '' : ' off') + '" aria-label="' + (on ? _t('Online', '在线') : _t('Offline', '离线')) + '"></span></div>' +
        '<p class="modal-sub">' + parts.join(' · ') + '</p>' +
      '</div></div>' +
      '<button type="button" data-close aria-label="' + _t('Close node details', '关闭节点详情') + '" class="modal-close monitor-control monitor-hover">' + icon('x') + '</button>');
  }
  function renderIncident() {
    var n = S.byId[S.modal.uuid], html = '';
    if (n && n.public_remark) html += '<div class="remark monitor-surface-secondary" style="margin-bottom:12px">' + esc(n.public_remark) + '</div>';
    html += '<p class="log-empty monitor-surface-secondary">' + (isOnline(S.modal.uuid) ? _t('No public alert events', '暂无公开告警事件') : _t('Node is currently offline — last report ', '节点当前离线 — 最后上报 ') + lastSeen(S.modal.uuid)) + '</p>';
    setHTML($('#incident'), html);
  }
  function lastSeen(uuid) { var r = rep(uuid), unk = _t('unknown', '未知'); if (!r || !r.updated_at) return unk; var d = new Date(r.updated_at); return isNaN(d) ? unk : dateTime(d); }

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
    if (metric === 'memory') return { title: _t('MEMORY', '内存'), series: [{ id: 'memory', color: accent, get: function (r) { return pct(r.ram, r.ramT); } }], min: 0, max: 100, fmt: fmtPct, axis: pctAxis };
    if (metric === 'storage') return { title: _t('STORAGE', '硬盘'), series: [{ id: 'storage', color: '#f59e0b', get: function (r) { return pct(r.disk, r.diskT); } }], min: 0, max: 100, fmt: fmtPct, axis: pctAxis };
    if (metric === 'load') {
      var lm = 0; recs.forEach(function (r) { lm = Math.max(lm, r.load); });
      return { title: _t('LOAD', '负载'), legend: [['1m', '#3b82f6']], series: [{ id: 'load1', color: '#3b82f6', get: function (r) { return r.load; } }], min: 0, max: Math.max(lm * 1.15, 0.05), fmt: function (v) { return '1m ' + v.toFixed(2); }, axis: function (v) { return v.toFixed(2); } };
    }
    var nm = 0; recs.forEach(function (r) { nm = Math.max(nm, r.rx, r.tx); });
    var nmax = Math.max(nm * 1.1, 1024);
    return { title: _t('NETWORK', '网络'), mirrored: true, legend: [['RX', '#3b82f6'], ['TX', '#10b981']],
      series: [{ id: 'rx_rate', color: '#3b82f6', get: function (r) { return r.rx; } }, { id: 'tx_rate', color: '#10b981', get: function (r) { return -r.tx; } }],
      min: -nmax, max: nmax, fmt: null, axis: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + speed(Math.abs(v)); } };
  }

  function renderModalCharts() {
    var m = S.modal; if (!m) return;
    var box = $('#history'); if (!box) return;
    box.setAttribute('aria-busy', String(!!m.loading));
    var recs = m.records || [], def = metricDef(m.metric, recs);
    var top = '<div class="history-bar monitor-divider"><div class="seg" role="group" aria-label="' + _t('Historical metric', '历史指标') + '">' +
        METRICS.map(function (x) { return '<button type="button" data-metric="' + x[0] + '" aria-pressed="' + (m.metric === x[0]) + '">' + _t(x[1], x[2]) + '</button>'; }).join('') +
      '</div><div class="range" role="group" aria-label="' + _t('History range', '时间范围') + '">' +
        HIST_RANGES.map(function (h) { return '<button type="button" data-range="' + h[0] + '" aria-pressed="' + (m.range === h[0]) + '">' + h[1] + '</button>'; }).join('') +
      '</div></div>';
    var body = m.loading && !recs.length ? '<div class="chart-empty">' + _t('Loading telemetry…', '正在加载数据…') + '</div>' : !recs.length ? '<div class="chart-empty">' + _t('No history recorded for this range', '该时间范围内没有记录') + '</div>' : null;
    var idx = m.hover == null ? recs.length - 1 : m.hover;
    var readout = recs.length ? readoutText(def, recs[idx], m.metric) : '—';
    box.innerHTML = top + '<div class="chart-block"><div class="chart-top"><span class="t">' + icon('zap') + esc(def.title) + _t(' Performance Horizon', ' 历史走势') + '</span>' +
      '<output class="chart-readout" id="hist-out">' + esc(readout) + '</output></div>' +
      '<div class="history-chart-viewport monitor-surface-tertiary" id="hist-vp">' + (body || '') + '</div>' +
      '<div class="chart-foot"><span>' + (recs.length ? axisTime(recs[0].t, m.range) : '') + '</span><span>' + _t('Interactive Telemetry · ', '交互图表 · ') + (m.range > 1 ? _t('Averaged buckets · ', '分段平均 · ') : '') + _t('Hover or use arrow keys', '悬停或使用方向键查看') + '</span><span>' + (recs.length ? axisTime(recs[recs.length - 1].t, m.range) : '') + '</span></div>' +
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
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' + esc(_t(def.title.toLowerCase() + ' history chart. Use arrow keys to inspect samples.', def.title + '历史图表，可用方向键查看采样点。')) + '" aria-describedby="hist-out" id="hist-svg"><defs>';
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
      var raw = {}, loss = {}, stats = {}, lossSeries = {};
      (res && res.records || []).forEach(function (r) {
        var t = new Date(r.time).getTime();
        (raw[r.task_id] = raw[r.task_id] || []).push({ t: t, v: r.value });
        // loss markers come from the raw samples, independent of the latency downsampling
        if (r.value < 0) (loss[r.task_id] = loss[r.task_id] || []).push(t);
      });
      // loss rate over time: the range cut into equal buckets
      var nB = h <= 1 ? 30 : 48, end = Date.now(), span = h * 3600e3 / nB, start = end - h * 3600e3;
      var by = {};
      Object.keys(raw).forEach(function (k) {
        var arr = raw[k].sort(function (x, y) { return x.t - y.t; }), lost = 0, last = null, bk = [];
        for (var i = 0; i < nB; i++) bk.push({ n: 0, lost: 0 });
        arr.forEach(function (p) {
          if (p.v < 0) lost++; else last = p.v;
          var j = Math.floor((p.t - start) / span); if (j < 0 || j >= nB) return;
          bk[j].n++; if (p.v < 0) bk[j].lost++;
        });
        stats[k] = { total: arr.length, lost: lost, loss: arr.length ? lost / arr.length * 100 : null, last: last };
        lossSeries[k] = bk.map(function (x, i) { return { t: start + (i + 0.5) * span, v: x.n ? x.lost / x.n * 100 : null }; });
        by[k] = downsampleProbe(arr, h > 24 ? 600 : 400);
      });
      S.modal.probe = { by: by, loss: loss, stats: stats, lossSeries: lossSeries, tasks: (res && res.tasks) || [] };
      S.modal.ploading = false;
      renderProbeChart();
    }).catch(function () { if (S.modal) { S.modal.probe = { by: {}, loss: {}, stats: {}, lossSeries: {}, tasks: [] }; S.modal.ploading = false; renderProbeChart(); } });
  }
  // "peak shaving": rolling median over 5 successful samples; lost samples stay where they are
  function smoothSeries(data) {
    var ok = data.filter(function (p) { return p.v >= 0; }).map(function (p) { return p.v; }), j = 0;
    return data.map(function (p) {
      if (p.v < 0) return p;
      var w = ok.slice(Math.max(0, j - 2), j + 3).slice().sort(function (x, y) { return x - y; }); j++;
      return { t: p.t, v: w[Math.floor(w.length / 2)] };
    });
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
        known.push({ id: Number(id), name: t ? t.name : _t('Task ', '任务 ') + id, type: t ? t.type : '' }); ids[id] = true;
      }
    });
    return known;
  }

  function renderProbeChart() {
    var m = S.modal; if (!m) return;
    var box = $('#probes'); if (!box) return;
    var P = m.probe || {}, tasks = probeTaskList(), lossMode = m.pmode === 'loss';
    var by = P.by || {}, lossBy = P.loss || {}, stats = P.stats || {}, lossSeries = P.lossSeries || {};
    var tg = function (key, label, title) { return '<button type="button" class="obtn' + (m[key] ? ' sel' : '') + '" data-ptoggle="' + key + '" aria-pressed="' + !!m[key] + '" title="' + title + '">' + label + '</button>'; };
    var html = '<div class="section-h"><h3 id="probe-h">' + _t('Latency Probes', '延迟探测') + '</h3><div class="probe-tools" role="group" aria-label="' + _t('Probe chart options', '延迟图选项') + '">' +
      '<div class="seg pmode" role="group" aria-label="' + _t('Chart', '图表') + '">' +
        '<button type="button" data-pmode="latency" aria-pressed="' + !lossMode + '">' + _t('Latency', '延迟') + '</button>' +
        '<button type="button" data-pmode="loss" aria-pressed="' + lossMode + '">' + _t('Loss rate', '丢包率') + '</button></div>' +
      '<span class="probe-tools-sep" aria-hidden="true"></span>' +
      (lossMode ? '' : tg('smooth', _t('Smooth peaks', '削峰平滑'), _t('Rolling median over 5 samples: hides single spikes', '5 点滑动中位数，削去孤立的尖峰'))) +
      tg('connectGaps', _t('Connect gaps', '断点连线'), _t('Off: show breaks at outages / lost probes. On: bridge the gaps — loss lines are still drawn.', '关闭：如实显示中断 / 丢包断点；开启：跨过空缺连线，丢包虚线仍保留。')) +
      (lossMode ? '' : tg('lossLines', _t('Loss lines', '丢包虚线'), _t('Draw a dashed vertical line at every lost probe, coloured by task', '在每次丢包处画一条与任务同色的竖向虚线'))) +
      '<span class="probe-tools-sep" aria-hidden="true"></span>' +
      RANGES.map(function (h) { return '<button type="button" class="obtn' + (m.prange === h[0] ? ' sel' : '') + '" data-prange="' + h[0] + '" aria-pressed="' + (m.prange === h[0]) + '">' + h[1] + '</button>'; }).join('') +
      '</div></div>';
    if (!tasks.length) { box.innerHTML = html + '<p class="log-empty monitor-surface-secondary">' + _t('No latency probes assigned to this node', '该节点没有分配延迟探测任务') + '</p>'; return; }
    html += '<div class="probe-panel monitor-surface-secondary"><div class="probe-series" role="group" aria-label="' + _t('Probe series', '探测任务') + '">' +
      tasks.map(function (t, i) {
        var hidden = !!m.hiddenSeries[t.id], st = stats[t.id] || {};
        return '<button type="button" class="obtn series" data-series="' + t.id + '" aria-label="' + esc(t.name) + '" aria-pressed="' + !hidden + '" title="' + esc((t.type || 'icmp').toUpperCase() + ' · ' + (t.interval ? t.interval + 's' : _t('Auto', '自动')) + (st.total ? ' · ' + _t(st.lost + ' lost of ' + st.total, st.total + ' 次中丢包 ' + st.lost + ' 次') : '')) + '">' +
          '<span class="sdot" style="background:' + SERIES_COLORS[i % SERIES_COLORS.length] + '"></span><span>' + esc(t.name) + '</span>' +
          '<b class="sv ' + latClass(st.last) + '">' + (st.last == null ? '—' : (Math.round(st.last * 10) / 10).toFixed(1) + ' ms') + '</b>' +
          '<span class="sl ' + lossClass(st.loss) + '">' + (st.loss == null ? '—' : (Math.round(st.loss * 10) / 10).toFixed(1) + '%') + '</span></button>';
      }).join('') + '</div>' +
      '<output class="probe-readout" id="probe-out"></output><div class="probe-chart-viewport" id="probe-vp"></div>' +
      '<div class="probe-foot"><span id="probe-start"></span><span>' + (lossMode ? _t('Loss rate per interval', '分段丢包率') : (m.smooth ? _t('Smoothed · ', '已削峰 · ') : _t('Raw checks · ', '原始检测 · ')) + (m.lossLines && S.T.lossMarkerStyle !== 'cross' ? '┆ ' : '× ') + _t('Packet loss', '丢包')) + _t(' · Hover or use arrow keys', ' · 悬停或使用方向键查看') + '</span><span id="probe-end"></span></div></div>';
    box.innerHTML = html;

    var vp = $('#probe-vp');
    var series = tasks.map(function (t, i) {
      var data = lossMode ? (lossSeries[t.id] || []) : (by[t.id] || []);
      if (!lossMode && m.smooth) data = smoothSeries(data);
      return { t: t, i: i, color: SERIES_COLORS[i % SERIES_COLORS.length], dash: SERIES_DASH[i % SERIES_DASH.length], data: data, loss: lossBy[t.id] || [] };
    }).filter(function (s) { return !m.hiddenSeries[s.t.id]; });
    var all = [];
    series.forEach(function (s) { s.data.forEach(function (p) { if (p.v != null) all.push(p); }); });
    if (m.ploading && !all.length) { vp.innerHTML = '<div class="chart-empty" style="height:192px">' + _t('Loading probes…', '正在加载探测数据…') + '</div>'; return; }
    if (!all.length) { vp.innerHTML = '<div class="chart-empty" style="height:192px">' + _t('No probe samples for this range', '该时间范围内没有探测数据') + '</div>'; $('#probe-out').textContent = ''; return; }

    var t0 = Infinity, t1 = -Infinity, vmax = 0;
    all.forEach(function (p) { t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); if (p.v > vmax) vmax = p.v; });
    if (t1 === t0) t1 = t0 + 1;
    vmax = lossMode ? Math.min(100, Math.max(5, Math.ceil(vmax / 5) * 5)) : Math.max(1, Math.ceil(vmax));
    var W = Math.max(320, Math.round(vp.clientWidth)), H = 190, L = 52, R = W - 12, T = 16, B = 166;
    var xs = function (t) { return L + (t - t0) / (t1 - t0) * (R - L); };
    var ys = function (v) { return B - clamp(v, 0, vmax) / vmax * (B - T); };
    var style = S.T.lossMarkerStyle, showLines = !lossMode && m.lossLines && style !== 'cross', showCross = !lossMode && (!m.lossLines || style !== 'line');
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" tabindex="0" aria-label="' + (lossMode ? _t('Packet loss rate over time. Use left and right arrows to inspect.', '丢包率走势，可用左右方向键查看。') : _t('Latency probe history in milliseconds. Use left and right arrows, Home or End to inspect samples.', '延迟探测历史（毫秒），可用左右方向键、Home 或 End 查看采样点。')) + '" aria-describedby="probe-out" id="probe-svg">';
    for (var i = 0; i <= 4; i++) {
      var y = B - (B - T) * i / 4, lab = vmax * i / 4;
      s += '<g><line x1="' + L + '" x2="' + R + '" y1="' + y + '" y2="' + y + '" class="svg-grid"' + (i ? ' stroke-dasharray="3 3"' : '') + '/><text x="' + (L - 8) + '" y="' + (y + 3) + '" text-anchor="end" class="svg-label">' + (lossMode ? (lab % 1 ? lab.toFixed(1) : lab) + '%' : Math.round(lab)) + '</text></g>';
    }
    if (!lossMode) s += '<text x="6" y="10" class="svg-label">ms</text>';

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
          s += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + B + '" stroke="' + se.color + '" stroke-width="1" stroke-dasharray="4 ' + (8 * list.length - 4) + '" stroke-dashoffset="' + (-j * 8) + '"><title>' + esc(se.t.name) + ' · ' + _t('packet loss', '丢包') + '</title></line>';
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
        if (p.v == null) { if (!m.connectGaps) pen = false; return; } // loss-rate bucket without samples
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
    $('#probe-start').textContent = m.prange > 24 ? axisTime(t0, m.prange) : clock12(new Date(t0), true);
    $('#probe-end').textContent = m.prange > 24 ? axisTime(t1, m.prange) : clock12(new Date(t1), true);

    var dense = series.reduce(function (a, b) { return b.data.length > a.data.length ? b : a; }, series[0]).data;
    function readAt(t) {
      var parts = series.map(function (se) {
        var best = null, bd = Infinity;
        se.data.forEach(function (p) { var dd = Math.abs(p.t - t); if (dd < bd) { bd = dd; best = p; } });
        if (!best) return null;
        if (lossMode) return esc(se.t.name) + ': ' + (best.v == null ? '—' : '<span class="' + lossClass(best.v) + '">' + (Math.round(best.v * 10) / 10).toFixed(1) + '%</span>');
        return esc(se.t.name) + ': ' + (best.v < 0 ? '<span class="lat-bad">' + _t('loss', '丢包') + '</span>' : (Math.round(best.v * 10) / 10).toFixed(1) + ' ms');
      }).filter(Boolean);
      return dateTime(new Date(t)) + ' · ' + parts.join(' · ');
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
      '<div class="banner monitor-surface-primary">' + _t('This status page is private.', '此状态页未公开。') + '<br><br><a class="control-room" style="display:inline-flex" href="/admin">' + _t('Admin Login', '后台登录') + icon('arrow-right') + '</a></div></div></main></div>';
  }
  function setNodes(list) {
    S.allNodes = (list || []).slice().sort(function (a, b) { return num(a.weight) - num(b.weight) || String(a.name).localeCompare(String(b.name)); });
    S.nodes = S.allNodes.filter(function (n) { return !matchesList(n, S.T.hiddenNodes); });
    S.byId = {}; S.allNodes.forEach(function (n) { S.byId[n.uuid] = n; });
  }

  function openManage() {
    var page = $('#page');
    if (!S.me.logged_in) {
      page.innerHTML = '<div class="container" style="padding-top:64px"><div class="banner monitor-surface-primary">' + _t('Theme settings are for administrators only. Please log in first.', '主题设置仅管理员可用，请先登录。') + '<br><br><a class="control-room" style="display:inline-flex" href="/admin">' + _t('Admin Login', '后台登录') + icon('arrow-right') + '</a></div></div>';
      return;
    }
    var sc = document.createElement('script');
    sc.src = '/assets/manage.js?v=1.9.1';
    sc.onload = function () { window.KHorizonManage(page, KC); };
    sc.onerror = function () { page.innerHTML = '<div class="container"><div class="banner monitor-surface-primary">' + _t('Could not load manage.js', '无法加载 manage.js') + '</div></div>'; };
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
    cycleWith: function (T, n) { var keep = S.T; S.T = T; try { return cycleBounds(resetDayFor(n), Date.now(), tzFor(n)); } finally { S.T = keep; } },
    tzLabel: tzLabel, cycleYMD: cycleYMD,
    loadTrafficWith: function (T, n) { var keep = S.T; S.T = T; var p = loadTrafficFor(n, true); S.T = keep; return p; },
    liveTotals: function (uuid) { var r = rep(uuid); return r && r.network ? { up: num(r.network.totalUp), down: num(r.network.totalDown) } : null; },
    bytesPrecise: bytesPrecise, dateYMD: dateYMD, dateTime: dateTime,
    // language + fonts
    _t: _t, lang: function () { return S.lang; }, setLang: function (l) { setLang(l); }, onLang: null,
    FONT_SANS: FONT_SANS, FONT_MONO: FONT_MONO, applyFonts: function (T) { applyFonts(T, false); }, applyFavicon: function (T) { applyFavicon(T, false); }
  };

  // switch the UI language in place (header, dashboard or settings page, open modal)
  function setLang(l) {
    if (l !== 'zh' && l !== 'en') return;
    S.lang = l; lsSet(LANG_KEY, l); applyLangAttr();
    var header = $('.monitor-header');
    if (header) { header.innerHTML = headerInner(); $('.monitor-app').style.setProperty('--monitor-header-height', header.offsetHeight + 'px'); }
    if (new URLSearchParams(location.search).get('view') === 'theme-manage') { if (KC.onLang) KC.onLang(); return; }
    var page = $('#page');
    if (page && $('#grid')) {
      var reopen = S.modal && S.modal.uuid;
      if (reopen) $('#modal').close();
      page.innerHTML = dashboardMarkup(); cardCache = {};
      renderAll();
      if (reopen) openModal(reopen);
    }
  }

  function boot() {
    Promise.all([api.settings().catch(function (e) { if (e.status) throw e; return {}; }), api.me()]).then(function (res) {
      S.settings = res[0] || {};
      S.raw = S.settings.theme_settings || {};
      S.T = normalizeSettings(S.raw);
      S.me = res[1] || { logged_in: false };
      S.lang = pickLang(); applyLangAttr();
      applyFonts(S.T, true); applyFavicon(S.T, true);
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
      else $('#root').innerHTML = '<div class="monitor-app"><main class="monitor-page"><div class="container"><div class="banner monitor-surface-primary">' + _t('Failed to load dashboard data. ', '加载数据失败：') + esc(e && e.message) + '</div></div></main></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
