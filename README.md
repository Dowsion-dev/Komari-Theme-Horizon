# Horizon · Komari 主题

高密度、控制台风格的 [Komari Monitor](https://github.com/komari-monitor/komari) 公开状态页主题。一屏俯瞰整个集群：总览、节点卡片、流量周期、延迟探针与历史图表。

纯 HTML / CSS / JS，无需构建。

<p align="center"><img src="preview.png" alt="Horizon preview" width="90%"></p>

## 功能

- **顶部栏**：站点名 + 标签、实时连接与时钟、浅色 / 深色 / 跟随系统、后台入口；登录后显示主题设置齿轮
- **集群总览**：在线状态、CPU、内存、硬盘、实时速率、周期流量、剩余价值（可选文字评级：通用 / 修仙 / 自定义）
- **筛选与排序**：国旗地区筛选、分组筛选、访客排序（名称、地区、CPU、内存、硬盘、速率、流量、在线时长、价格、到期）
- **节点卡片**（标准 / 小卡片两种视图）：系统图标、地区 / 架构 / 虚拟化 / 在线时长 / 重置倒计时、CPU · 内存 · 硬盘、网速、**Cycle I/O**（按计费方式显示已用量 + 用量条）、Swap、负载与连接数、延迟探针（最近 10 次检测）、标签与账单
- **节点详情**：CPU / 内存 / 网络（RX/TX 镜像）/ 负载 / 硬盘历史图（1h · 8h · 24h · 7d），延迟探针图（含**丢包虚线**、断点连线开关），心跳日志
- **流量周期**：按重置日统计（自动处理重启计数归零）、按服务器自定义重置日、**流量校准**（设定已用 / 重置为 0）、可选管理员自动存档
- **背景与动效**：自定义背景图（区分浅色/深色、移动端）、桌面视频背景、卡片不透明度、樱花 / 细雨 / 缓雪 / 秋叶 / 彩纸 / 烟花
- **移动端**：卡片信息块按自身宽度自适应；实时刷新只更新变化的数据，不会触发 iOS Safari 自动滚动

## 安装

1. 到 [Releases](https://github.com/Dowsion-dev/Komari-Theme-Horizon/releases/latest) 下载 `Komari-Theme-Horizon-vX.Y.Z.zip`
2. Komari 后台 → **设置 → 主题** → 上传 zip → 选中 **Horizon**
3. 登录后打开首页，点击右上角 **⚙ 齿轮** 进入主题设置（也可直接访问 `/?view=theme-manage`）

> 站点在 Cloudflare 等 CDN 后面也没关系：资源地址带版本号（`app.css?v=1.4.0`），升级后会自动拿到新文件。

### 从 Copycat Console 升级

主题标识从 `copycat-console` 改为 `horizon`，Komari 按标识保存主题设置，所以切换后设置需要迁移一次：

1. 切换前，在旧主题的设置页 **10 高级 → 导出当前草稿**，复制 JSON
2. 安装并启用 Horizon，进入设置页 **10 高级**，粘贴 JSON → **导入到草稿** → **保存设置**

## 主题设置

设置页仅登录管理员可见，保存到 Komari 的 `theme_settings`（`POST /api/admin/theme/settings?theme=horizon`），对所有访客生效。

| # | 分区 | 内容 |
|---|---|---|
| 01 | 外观 | 默认外观、站点标签、Logo、节点区标题、页脚 |
| 02 | 视图 | 桌面端 / 移动端默认卡片视图、卡片密度 |
| 03 | 背景 | 自定义背景图（`浅色图\|深色图`）、移动端背景图、桌面视频、缩放与对齐、卡片不透明度、背景动效 |
| 04 | 首页 | 定时隐藏顶部栏、总览 / 分组 / 地区筛选开关、卡片显示分组、按分组分段、访客排序与默认排序、隐藏后台入口、分组排序、总览评级 |
| 05 | 隐藏 | 隐藏节点（名称或 UUID），不显示也不计入统计 |
| 06 | 卡片 | 连接数、Swap 信息块、小卡片显示累计流量 / 费用到期 / 在线时间 |
| 07 | 流量 | 统计模式（探针计数 / 按重置日统计）、默认重置日与时区、重置倒计时、自动存档、按服务器设置重置日与**流量校准** |
| 08 | 花费 | 向访客公开费用、剩余价值卡片、折算货币、实时汇率接口、到期提醒天数、忽略计费节点 |
| 09 | 延迟 | 卡片探针开关与数量、全局默认线路、按服务器覆盖、延迟阈值、**丢包显示**（虚线 / 叉号 / 两者、不透明度、默认断点连线） |
| 10 | 高级 | 实时刷新间隔、导出 / 导入设置 JSON |

### 流量周期与校准

- **探针计数**（默认）：显示 Komari 探针上报的累计流量（由探针 `--month-rotate` 决定何时归零），重置日只用于倒计时。
- **按重置日统计**：每到重置日自动开始新周期。用量由 Komari 记录中的 `net_total_up/down` 计数器逐段累加，计数器回落（重启）时从零接续。
- **校准**：记录「此刻本周期已用 ↑/↓，此刻计数器读数」，之后在此基础上累加直到下一个重置日；「重置为 0」即校准为 0。
- Komari 默认只保留 1 天记录；保留时间短于周期时数值前显示「≈」，可开启**管理员访问时自动存档**或调大记录保留时间。

### 丢包虚线

节点详情的延迟图中，每次丢包在对应时间点画一条与任务同色的竖向虚线；同一时刻多任务丢包时虚线交错显示（dasharray `4 / 8n-4`，offset `-8·i`），丢包点取自原始采样，不受降采样影响。思路来自 [LuminaPlus-Dowsion-Modified](https://github.com/Dowsion-dev/LuminaPlus-Dowsion-Modified)。

## 开发

```bash
ADMIN=1 node tools/mock.js "$PWD/dist" 8787   # 模拟 Komari API + WebSocket（ADMIN=1 = 已登录）
# 浏览器打开 http://localhost:8787 ；设置页 http://localhost:8787/?view=theme-manage
```

## 发布

```bash
python3 tools/bump.py 1.4.1        # 同步 komari-theme.json 版本与资源 ?v= 版本号
# 在 CHANGELOG.md 顶部写上 ## 1.4.1 的更新内容
git commit -am "release: v1.4.1"
git push                            # main 上出现新版本号 → 自动打标签 v1.4.1 并发布 Release
```

GitHub Actions（`.github/workflows/release.yml`）在 `main` 的 `komari-theme.json` 版本号变化时运行：校验版本号与资源 `?v=` 一致，打包 `Komari-Theme-Horizon-v1.4.1.zip`，创建标签与 Release，更新说明取自 CHANGELOG 对应段落。已发布过的版本会跳过；自己推送 `v*` 标签也能触发。本地打包：`bash tools/package.sh`。

## 致谢

- 布局参考 gut.qzz.io
- 主题设置页参考 [Komari-Theme-LuminaPlus](https://github.com/shanyang242/Komari-Theme-LuminaPlus)
- 图标、国旗与字体见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 许可

[MIT](LICENSE)
