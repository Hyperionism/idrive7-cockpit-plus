# Cockpit+ 开源全流程全屏导航套件：GitHub 云端编译 + MGU Store 安装指南

> 本地代码目录：`C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus`  
> 全库保留精简源码与补丁（共 98 个文件，小于 GitHub 网页单次 100 文件上限，无需安装 Git）。

---

## 一、本仓库已打通的开源全屏导航全套组件

无需再购买或依赖国内商家打包的付费闭源全屏地图！在 GitHub **`Actions`** 点击发布后，云端会在 Ubuntu 18.04 Docker 编译环境里从开源上游源码自动编译并发布整套 MGU 组件：

1. **`cluster-render` (`0.8.14`)**：基于 `robertnisipeanu/idrive-apps`（MPL-2.0/GPL-3.0），已打入 `1632x720` 全屏纹理上限补丁，负责集群 `0x203` + `0x100` + HUD `0x323` 分层合成。
2. **`waze-on-cluster` (`0.14.16`)**：基于 `robertnisipeanu/idrive-apps`（GPL-3.0），默认启用 **`1632x720` FullView 清晰度 + GPU 缩放（`hosted_vpp_scale = 1`）+ `--res 1632x720`**（CarPlay 高德 / 百度 / Apple 地图 / Google 地图 / Android Auto），且**不含任何挡住 Cockpit+ 的冗余 C++ 小窗**。
3. **`robertn_waze_cluster` (`0.6.16`)**：车机上的《Maps on cluster》控制面板，用来一键激活/查看 CarPlay/Android Auto 内存补丁、开关 HUD 地图与查看日志。
4. **`mgu-render` (`0.6.26`，可选组件)**：源自 `robertnisipeanu/mgu-store`（`idrive7-renderd` / `mgu-renderd` 最新开源上游），供其它 60fps OpenGL ES 2 仪表应用共用。
5. **`cockpit-fullview` (`1.0.0`)**：兼容保留了旧付费版 `waze-on-cluster 2.x` 的车辆（自动切换无 C++ 小窗的 `ID7-cockpit` 配置）；装了上面开源 `0.14.16` 的车辆会自动静默跳过。
6. **`id7_cockpit_plus` (`0.9.4`，Cockpit+ 本体 — 原生简体中文)**：通过 `cluster-render` 的原生 **`host` 协议** 直接把全屏 CarPlay 地图托管渲染在 `panel` (`0x203`, `144,0`, `1632x720`) 底层，配合 **GLSL 弧线淡出遮罩**，在地图之上无遮挡渲染 5AU 车道条、350m 居中 iOS 转向卡、ETA 胶囊、数字车速、左右侧中文车况卡片及 HUD；iDrive 全部菜单、设置项与诊断页已通过 BMW `StringBundle` 完整中文化。

---

## 二、上车卸载与防变砖检查（重要）

1. **可以放心删掉**：
   - 旧的 `chyiz` 仪表应用（`idrive7-cluster-plus`）
   - 旧的国内商家改版全屏地图（`waze-on-cluster 2.x`）、`cluster-render 2.x`、`idrive7-renderd 2.x` 及其它 HUD 覆盖插件
2. **⚠️ 千万不要删这两个底座**：
   - **`mgu-store`（商店本体）** 与 **`mgu-deploy`（安装器）** —— 如果把它们卸载了，车机屏幕上的 MGU Store 会消失，必须重新连电脑用 USB/SSH 刷回！
3. 若旧版第三方工具曾经改过 `/var/opt/cluster-render/cluster-render.local.conf` 成了 `panel_slot = 0x202`，请确认先用 SSH 运行一次 `sh scripts/configure-cluster-slot.sh --revert` 还原到 `0x203`。

---

## 三、上传更新到 GitHub 网页版仓库（共 98 个文件，一次传完）

1. 先确认本地 `C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus` 文件夹中**没有**残留 `dist/` 或 `oap-sdk/` 目录。
2. Windows 资源管理器确认已开启 **`显示隐藏的项目`**（能看到 `.github`）。
3. 打开 [`Hyperionism/idrive7-cockpit-plus`](https://github.com/Hyperionism/idrive7-cockpit-plus) -> **`Add file` -> `Upload files`**。
4. 进入本地 `idrive7-cockpit-plus` 目录全选所有项拖入上传框：
   - 文件夹：`.github`、`apps`、`bench`、`docs`、`native`、`release`、`scripts`、`shared`、`test`、`tools`、`vendor`
   - 文件：`.gitignore`、`LICENSE`、`README.md`、`mgu-repo.json`、`package.json`
   - *(如果浏览器跳过 `.github` 里的内容，按你之前的方式单独打开 `.github/workflows/` 拖拽覆写 `release.yml` 与 `ci.yml`。)*
5. 底部点绿色 **`Commit changes`**。

---

## 四、触发 GitHub 云端 Docker 编译并发布

1. 打开仓库顶部 **`Actions`** -> 左侧选择 **`Build and Publish MGU Store Release`** -> 右侧 **`Run workflow`**（`tag` 留空会自动读取 `v0.9.4`）。
2. 由于这次会在云端 Docker 编译全套原生 C/C++ 组件并运行 C++ 单元测试，耗时约 **3～5 分钟**。
3. 变绿 `✅` 后，点开右侧 **`Releases` -> `v0.9.4`**，即可看到完整 6 个组件 `.tgz`、`catalog.json` 与 `mgu-store.json`。

---

## 五、在车机 MGU Store 一键安装全套组件

1. 车机连上热点 -> 打开 **MGU Store -> Sources -> 添加 Releases 源**：`Hyperionism/idrive7-cockpit-plus`。
2. 直接安装 **`Cockpit+` (`id7_cockpit_plus`)**：MGU Store 会自动按顺序拉取安装 `cluster-render`、`waze-on-cluster`、`cockpit-fullview` 和 `Cockpit+`。
3. 建议顺便安装同目录里的 **`Maps on cluster` (`robertn_waze_cluster`)**（用于确认/激活 CarPlay & Android Auto 内存补丁与切换 HUD 地图）；如有需要其它 60fps 仪表也可再装 **`mgu-render`**。
4. 安装完毕后长按音量旋钮 ~30 秒重启一次主机。
5. 车机开启后如想切换地图模式（`1632x720 全屏` / `1088x480 居中` / `关闭`）或仪表表圈角淡出遮罩，直接在 iDrive 进入 **`Cockpit+ -> Cluster -> Nav & Speed Positions / Trigger...`** 即可实时调整。
