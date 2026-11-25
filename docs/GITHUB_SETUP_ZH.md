# Cockpit+ 零 U 盘 / 零本地 Git 发布与安装教程（GitHub 网页版 + MGU Store）

> 本地代码目录：`C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus`  
> 建议在 Antigravity 中将该目录设为当前工作区（Active Workspace），方便后续维护或发新版。

---

## 一、车机安装前检查（重点）

1. **是否要先卸载之前安装的国内版？**  
   - **是的，先在车机 MGU Store 卸载旧的“国内版”应用**，避免两个仪表增强应用同时抢占 HUD（`0x323`）和仪表扩展层（`0x203`）导致图层覆盖或超出上限。
2. **保留或确认底层依赖 `cluster-render`（>= 0.4.0）：**
   - `cluster-render` 必须保持安装状态，且 `panel_slot` 保持默认的 **`0x203`**。
   - 如果旧的国内版改写过 `/var/opt/cluster-render/cluster-render.local.conf` 成了 `panel_slot = 0x202`（会导致功率表和右侧多媒体异常），可通过 SSH 在车机执行本仓库的还原脚本：
     ```sh
     sh configure-cluster-slot.sh --revert
     ```
3. **如果你车上同时装了 `waze-on-cluster`：**
   - 如果希望仪表盘只显示 `Cockpit+` 自己的居中数字速度、5AU 车道条、iOS 转向卡和 ETA 胶囊，可按需通过 SSH 运行 `scripts/configure-waze-pods.sh` 关闭 Waze 原版重复的小窗。

---

## 二、在 GitHub 网页上创建仓库并上传代码（无需装 Git / Python）

### 第 1 步：创建公开仓库
1. 登录 [github.com](https://github.com)，点击右上角 **`+`** -> **`New repository`**。
2. **Repository name** 填写：`idrive7-cockpit-plus`。
3. **Visibility 必须选择 `Public`**（车机 MGU Store 需要公开拉取 Releases）。
4. **不要勾选** `Add a README file`、`.gitignore` 或 `license`（项目内均已配好）。
5. 点击 **`Create repository`**。

### 第 2 步：在 Windows 资源管理器显示隐藏文件夹（关键）
GitHub Actions 构建脚本位于 `.github` 隐藏目录中。上传前务必确认能看到 `.github`：
- 打开 `C:\Users\ASUS\.gemini\antigravity\scratch\idrive7-cockpit-plus`
- Windows 11：点击顶部 **`查看` -> `显示` -> 勾选 `隐藏的项目`**
- Windows 10：点击顶部 **`查看` -> 勾选 `隐藏的项目`**

### 第 3 步：一次性网页上传全库
> 当前项目共 93 个文件，小于 GitHub 网页单次上传 100 个文件的限制，可以一次上传完毕，无需分批。

1. 在新建的空仓库页面点击 **`uploading an existing file`**。
2. 打开本地 `idrive7-cockpit-plus` 文件夹，**全选里面的所有内容**（注意：**进入文件夹全选里面的项，不要拖外层整个目录名**）：
   - 文件夹：`.github`、`apps`、`bench`、`docs`、`release`、`scripts`、`shared`、`test`、`vendor`
   - 文件：`.gitignore`、`LICENSE`、`README.md`、`mgu-repo.json`、`package.json`
3. 拖入 GitHub 网页的上传框中，等全部文件进度条加载完成。
4. 底部填写提交说明（例如 `Initial Cockpit+ v0.9.3`），点击绿色 **`Commit changes`**。
5. 上传完成后，确认网页文件列表里能看到 `.github/workflows/release.yml` 和 `mgu-repo.json`。

---

## 三、一键云端打包并发布 GitHub Releases

上传后，GitHub 云端会自动用 Linux + Python 3 + Node 20 完成完整构建与自检（不包含任何 BMW 私有 `oap-sdk`，符合 MGU Store 规范）：

1. 在你的 GitHub 仓库顶部点击 **`Actions`** 标签页。
2. 在左侧工作流列表中点击 **`Build and Publish MGU Store Release`**。
3. 点击右侧 **`Run workflow`** 下拉按钮（`tag` 留空即可，会自动读取 `app.json` 中的版本号生成 `v0.9.3`），再点绿色的 **`Run workflow`**。
4. 等待约 **30～45 秒**，任务变成绿色对勾 `✅`。
5. 回到仓库主页右侧 **`Releases`**，确认已生成：
   - **`v0.9.3`**：包含 `id7_cockpit_plus@0.9.3.tgz`、`mgu-store.json`、`catalog.json`、`id7_cockpit_plus.png`
   - **`catalog`**：供 MGU Store 索引使用的 Schema 2 目录

---

## 四、在车机 MGU Store 安装 Cockpit+

1. 让车机连接手机热点 / Wi-Fi。
2. 打开车机上的 **MGU Store** -> 进入插件源 / **Sources**（或 Add GitHub Repo）。
3. 推荐模式：**Releases**，输入：
   ```text
   你的GitHub用户名/idrive7-cockpit-plus
   ```
   *(注：仓库根目录也附带了 `mgu-repo.json`，如使用 Branch `main` 模式也可识别，但强烈建议走 **Releases** 模式，安装最快。)*
4. 确认列表里 **`cluster-render`**（`>= 0.4.0`）已安装，然后安装 **`Cockpit+` (`id7_cockpit_plus`)**。
5. 安装完成后重启一次主机（长按音量旋钮 ~30 秒或锁车休眠后唤醒即可生效）。

---

## 五、上车后如何微调各组件位置与参数

- **Locked（已锁定）**：右侧多媒体 / 行程 / 胎压 / 充电面板（`right_widget`）位置保持与 `chyiz` v0.9.3 完全一致并锁定，防止曲面遮罩错位。
- **支持手动微调**：
  1. **iDrive 屏幕直接调**：进入 `Cockpit+ -> Cluster -> Nav & Speed Positions / Trigger...`，可直接开关及微调：
     - 5AU 顶置居中车道线（`laneBarNudgeX` / `laneBarNudgeY`）
     - 居中 iOS 转向卡与自动弹出距离（默认 350 米，支持 200/350/500/800/常显，及 X/Y 偏移）
     - 底部到达时间 ETA 胶囊（X/Y 偏移，结束导航后自动隐藏）
     - 仪表中间无框数字车速（支持开关与 X/Y 偏移）
  2. **无需重编译实时精调（可选）**：若后续连 SSH，可在 `/var/opt/cluster-render/cockpit_layout.json` 覆盖坐标（支持 `lane_guidance`、`guidance_turn_card`、`eta_pill`、`speed`、`below_speed` 等字段，`right_widget` 会被自动忽略保护），热重载约 1 秒生效。

---

## 六、后续修改代码或升级版本

- 若改了 `apps/id7_cockpit_plus/` 下的任意文件，顺便把 `apps/id7_cockpit_plus/app.json`、`mgu-repo.json`、`package.json` 里的版本号改高（例如 `0.9.4`），传上 GitHub 后再点一次 **Actions -> Run workflow**，车机 MGU Store 即可收到更新推送。
