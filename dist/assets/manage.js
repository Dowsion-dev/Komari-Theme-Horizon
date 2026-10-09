/*!
 * Horizon — theme settings page (/?view=theme-manage), admin only.
 * Layout and option set follow Komari-Theme-LuminaPlus' 主题管理 page; values are saved with
 * POST /api/admin/theme/settings?theme=<short> and read back from /api/public → theme_settings.
 */
(function () {
  'use strict';

  window.KHorizonManage = function (page, KC) {
    var S = KC.S, esc = KC.esc, icon = KC.icon;
    var theme = (S.settings && S.settings.theme) || 'horizon';
    var saved = KC.normalizeSettings(S.raw);
    var D = clone(saved);
    var ui = { msg: '', err: '', saving: false, nodeQuery: '', nodesOpen: false, importText: '', trafficQuery: '', cal: {} };
    var GiB = 1024 * 1024 * 1024;

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function groups() {
      var set = {};
      S.allNodes.forEach(function (n) { var g = (n.group || '').trim(); if (g) set[g] = true; });
      var all = Object.keys(set);
      var ordered = D.groupOrder.filter(function (g) { return set[g]; });
      all.sort().forEach(function (g) { if (ordered.indexOf(g) < 0) ordered.push(g); });
      return ordered;
    }
    function tasksSorted() { return S.pingTasks.slice().sort(function (a, b) { return (a.weight || 0) - (b.weight || 0) || a.id - b.id; }); }
    function overrideCount() { return Object.keys(D.cardProbeNodeTaskIds || {}).filter(function (k) { return KC.toList(D.cardProbeNodeTaskIds[k]).length; }).length; }
    function dirty() { return JSON.stringify(D) !== JSON.stringify(saved); }

    // ---------------- controls ----------------
    function toggle(key, title, desc) {
      return '<label class="m-toggle"><span class="m-tt"><b>' + title + '</b>' + (desc ? '<small>' + desc + '</small>' : '') + '</span>' +
        '<input type="checkbox" data-k="' + key + '"' + (D[key] ? ' checked' : '') + '><span class="m-switch" aria-hidden="true"></span></label>';
    }
    function seg(key, opts) {
      return '<div class="m-seg" role="group">' + opts.map(function (o) {
        return '<button type="button" data-seg="' + key + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(D[key]) === String(o[0])) + '">' + (o[2] ? icon(o[2]) : '') + '<span>' + o[1] + '</span></button>';
      }).join('') + '</div>';
    }
    function field(label, inner, help) {
      return '<div class="m-field"><div class="m-label">' + label + '</div>' + inner + (help ? '<div class="m-help">' + help + '</div>' : '') + '</div>';
    }
    function input(key, placeholder, type, extra) {
      return '<input class="m-input" type="' + (type || 'text') + '" data-k="' + key + '" data-type="' + (type === 'number' ? 'number' : 'text') + '" value="' + esc(D[key]) + '" placeholder="' + esc(placeholder || '') + '"' + (extra || '') + '>';
    }
    function listArea(key, placeholder) {
      return '<textarea class="m-input m-area" data-k="' + key + '" data-type="list" placeholder="' + esc(placeholder || '') + '">' + esc((D[key] || []).join('\n')) + '</textarea>';
    }
    function select(key, opts) {
      return '<select class="m-input" data-k="' + key + '" data-type="text">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(D[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }
    function section(no, kicker, title, desc, body, side) {
      return '<section class="m-card monitor-surface-primary" id="m-' + no + '"><div class="m-card-h"><div><div class="m-kicker"><span>' + no + '</span>' + kicker + '</div><h2>' + title + '</h2><p>' + desc + '</p></div>' + (side ? '<div class="m-side">' + side + '</div>' : '') + '</div>' + body + '</section>';
    }
    function sub(title, desc, body) {
      return '<div class="m-sub monitor-surface-secondary"><div class="m-sub-h"><b>' + title + '</b>' + (desc ? '<small>' + desc + '</small>' : '') + '</div>' + body + '</div>';
    }

    // ---------------- sections ----------------
    function sAppearance() {
      return section('01', '外观', '默认外观与品牌', '为首次访问或尚未手动切换外观的访客设置默认显示模式；访客之后仍可在右上角切换。',
        '<div class="m-grid2">' +
          sub('默认外观', '访客手动切换后以其选择为准。', seg('defaultAppearance', [['light', '浅色', 'sun'], ['system', '跟随系统', 'sun-moon'], ['dark', '深色', 'moon']])) +
          sub('品牌', '', '<div class="m-grid2 tight">' +
            field('站点名旁的标签', input('productLabel', 'MONITOR'), '留空则不显示。') +
            field('节点区标题', input('nodesTitle', 'Cluster Infrastructure Nodes')) +
            field('Logo 图片地址', input('logoUrl', 'https://… 或 /assets/logo.png'), '留空使用默认闪电图标。') +
            '<div class="m-field">' + toggle('showFooter', '显示页脚', '底部 “Powered by Komari Monitor”。') + '</div>' +
          '</div>') +
        '</div>');
    }
    function sView() {
      var opts = [['standard', '标准卡片', 'layout-grid'], ['compact', '小卡片', 'rows-3']];
      return section('02', '视图', '默认卡片视图', '分别设置桌面端与移动端的默认卡片尺寸；首页节点标题旁的按钮只临时切换当前设备的显示。',
        '<div class="m-grid3">' +
          sub('桌面端默认', '适用于宽度大于 720px 的浏览器窗口。', seg('desktopView', opts)) +
          sub('移动端默认', '适用于宽度小于等于 720px 的手机或窄屏窗口。', seg('mobileView', opts)) +
          sub('卡片密度', '紧凑与参考站一致；舒适会加大卡片内边距。', seg('cardDensity', [['dense', '紧凑'], ['comfortable', '舒适']])) +
        '</div>', icon('layout-grid'));
    }
    function sBackground() {
      var video = D.backgroundMediaType === 'video';
      return section('03', '背景', '背景与透明度', '为站点设置自定义背景图或桌面视频，并调节卡片不透明度。',
        '<div class="m-grid2">' +
          toggle('enableBackground', '启用自定义背景', '关闭后不加载任何背景图或视频（下方地址会保留），站点回到纯色主题。') +
          toggle('enableAmbientEffect', '启用背景动效', '默认关闭；开启后轻量渲染所选氛围效果，不影响点击和滚动。') +
        '</div>' +
        (D.enableAmbientEffect ? field('动效选择', seg('ambientEffect', [['sakura', '樱花飘落'], ['rain', '细雨'], ['snow', '缓雪'], ['leaves', '秋叶飘落'], ['confetti', '庆典彩纸'], ['fireworks', '烟花']]), '移动端自动减少粒子数量；系统开启“减少动态效果”时不播放。') : '') +
        field('桌面端背景类型', seg('backgroundMediaType', [['image', '图片', 'image'], ['video', '视频', 'monitor']])) +
        '<div class="m-grid2">' +
          field('桌面端背景图', input('backgroundImage', 'https://example.com/bg.jpg'), '留空则不显示背景图；可用 <code>浅色图|深色图</code> 分别设置两种外观。' + (video ? '视频模式下作为封面与回退图。' : '')) +
          field('移动端背景图', input('backgroundImageMobile', '留空则沿用桌面端背景图'), '屏宽不超过 720px 时生效；同样支持 <code>浅色图|深色图</code>。') +
          (video ? field('浅色模式视频', input('backgroundVideo', '/assets/my-background.mp4'), '推荐 MP4（H.264、无音轨、短循环）。仅在宽屏、非触摸设备且未开启省流量/减少动效时加载。') +
            field('深色模式视频（可选）', input('backgroundVideoDark', '留空则沿用浅色模式视频')) : '') +
        '</div>' +
        '<div class="m-grid3">' +
          field('缩放方式', seg('backgroundFit', [['cover', '填满'], ['contain', '完整'], ['auto', '原始']])) +
          field('对齐位置', seg('backgroundAlign', [['top', '顶部'], ['center', '居中'], ['bottom', '底部']])) +
          field('卡片不透明度', '<div class="m-range"><input type="range" min="0" max="100" step="1" data-k="surfaceOpacity" data-type="number" value="' + D.surfaceOpacity + '"><input class="m-input m-num" type="number" min="0" max="100" data-k="surfaceOpacity" data-type="number" value="' + D.surfaceOpacity + '"><span>%</span></div>',
            '100 = 完全不透明（与默认一致），数值越低卡片越通透。低于 95 时自动叠加可读性遮罩。需先设置自定义背景才会生效。') +
        '</div>', icon('image'));
    }
    function sHome() {
      var gs = groups();
      var sortOpts = KC.SORT_FIELDS.map(function (f) { return [f[0], { default: '默认（权重）', name: '名称', region: '地区', cpu: 'CPU', memory: '内存', disk: '硬盘', netRate: '实时速率', traffic: '累计流量', uptime: '在线时长', price: '价格（月均）', expiry: '到期时间' }[f[0]]]; });
      var preset = KC.RATING_PRESETS[D.ratingStyle] || KC.RATING_PRESETS.general;
      return section('04', '首页', '首页巡检', '控制首页顶部总览、筛选栏和节点排序方式；适合节点较多时快速查看状态。',
        '<div class="m-grid2">' +
          '<div class="m-toggle-wrap">' + toggle('enableHeaderAutoHide', '定时隐藏顶部信息', '首页加载完成后隐藏顶部栏（站点名与右上角按钮）；刷新页面后重新显示。') +
            (D.enableHeaderAutoHide ? '<div class="m-inline">显示时长 ' + input('headerVisibleSeconds', '10', 'number', ' min="1" max="3600" style="width:90px"') + ' 秒 <small>可设置 1–3600 秒，默认 10 秒。</small></div>' : '') + '</div>' +
          toggle('showHomeOverview', '显示顶部总览', '展示集群状态、CPU、内存、硬盘、流量、速率与剩余价值。') +
          toggle('showGroupFilter', '显示分组筛选', '根据后台节点分组生成筛选按钮。') +
          toggle('showRegionFilter', '显示地区筛选', '按节点地区生成国旗筛选栏，点击某地区只看该地区节点。') +
          toggle('showCardGroup', '卡片显示分组', '关闭后卡片标题后不再显示分组名（不影响分组筛选栏）。') +
          toggle('groupSections', '按分组分段显示', '节点网格按分组插入小标题，顺序遵循下方“分组排序”。') +
          toggle('enableHomeSort', '启用排序切换', '首页显示排序控件，访客可临时切换排序方式（非默认排序时离线节点置底）。') +
          toggle('hideAdminEntryWhenLoggedOut', '未登录时隐藏后台入口', '仅隐藏访客看到的 “Admin Login”；/admin 仍可直接访问，登录后自动显示。') +
        '</div>' +
        '<div class="m-grid2">' +
          field('默认排序维度', select('homeSortField', sortOpts), '首次访问时的初始排序；访客可临时切换。') +
          field('默认方向', seg('homeSortDirection', [['asc', '升序', 'arrow-up'], ['desc', '降序', 'arrow-down']])) +
        '</div>' +
        '<div class="m-list-h"><span>分组排序</span><small>调整分组筛选与分段的显示顺序；未列出的分组按名称排在后面。</small></div>' +
        (gs.length ? '<ol class="m-order">' + gs.map(function (g, i) {
          return '<li class="monitor-surface-secondary"><span class="m-idx">' + (i + 1) + '</span><span class="m-name">' + esc(g) + '</span>' +
            '<button type="button" class="m-icon" data-move="' + esc(g) + '" data-dir="-1" aria-label="上移 ' + esc(g) + '"' + (i === 0 ? ' disabled' : '') + '>' + icon('chevron-up') + '</button>' +
            '<button type="button" class="m-icon" data-move="' + esc(g) + '" data-dir="1" aria-label="下移 ' + esc(g) + '"' + (i === gs.length - 1 ? ' disabled' : '') + '>' + icon('chevron-down') + '</button></li>';
        }).join('') + '</ol>' : '<div class="m-empty">暂无分组（节点未设置分组时无需排序）</div>') +
        sub('总览评级', '在实时速率、累计流量、剩余价值卡片右下角显示文字评级；名称用英文逗号分隔，只取前四个。',
          '<div class="m-row-end">' + toggle('showOverviewRatings', '启用', '') + '</div>' +
          '<div class="m-grid4">' +
            field('评级风格', seg('ratingStyle', [['general', '通用'], ['cultivation', '修仙']])) +
            field('累计流量评级名称', input('trafficRatingLabels', preset.traffic), '例如: ' + esc(preset.traffic)) +
            field('实时带宽评级名称', input('bandwidthRatingLabels', preset.bandwidth), '例如: ' + esc(preset.bandwidth)) +
            field('资产评级名称', input('assetRatingLabels', preset.asset), '例如: ' + esc(preset.asset)) +
          '</div><div class="m-grid3 tight">' +
            toggle('showTrafficRating', '累计流量', '500G / 2T / 10T 分档') + toggle('showBandwidthRating', '实时带宽', '1 / 10 / 100 Mbps 分档') + toggle('showAssetRating', '资产概览', '¥500 / 1500 / 3000 分档（按汇率折算）') +
          '</div>'), icon('house'));
    }
    function sHidden() {
      return section('05', '隐藏', '隐藏节点', '在此填写的节点会从首页彻底移除：不显示卡片，也不计入在线数、累计流量、实时速率与资产等统计。对所有访客生效，清空即可恢复。',
        field('隐藏列表', listArea('hiddenNodes', '每行一个节点名称 / UUID，也可以用逗号分隔'), '已隐藏 ' + D.hiddenNodes.length + ' 个节点。按名称或 UUID 匹配，大小写不敏感。'), icon('eye-off'));
    }
    function sCards() {
      return section('06', '卡片', '卡片显示项', '分别管理跨卡片视图的信息块，以及小卡片专属的信息密度。',
        '<div class="m-list-h"><span>跨视图设置</span><small>适用于标准卡片与小卡片。</small></div>' +
        '<div class="m-grid2">' +
          toggle('showConnections', '显示连接数（TCP/UDP）', '在标准卡片 Workload 与小卡片底栏展示实时 TCP / UDP 连接数；关闭后 Workload 改显示在线时长。') +
          toggle('showSwap', '显示 Swap 信息块', '关闭后标准卡片只保留网速、流量、负载三个信息块。') +
        '</div>' +
        '<div class="m-list-h"><span>小卡片专属</span><small>控制小卡片底栏的信息密度；实时速率始终显示。</small></div>' +
        '<div class="m-grid3">' +
          toggle('compactShowTrafficTotal', '显示累计流量', '展示入站与出站累计流量。') +
          toggle('compactShowBilling', '显示费用到期', '展示续费价格与剩余天数。') +
          toggle('compactShowUptime', '显示在线时间', '在小卡片右上角展示在线时长。') +
        '</div>', icon('rows-3'));
    }
    function fmtGB(b) { return b ? String(Math.round(b / GiB * 100) / 100) : ''; }
    function sTraffic() {
      var T = KC.normalizeSettings(D), now = Date.now();
      var retentionH = Number(S.settings.record_preserve_time) || 0;
      var dayOpts = [['expiry', '跟随账单到期日'], ['none', '不重置']];
      for (var d = 1; d <= 31; d++) dayOpts.push([String(d), '每月 ' + d + ' 日']);
      var customCount = Object.keys(D.trafficResetDays || {}).length, calibCount = Object.keys(D.trafficCalib || {}).length;
      var q = ui.trafficQuery.toLowerCase();
      var rows = S.allNodes.filter(function (nd) { return !q || [nd.name, nd.uuid, nd.group, KC.regionLabel(nd.region)].join(' ').toLowerCase().indexOf(q) >= 0; }).map(function (nd) {
        var tr = KC.trafficWith(T, nd), cyc = tr.cyc, lim = Number(nd.traffic_limit) || 0;
        var c = (D.trafficCalib || {})[nd.uuid], custom = (D.trafficResetDays || {})[nd.uuid];
        var defDay = KC.resetDayWith(KC.normalizeSettings(Object.assign({}, D, { trafficResetDays: {} })), nd);
        var opts = '<option value="">默认（' + (defDay ? '每月 ' + defDay + ' 日' : '不重置') + '）</option><option value="-1"' + (custom === -1 ? ' selected' : '') + '>不重置</option>';
        for (var k = 1; k <= 31; k++) opts += '<option value="' + k + '"' + (Number(custom) === k ? ' selected' : '') + '>每月 ' + k + ' 日</option>';
        var cal = ui.cal[nd.uuid] || {};
        var usage = (tr.pending ? '<span class="m-dim">计算中…</span> ' : '') + '↓ ' + (tr.approx ? '≈' : '') + KC.bytesPrecise(tr.down) + ' · ↑ ' + (tr.approx ? '≈' : '') + KC.bytesPrecise(tr.up) + (lim > 0 ? ' · 限额 ' + KC.bytesPrecise(lim) + ' (' + esc(nd.traffic_limit_type || 'max') + ')' : '');
        return '<div class="m-traffic monitor-surface-secondary' + (c ? ' is-set' : '') + '">' +
          '<div class="m-node-id">' + KC.flagImg(nd.region) + '<b>' + esc(nd.name) + '</b><small>' + (tr.engine ? '周期统计' : '探针计数') + (cyc ? ' · 下次重置 ' + KC.dateYMD(new Date(cyc.next)) + '（' + (cyc.daysLeft === 0 ? '今天' : cyc.daysLeft + ' 天后') + '）' : ' · 未设置重置日') + '</small></div>' +
          '<div class="m-usage mono">' + usage + (c ? '<div class="m-dim">' + (c.auto ? '自动存档' : '已校准') + '于 ' + esc(new Date(c.at).toLocaleString()) + '：↓ ' + KC.bytesPrecise(c.down) + ' · ↑ ' + KC.bytesPrecise(c.up) + '</div>' : '') + '</div>' +
          '<div class="m-traffic-ctl">' +
            '<label class="m-mini"><span>重置日</span><select class="m-input" data-rday="' + esc(nd.uuid) + '">' + opts + '</select></label>' +
            '<label class="m-mini"><span>已用下行 GB</span><input class="m-input" type="number" min="0" step="0.01" data-cal="' + esc(nd.uuid) + '" data-dir="down" value="' + esc(cal.down != null ? cal.down : '') + '" placeholder="' + esc(fmtGB(tr.down)) + '"></label>' +
            '<label class="m-mini"><span>已用上行 GB</span><input class="m-input" type="number" min="0" step="0.01" data-cal="' + esc(nd.uuid) + '" data-dir="up" value="' + esc(cal.up != null ? cal.up : '') + '" placeholder="' + esc(fmtGB(tr.up)) + '"></label>' +
            '<div class="m-mini-btns"><button type="button" class="m-btn" data-calset="' + esc(nd.uuid) + '" title="以当前时刻为基准，把本周期已用流量设为左侧数值">设定已用</button>' +
            '<button type="button" class="m-btn" data-calzero="' + esc(nd.uuid) + '" title="立即把本周期已用流量清零">重置为 0</button>' +
            (c ? '<button type="button" class="m-icon" data-calclear="' + esc(nd.uuid) + '" title="清除校准，回到自动统计">' + icon('x') + '</button>' : '') + '</div>' +
          '</div></div>';
      }).join('');
      return section('07', '流量', '流量重置日与校准', '按服务器设置每月流量重置日，并可校准本周期已用流量或手动清零。“按重置日统计”会用 Komari 记录的累计计数器逐段累加本周期流量（自动处理重启后计数归零）；校准点会作为新的起算基准，直到下一个重置日。',
        '<div class="m-grid3">' +
          sub('统计模式', '', seg('trafficMode', [['agent', '探针计数'], ['theme', '按重置日统计']]) + '<div class="m-help">' + (D.trafficMode === 'theme' ? '主题按重置日自动开始新周期，适合探针未设置 <code>--month-rotate</code> 的节点。' : '直接显示 Komari 探针上报的累计流量（由探针的 <code>--month-rotate</code> 决定何时归零）；重置日仅用于显示倒计时。已校准的节点在本周期内仍按校准值累加。') + '</div>') +
          sub('默认重置日', '未单独设置的服务器使用此规则。', select('trafficResetDefault', dayOpts) + '<div class="m-inline">时区 UTC ' + input('trafficResetUtcOffset', '8', 'number', ' min="-12" max="14" step="0.5" style="width:80px"') + '<small>所有访客按同一时区计算周期边界。</small></div>') +
          sub('显示', '', toggle('showResetCountdown', '显示重置倒计时', '在卡片标签区显示 “↻ 12d”。')) +
        '</div>' +
        '<div class="m-grid2">' +
          '<div class="m-toggle-wrap">' + toggle('trafficAutoCheckpoint', '管理员访问时自动存档', '登录管理员打开首页时，把各节点当前周期用量写入校准点；适用于 Komari 记录保留时间短于账单周期的情况。') +
            (D.trafficAutoCheckpoint ? '<div class="m-inline">间隔 ' + input('trafficCheckpointHours', '12', 'number', ' min="1" max="168" style="width:80px"') + ' 小时</div>' : '') + '</div>' +
          '<div class="m-note' + (retentionH && retentionH < 31 * 24 && D.trafficMode === 'theme' && !D.trafficAutoCheckpoint ? ' warn' : '') + '">' + icon('triangle-alert') + '<div>当前 Komari 记录保留 <b>' + (retentionH ? Math.round(retentionH / 24 * 10) / 10 + ' 天' : '未知') + '</b>。按重置日统计需要记录覆盖整个周期（最长 31 天），否则只能从最早的记录算起，数值前会显示 “≈”。保留时间不足时请开启“自动存档”，或在后台调大记录保留时间。</div></div>' +
        '</div>' +
        '<div class="m-sub monitor-surface-secondary"><div class="m-sub-h m-sub-flex"><div><b>按服务器设置</b><small>自定义重置日 ' + customCount + ' 台 · 已校准 ' + calibCount + ' 台。校准与重置在点击“保存设置”后对所有访客生效。</small></div>' +
          '<button type="button" class="m-btn" data-act="traffic-refresh">' + icon('rotate-ccw') + '刷新用量</button></div>' +
          '<div class="m-search">' + icon('search') + '<input class="m-input" id="m-traffic-q" placeholder="搜索节点名称 / UUID / 分组 / 地区" value="' + esc(ui.trafficQuery) + '"></div>' +
          '<div class="m-nodes">' + (rows || '<div class="m-empty">没有匹配的节点。</div>') + '</div></div>', icon('activity'));
    }
    function refreshTraffic(nodes) {
      var T = KC.normalizeSettings(D);
      return Promise.all((nodes || S.allNodes).map(function (n) { return KC.loadTrafficWith(T, n); })).then(render);
    }
    function setCalib(uuid, up, down) {
      var map = clone(D.trafficCalib || {}), live = KC.liveTotals(uuid), entry = { at: new Date().toISOString(), up: Math.max(0, Math.round(up)), down: Math.max(0, Math.round(down)) };
      if (live) { entry.cu = live.up; entry.cd = live.down; }
      map[uuid] = entry; D.trafficCalib = map; delete ui.cal[uuid];
      ui.msg = '已更新校准（尚未保存）'; ui.err = '';
      var n = S.allNodes.filter(function (x) { return x.uuid === uuid; });
      render(); refreshTraffic(n);
    }

    function sCost() {
      return section('08', '花费', '服务器花费', '剩余价值卡片按实时汇率折算各节点当前账期的剩余价值；忽略列表中的节点不计入。',
        '<div class="m-grid2"><div class="m-stack">' +
          toggle('showCostsToGuests', '向未登录访客公开费用', '关闭后续费价格、剩余价值与价格排序仅登录管理员可见；到期时间仍正常显示。') +
          toggle('showRemainingValue', '显示剩余价值卡片', '顶部总览中的 Remaining Value。') +
          '<div class="m-grid2 tight">' +
            field('折算货币', select('baseCurrency', [['USD', 'USD 美元'], ['CNY', 'CNY 人民币'], ['EUR', 'EUR 欧元'], ['GBP', 'GBP 英镑'], ['HKD', 'HKD 港币'], ['JPY', 'JPY 日元'], ['SGD', 'SGD 新元']])) +
            field('到期提醒天数', input('expiryWarningDays', '30', 'number', ' min="1" max="365"'), '剩余天数不超过该值时，卡片底部变为琥珀色。') +
          '</div>' +
          field('实时汇率接口', input('costRateApiUrl', 'https://api.frankfurter.dev/v2/rates?base=USD'), '需返回以 USD 为基准的 <code>{"rates":{…}}</code> 或 <code>[{"quote","rate"}]</code>；结果缓存 12 小时，请求失败时使用内置近似汇率。') +
        '</div>' +
        field('忽略计费节点', listArea('costIgnoredNodes', '每行一个节点名称 / UUID，也可以用逗号分隔')) + '</div>', icon('circle-dollar-sign'));
    }
    function taskOptions(selected, list, emptyLabel) {
      return '<option value="">' + emptyLabel + '</option>' + list.map(function (t) {
        return '<option value="' + t.id + '"' + (String(selected) === String(t.id) ? ' selected' : '') + '>' + esc(t.name || ('任务 #' + t.id)) + ' · ' + esc(String(t.type || 'icmp').toUpperCase()) + ' #' + t.id + '</option>';
      }).join('');
    }
    function sLatency() {
      var tasks = tasksSorted(), n = D.probeCount;
      var slots = '';
      for (var i = 0; i < n; i++) {
        slots += '<label class="m-slot"><span>线路 ' + (i + 1) + '</span><select class="m-input" data-slot="' + i + '">' + taskOptions(D.cardProbeTaskIds[i] || '', tasks, '— 未选择 —') + '</select></label>';
      }
      var q = ui.nodeQuery.toLowerCase();
      var nodes = S.allNodes.filter(function (nd) {
        if (!q) return true;
        return [nd.name, nd.uuid, nd.group, KC.regionLabel(nd.region)].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      var nodeRows = nodes.map(function (nd) {
        var assigned = KC.tasksFor(nd.uuid), cur = KC.toList((D.cardProbeNodeTaskIds || {})[nd.uuid]);
        var sel = '';
        for (var k = 0; k < n; k++) sel += '<select class="m-input" data-node="' + esc(nd.uuid) + '" data-nslot="' + k + '"' + (assigned.length ? '' : ' disabled') + '>' + taskOptions(cur[k] || '', assigned, k === 0 ? '跟随全局' : '—') + '</select>';
        return '<div class="m-node monitor-surface-secondary' + (cur.length ? ' is-set' : '') + '"><div class="m-node-id">' + KC.flagImg(nd.region) + '<b>' + esc(nd.name) + '</b><small>' + esc(nd.group || '未设置分组') + ' · ' + assigned.length + ' 个任务</small></div>' +
          '<div class="m-node-sel">' + sel + '</div>' + (cur.length ? '<button type="button" class="m-icon" data-clearnode="' + esc(nd.uuid) + '" title="清除覆盖">' + icon('x') + '</button>' : '<span class="m-icon-ph"></span>') + '</div>';
      }).join('');
      return section('09', '延迟', '主页延迟检测与丢包', '为节点卡片挑选要展示的 Ping 任务：可设置全局默认线路，也可为每台服务器单独覆盖；未配置时展示该节点全部任务中的前 N 个。如果当前还没有可用任务，请先前往 <a href="/admin/ping" target="_blank" rel="noopener">后台 Ping 管理</a> 创建任务。',
        '<div class="m-grid2">' +
          toggle('showProbes', '卡片中显示探针', '标准卡片底部的延迟、失败次数与最近 10 次检测色条。') +
          '<div class="m-grid3 tight">' +
            field('每张卡片最多', input('probeCount', '3', 'number', ' min="1" max="6"'), '1–6 个') +
            field('绿色阈值 (ms)', input('latencyGoodMs', '150', 'number', ' min="1"')) +
            field('琥珀阈值 (ms)', input('latencyWarnMs', '400', 'number', ' min="1"')) +
          '</div>' +
        '</div>' +
        sub('全局默认线路', '按顺序显示在节点卡片中；某节点未分配该任务时自动跳过。全部留空 = 显示该节点的全部任务。', tasks.length ? '<div class="m-slots">' + slots + '</div>' : '<div class="m-empty">当前还没有可用于首页展示的 Ping 任务。</div>') +
        '<div class="m-sub monitor-surface-secondary"><div class="m-sub-h m-sub-flex"><div><b>按服务器覆盖</b><small>已单独配置 ' + overrideCount() + ' / ' + S.allNodes.length + ' 台服务器；第一项选择“跟随全局”即使用全局线路。</small></div>' +
          '<button type="button" class="m-btn" data-act="toggle-nodes">' + icon('sliders-horizontal') + (ui.nodesOpen ? '收起服务器' : '配置服务器探测点') + '</button></div>' +
          (ui.nodesOpen ? '<div class="m-search">' + icon('search') + '<input class="m-input" id="m-node-q" placeholder="搜索节点名称 / UUID / 分组 / 地区" value="' + esc(ui.nodeQuery) + '"></div><div class="m-nodes">' + (nodeRows || '<div class="m-empty">没有匹配的节点。</div>') + '</div>' : '') +
        '</div>' +
        sub('丢包显示', '节点详情的延迟图中，在每次丢包的时间点画一条与任务同色的竖向虚线；同一时刻多个任务丢包时虚线交错显示，互不覆盖。',
          '<div class="m-grid2">' +
            toggle('showLossLines', '默认显示丢包虚线', '访客仍可在图表右上角用 “Loss lines” 临时开关。') +
            toggle('connectGapsDefault', '默认断点连线', '关闭：如实显示中断/丢包断点；开启：跨过空缺连接曲线，丢包虚线仍保留。') +
          '</div><div class="m-grid2">' +
            field('丢包标记样式', seg('lossMarkerStyle', [['line', '竖向虚线'], ['cross', '底部叉号'], ['both', '两者都显示']])) +
            field('虚线不透明度', '<div class="m-range"><input type="range" min="10" max="100" step="5" data-k="lossLineOpacity" data-type="number" value="' + D.lossLineOpacity + '"><input class="m-input m-num" type="number" min="10" max="100" data-k="lossLineOpacity" data-type="number" value="' + D.lossLineOpacity + '"><span>%</span></div>') +
          '</div>' + lossPreview()),
        tasks.length + ' 个任务');
    }
    function lossPreview() {
      // tiny static preview of the dashed-line style using the current options
      var cols = ['#2563eb', '#059669', '#d97706'], W = 560, H = 90, s = '<svg class="m-loss-preview" viewBox="0 0 ' + W + ' ' + H + '" aria-label="丢包虚线预览">';
      for (var g = 1; g <= 3; g++) s += '<line x1="20" x2="' + (W - 10) + '" y1="' + (g * 22) + '" y2="' + (g * 22) + '" class="svg-grid" stroke-dasharray="3 3"/>';
      var showLines = D.lossMarkerStyle !== 'cross', showCross = D.lossMarkerStyle !== 'line';
      var losses = [[0, 150], [1, 150], [2, 330], [0, 420]];
      if (showLines) {
        var byX = {}; losses.forEach(function (l) { (byX[l[1]] = byX[l[1]] || []).push(l[0]); });
        s += '<g opacity="' + (D.lossLineOpacity / 100) + '">';
        Object.keys(byX).forEach(function (x) { var list = byX[x]; list.forEach(function (ci, j) { s += '<line x1="' + x + '" x2="' + x + '" y1="8" y2="74" stroke="' + cols[ci] + '" stroke-dasharray="4 ' + (8 * list.length - 4) + '" stroke-dashoffset="' + (-j * 8) + '"/>'; }); });
        s += '</g>';
      }
      [[60, 30], [58, 48], [64, 26]].forEach(function (base, ci) {
        var d = '', pen = false;
        for (var x = 20; x <= W - 10; x += 10) {
          var lost = losses.some(function (l) { return l[0] === ci && Math.abs(l[1] - x) < 5; });
          if (lost) { if (!D.connectGapsDefault) pen = false; if (showCross) s += '<path d="M ' + (x - 3) + ' 78 l 6 6 m -6 0 l 6 -6" stroke="' + cols[ci] + '" stroke-width="1.5"/>'; continue; }
          var y = base[0] - ci * 14 + Math.sin(x / 23 + ci) * 4;
          d += (pen ? ' L ' : ' M ') + x + ' ' + y.toFixed(1); pen = true;
        }
        s += '<path d="' + d + '" fill="none" stroke="' + cols[ci] + '" stroke-width="2"' + (ci === 1 ? ' stroke-dasharray="6 3"' : ci === 2 ? ' stroke-dasharray="2 3"' : '') + '/>';
      });
      return s + '</svg>';
    }
    function sAdvanced() {
      return section('10', '高级', '刷新与备份', '实时数据刷新频率，以及主题设置的导出 / 导入。',
        '<div class="m-grid2">' +
          field('实时刷新间隔 (ms)', input('refreshIntervalMs', '2000', 'number', ' min="1000" max="60000" step="500"'), '通过 WebSocket 拉取节点状态的间隔，1000–60000。') +
          field('导出 / 导入 JSON', '<textarea class="m-input m-area mono" id="m-import" placeholder="粘贴之前导出的 JSON，然后点击“导入到草稿”">' + esc(ui.importText) + '</textarea>' +
            '<div class="m-btns"><button type="button" class="m-btn" data-act="export">导出当前草稿</button><button type="button" class="m-btn" data-act="import">导入到草稿</button></div>') +
        '</div>', icon('gauge'));
    }

    // ---------------- page ----------------
    function render() {
      var y = window.scrollY;
      var active = document.activeElement && document.activeElement.id;
      page.innerHTML = '<div class="manage-root container">' +
        '<div class="m-masthead"><div><div class="m-kicker big">HORIZON · 主题控制台</div><h1>主题设置</h1><p>集中调整 Horizon 的展示偏好、背景、费用与首页延迟绑定；保存后立即应用到当前站点。</p></div>' +
          '<dl class="m-meta"><div><dt>主题</dt><dd>' + esc(theme) + '</dd></div><div><dt>节点</dt><dd>' + S.allNodes.length + '</dd></div><div><dt>Ping 任务</dt><dd>' + S.pingTasks.length + '</dd></div><div><dt>单独覆盖</dt><dd>' + overrideCount() + ' 台</dd></div></dl></div>' +
        '<nav class="m-toc">' + [['01', '外观'], ['02', '视图'], ['03', '背景'], ['04', '首页'], ['05', '隐藏'], ['06', '卡片'], ['07', '流量'], ['08', '花费'], ['09', '延迟'], ['10', '高级']].map(function (x) { return '<a href="#m-' + x[0] + '"><span>' + x[0] + '</span>' + x[1] + '</a>'; }).join('') + '</nav>' +
        sAppearance() + sView() + sBackground() + sHome() + sHidden() + sCards() + sTraffic() + sCost() + sLatency() + sAdvanced() +
        '<div class="m-savebar monitor-surface-primary"><a href="/" class="m-btn">' + icon('arrow-left') + '返回首页</a>' +
          '<span class="m-status ' + (ui.err ? 'err' : ui.msg ? 'ok' : '') + '">' + esc(ui.err || ui.msg || (dirty() ? '有未保存的修改' : '所有修改已保存')) + '</span>' +
          '<button type="button" class="m-btn" data-act="defaults">恢复默认</button>' +
          '<button type="button" class="m-btn" data-act="reset"' + (dirty() ? '' : ' disabled') + '>' + icon('rotate-ccw') + '重置</button>' +
          '<button type="button" class="m-btn primary" data-act="save"' + (ui.saving ? ' disabled' : '') + '>' + icon('save') + (ui.saving ? '保存中' : '保存设置') + '</button></div>' +
      '</div>';
      window.scrollTo(0, y);
      if (active) { var el = document.getElementById(active); if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } }
    }

    function preview() { KC.applyPreview(KC.normalizeSettings(D)); }
    function setVal(el) {
      var k = el.dataset.k, t = el.dataset.type;
      if (el.type === 'checkbox') D[k] = el.checked;
      else if (t === 'number') { var v = Number(el.value); D[k] = isFinite(v) && el.value !== '' ? v : KC.DEFAULTS[k]; }
      else if (t === 'list') D[k] = KC.toList(el.value);
      else D[k] = el.value;
    }

    page.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'm-node-q') { ui.nodeQuery = el.value; render(); return; }
      if (el.id === 'm-import') { ui.importText = el.value; return; }
      if (el.id === 'm-traffic-q') { ui.trafficQuery = el.value; render(); return; }
      if (el.dataset.cal) { (ui.cal[el.dataset.cal] = ui.cal[el.dataset.cal] || {})[el.dataset.dir] = el.value; return; }
      if (!el.dataset.k) return;
      setVal(el);
      if (el.type === 'range' || el.classList.contains('m-num')) {
        page.querySelectorAll('[data-k="' + el.dataset.k + '"]').forEach(function (o) { if (o !== el) o.value = el.value; });
        if (el.dataset.k === 'lossLineOpacity') { var p = page.querySelector('.m-loss-preview'); if (p) p.outerHTML = lossPreview(); }
      }
      ui.msg = ''; ui.err = '';
      if (/^background|^surface/.test(el.dataset.k)) preview();
      var st = page.querySelector('.m-status'); if (st) { st.className = 'm-status'; st.textContent = dirty() ? '有未保存的修改' : '所有修改已保存'; }
    });
    page.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.slot != null) {
        var ids = D.cardProbeTaskIds.slice(); ids[Number(el.dataset.slot)] = el.value;
        D.cardProbeTaskIds = ids.slice(0, D.probeCount).map(function (x) { return x || ''; });
        while (D.cardProbeTaskIds.length && !D.cardProbeTaskIds[D.cardProbeTaskIds.length - 1]) D.cardProbeTaskIds.pop();
        render(); return;
      }
      if (el.dataset.rday) {
        var rd = clone(D.trafficResetDays || {});
        if (el.value === '') delete rd[el.dataset.rday]; else rd[el.dataset.rday] = Number(el.value);
        D.trafficResetDays = rd; ui.msg = ''; render();
        refreshTraffic(S.allNodes.filter(function (x) { return x.uuid === el.dataset.rday; }));
        return;
      }
      if (el.dataset.node) {
        var map = clone(D.cardProbeNodeTaskIds || {}), cur = KC.toList(map[el.dataset.node]);
        var arr = []; for (var i = 0; i < D.probeCount; i++) arr[i] = cur[i] || '';
        arr[Number(el.dataset.nslot)] = el.value;
        arr = arr.filter(Boolean);
        if (arr.length) map[el.dataset.node] = arr; else delete map[el.dataset.node];
        D.cardProbeNodeTaskIds = map; render(); return;
      }
      if (!el.dataset.k) return;
      setVal(el);
      if (el.dataset.k === 'probeCount') D.probeCount = Math.max(1, Math.min(6, Math.round(D.probeCount) || 3));
      if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.dataset.k === 'probeCount') { if (/Ambient|Background/.test(el.dataset.k)) preview(); render(); }
      if (/^trafficReset/.test(el.dataset.k)) { render(); refreshTraffic(); }
    });
    page.addEventListener('click', function (e) {
      var t = e.target;
      var sg = t.closest('[data-seg]');
      if (sg) {
        var k = sg.dataset.seg, v = sg.dataset.v;
        D[k] = typeof KC.DEFAULTS[k] === 'number' ? Number(v) : v;
        if (k === 'homeSortField') D.homeSortDirection = KC.SORT_NATURAL[v] || 'desc';
        if (/^background|^ambient/.test(k)) preview();
        ui.msg = ''; render();
        if (k === 'trafficMode') refreshTraffic();
        return;
      }
      var mv = t.closest('[data-move]');
      if (mv) {
        var gs = groups(), i = gs.indexOf(mv.dataset.move), j = i + Number(mv.dataset.dir);
        if (i >= 0 && j >= 0 && j < gs.length) { var tmp = gs[i]; gs[i] = gs[j]; gs[j] = tmp; D.groupOrder = gs; render(); }
        return;
      }
      var cs = t.closest('[data-calset]');
      if (cs) {
        var id = cs.dataset.calset, v = ui.cal[id] || {}, nd = S.allNodes.filter(function (x) { return x.uuid === id; })[0];
        var cur = KC.trafficWith(KC.normalizeSettings(D), nd);
        var up = v.up !== undefined && v.up !== '' ? Number(v.up) * GiB : cur.up, down = v.down !== undefined && v.down !== '' ? Number(v.down) * GiB : cur.down;
        if (!isFinite(up) || !isFinite(down) || up < 0 || down < 0) { ui.err = '请输入有效的流量数值（GB）'; render(); return; }
        setCalib(id, up, down); return;
      }
      var cz = t.closest('[data-calzero]');
      if (cz) { setCalib(cz.dataset.calzero, 0, 0); return; }
      var cc = t.closest('[data-calclear]');
      if (cc) { var cm = clone(D.trafficCalib || {}); delete cm[cc.dataset.calclear]; D.trafficCalib = cm; ui.msg = '已清除校准（尚未保存）'; render(); refreshTraffic(S.allNodes.filter(function (x) { return x.uuid === cc.dataset.calclear; })); return; }
      var cn = t.closest('[data-clearnode]');
      if (cn) { var m = clone(D.cardProbeNodeTaskIds || {}); delete m[cn.dataset.clearnode]; D.cardProbeNodeTaskIds = m; render(); return; }
      var act = t.closest('[data-act]');
      if (!act) return;
      var a = act.dataset.act;
      if (a === 'toggle-nodes') { ui.nodesOpen = !ui.nodesOpen; render(); }
      else if (a === 'traffic-refresh') { ui.msg = '正在刷新用量…'; render(); refreshTraffic().then(function () { ui.msg = '用量已刷新'; render(); }); }
      else if (a === 'reset') { D = clone(saved); ui.msg = '已重置为上次保存的设置'; ui.err = ''; preview(); render(); }
      else if (a === 'defaults') { D = KC.normalizeSettings({}); ui.msg = '已载入默认值（尚未保存）'; ui.err = ''; preview(); render(); }
      else if (a === 'export') { ui.importText = JSON.stringify(D, null, 2); render(); var ta = document.getElementById('m-import'); if (ta) { ta.focus(); ta.select(); } }
      else if (a === 'import') {
        try { D = KC.normalizeSettings(JSON.parse(ui.importText)); ui.msg = '已导入到草稿，确认后点击保存'; ui.err = ''; preview(); }
        catch (err) { ui.err = 'JSON 解析失败：' + err.message; }
        render();
      } else if (a === 'save') save();
    });

    function save() {
      ui.saving = true; ui.err = ''; ui.msg = ''; render();
      var payload = {};
      // keep unknown keys from other tools, drop legacy snake_case keys we have migrated
      Object.keys(S.raw || {}).forEach(function (k) { if (!(k in KC.DEFAULTS) && !/^[a-z]+(_[a-z]+)+$/.test(k)) payload[k] = S.raw[k]; });
      var norm = KC.normalizeSettings(D);
      Object.keys(norm).forEach(function (k) { payload[k] = norm[k]; });
      KC.api.saveSettings(theme, payload).then(function () {
        S.raw = payload; saved = clone(norm); D = clone(norm);
        ui.saving = false; ui.msg = '主题设置已保存';
        render();
      }).catch(function (err) {
        ui.saving = false; ui.err = '保存失败：' + (err && err.message || err);
        render();
      });
    }

    setTimeout(function () { refreshTraffic(); }, 2500);
    window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    render();
  };
})();
