/*!
 * Horizon — theme settings page (/?view=theme-manage), admin only.
 * Layout and option set follow Komari-Theme-LuminaPlus' 主题管理 page; values are saved with
 * POST /api/admin/theme/settings?theme=<short> and read back from /api/public → theme_settings.
 * Every visible string goes through Z(chinese, english); the language follows the header switch.
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

    function Z(zh, en) { return KC.lang() === 'en' ? en : zh; }
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
    function statusText() { return dirty() ? Z('有未保存的修改', 'Unsaved changes') : Z('所有修改已保存', 'All changes saved'); }
    function listPh() { return Z('每行一个节点名称 / UUID，也可以用逗号分隔', 'One node name / UUID per line, or comma-separated'); }
    function searchPh() { return Z('搜索节点名称 / UUID / 分组 / 地区', 'Search name / UUID / group / region'); }

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
    function textArea(key, placeholder) {
      return '<textarea class="m-input m-area" data-k="' + key + '" data-type="text" placeholder="' + esc(placeholder || '') + '">' + esc(D[key] || '') + '</textarea>';
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
    var TOC = [['01', '外观', 'Look'], ['02', '视图', 'Views'], ['03', '背景', 'Background'], ['04', '首页', 'Home'], ['05', '隐藏', 'Hidden'], ['06', '卡片', 'Cards'], ['07', '流量', 'Traffic'], ['08', '花费', 'Costs'], ['09', '延迟', 'Latency'], ['10', '高级', 'Advanced']];
    function kicker(no) { var t = TOC[Number(no) - 1]; return Z(t[1], t[2]); }

    function fontOpts(table) {
      var names = { system: Z('系统默认字体', 'System UI'), custom: Z('自定义…', 'Custom…'), sans: Z('与正文相同', 'Same as body') };
      return Object.keys(table).map(function (k) { return [k, (k === 'default' ? table[k].label + Z('（默认）', ' (default)') : names[k] || table[k].label)]; });
    }
    // live sample: the page itself is previewing the draft fonts through --font-sans / --font-mono
    function fontSample(kind) {
      return '<div class="m-font-sample' + (kind === 'mono' ? ' mono' : '') + '">' + (kind === 'mono' ? 'CPU 12.5% · 1.2 GB/s · 0123456789 · 延迟 38 ms' : 'Horizon 集群节点 · Cluster Infrastructure Nodes') + '</div>';
    }
    function sAppearance() {
      var sansCustom = D.fontSans === 'custom', monoCustom = D.fontMono === 'custom';
      return section('01', kicker('01'), Z('默认外观、语言与字体', 'Appearance, language and fonts'), Z('为首次访问或尚未手动切换的访客设置默认外观与语言；访客之后仍可在右上角切换。字体对所有访客生效。', 'Default color scheme and language for first-time visitors (they can still switch in the header). Fonts apply to every visitor.'),
        '<div class="m-grid2">' +
          sub(Z('默认外观', 'Default appearance'), Z('访客手动切换后以其选择为准。', 'A visitor\'s own choice takes precedence.'), seg('defaultAppearance', [['light', Z('浅色', 'Light'), 'sun'], ['system', Z('跟随系统', 'System'), 'sun-moon'], ['dark', Z('深色', 'Dark'), 'moon']])) +
          sub(Z('默认语言', 'Default language'), Z('“自动”按访客浏览器语言选择中文或英文。', '"Auto" picks Chinese or English from the visitor\'s browser language.'),
            seg('defaultLanguage', [['auto', Z('自动', 'Auto'), 'languages'], ['zh', '中文'], ['en', 'English']]) +
            '<div style="margin-top:10px">' + toggle('showLanguageToggle', Z('显示语言切换按钮', 'Show the language switch'), Z('在顶部栏显示“中 / EN”切换；关闭后所有访客固定使用默认语言。', 'Shows "中 / EN" in the header; when off, everyone sees the default language.')) + '</div>') +
        '</div>' +
        sub(Z('字体', 'Fonts'), Z('正文字体用于标题与名称，等宽字体用于数值、标签与图表。中文字符会自动回退到系统中文字体。', 'The body font is used for titles and names, the monospace font for numbers, labels and charts. Chinese characters fall back to the system CJK font.'),
          '<div class="m-grid2">' +
            '<div>' + field(Z('正文字体', 'Body font'), select('fontSans', fontOpts(KC.FONT_SANS))) +
              (sansCustom ? '<div class="m-grid2 tight">' +
                field(Z('字体地址', 'Font URL'), input('fontSansUrl', 'https://…/font.css ' + Z('或', 'or') + ' …/font.woff2'), Z('填写 CSS 样式表地址（如 Google Fonts / jsDelivr），或直接填写 woff2 / woff / ttf / otf 字体文件。', 'A stylesheet URL (e.g. Google Fonts / jsDelivr) or a woff2 / woff / ttf / otf file.')) +
                field(Z('字体名称 (font-family)', 'Font family'), input('fontSansFamily', 'MiSans'), Z('与样式表中声明的名称一致；使用字体文件时可随意命名。', 'Must match the name declared in the stylesheet; any name works for a font file.')) +
              '</div>' : '') + fontSample('sans') + '</div>' +
            '<div>' + field(Z('等宽字体', 'Monospace font'), select('fontMono', fontOpts(KC.FONT_MONO))) +
              (monoCustom ? '<div class="m-grid2 tight">' +
                field(Z('字体地址', 'Font URL'), input('fontMonoUrl', 'https://…/mono.css ' + Z('或', 'or') + ' …/mono.woff2')) +
                field(Z('字体名称 (font-family)', 'Font family'), input('fontMonoFamily', 'Maple Mono')) +
              '</div>' : '') + fontSample('mono') + '</div>' +
          '</div>' +
          '<div class="m-help">' + Z('预设字体：Plus Jakarta Sans、Inter、Noto Sans SC、JetBrains Mono、Fira Code、IBM Plex Mono 来自 Google Fonts；HarmonyOS Sans SC、MiSans、霞鹜文楷来自 jsDelivr。修改后页面立即预览，保存后对所有访客生效。', 'Presets: Plus Jakarta Sans, Inter, Noto Sans SC, JetBrains Mono, Fira Code and IBM Plex Mono load from Google Fonts; HarmonyOS Sans SC, MiSans and LXGW WenKai from jsDelivr. Changes preview immediately and apply to everyone after saving.') + '</div>') +
        sub(Z('品牌', 'Branding'), '', '<div class="m-grid2 tight">' +
          field(Z('站点名旁的标签', 'Label next to the site name'), input('productLabel', 'MONITOR'), Z('留空则不显示。', 'Leave empty to hide.')) +
          field(Z('节点区标题', 'Node section title'), input('nodesTitle', 'Cluster Infrastructure Nodes'), Z('保持默认时会随语言显示为“集群节点”。', 'The default title is translated automatically.')) +
          field(Z('Logo 图片地址', 'Logo image URL'), input('logoUrl', Z('https://… 或 /assets/logo.png', 'https://… or /assets/logo.png')), Z('留空使用默认闪电图标。', 'Leave empty for the default bolt icon.')) +
          field(Z('网页标签图标 (favicon)', 'Browser tab icon (favicon)'), '<div class="m-icon-row">' + input('faviconUrl', Z('https://…/favicon.png 或 /assets/icon.svg', 'https://…/favicon.png or /assets/icon.svg')) + '<img class="m-fav" alt="" src="' + esc(D.faviconUrl || '/favicon.svg') + '"></div>', Z('支持 PNG / SVG / ICO 地址或 data:image URI；留空使用主题默认图标。修改后浏览器标签立即预览。', 'PNG / SVG / ICO URL or a data:image URI; empty = the theme icon. The tab icon previews immediately.')) +
        '</div>') +
        sub(Z('页脚', 'Footer'), Z('可写纯文本或简单 HTML（链接、加粗、图片等，脚本会被过滤）；换行会保留。占位符：<code>{year}</code> 当前年份、<code>{sitename}</code> 站点名。留空显示默认的 “Powered by Komari Monitor”。', 'Plain text or simple HTML (links, bold, images; scripts are stripped); line breaks are kept. Placeholders: <code>{year}</code>, <code>{sitename}</code>. Empty = the default "Powered by Komari Monitor".'),
          '<div class="m-row-end">' + toggle('showFooter', Z('显示页脚', 'Show footer'), '') + '</div>' +
          '<div class="m-grid2">' +
            field(Z('页脚内容', 'Footer content'), textArea('footerContent', '© {year} {sitename} · Powered by <a href="https://github.com/komari-monitor/komari">Komari</a>')) +
            field(Z('英文页脚（可选）', 'English footer (optional)'), textArea('footerContentEn', Z('留空则英文界面也使用左侧内容', 'Empty = same as the main footer')), Z('访客切换到 English 时显示。', 'Shown when the visitor switches to English.')) +
          '</div>'), icon('type'));
    }
    function sView() {
      var opts = [['standard', Z('标准卡片', 'Standard'), 'layout-grid'], ['compact', Z('小卡片', 'Compact'), 'rows-3']];
      return section('02', kicker('02'), Z('默认卡片视图', 'Default card view'), Z('分别设置桌面端与移动端的默认卡片尺寸；首页节点标题旁的按钮只临时切换当前设备的显示。', 'Default card size for desktop and mobile; the buttons next to the node title only switch the current device.'),
        '<div class="m-grid3">' +
          sub(Z('桌面端默认', 'Desktop default'), Z('适用于宽度大于 720px 的浏览器窗口。', 'Windows wider than 720px.'), seg('desktopView', opts)) +
          sub(Z('移动端默认', 'Mobile default'), Z('适用于宽度小于等于 720px 的手机或窄屏窗口。', 'Phones and windows up to 720px wide.'), seg('mobileView', opts)) +
          sub(Z('卡片密度', 'Card density'), Z('紧凑与参考站一致；舒适会加大卡片内边距。', 'Dense matches the reference design; comfortable adds padding.'), seg('cardDensity', [['dense', Z('紧凑', 'Dense')], ['comfortable', Z('舒适', 'Comfortable')]])) +
        '</div>', icon('layout-grid'));
    }
    function sBackground() {
      var video = D.backgroundMediaType === 'video';
      var LD = '<code>' + Z('浅色图|深色图', 'light|dark') + '</code>';
      return section('03', kicker('03'), Z('背景与透明度', 'Background and opacity'), Z('为站点设置自定义背景图或桌面视频，并调节卡片不透明度。', 'Custom background image or desktop video, and card opacity.'),
        '<div class="m-grid2">' +
          toggle('enableBackground', Z('启用自定义背景', 'Enable custom background'), Z('关闭后不加载任何背景图或视频（下方地址会保留），站点回到纯色主题。', 'When off, no image or video is loaded (the URLs below are kept).')) +
          toggle('enableAmbientEffect', Z('启用背景动效', 'Enable ambient effect'), Z('默认关闭；开启后轻量渲染所选氛围效果，不影响点击和滚动。', 'Off by default; a lightweight animation that never blocks clicks or scrolling.')) +
        '</div>' +
        (D.enableAmbientEffect ? field(Z('动效选择', 'Effect'), seg('ambientEffect', [['sakura', Z('樱花飘落', 'Sakura')], ['rain', Z('细雨', 'Rain')], ['snow', Z('缓雪', 'Snow')], ['leaves', Z('秋叶飘落', 'Leaves')], ['confetti', Z('庆典彩纸', 'Confetti')], ['fireworks', Z('烟花', 'Fireworks')]]), Z('移动端自动减少粒子数量；系统开启“减少动态效果”时不播放。', 'Fewer particles on mobile; disabled when the system asks for reduced motion.')) : '') +
        field(Z('桌面端背景类型', 'Desktop background type'), seg('backgroundMediaType', [['image', Z('图片', 'Image'), 'image'], ['video', Z('视频', 'Video'), 'monitor']])) +
        '<div class="m-grid2">' +
          field(Z('桌面端背景图', 'Desktop image'), input('backgroundImage', 'https://example.com/bg.jpg'), Z('留空则不显示背景图；可用 ', 'Leave empty for none; use ') + LD + Z(' 分别设置两种外观。', ' for separate light / dark images.') + (video ? Z('视频模式下作为封面与回退图。', ' Used as poster and fallback in video mode.') : '')) +
          field(Z('移动端背景图', 'Mobile image'), input('backgroundImageMobile', Z('留空则沿用桌面端背景图', 'Empty = same as desktop')), Z('屏宽不超过 720px 时生效；同样支持 ', 'Used up to 720px wide; also supports ') + LD + Z('。', '.')) +
          (video ? field(Z('浅色模式视频', 'Video (light)'), input('backgroundVideo', '/assets/my-background.mp4'), Z('推荐 MP4（H.264、无音轨、短循环）。仅在宽屏、非触摸设备且未开启省流量/减少动效时加载。', 'MP4 (H.264, no audio, short loop) recommended. Only loaded on wide, non-touch screens without data saver / reduced motion.')) +
            field(Z('深色模式视频（可选）', 'Video (dark, optional)'), input('backgroundVideoDark', Z('留空则沿用浅色模式视频', 'Empty = same as light'))) : '') +
        '</div>' +
        '<div class="m-grid3">' +
          field(Z('缩放方式', 'Fit'), seg('backgroundFit', [['cover', Z('填满', 'Cover')], ['contain', Z('完整', 'Contain')], ['auto', Z('原始', 'Original')]])) +
          field(Z('对齐位置', 'Position'), seg('backgroundAlign', [['top', Z('顶部', 'Top')], ['center', Z('居中', 'Center')], ['bottom', Z('底部', 'Bottom')]])) +
          field(Z('卡片不透明度', 'Card opacity'), '<div class="m-range"><input type="range" min="0" max="100" step="1" data-k="surfaceOpacity" data-type="number" value="' + D.surfaceOpacity + '"><input class="m-input m-num" type="number" min="0" max="100" data-k="surfaceOpacity" data-type="number" value="' + D.surfaceOpacity + '"><span>%</span></div>',
            Z('100 = 完全不透明（与默认一致），数值越低卡片越通透。低于 95 时自动叠加可读性遮罩。需先设置自定义背景才会生效。', '100 = fully opaque (default); lower values let the background show through. Below 95 a readability veil is added. Needs a custom background.')) +
        '</div>', icon('image'));
    }
    function sHome() {
      var gs = groups();
      var sortOpts = KC.SORT_FIELDS.map(function (f) { return [f[0], f[0] === 'default' ? Z('默认（权重）', 'Default (weight)') : f[0] === 'price' ? Z('价格（月均）', 'Price (monthly)') : Z(f[2], f[1])]; });
      var preset = KC.RATING_PRESETS[D.ratingStyle === 'cultivation' ? 'cultivation' : Z('generalZh', 'general')];
      return section('04', kicker('04'), Z('首页巡检', 'Home page'), Z('控制首页顶部总览、筛选栏和节点排序方式；适合节点较多时快速查看状态。', 'Overview, filter bar and node sorting on the home page.'),
        '<div class="m-grid2">' +
          '<div class="m-toggle-wrap">' + toggle('enableHeaderAutoHide', Z('定时隐藏顶部信息', 'Auto-hide the header'), Z('首页加载完成后隐藏顶部栏（站点名与右上角按钮）；刷新页面后重新显示。', 'Hides the header (site name and buttons) after the page loads; it returns on reload.')) +
            (D.enableHeaderAutoHide ? '<div class="m-inline">' + Z('显示时长', 'Visible for') + ' ' + input('headerVisibleSeconds', '10', 'number', ' min="1" max="3600" style="width:90px"') + ' ' + Z('秒', 's') + ' <small>' + Z('可设置 1–3600 秒，默认 10 秒。', '1–3600 seconds, default 10.') + '</small></div>' : '') + '</div>' +
          toggle('showHomeOverview', Z('显示顶部总览', 'Show overview'), Z('展示集群状态、CPU、内存、硬盘、流量、速率与剩余价值。', 'Cluster status, CPU, memory, storage, traffic, throughput and remaining value.')) +
          toggle('showGroupFilter', Z('显示分组筛选', 'Show group filter'), Z('根据后台节点分组生成筛选按钮。', 'Filter buttons built from the node groups.')) +
          toggle('showRegionFilter', Z('显示地区筛选', 'Show region filter'), Z('按节点地区生成国旗筛选栏，点击某地区只看该地区节点；需要换行时每行数量自动均分。', 'Flag buttons per region; when they wrap, rows are balanced automatically.')) +
          toggle('showCardGroup', Z('卡片显示分组', 'Show group on cards'), Z('标准卡片标题后显示分组名（小卡片只显示国旗与名称；不影响分组筛选栏）。', 'Group name after the standard card title (compact cards show flag and name only; the filter bar is unaffected).')) +
          toggle('groupSections', Z('按分组分段显示', 'Section by group'), Z('节点网格按分组插入小标题，顺序遵循下方“分组排序”。', 'Inserts a heading per group, ordered as in "Group order" below.')) +
          toggle('enableHomeSort', Z('启用排序切换', 'Let visitors sort'), Z('首页显示排序控件，访客可临时切换排序方式（非默认排序时离线节点置底）。', 'Shows sort controls; offline nodes go last when not using the default order.')) +
          toggle('hideAdminEntryWhenLoggedOut', Z('未登录时隐藏后台入口', 'Hide admin link when logged out'), Z('仅隐藏访客看到的 “Admin Login”；/admin 仍可直接访问，登录后自动显示。', 'Hides "Admin Login" for visitors; /admin still works and the link returns after login.')) +
        '</div>' +
        '<div class="m-grid2">' +
          field(Z('默认排序维度', 'Default sort'), select('homeSortField', sortOpts), Z('首次访问时的初始排序；访客可临时切换。', 'Initial order for new visitors.')) +
          field(Z('默认方向', 'Direction'), seg('homeSortDirection', [['asc', Z('升序', 'Ascending'), 'arrow-up'], ['desc', Z('降序', 'Descending'), 'arrow-down']])) +
        '</div>' +
        '<div class="m-list-h"><span>' + Z('分组排序', 'Group order') + '</span><small>' + Z('调整分组筛选与分段的显示顺序；未列出的分组按名称排在后面。', 'Order of group filters and sections; unlisted groups follow by name.') + '</small></div>' +
        (gs.length ? '<ol class="m-order">' + gs.map(function (g, i) {
          return '<li class="monitor-surface-secondary"><span class="m-idx">' + (i + 1) + '</span><span class="m-name">' + esc(g) + '</span>' +
            '<button type="button" class="m-icon" data-move="' + esc(g) + '" data-dir="-1" aria-label="' + Z('上移 ', 'Move up ') + esc(g) + '"' + (i === 0 ? ' disabled' : '') + '>' + icon('chevron-up') + '</button>' +
            '<button type="button" class="m-icon" data-move="' + esc(g) + '" data-dir="1" aria-label="' + Z('下移 ', 'Move down ') + esc(g) + '"' + (i === gs.length - 1 ? ' disabled' : '') + '>' + icon('chevron-down') + '</button></li>';
        }).join('') + '</ol>' : '<div class="m-empty">' + Z('暂无分组（节点未设置分组时无需排序）', 'No groups yet (set groups on the nodes in the Komari admin).') + '</div>') +
        sub(Z('总览评级', 'Overview ratings'), Z('在实时速率、累计流量、剩余价值卡片右下角显示文字评级；名称用英文逗号分隔，只取前四个。', 'Text rating on the throughput, traffic and remaining-value cards; comma-separated, first four names are used.'),
          '<div class="m-row-end">' + toggle('showOverviewRatings', Z('启用', 'Enabled'), '') + '</div>' +
          '<div class="m-grid4">' +
            field(Z('评级风格', 'Style'), seg('ratingStyle', [['general', Z('通用', 'General')], ['cultivation', Z('修仙', 'Cultivation')]])) +
            field(Z('累计流量评级名称', 'Traffic labels'), input('trafficRatingLabels', preset.traffic), Z('例如: ', 'e.g. ') + esc(preset.traffic)) +
            field(Z('实时带宽评级名称', 'Bandwidth labels'), input('bandwidthRatingLabels', preset.bandwidth), Z('例如: ', 'e.g. ') + esc(preset.bandwidth)) +
            field(Z('资产评级名称', 'Asset labels'), input('assetRatingLabels', preset.asset), Z('例如: ', 'e.g. ') + esc(preset.asset)) +
          '</div><div class="m-grid3 tight">' +
            toggle('showTrafficRating', Z('累计流量', 'Traffic'), Z('500G / 2T / 10T 分档', 'Tiers at 500G / 2T / 10T')) + toggle('showBandwidthRating', Z('实时带宽', 'Bandwidth'), Z('1 / 10 / 100 Mbps 分档', 'Tiers at 1 / 10 / 100 Mbps')) + toggle('showAssetRating', Z('资产概览', 'Assets'), Z('¥500 / 1500 / 3000 分档（按汇率折算）', 'Tiers at ¥500 / 1500 / 3000 (converted)')) +
          '</div>'), icon('house'));
    }
    function sHidden() {
      return section('05', kicker('05'), Z('隐藏节点', 'Hidden nodes'), Z('在此填写的节点会从首页彻底移除：不显示卡片，也不计入在线数、累计流量、实时速率与资产等统计。对所有访客生效，清空即可恢复。', 'Nodes listed here disappear from the home page and from every total (online count, traffic, throughput, assets). Clear the list to restore them.'),
        field(Z('隐藏列表', 'Hidden list'), listArea('hiddenNodes', listPh()), Z('已隐藏 ' + D.hiddenNodes.length + ' 个节点。按名称或 UUID 匹配，大小写不敏感。', D.hiddenNodes.length + ' hidden. Matched by name or UUID, case-insensitive.')), icon('eye-off'));
    }
    function sCards() {
      return section('06', kicker('06'), Z('卡片显示项', 'Card contents'), Z('分别管理跨卡片视图的信息块，以及小卡片专属的信息密度。', 'Blocks shared by both card views, and what compact cards show.'),
        '<div class="m-list-h"><span>' + Z('跨视图设置', 'Both views') + '</span><small>' + Z('适用于标准卡片与小卡片。', 'Standard and compact cards.') + '</small></div>' +
        '<div class="m-grid2">' +
          toggle('showConnections', Z('显示连接数（TCP/UDP）', 'Show connections (TCP/UDP)'), Z('在标准卡片“周期流量”信息块底部显示实时 TCP / UDP 连接数（小卡片不显示连接数）。', 'Live TCP / UDP counts at the bottom of the standard card\'s cycle-traffic block (compact cards never show connections).')) +
        '</div>' +
        '<div class="m-list-h"><span>' + Z('小卡片专属', 'Compact cards') + '</span><small>' + Z('控制小卡片底栏的信息密度；实时速率始终显示。', 'Footer details; the live rate is always shown.') + '</small></div>' +
        '<div class="m-grid3">' +
          toggle('compactShowTrafficTotal', Z('显示累计流量', 'Show traffic'), Z('展示入站与出站累计流量。', 'Cycle traffic used.')) +
          toggle('compactShowBilling', Z('显示费用到期', 'Show billing'), Z('展示续费价格与剩余天数。', 'Price and days left.')) +
          toggle('compactShowUptime', Z('显示在线时间', 'Show uptime'), Z('在小卡片右上角展示在线时长。', 'Uptime in the top-right corner.')) +
        '</div>', icon('rows-3'));
    }
    function fmtGB(b) { return b ? String(Math.round(b / GiB * 100) / 100) : ''; }
    function dayLabel(d) { return Z('每月 ' + d + ' 日', 'Day ' + d); }
    function sTraffic() {
      var T = KC.normalizeSettings(D);
      var retentionH = Number(S.settings.record_preserve_time) || 0;
      var dayOpts = [['expiry', Z('跟随账单到期日', 'Billing expiry day')], ['none', Z('不重置', 'Never')]];
      for (var d = 1; d <= 31; d++) dayOpts.push([String(d), dayLabel(d)]);
      var customCount = Object.keys(D.trafficResetDays || {}).length, calibCount = Object.keys(D.trafficCalib || {}).length;
      var q = ui.trafficQuery.toLowerCase();
      var rows = S.allNodes.filter(function (nd) { return !q || [nd.name, nd.uuid, nd.group, KC.regionLabel(nd.region)].join(' ').toLowerCase().indexOf(q) >= 0; }).map(function (nd) {
        var tr = KC.trafficWith(T, nd), cyc = tr.cyc, lim = Number(nd.traffic_limit) || 0;
        var c = (D.trafficCalib || {})[nd.uuid], custom = (D.trafficResetDays || {})[nd.uuid];
        var defDay = KC.resetDayWith(KC.normalizeSettings(Object.assign({}, D, { trafficResetDays: {} })), nd);
        var opts = '<option value="">' + Z('默认（', 'Default (') + (defDay ? dayLabel(defDay) : Z('不重置', 'never')) + Z('）', ')') + '</option><option value="-1"' + (custom === -1 ? ' selected' : '') + '>' + Z('不重置', 'Never') + '</option>';
        for (var k = 1; k <= 31; k++) opts += '<option value="' + k + '"' + (Number(custom) === k ? ' selected' : '') + '>' + dayLabel(k) + '</option>';
        var tzv = (D.trafficResetTz || {})[nd.uuid], hasTz = tzv !== undefined && tzv !== '' && tzv !== null;
        var tzOpts = '<option value="">' + Z('默认（', 'Default (') + KC.tzLabel(Number(D.trafficResetUtcOffset) || 0) + Z('）', ')') + '</option>';
        for (var z = -12; z <= 14; z += 0.5) tzOpts += '<option value="' + z + '"' + (hasTz && Number(tzv) === z ? ' selected' : '') + '>' + KC.tzLabel(z) + '</option>';
        var cal = ui.cal[nd.uuid] || {};
        var usage = (tr.pending ? '<span class="m-dim">' + Z('计算中…', 'Counting…') + '</span> ' : '') + '↓ ' + (tr.approx ? '≈' : '') + KC.bytesPrecise(tr.down) + ' · ↑ ' + (tr.approx ? '≈' : '') + KC.bytesPrecise(tr.up) + (lim > 0 ? ' · ' + Z('限额 ', 'limit ') + KC.bytesPrecise(lim) + ' (' + esc(nd.traffic_limit_type || 'max') + ')' : '');
        return '<div class="m-traffic monitor-surface-secondary' + (c ? ' is-set' : '') + '">' +
          '<div class="m-node-id">' + KC.flagImg(nd.region) + '<b>' + esc(nd.name) + '</b><small>' + (tr.engine ? Z('周期统计', 'Cycle count') : Z('探针计数', 'Agent counter')) +
            (cyc ? Z(' · 下次重置 ', ' · next reset ') + KC.cycleYMD(cyc) + ' ' + KC.tzLabel(cyc.tz) + Z('（', ' (') + (cyc.daysLeft === 0 ? Z('今天', 'today') : Z(cyc.daysLeft + ' 天后', 'in ' + cyc.daysLeft + ' days')) + Z('）', ')') : Z(' · 未设置重置日', ' · no reset day')) + '</small></div>' +
          '<div class="m-usage mono">' + usage + (c ? '<div class="m-dim">' + (c.auto ? Z('自动存档', 'Auto checkpoint') : Z('已校准', 'Calibrated')) + Z('于 ', ' at ') + esc(KC.dateTime(new Date(c.at))) + '：↓ ' + KC.bytesPrecise(c.down) + ' · ↑ ' + KC.bytesPrecise(c.up) + '</div>' : '') + '</div>' +
          '<div class="m-traffic-ctl">' +
            '<label class="m-mini"><span>' + Z('重置日', 'Reset day') + '</span><select class="m-input" data-rday="' + esc(nd.uuid) + '">' + opts + '</select></label>' +
            '<label class="m-mini"><span>' + Z('时区', 'Time zone') + '</span><select class="m-input" data-rtz="' + esc(nd.uuid) + '">' + tzOpts + '</select></label>' +
            '<label class="m-mini"><span>' + Z('已用下行 GB', 'Used in (GB)') + '</span><input class="m-input" type="number" min="0" step="0.01" data-cal="' + esc(nd.uuid) + '" data-dir="down" value="' + esc(cal.down != null ? cal.down : '') + '" placeholder="' + esc(fmtGB(tr.down)) + '"></label>' +
            '<label class="m-mini"><span>' + Z('已用上行 GB', 'Used out (GB)') + '</span><input class="m-input" type="number" min="0" step="0.01" data-cal="' + esc(nd.uuid) + '" data-dir="up" value="' + esc(cal.up != null ? cal.up : '') + '" placeholder="' + esc(fmtGB(tr.up)) + '"></label>' +
            '<div class="m-mini-btns"><button type="button" class="m-btn" data-calset="' + esc(nd.uuid) + '" title="' + Z('以当前时刻为基准，把本周期已用流量设为左侧数值', 'Set this cycle\'s usage to the values on the left, as of now') + '">' + Z('设定已用', 'Set used') + '</button>' +
            '<button type="button" class="m-btn" data-calzero="' + esc(nd.uuid) + '" title="' + Z('立即把本周期已用流量清零', 'Reset this cycle\'s usage to zero now') + '">' + Z('重置为 0', 'Reset to 0') + '</button>' +
            (c ? '<button type="button" class="m-icon" data-calclear="' + esc(nd.uuid) + '" title="' + Z('清除校准，回到自动统计', 'Clear the calibration') + '">' + icon('x') + '</button>' : '') + '</div>' +
          '</div></div>';
      }).join('');
      var warn = retentionH && retentionH < 31 * 24 && D.trafficMode === 'theme' && !D.trafficAutoCheckpoint;
      var days = retentionH ? Math.round(retentionH / 24 * 10) / 10 : 0;
      return section('07', kicker('07'), Z('流量重置日与校准', 'Traffic reset day and calibration'), Z('按服务器设置每月流量重置日，并可校准本周期已用流量或手动清零。“按重置日统计”会用 Komari 记录的累计计数器逐段累加本周期流量（自动处理重启后计数归零）；校准点会作为新的起算基准，直到下一个重置日。', 'Set a monthly reset day per server, calibrate this cycle\'s usage or reset it. "Count by reset day" adds up Komari\'s cumulative counters for the cycle (counter resets after reboots are handled); a calibration becomes the new starting point until the next reset day.'),
        '<div class="m-grid3">' +
          sub(Z('统计模式', 'Counting mode'), '', seg('trafficMode', [['agent', Z('探针计数', 'Agent counter')], ['theme', Z('按重置日统计', 'Count by reset day')]]) + '<div class="m-help">' + (D.trafficMode === 'theme' ? Z('主题按重置日自动开始新周期，适合探针未设置 <code>--month-rotate</code> 的节点。', 'The theme starts a new cycle on each reset day; for agents without <code>--month-rotate</code>.') : Z('直接显示 Komari 探针上报的累计流量（由探针的 <code>--month-rotate</code> 决定何时归零）；重置日仅用于显示倒计时。已校准的节点在本周期内仍按校准值累加。', 'Shows the agent\'s cumulative counter (reset by the agent\'s <code>--month-rotate</code>); the reset day only drives the countdown. Calibrated nodes still count from the calibration this cycle.')) + '</div>') +
          sub(Z('默认重置日', 'Default reset day'), Z('未单独设置的服务器使用此规则。', 'Used by servers without their own setting.'), select('trafficResetDefault', dayOpts) + '<div class="m-inline">' + Z('时区', 'Time zone') + ' UTC ' + input('trafficResetUtcOffset', '8', 'number', ' min="-12" max="14" step="0.5" style="width:80px"') + '<small>' + Z('所有访客按同一时区计算周期边界。', 'Every visitor uses the same cycle boundaries.') + '</small></div>') +
          sub(Z('显示', 'Display'), '', toggle('showResetCountdown', Z('显示重置倒计时', 'Show reset countdown'), Z('在卡片标签区显示 “↻ 12d”。', 'Shows "↻ 12d" among the card chips.'))) +
        '</div>' +
        '<div class="m-grid2">' +
          '<div class="m-toggle-wrap">' + toggle('trafficAutoCheckpoint', Z('管理员访问时自动存档', 'Auto checkpoint on admin visits'), Z('登录管理员打开首页时，把各节点当前周期用量写入校准点；适用于 Komari 记录保留时间短于账单周期的情况。', 'When a logged-in admin opens the home page, current usage is saved as a calibration point; for record retention shorter than the billing cycle.')) +
            (D.trafficAutoCheckpoint ? '<div class="m-inline">' + Z('间隔', 'Every') + ' ' + input('trafficCheckpointHours', '12', 'number', ' min="1" max="168" style="width:80px"') + ' ' + Z('小时', 'hours') + '</div>' : '') + '</div>' +
          '<div class="m-note' + (warn ? ' warn' : '') + '">' + icon('triangle-alert') + '<div>' + Z('当前 Komari 记录保留 <b>' + (days ? days + ' 天' : '未知') + '</b>。按重置日统计需要记录覆盖整个周期（最长 31 天），否则只能从最早的记录算起，数值前会显示 “≈”。保留时间不足时请开启“自动存档”，或在后台调大记录保留时间。',
            'Komari currently keeps <b>' + (days ? days + ' days' : 'an unknown span') + '</b> of records. Counting by reset day needs records for the whole cycle (up to 31 days); otherwise counting starts at the oldest record and values show "≈". Turn on auto checkpoint or raise the retention in the admin.') + '</div></div>' +
        '</div>' +
        '<div class="m-sub monitor-surface-secondary"><div class="m-sub-h m-sub-flex"><div><b>' + Z('按服务器设置', 'Per server') + '</b><small>' + Z('自定义重置日 ' + customCount + ' 台 · 已校准 ' + calibCount + ' 台。校准与重置在点击“保存设置”后对所有访客生效。', customCount + ' with a custom reset day · ' + calibCount + ' calibrated. Calibrations apply to everyone after saving.') + '</small></div>' +
          '<button type="button" class="m-btn" data-act="traffic-refresh">' + icon('rotate-ccw') + Z('刷新用量', 'Refresh usage') + '</button></div>' +
          '<div class="m-search">' + icon('search') + '<input class="m-input" id="m-traffic-q" placeholder="' + searchPh() + '" value="' + esc(ui.trafficQuery) + '"></div>' +
          '<div class="m-nodes">' + (rows || '<div class="m-empty">' + Z('没有匹配的节点。', 'No matching nodes.') + '</div>') + '</div></div>', icon('activity'));
    }
    function refreshTraffic(nodes) {
      var T = KC.normalizeSettings(D);
      return Promise.all((nodes || S.allNodes).map(function (n) { return KC.loadTrafficWith(T, n); })).then(render);
    }
    function setCalib(uuid, up, down) {
      var map = clone(D.trafficCalib || {}), live = KC.liveTotals(uuid), entry = { at: new Date().toISOString(), up: Math.max(0, Math.round(up)), down: Math.max(0, Math.round(down)) };
      if (live) { entry.cu = live.up; entry.cd = live.down; }
      map[uuid] = entry; D.trafficCalib = map; delete ui.cal[uuid];
      ui.msg = Z('已更新校准（尚未保存）', 'Calibration updated (not saved yet)'); ui.err = '';
      var n = S.allNodes.filter(function (x) { return x.uuid === uuid; });
      render(); refreshTraffic(n);
    }

    function sCost() {
      return section('08', kicker('08'), Z('服务器花费', 'Server costs'), Z('剩余价值卡片按实时汇率折算各节点当前账期的剩余价值；忽略列表中的节点不计入。', 'The remaining-value card converts what is left of each billing period at live rates; ignored nodes are skipped.'),
        '<div class="m-grid2"><div class="m-stack">' +
          toggle('showCostsToGuests', Z('向未登录访客公开费用', 'Show costs to visitors'), Z('关闭后续费价格、剩余价值与价格排序仅登录管理员可见；到期时间仍正常显示。', 'When off, prices, remaining value and price sorting are admin-only; expiry dates still show.')) +
          toggle('showRemainingValue', Z('显示剩余价值卡片', 'Show remaining value card'), Z('顶部总览中的 Remaining Value。', 'The Remaining Value card in the overview.')) +
          '<div class="m-grid2 tight">' +
            field(Z('折算货币', 'Display currency'), select('baseCurrency', [['USD', Z('USD 美元', 'USD')], ['CNY', Z('CNY 人民币', 'CNY')], ['EUR', Z('EUR 欧元', 'EUR')], ['GBP', Z('GBP 英镑', 'GBP')], ['HKD', Z('HKD 港币', 'HKD')], ['JPY', Z('JPY 日元', 'JPY')], ['SGD', Z('SGD 新元', 'SGD')]])) +
            field(Z('到期提醒天数', 'Expiry warning (days)'), input('expiryWarningDays', '30', 'number', ' min="1" max="365"'), Z('剩余天数不超过该值时，卡片底部变为琥珀色。', 'The card footer turns amber when this few days are left.')) +
          '</div>' +
          field(Z('实时汇率接口', 'Exchange-rate API'), input('costRateApiUrl', 'https://api.frankfurter.dev/v2/rates?base=USD'), Z('需返回以 USD 为基准的 <code>{"rates":{…}}</code> 或 <code>[{"quote","rate"}]</code>；结果缓存 12 小时，请求失败时使用内置近似汇率。', 'Must return USD-based <code>{"rates":{…}}</code> or <code>[{"quote","rate"}]</code>; cached for 12 hours, built-in approximate rates are used on failure.')) +
        '</div>' +
        field(Z('忽略计费节点', 'Ignored nodes'), listArea('costIgnoredNodes', listPh())) + '</div>', icon('circle-dollar-sign'));
    }
    function taskOptions(selected, list, emptyLabel) {
      return '<option value="">' + emptyLabel + '</option>' + list.map(function (t) {
        return '<option value="' + t.id + '"' + (String(selected) === String(t.id) ? ' selected' : '') + '>' + esc(t.name || (Z('任务 #', 'Task #') + t.id)) + ' · ' + esc(String(t.type || 'icmp').toUpperCase()) + ' #' + t.id + '</option>';
      }).join('');
    }
    function sLatency() {
      var tasks = tasksSorted(), n = D.probeCount;
      var slots = '';
      for (var i = 0; i < n; i++) {
        slots += '<label class="m-slot"><span>' + Z('线路 ', 'Slot ') + (i + 1) + '</span><select class="m-input" data-slot="' + i + '">' + taskOptions(D.cardProbeTaskIds[i] || '', tasks, Z('— 未选择 —', '— none —')) + '</select></label>';
      }
      var q = ui.nodeQuery.toLowerCase();
      var nodes = S.allNodes.filter(function (nd) {
        if (!q) return true;
        return [nd.name, nd.uuid, nd.group, KC.regionLabel(nd.region)].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      var nodeRows = nodes.map(function (nd) {
        var assigned = KC.tasksFor(nd.uuid), cur = KC.toList((D.cardProbeNodeTaskIds || {})[nd.uuid]);
        var sel = '';
        for (var k = 0; k < n; k++) sel += '<select class="m-input" data-node="' + esc(nd.uuid) + '" data-nslot="' + k + '"' + (assigned.length ? '' : ' disabled') + '>' + taskOptions(cur[k] || '', assigned, k === 0 ? Z('跟随全局', 'Use global') : '—') + '</select>';
        return '<div class="m-node monitor-surface-secondary' + (cur.length ? ' is-set' : '') + '"><div class="m-node-id">' + KC.flagImg(nd.region) + '<b>' + esc(nd.name) + '</b><small>' + esc(nd.group || Z('未设置分组', 'No group')) + ' · ' + Z(assigned.length + ' 个任务', assigned.length + ' tasks') + '</small></div>' +
          '<div class="m-node-sel">' + sel + '</div>' + (cur.length ? '<button type="button" class="m-icon" data-clearnode="' + esc(nd.uuid) + '" title="' + Z('清除覆盖', 'Clear override') + '">' + icon('x') + '</button>' : '<span class="m-icon-ph"></span>') + '</div>';
      }).join('');
      var pingLink = '<a href="/admin/ping" target="_blank" rel="noopener">' + Z('后台 Ping 管理', 'Ping tasks in the admin') + '</a>';
      return section('09', kicker('09'), Z('主页延迟检测与丢包', 'Latency probes and packet loss'), Z('为节点卡片挑选要展示的 Ping 任务：可设置全局默认线路，也可为每台服务器单独覆盖；未配置时展示该节点全部任务中的前 N 个。如果当前还没有可用任务，请先前往 ', 'Pick the ping tasks shown on node cards: global defaults plus per-server overrides; without a choice the first N tasks of the node are shown. No tasks yet? Create them under ') + pingLink + Z(' 创建任务。', '.'),
        '<div class="m-grid2">' +
          toggle('showProbes', Z('卡片中显示探针', 'Show probes on cards'), Z('标准卡片底部显示最近 1 小时平均延迟、丢包率与 20 格色条（每格为 3 分钟平均延迟）；小卡片显示 1 小时平均延迟与丢包率。', 'Standard cards show the last hour\'s average latency and loss rate plus 20 cells of 3-minute average latency; compact cards show the 1-hour average latency and loss.')) +
          '<div class="m-grid3 tight">' +
            field(Z('每张卡片最多', 'Per card'), input('probeCount', '3', 'number', ' min="1" max="6"'), Z('1–6 个', '1–6')) +
            field(Z('绿色阈值 (ms)', 'Green below (ms)'), input('latencyGoodMs', '150', 'number', ' min="1"')) +
            field(Z('琥珀阈值 (ms)', 'Amber below (ms)'), input('latencyWarnMs', '400', 'number', ' min="1"')) +
          '</div>' +
        '</div>' +
        sub(Z('全局默认线路', 'Global default slots'), Z('按顺序显示在节点卡片中；某节点未分配该任务时自动跳过。全部留空 = 显示该节点的全部任务。', 'Shown in this order; skipped for nodes without that task. All empty = every task of the node.'), tasks.length ? '<div class="m-slots">' + slots + '</div>' : '<div class="m-empty">' + Z('当前还没有可用于首页展示的 Ping 任务。', 'There are no ping tasks yet.') + '</div>') +
        '<div class="m-sub monitor-surface-secondary"><div class="m-sub-h m-sub-flex"><div><b>' + Z('按服务器覆盖', 'Per-server overrides') + '</b><small>' + Z('已单独配置 ' + overrideCount() + ' / ' + S.allNodes.length + ' 台服务器；第一项选择“跟随全局”即使用全局线路。', overrideCount() + ' / ' + S.allNodes.length + ' servers overridden; "Use global" in the first slot falls back to the global slots.') + '</small></div>' +
          '<button type="button" class="m-btn" data-act="toggle-nodes">' + icon('sliders-horizontal') + (ui.nodesOpen ? Z('收起服务器', 'Hide servers') : Z('配置服务器探测点', 'Configure servers')) + '</button></div>' +
          (ui.nodesOpen ? '<div class="m-search">' + icon('search') + '<input class="m-input" id="m-node-q" placeholder="' + searchPh() + '" value="' + esc(ui.nodeQuery) + '"></div><div class="m-nodes">' + (nodeRows || '<div class="m-empty">' + Z('没有匹配的节点。', 'No matching nodes.') + '</div>') + '</div>' : '') +
        '</div>' +
        sub(Z('丢包显示', 'Packet loss'), Z('节点详情的延迟图中，在每次丢包的时间点画一条与任务同色的竖向虚线；同一时刻多个任务丢包时虚线交错显示，互不覆盖。', 'In the node latency chart, every lost probe gets a dashed vertical line in the task\'s color; simultaneous losses interleave their dashes.'),
          '<div class="m-grid2">' +
            toggle('showLossLines', Z('默认显示丢包虚线', 'Loss lines on by default'), Z('访客仍可在图表右上角用 “丢包虚线” 临时开关。', 'Visitors can still toggle them on the chart.')) +
            toggle('connectGapsDefault', Z('默认断点连线', 'Connect gaps by default'), Z('关闭：如实显示中断/丢包断点；开启：跨过空缺连接曲线，丢包虚线仍保留。', 'Off: show breaks at outages / losses. On: bridge the gaps; loss lines stay.')) +
            toggle('smoothProbesDefault', Z('默认削峰平滑', 'Smooth peaks by default'), Z('延迟图按 5 点滑动中位数绘制，削去孤立尖峰；访客可在图表上临时切换。', 'Draw latency as a 5-sample rolling median that hides single spikes; visitors can toggle it on the chart.')) +
          '</div><div class="m-grid2">' +
            field(Z('丢包标记样式', 'Marker style'), seg('lossMarkerStyle', [['line', Z('竖向虚线', 'Dashed line')], ['cross', Z('底部叉号', 'Cross at bottom')], ['both', Z('两者都显示', 'Both')]])) +
            field(Z('虚线不透明度', 'Line opacity'), '<div class="m-range"><input type="range" min="10" max="100" step="5" data-k="lossLineOpacity" data-type="number" value="' + D.lossLineOpacity + '"><input class="m-input m-num" type="number" min="10" max="100" data-k="lossLineOpacity" data-type="number" value="' + D.lossLineOpacity + '"><span>%</span></div>') +
          '</div>' + lossPreview()),
        Z(tasks.length + ' 个任务', tasks.length + ' tasks'));
    }
    function lossPreview() {
      // tiny static preview of the dashed-line style using the current options
      var cols = ['#2563eb', '#059669', '#d97706'], W = 560, H = 90, s = '<svg class="m-loss-preview" viewBox="0 0 ' + W + ' ' + H + '" aria-label="' + Z('丢包虚线预览', 'Loss line preview') + '">';
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
      return section('10', kicker('10'), Z('刷新与备份', 'Refresh and backup'), Z('实时数据刷新频率，以及主题设置的导出 / 导入。', 'Live refresh interval and export / import of the theme settings.'),
        '<div class="m-grid2">' +
          field(Z('实时刷新间隔 (ms)', 'Refresh interval (ms)'), input('refreshIntervalMs', '2000', 'number', ' min="1000" max="60000" step="500"'), Z('通过 WebSocket 拉取节点状态的间隔，1000–60000。', 'How often node status is pulled over WebSocket, 1000–60000.')) +
          field(Z('导出 / 导入 JSON', 'Export / import JSON'), '<textarea class="m-input m-area mono" id="m-import" placeholder="' + Z('粘贴之前导出的 JSON，然后点击“导入到草稿”', 'Paste exported JSON, then click "Import to draft"') + '">' + esc(ui.importText) + '</textarea>' +
            '<div class="m-btns"><button type="button" class="m-btn" data-act="export">' + Z('导出当前草稿', 'Export draft') + '</button><button type="button" class="m-btn" data-act="import">' + Z('导入到草稿', 'Import to draft') + '</button></div>') +
        '</div>', icon('gauge'));
    }

    // ---------------- page ----------------
    function langSwitch() {
      return '<div class="lang-toggle monitor-control m-lang" role="group" aria-label="Language / 语言">' +
        [['zh', '中文'], ['en', 'English']].map(function (p) { return '<button type="button" data-mlang="' + p[0] + '" aria-pressed="' + (KC.lang() === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div>';
    }
    function render() {
      var y = window.scrollY;
      var active = document.activeElement && document.activeElement.id;
      page.innerHTML = '<div class="manage-root container">' +
        '<div class="m-masthead"><div><div class="m-kicker big">HORIZON · ' + Z('主题控制台', 'THEME CONSOLE') + langSwitch() + '</div><h1>' + Z('主题设置', 'Theme settings') + '</h1><p>' + Z('集中调整 Horizon 的展示偏好、背景、费用与首页延迟绑定；保存后立即应用到当前站点。', 'Display preferences, background, costs and latency probes for Horizon; saved settings apply to the site right away.') + '</p></div>' +
          '<dl class="m-meta"><div><dt>' + Z('主题', 'Theme') + '</dt><dd>' + esc(theme.charAt(0).toUpperCase() + theme.slice(1)) + '</dd></div><div><dt>' + Z('节点', 'Nodes') + '</dt><dd>' + S.allNodes.length + '</dd></div><div><dt>' + Z('Ping 任务', 'Ping tasks') + '</dt><dd>' + S.pingTasks.length + '</dd></div><div><dt>' + Z('单独覆盖', 'Overrides') + '</dt><dd>' + overrideCount() + '</dd></div></dl></div>' +
        '<nav class="m-toc">' + TOC.map(function (x) { return '<a href="#m-' + x[0] + '"><span>' + x[0] + '</span>' + Z(x[1], x[2]) + '</a>'; }).join('') + '</nav>' +
        sAppearance() + sView() + sBackground() + sHome() + sHidden() + sCards() + sTraffic() + sCost() + sLatency() + sAdvanced() +
        '<div class="m-savebar monitor-surface-primary"><a href="/" class="m-btn">' + icon('arrow-left') + Z('返回首页', 'Back to home') + '</a>' +
          '<span class="m-status ' + (ui.err ? 'err' : ui.msg ? 'ok' : '') + '">' + esc(ui.err || ui.msg || statusText()) + '</span>' +
          '<button type="button" class="m-btn" data-act="defaults">' + Z('恢复默认', 'Defaults') + '</button>' +
          '<button type="button" class="m-btn" data-act="reset"' + (dirty() ? '' : ' disabled') + '>' + icon('rotate-ccw') + Z('重置', 'Revert') + '</button>' +
          '<button type="button" class="m-btn primary" data-act="save"' + (ui.saving ? ' disabled' : '') + '>' + icon('save') + (ui.saving ? Z('保存中', 'Saving') : Z('保存设置', 'Save')) + '</button></div>' +
      '</div>';
      window.scrollTo(0, y);
      if (active) { var el = document.getElementById(active); if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } }
    }

    function preview() { var T = KC.normalizeSettings(D); KC.applyPreview(T); KC.applyFonts(T); KC.applyFavicon(T); }
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
      if (/^background|^surface|^font|^favicon/.test(el.dataset.k)) preview();
      if (el.dataset.k === 'faviconUrl') { var fi = page.querySelector('.m-fav'); if (fi) fi.src = el.value || '/favicon.svg'; }
      var st = page.querySelector('.m-status'); if (st) { st.className = 'm-status'; st.textContent = statusText(); }
    });
    page.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.slot != null) {
        var ids = D.cardProbeTaskIds.slice(); ids[Number(el.dataset.slot)] = el.value;
        D.cardProbeTaskIds = ids.slice(0, D.probeCount).map(function (x) { return x || ''; });
        while (D.cardProbeTaskIds.length && !D.cardProbeTaskIds[D.cardProbeTaskIds.length - 1]) D.cardProbeTaskIds.pop();
        render(); return;
      }
      if (el.dataset.rtz) {
        var tzm = clone(D.trafficResetTz || {});
        if (el.value === '') delete tzm[el.dataset.rtz]; else tzm[el.dataset.rtz] = Number(el.value);
        D.trafficResetTz = tzm; ui.msg = ''; render();
        refreshTraffic(S.allNodes.filter(function (x) { return x.uuid === el.dataset.rtz; }));
        return;
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
      if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.dataset.k === 'probeCount') { if (/Ambient|Background|^font/.test(el.dataset.k)) preview(); render(); }
      if (/^trafficReset/.test(el.dataset.k)) { render(); refreshTraffic(); }
    });
    page.addEventListener('click', function (e) {
      var t = e.target;
      var ml = t.closest('[data-mlang]');
      if (ml) { KC.setLang(ml.dataset.mlang); return; }
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
        var id = cs.dataset.calset, v2 = ui.cal[id] || {}, nd = S.allNodes.filter(function (x) { return x.uuid === id; })[0];
        var cur = KC.trafficWith(KC.normalizeSettings(D), nd);
        var up = v2.up !== undefined && v2.up !== '' ? Number(v2.up) * GiB : cur.up, down = v2.down !== undefined && v2.down !== '' ? Number(v2.down) * GiB : cur.down;
        if (!isFinite(up) || !isFinite(down) || up < 0 || down < 0) { ui.err = Z('请输入有效的流量数值（GB）', 'Please enter valid traffic values (GB)'); render(); return; }
        setCalib(id, up, down); return;
      }
      var cz = t.closest('[data-calzero]');
      if (cz) { setCalib(cz.dataset.calzero, 0, 0); return; }
      var cc = t.closest('[data-calclear]');
      if (cc) { var cm = clone(D.trafficCalib || {}); delete cm[cc.dataset.calclear]; D.trafficCalib = cm; ui.msg = Z('已清除校准（尚未保存）', 'Calibration cleared (not saved yet)'); render(); refreshTraffic(S.allNodes.filter(function (x) { return x.uuid === cc.dataset.calclear; })); return; }
      var cn = t.closest('[data-clearnode]');
      if (cn) { var m = clone(D.cardProbeNodeTaskIds || {}); delete m[cn.dataset.clearnode]; D.cardProbeNodeTaskIds = m; render(); return; }
      var act = t.closest('[data-act]');
      if (!act) return;
      var a = act.dataset.act;
      if (a === 'toggle-nodes') { ui.nodesOpen = !ui.nodesOpen; render(); }
      else if (a === 'traffic-refresh') { ui.msg = Z('正在刷新用量…', 'Refreshing usage…'); render(); refreshTraffic().then(function () { ui.msg = Z('用量已刷新', 'Usage refreshed'); render(); }); }
      else if (a === 'reset') { D = clone(saved); ui.msg = Z('已重置为上次保存的设置', 'Reverted to the last saved settings'); ui.err = ''; preview(); render(); }
      else if (a === 'defaults') { D = KC.normalizeSettings({}); ui.msg = Z('已载入默认值（尚未保存）', 'Defaults loaded (not saved yet)'); ui.err = ''; preview(); render(); }
      else if (a === 'export') { ui.importText = JSON.stringify(D, null, 2); render(); var ta = document.getElementById('m-import'); if (ta) { ta.focus(); ta.select(); } }
      else if (a === 'import') {
        try { D = KC.normalizeSettings(JSON.parse(ui.importText)); ui.msg = Z('已导入到草稿，确认后点击保存', 'Imported into the draft — click Save to apply'); ui.err = ''; preview(); }
        catch (err) { ui.err = Z('JSON 解析失败：', 'Invalid JSON: ') + err.message; }
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
        ui.saving = false; ui.msg = Z('主题设置已保存', 'Theme settings saved');
        render();
      }).catch(function (err) {
        ui.saving = false; ui.err = Z('保存失败：', 'Save failed: ') + (err && err.message || err);
        render();
      });
    }

    KC.onLang = function () { ui.msg = ''; render(); };
    setTimeout(function () { refreshTraffic(); }, 2500);
    window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    render();
  };
})();
