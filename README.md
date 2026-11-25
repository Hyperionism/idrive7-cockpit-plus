# Cockpit+ for BMW iDrive 7 (`id7_cockpit_plus`)

**Cockpit+** is a dual-component MGU Store navigation and instrument overlay suite for **BMW iDrive 7 (MGU / KOMBI4 + HUD)**:

- **Pure Full-Screen CarPlay / AMAP / Baidu Map Layer** (`cockpit-fullview` + `waze-on-cluster`): keeps `waze-on-cluster`'s `1632x720` `panel-safe` FullView H.264 video projection, KOMBI4 contour mask (`shape_top` / `shape_bottom`), overspeed halo, and HUD map alive while automatically switching to a clean `ID7-cockpit` profile (`speed_pod = 0`, `guidance_pod = 0`, `trip_pod = 0`) so C++ pods never overlap `Cockpit+`.
- **Calibrated Cluster+ & Navigation Overlays** (`id7_cockpit_plus` v0.9.3): sits cleanly on `panel` (`0x203`, `z = 11..15`) and `hud` (`0x323`) above the full-screen map without touching stock tachometer/speedometer needles or the right power meter.

---

## Features & Layer Layout

| Zone | Widget | Details |
| :--- | :--- | :--- |
| **Background Map** | FullView H.264 CarPlay / AMAP / Baidu | Configured automatically via **`cockpit-fullview`** (`ID7-cockpit` profile: keeps `1632x720` FullView map, disables redundant C++ pods cleanly and reversibly) |
| **Top Center** | **5AU Lane Guidance** (`lane_guidance`) | 5-lane highway schematic highlighting active/recommended lanes; auto-scales at `4..5` lanes; toggleable & X/Y adjustable |
| **Center** | **iOS Turn Card** (`guidance_turn_card`) | Renders turn arrow icon, street name, and remaining distance only within configurable trigger threshold (default **`350 m`**; supports `200 / 350 / 500 / 800 m / always`); supports CJK & CarPlay / Baidu maneuvers |
| **Bottom Center** | **ETA Capsule** (`eta_pill`) | Dark rounded capsule showing distance, ETA time, and arrival clock; auto-hides when navigation stops |
| **Center Digital Speed** | **Frameless Speed** (`speed`) | Clean digital speed readout with dark outline (`km/h` / `mph`); toggleable & X/Y adjustable |
| **Right Wing (Locked)** | **Cluster+ Wing Panel** (`right_widget`) | Media / Now Playing (with album art), Trip Computer, TPMS, or Charging telemetry; locked to calibrated `chyiz` v0.9.3 curved KOMBI4 mask |
| **Left Side** | **Engine & Driving Vitals** (`below_speed`) | Per-line compact telemetry (gear/oil/boost/fuel/voltage/tire/range) tucked cleanly below speed dial |
| **HUD (`0x323`)** | **Bold Navigation & Speed** | Crisp maneuver arrow, turn distance, ETA strip, and optional secondary speed readout |

---

## Coexistence Guarantee (Zero Overlap)

When installing `id7_cockpit_plus` from MGU Store, MGU Store automatically installs its companion root tool **`cockpit-fullview`**:

1. **Before**: Stock `waze-on-cluster` draws 3 hard-coded C++ boxes (`speed_pod` at left, `guidance_pod` at `1304,326` colliding with the right wing, `trip_pod` at bottom center colliding with the ETA pill).
2. **With `cockpit-fullview` (`ID7-cockpit`)**:
   - Keeps `waze-on-cluster`'s `1632x720` `panel-safe` FullView map, contour arcs, overspeed rim, and HUD map intact.
   - Backs up your existing `/var/opt/waze-on-cluster/waze-on-cluster.local.conf` once to `.cockpit-bak` and sets `fullview_profile = ID7-cockpit` with `speed_pod = 0`, `guidance_pod = 0`, `trip_pod = 0`.
   - Uninstalling `cockpit-fullview` automatically restores your original `waze-on-cluster` configuration.
3. **Standalone systems**: If `waze-on-cluster` is not installed on the head unit, `cockpit-fullview` exits cleanly (`0`) and `Cockpit+` operates directly over the native black KOMBI4 background.

> Previously installed another HUD/cluster overlay app (including modified third-party bundles that moved `cluster-render`'s `panel_slot` to `0x202`)? Uninstall the old overlay app first, and run `sh scripts/configure-cluster-slot.sh --revert` over SSH if needed to restore `panel_slot = 0x203`.

---

## Requirements

- **BMW MGU (iDrive 7 / ID7)** with `cluster-render` `>= 0.4.0` installed.
- *(For full-screen CarPlay / AMAP / Baidu projection)* `waze-on-cluster` already installed on MGU (`cockpit-fullview` configures it automatically; zero USB or SSH needed).

---

## Install via MGU Store (Releases Feed)

1. Open **MGU Store** on the head unit (connected to a phone hotspot or Wi-Fi).
2. Under **Sources** -> **Add GitHub Repo**, select **Releases** and enter:
   ```text
   Hyperionism/idrive7-cockpit-plus
   ```
3. Install **`Cockpit+` (`id7_cockpit_plus`)** — MGU Store automatically resolves and installs **`cockpit-fullview`** + verifies **`cluster-render`**.
4. Reboot iDrive once (hold the volume knob ~30 seconds or let the car enter sleep).

---

## Fine-Tuning & Live Override

- **On iDrive screen**: `Cockpit+ -> Cluster -> Nav & Speed Positions / Trigger...` adjusts the iOS turn card distance threshold, toggles overlays, and nudges X/Y coordinates of `lane_guidance`, `guidance_turn_card`, `eta_pill`, and `speed` in real time.
- **Via SSH JSON hot-reload (optional)**: write overrides to `/var/opt/cluster-render/cockpit_layout.json` (1-second hot reload; `right_widget` remains locked against accidental corruption).
- **Local PC Preview Bench**:
  ```sh
  npm run bench
  ```
  Opens a browser simulator at `http://127.0.0.1:4400` reproducing `panel` (`1920x720`) + `hud` (`480x160`), with Day/Night and Full-Screen CarPlay/AMAP map mock modes.

---

## Repository Structure

- `apps/id7_cockpit_plus/` — Node 8.16.2 (`ES2017`) OAP app source, KOMBI4/HUD renderers, navigation tracker, and CJK glyph support
- `tools/cockpit-fullview/` — MGU Store companion root tool (`kind: "tool"`) that switches `waze-on-cluster` to `ID7-cockpit` pure FullView mode
- `bench/` — Cross-platform (Windows Named Pipe + Linux/macOS Unix socket) PC live cluster/HUD preview simulator
- `release/build_catalog.js` — Packages both app and tool `.tgz` archives and generates MGU Store Schema 2 `catalog.json` + `mgu-store.json`
- `scripts/` — Optional SSH helpers (`configure-waze-pods.sh`, `configure-cluster-slot.sh`)
- `test/` — Automated stub-SDK build tests, glyph checks, `cockpit-fullview` unit tests, and Schema 2 catalog tests

## License

GPL-3.0-only (based on `cauliflowermossgrape` / `chyiz` iDrive 7 app tooling).
