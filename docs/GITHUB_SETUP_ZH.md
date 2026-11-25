# Cockpit+ 零 U 盘 / 零本地 Git 发布与安装教程（GitHub 网页版 + MGU Store）

> 本地代码目录：`C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus`  
> 建议在 Antigravity 中将该目录设为当前工作区（Active Workspace），方便后续维护或发新版。

---

## 一、车机安装前检查 & 全屏导航联用说明（重点）

1. **全屏导航联用架构（全自动，零重复遮挡）：**
   - 你车上已安装的 `waze-on-cluster`（2.0.29）负责解码 **1632×720 FullView 全屏导航视频**（CarPlay 高德 / 百度 / Apple 地图）以及红圈超速警示、HUD 地图。
   - 本仓库现在打包**双组件**：
     1. **`cockpit-fullview`（伴侣配置工具，v1.0.0）**：MGU Store 安装 `Cockpit+` 时**自动先安装**，自动把 `ID7.conf` 复制为 `ID7-cockpit.conf`，**只保留全屏地图画面**，并把原版会挡住界面、位置重合的 3 个内置小窗（`speed_pod = 0`、`guidance_pod = 0`、`trip_pod = 0`）干净关闭（已自动备份原配置，卸载即可一键还原）。
     2. **`id7_cockpit_plus`（Cockpit+ 仪表/HUD 套件，v0.9.3）**：以高优先级图层叠加显示 5AU 顶置居中车道线、居中 iOS 转向卡（默认 ≤350 米自动弹出）、底部 ETA 胶囊、居中无框数字车速、左侧单行车况与右侧曲面多媒体/行程卡片（Locked），全程**互不遮挡**。
2. **是否要先卸载之前安装的其它 HUD/仪表覆盖插件？**
   - **是的，请先在 MGU Store 卸载旧的第三方仪表覆盖插件**（保留 `cluster-render` 和 `waze-on-cluster` 即可），避免旧插件把 `panel_slot` 改去 `0x202` 或重复抢占 HUD（`0x323`）。
   - 如果旧插件改过 `/var/opt/cluster-render/cluster-render.local.conf` 成了 `panel_slot = 0x202`，可通过 SSH 执行 `sh scripts/configure-cluster-slot.sh --revert` 恢复 `0x203`。

---

## 二、同步更新到 GitHub 网页版仓库（无需装 Git / Python）

### 第 1 步：确认仓库可见性与显示隐藏文件夹
1. 你的仓库 [`Hyperionism/idrive7-cockpit-plus`](https://github.com/Hyperionism/idrive7-cockpit-plus) 必须保持 **`Public`**。
2. Windows 资源管理器显示隐藏项：
   - 打开 `C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus`
   - Windows 11：点击顶部 **`查看` -> `显示` -> 勾选 `隐藏的项目`**
   - Windows 10：点击顶部 **`查看` -> 勾选 `隐藏的项目`**

### 第 2 步：上传最新全部文件
> 当前全库共 98 个文件（`< 100`），仍可一次完整拖拽上传。若本地曾运行过 `npm run bench` 或测试脚本，请先确认文件夹内**没有**临时生成的 `dist/` 或 `oap-sdk/` 目录再拖拽。

1. 打开 `https://github.com/Hyperionism/idrive7-cockpit-plus` -> 点击 **`Add file` -> `Upload files`**。
2. 打开本地 `idrive7-cockpit-plus` 文件夹，**全选里面的所有内容**拖入网页上传框：
   - 文件夹：`.github`、`apps`、`bench`、`docs`、`release`、`scripts`、`shared`、`test`、`tools`、`vendor`
   - 文件：`.gitignore`、`LICENSE`、`README.md`、`mgu-repo.json`、`package.json`
3. 说明：`.github` 目录若被浏览器限制提示隐藏，保持把 `.github/workflows/*.yml` 一并拖到对应目录即可（你上次已经传成功 `.github`，这次如未改工作流也可或一起覆写上传）。
4. 底部填写提交说明（例如 `Add cockpit-fullview companion & Schema 2 release catalog`），点击绿色 **`Commit changes`**。

---

## 三、一键云端打包并发布 GitHub Releases

1. 上传后点击仓库顶部 **`Actions`**。
2. 在左侧点击 **`Build and Publish MGU Store Release`** -> 右侧 **`Run workflow`**（`tag` 留空即可自动用 `v0.9.3`）。
3. 等待 **30～45 秒**变为绿色 `✅`。
4. 确认 **`Releases`** 里已生成：
   - **`v0.9.3`**：同时包含 **`id7_cockpit_plus@0.9.3.tgz`**、**`cockpit-fullview@1.0.0.tgz`**、**`catalog.json`**（官方 Schema 2 数组格式）、`mgu-store.json`、`id7_cockpit_plus.png`
   - **`catalog`**：供 MGU Store 索引的 Schema 2 滚动目录

---

## 四、在车机 MGU Store 一键安装（零 U 盘 / 零 SSH）

1. 车机连上手机热点 / Wi-Fi，打开 **MGU Store** -> **Sources** -> 添加 GitHub 源：
   - 模式选择：**Releases**
   - 仓库填写：`Hyperionism/idrive7-cockpit-plus`
2. 点击安装 **`Cockpit+` (`id7_cockpit_plus`)**：
   - MGU Store 会自动先下载并激活 **`cockpit-fullview`**（自动把 `waze-on-cluster` 切到 `ID7-cockpit` 纯全屏地图模式、关闭重复的 3 个内置小窗），随后安装 `Cockpit+`。
3. 安装完成后重启一次主机（长按音量旋钮 ~30 秒或锁车休眠）。

---

## 五、上车后的位置微调

- **右侧卡片 (`right_widget`)**：已与 `chyiz` v0.9.3 对齐并锁定，防止曲面遮罩错位。
- **其余全屏导航元素可在 iDrive 屏幕实时微调**：进入 `Cockpit+ -> Cluster -> Nav & Speed Positions / Trigger...`，即可调整：
  - 5AU 顶置车道条开关与 X/Y 微调
  - 居中 iOS 转向卡弹出距离（`200 / 350 / 500 / 800 m / 常显`）与 X/Y 微调
  - 底部 ETA 胶囊开关与 X/Y 微调
  - 居中无框数字车速开关与 X/Y 微调
- **电脑端模拟预览**：在本地终端运行 `npm run bench` 后浏览器打开 `http://127.0.0.1:4400`，即可切换到 **FullView Map + Cockpit+ 日间/夜间模式** 预览。
