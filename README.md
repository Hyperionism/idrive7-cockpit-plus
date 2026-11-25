# Cockpit+ FullView Suite for BMW iDrive 7 (`id7_cockpit_plus`)

**Cockpit+** is a complete, 100% open-source MGU Store navigation & digital cockpit suite for **BMW iDrive 7 (MGU / KOMBI4 + HUD)** — zero paid third-party full-screen map apps required.

Adding **`Hyperionism/idrive7-cockpit-plus`** as a single MGU Store Releases source gives users every open-source runtime needed for full-screen CarPlay / Android Auto / AMAP / Baidu map projection and HUD/Cluster telemetry:

| Component | Kind | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **`cluster-render`** | Tool | `0.8.14` | Shared RAMSES 19 + Dcsm2 cluster & HUD compositor with unlocked `1632x720` map texture ceiling (from `robertnisipeanu/idrive-apps`, MPL-2.0 / GPL-3.0) |
| **`waze-on-cluster`** | Tool | `0.14.16` | FullView CarPlay / Android Auto H.264 decoder (`tex_size = 1632x720`, `hosted_vpp_scale = 1`, `--res 1632x720`) + HUD map projection (from `robertnisipeanu/idrive-apps`, GPL-3.0) |
| **`robertn_waze_cluster`** | App | `0.6.16` | *Maps on Cluster* iDrive control UI to enable/verify the in-memory CarPlay / AA patch, toggle HUD map, and view logs (GPL-3.0) |
| **`mgu-render`** | Tool *(optional)* | `0.6.26` | 60 fps OpenGL ES 2 GPU renderer daemon (`mgu-renderd` successor from `robertnisipeanu/mgu-store`) for GPU-drawn MGU apps |
| **`cockpit-fullview`** | Tool | `1.0.0` | Automatically sets `ID7-cockpit` (`speed_pod = 0`, `guidance_pod = 0`, `trip_pod = 0`) if a legacy `2.x` paid `waze-on-cluster` fork is still present; harmlessly skips on open-source installs |
| **`id7_cockpit_plus`** | App | `0.9.4` | **Cockpit+**: auto-hosts the `1632x720` live CarPlay/AA map on `panel` (`0x203`) with curved KOMBI4 bezel masking underneath calibrated 5AU lanes, centered 350 m iOS turn card, ETA capsule, digital speed, left vitals, right wing widget, and HUD nav |

---

## Visual Layout & Zero-Overlap Hosting

When `Cockpit+` runs on `panel` (`0x203`, `1920x720`):

1. **Hosted FullView Video Layer (`z = 0`, `144,0` `1632x720`)**: `Cockpit+` uses `cluster-render`'s `host` API to render `waze-on-cluster`'s `1632x720` H.264 stream (Apple Maps, Google Maps, AMAP/高德, Baidu Maps/百度, Waze) directly inside the central instrument area underneath `Cockpit+`'s overlays.
2. **KOMBI4 Bezel Corner Fade (`z = 2`)**: GLSL `bezel_mask` shader smoothly feathers the inner curved dial bezel corners (`shape_top = 374x354`, `shape_bottom = 408x168`) without uploading extra bitmaps.
3. **Cockpit+ Overlay Zones (`z = 11..15`)**:
   - **Top Center**: **5AU Lane Guidance** (`lane_guidance`)
   - **Center**: **iOS Turn Card** (`guidance_turn_card`, auto-shows within configurable threshold, default `350 m`)
   - **Bottom Center**: **ETA Capsule** (`eta_pill`, auto-hides when not navigating)
   - **Center Speed**: **Frameless Digital Speed** (`speed`, dark outline)
   - **Left Vitals**: Per-line engine & driving vitals (`below_speed`)
   - **Right Wing (Locked)**: Calibrated Media / Trip / TPMS / Charging widget (`right_widget`)
4. **HUD (`0x323`)**: Bold maneuver card, top road/exit banner, compact 3-line telemetry, and auto-yield on native intersection mini-map.

---

## Install via MGU Store (Releases Feed)

1. Connect MGU to a phone hotspot or Wi-Fi and open **MGU Store** -> **Sources**.
2. Choose **Releases** and add:
   ```text
   Hyperionism/idrive7-cockpit-plus
   ```
3. Install **`Cockpit+` (`id7_cockpit_plus`)** — MGU Store automatically installs `cluster-render`, `waze-on-cluster`, and `cockpit-fullview` in dependency order. Optionally install **`Maps on cluster` (`robertn_waze_cluster`)** to arm/check CarPlay & Android Auto patching from the iDrive menu, and **`mgu-render`** if you also run OpenGL ES 2 apps.
4. Reboot iDrive once (hold the volume knob ~30 seconds).

> **Note**: If migrating from modified third-party overlays, uninstall the old overlay apps first (keep `mgu-store` / `mgu-deploy`!), and if `cluster-render` `panel_slot` was changed to `0x202`, run `sh scripts/configure-cluster-slot.sh --revert`.

---

## Local Verification & Simulator Bench

```sh
python3 vendor/cauliflowermossgrape-idrive7-apps/kit/tools/build.py --app-root . --stub-sdk id7_cockpit_plus
REQUIRE_DIST=1 node test/run_tests.js
node test/fullview_companion_test.js
npm run bench
```

## License

- `id7_cockpit_plus`, `waze-on-cluster`, `robertn_waze_cluster`: **GPL-3.0-only / GPL-3.0-or-later**
- `cluster-render` client/protocol/kit: **MPL-2.0**; service: **GPL-3.0-or-later**
- `mgu-render`: **GPL-3.0 / MIT**
