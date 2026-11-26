# Cockpit+ for BMW iDrive 7 (`id7_cockpit_plus`)

[简体中文](#简体中文) | [English](#english)

---

<a id="简体中文"></a>

## 简体中文

> [!WARNING]
> **尚未经过实车测试**：本项目目前仅通过自动化单元测试、`hu-stub.js` 车机运行桩与桌面模拟器验证，**尚未在真实 BMW iDrive 7 实车 / 实体 MGU 车机上进行完整实测**。在车机上安装或调试前请自行做好原有配置备份，切勿卸载 `mgu-store` 与 `mgu-deploy` 等基础组件。

**Cockpit+** 是一套完全开源的 **BMW iDrive 7（MGU / KOMBI4 液晶仪表 + HUD 抬头显示）** 全屏导航与数字驾驶舱套件。

只需在车机 **MGU Store** 中添加单一开源仓库源 `Hyperionism/idrive7-cockpit-plus`，即可一站式获取 `1632x720` 全屏 CarPlay / Android Auto 地图投屏所需的全部开源底层组件，以及与原生仪表布局深度融合的简体中文数字仪表 / HUD 增强界面。

### 组件构成

| 组件名 | 类型 | 版本 | 说明 |
| :--- | :--- | :--- | :--- |
| **`cluster-render`** | 工具 | `0.8.14` | 共享 RAMSES 19 + Dcsm2 仪表与 HUD 合成器，已解锁 `1632x720` 地图纹理尺寸上限（基于 `robertnisipeanu/idrive-apps`，MPL-2.0 / GPL-3.0） |
| **`waze-on-cluster`** | 工具 | `0.14.16` | FullView 全屏 H.264 CarPlay / Android Auto 地图解码器（`tex_size = 1632x720`、`hosted_vpp_scale = 0`、`--res 1632x720`）并支持 HUD 投影（GPL-3.0） |
| **`robertn_waze_cluster`** | 应用 | `0.6.16` | *Maps on Cluster* 车机控制界面，用于在 iDrive 内开启 / 校验内存地图投屏补丁、开关 HUD 地图与查看日志（GPL-3.0） |
| **`mgu-render`** | 工具 *（可选）* | `0.6.26` | 60 fps OpenGL ES 2 GPU 渲染守护进程（源自 `robertnisipeanu/mgu-store`），供其他 GPU 绘制应用使用 |
| **`cockpit-fullview`** | 工具 | `1.0.0` | 当存在旧版自定义配置冲突时，自动可逆地修复 `cluster-render.local.conf` 中的 `panel_scene_id` / `panel_slot` 并禁用重叠的原生 C++ 浮窗；纯开源环境安装时自动跳过 |
| **`id7_cockpit_plus`** | 应用 | `0.9.4` | **Cockpit+ 主程序**：提供原生简体中文（`zh-CN`）iDrive 设置与诊断菜单，在 `panel`（`0x203`）上以 `1632x720` 托管全屏实时地图与弧形表圈遮罩，并叠加 5AU 车道引导、居中转向卡、ETA 胶囊、无框车速、左侧工况数据、右侧 BC 卡片及 HUD 中文导航 |

### 视觉层级与防遮挡设计

当 `Cockpit+` 运行在 `panel` 图层（槽位 `0x203`，`1920x720`，渲染优先级位于原车表圈、指针与底部信息栏之后）：

1. **托管 FullView 全屏地图层（`z = 0`，`144,0`，`1632x720`）**：通过 `cluster-render` 的 `host` 接口将 `waze-on-cluster` 解码的 CarPlay / Android Auto / 高德 / 百度 / Apple 地图视频流直接嵌入中心仪表区域，所有 `Cockpit+` 控件均位于地图之上。
2. **KOMBI4 弧形表圈渐变遮罩（`z = 2`）**：内置 GLSL ES 1.00 `bezel_mask` 着色器对仪表四角弧形表圈边缘进行平滑羽化过渡（`shape_top = 374x354`，`shape_bottom = 408x168`），避免直角硬边裁切，无需上传额外大尺寸位图。
3. **Cockpit+ 仪表叠加控件（`z = 11..15`）**：
   - **顶部居中**：**5AU 车道引导条**（`lane_guidance`）
   - **居中上部**：**iOS 风格转向提示卡**（`guidance_turn_card`，临近路口自动弹出，触发距离可在菜单设为 `200m / 350m / 500m / 800m / 常显`，默认 `350 m`）
   - **底部居中**：**预计到达 ETA 胶囊**（`eta_pill`，未导航时自动隐藏）
   - **居中车速**：**无框数字车速**（`speed`，黑色描边清晰防遮挡）
   - **车速下方工况**：实时能耗 / 功率 / 转速 / 涡轮压力（`below_speed`）
   - **右侧表盘卡片**：已校准几何位置的 **媒体专辑封面与进度 / 行程与动力总成 / 胎压胎温与异常警报 / 插混充电完成时间**（`right_widget`），通过左侧拨杆 **BC 键** 循环切换
   - **左下 / 右下角标**：机油 / 水温 / 变速箱油温（`corner_left`）、12V 电瓶 / 高压电池 / 进气温度（`corner_right`）与只读制动 / 回充状态条（`brake_rail`）
4. **HUD 抬头显示（`0x323`）**：支持中文道路名称与高速出口绿牌显示、放大版转向矢量与 6 车道引导、前车车距与 3 行紧凑车况数据，并在原车路口放大图弹出时自动避让。

### 通过 MGU Store 安装（Releases 源）

1. 让车机连接手机热点或 Wi-Fi，在车机中打开 **MGU Store → Sources（软件源）**。
2. 选择 **Releases** 类型并添加仓库地址：
   ```text
   Hyperionism/idrive7-cockpit-plus
   ```
3. 刷新列表后安装 **`Cockpit+ 驾驶舱增强`（`id7_cockpit_plus`）**，商店会自动按依赖安装 `cluster-render`、`waze-on-cluster` 与 `cockpit-fullview`。
4. 再安装 **`Maps on cluster`（`robertn_waze_cluster`）** 以在 iDrive 菜单内启用 CarPlay / Android Auto 投屏补丁（如需运行其他 OpenGL ES 2 应用可一并安装 `mgu-render`）。
5. 长按中控音量旋钮约 30 秒重启一次 iDrive 后即可进入设置与诊断界面查看连接状态。

> **重要提示**：如果车机此前安装过其他版本的仪表叠加插件，请先在 MGU Store 中卸载旧版插件后再安装本套件，并**务必保留 `mgu-store` 和 `mgu-deploy` 不要卸载**。

### 本地构建、测试与桌面模拟器

```sh
# 1. 使用 stub-SDK 构建简体中文版安装包（用于本地测试）
python3 vendor/cauliflowermossgrape-idrive7-apps/kit/tools/build.py --app-root . --language zh-CN --stub-sdk id7_cockpit_plus

# 2. 运行全部单元测试（核心 29 项 + 伴侣工具/中文包/Schema 2 目录 8 项）
REQUIRE_DIST=1 node test/run_tests.js
node test/fullview_companion_test.js

# 3. 启动本地桌面预览模拟器
npm run bench
```

---

<a id="english"></a>

## English

> [!WARNING]
> **NOT YET TESTED ON A REAL VEHICLE**: This project has only been verified using automated unit tests, the `hu-stub.js` head-unit stub runtime, and the desktop bench simulator. **It has NOT yet been tested on a physical BMW iDrive 7 vehicle / MGU head unit.** Back up existing configurations before installing, proceed at your own risk, and **never uninstall `mgu-store` or `mgu-deploy`**.

**Cockpit+** is a complete open-source **BMW iDrive 7 (MGU / KOMBI4 Instrument Cluster + HUD)** full-screen navigation and digital cockpit suite designed for **MGU Store (Releases feed)**.

Adding **`Hyperionism/idrive7-cockpit-plus`** as a single Releases source provides all open-source runtimes needed for `1632x720` FullView CarPlay / Android Auto map projection alongside Simplified Chinese (`zh-CN`) iDrive menus, CJK road-name rendering, and calibrated cluster / HUD telemetry overlays.

### Components

| Component | Kind | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **`cluster-render`** | Tool | `0.8.14` | Shared RAMSES 19 + Dcsm2 cluster & HUD compositor with unlocked `1632x720` map texture ceiling (from `robertnisipeanu/idrive-apps`, MPL-2.0 / GPL-3.0) |
| **`waze-on-cluster`** | Tool | `0.14.16` | FullView CarPlay / Android Auto H.264 decoder (`tex_size = 1632x720`, `hosted_vpp_scale = 0`, `--res 1632x720`) + HUD map projection (GPL-3.0) |
| **`robertn_waze_cluster`** | App | `0.6.16` | *Maps on Cluster* iDrive control UI to arm/verify in-memory CarPlay / AA patching, toggle HUD map, and inspect logs (GPL-3.0) |
| **`mgu-render`** | Tool *(optional)* | `0.6.26` | 60 fps OpenGL ES 2 GPU renderer daemon (from `robertnisipeanu/mgu-store`) for GPU-rendered MGU apps |
| **`cockpit-fullview`** | Tool | `1.0.0` | Reversibly repairs conflicting `panel_scene_id` / `panel_slot` overrides in `cluster-render.local.conf` and disables overlapping C++ pods when legacy profiles exist; no-ops cleanly on fresh open-source setups |
| **`id7_cockpit_plus`** | App | `0.9.4` | **Cockpit+**: auto-hosts the live `1632x720` CarPlay/AA map on `panel` (`0x203`) with curved KOMBI4 bezel masking underneath 5AU lanes, centered 350 m iOS turn card, ETA capsule, digital speed, left vitals, BC-cyclable right wing widget, and CJK-capable HUD nav (`zh-CN` default release build) |

### Visual Layout & Zero-Overlap Hosting

When `Cockpit+` renders on `panel` (`0x203`, `1920x720`, composited behind BMW's OEM dial rings, needles, and bottom bar):

1. **Hosted FullView Video Layer (`z = 0`, `144,0`, `1632x720`)**: Uses `cluster-render`'s `host` API to place `waze-on-cluster`'s live H.264 stream (Apple Maps, Google Maps, AMAP, Baidu Maps, Waze) directly inside the central cluster area underneath `Cockpit+`'s overlays.
2. **KOMBI4 Bezel Corner Fade (`z = 2`)**: Lightweight GLSL ES 1.00 `bezel_mask` fragment shader smoothly feathers the four inner dial corners (`shape_top = 374x354`, `shape_bottom = 408x168`) without uploading extra bitmap assets.
3. **Cockpit+ Overlay Zones (`z = 11..15`)**:
   - **Top Center**: **5AU Lane Guidance** (`lane_guidance`)
   - **Center**: **iOS Turn Card** (`guidance_turn_card`, auto-triggers near maneuvers at configurable distance `200m / 350m / 500m / 800m / Always`, default `350 m`)
   - **Bottom Center**: **ETA Capsule** (`eta_pill`, hidden automatically when no route is active)
   - **Center Speed**: **Frameless Digital Speed** (`speed`)
   - **Left Vitals**: Engine, boost, efficiency, and powertrain vitals (`below_speed`)
   - **Right Wing Widget**: Calibrated **Media Artwork / Trip & Powertrain / TPMS & Smart Alerts / PHEV Charging Finish** widget (`right_widget`), cycled via the steering-column **BC** button
   - **Bottom Corners & Brake Rail**: Read-only temperatures, 12V / HV SoC, and friction-brake / ICE-charge indicator
4. **HUD (`0x323`)**: Bold maneuver vector arrow + 6-lane guidance, CJK-capable road & green highway exit banner, lead-car headway badge, compact 3-line telemetry, and automatic yield when BMW's native intersection mini-map appears.

### Install via MGU Store (Releases Feed)

1. Connect the head unit to a phone hotspot or Wi-Fi and open **MGU Store → Sources**.
2. Add a **Releases** source:
   ```text
   Hyperionism/idrive7-cockpit-plus
   ```
3. Install **`Cockpit+` (`id7_cockpit_plus`)** — MGU Store automatically resolves `cluster-render`, `waze-on-cluster`, and `cockpit-fullview`.
4. Install **`Maps on cluster` (`robertn_waze_cluster`)** to arm/check CarPlay & Android Auto patching from the iDrive menu (and optionally `mgu-render` for OpenGL ES 2 apps).
5. Reboot iDrive once (hold the volume knob for ~30 seconds).

> **Note**: If migrating from other third-party cluster overlays, uninstall the previous overlay components first while keeping **`mgu-store`** and **`mgu-deploy`** installed.

### Local Verification & Simulator Bench

```sh
python3 vendor/cauliflowermossgrape-idrive7-apps/kit/tools/build.py --app-root . --language zh-CN --stub-sdk id7_cockpit_plus
REQUIRE_DIST=1 node test/run_tests.js
node test/fullview_companion_test.js
npm run bench
```

---

## Credits & License

- Built upon [`chyiz/idrive7-cluster-plus`](https://github.com/chyiz/idrive7-cluster-plus), [`cauliflowermossgrape/idrive7-apps`](https://github.com/cauliflowermossgrape/idrive7-apps), [`robertnisipeanu/idrive-apps`](https://github.com/robertnisipeanu/idrive-apps), and [`robertnisipeanu/mgu-store`](https://github.com/robertnisipeanu/mgu-store).
- `id7_cockpit_plus`, `waze-on-cluster`, `robertn_waze_cluster`: **GPL-3.0-only / GPL-3.0-or-later**
- `cluster-render` client/protocol/kit: **MPL-2.0**; service: **GPL-3.0-or-later**
- `mgu-render`: **GPL-3.0 / MIT**
