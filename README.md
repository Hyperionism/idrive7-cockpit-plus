# Cockpit+ (`id7_cockpit_plus`) for BMW iDrive 7

**Cockpit+** combines the calibrated **Cluster+** (`chyiz/idrive7-cluster-plus` v0.9.3) KOMBI4 & HUD engine with Apple Maps / Baidu Maps / BMW Navigation overlays built for non-5AU G30/G20/X5 MGU head units:

- **Calibrated Cluster+ Wing & Powertrain Suite**:
  - Locked `right_widget` (`1244, 88, 536x520`) using `chyiz` v0.9.3's calibrated KOMBI4 right-wing homography mask (Media cover art + Cyrillic/CJK title pagination, Trip/Powertrain, TPMS/Alerts, PHEV Charging Finish Time).
  - Per-line controllable below-speed metrics (`belowSpeedLine1`, `belowSpeedLine2`), clean `---` at `0 km/h`, white ICE gas telemetry + RPM/boost, `km->mi` trip scaling, and KOMBI4 `GEAR_WIN` (`x >= 1461`) protection.
- **5AU Top-Center Lane Guidance (`lane_guidance`, default `760, 20, 400x78`)**:
  - Sits inside the unused top-center IR-camera pocket (`x=760..1160`, clear of left speedometer ring `<=722` and right redline `>=1198`).
  - Decodes `ProjectedModeGuiding.currentLaneGuiding` & `Guidance.currentLaneGuiding` (Apple Maps / Baidu Maps / BMW Navigation), even when no HUD maneuver card is active.
- **Centered iOS Turn Card (`guidance_turn_card`, default `760, 110, 400x104`)**:
  - Triggers automatically near upcoming turns (`350 m` default, configurable via iDrive menu or `cockpit_layout.json`, `2.5s` smooth dismiss hysteresis).
  - Positioned strictly left of `right_widget` (`1160 < 1244`, 84px clearance) with sharp Redline vector maneuver arrows + Chinese/CJK street names via `cjk_gothic.pack`.
- **Bottom iOS Arrival ETA Pill (`eta_pill`, default `760, 648, 400x46`)**:
  - Reads `ProjectedModeGuiding.waypoints` and `Guidance.{finalDestinationInfo,nextDestinationInfo}` and hides automatically when navigation ends.
- **Frameless Digital Speed (`speed`, default `372, 328, 220x90`)**:
  - Clean transparent speedometer readout toggleable & adjustable independently of the calibrated right wing.
- **Adjustable Layout**:
  - `right_widget` stays locked to prevent breaking the curved right gauge mask.
  - Every other cluster layer supports fine offsets inside iDrive (`Cluster -> Nav & Speed Positions / Trigger...`) AND direct coordinates in `apps/id7_cockpit_plus/layout_config.js` or runtime `/var/opt/cluster-render/cockpit_layout.json`.

---

## Requirements (On Car)

- **BMW iDrive 7 (`ID7`)** MGU head unit with MGU Store / OAP runtime
- **`cluster-render` `>= 0.4.0`** (must stay on default slot `panel_slot = 0x203`)
- *(Optional)* `waze-on-cluster` (`scripts/configure-waze-pods.sh` can hide Waze's stock lower-left speed/guidance/trip pods if desired)
- *(Switching from domestic / legacy versions)* Uninstall the previous domestic version in MGU Store before installing `Cockpit+`; if it changed `/var/opt/cluster-render/cluster-render.local.conf` to `panel_slot = 0x202`, run `sh scripts/configure-cluster-slot.sh --revert`.

---

## Publishing Without USB or Git CLI

1. Create a **Public** GitHub repository (for example `<username>/idrive7-cockpit-plus`).
2. Upload all files from this folder via GitHub Web (**Add file -> Upload files**, total ~93 files — fits in a single upload; make sure hidden `.github/` folder is visible when dragging!).
3. Open the **Actions** tab on GitHub -> **Build and Publish MGU Store Release** -> **Run workflow**.
4. GitHub Actions automatically runs all tests, builds the `--omit-sdk` package (`id7_cockpit_plus@0.9.3.tgz`, without proprietary `oap-sdk`), generates `mgu-store.json` & Schema 2 `catalog.json`, and publishes both `v0.9.3` and `catalog` GitHub Releases.
5. In your car's **MGU Store**, add `<username>/idrive7-cockpit-plus` (**Releases**) and install **Cockpit+**.

See [`docs/GITHUB_SETUP_ZH.md`](docs/GITHUB_SETUP_ZH.md) for the complete beginner-friendly Chinese guide.

---

## Development & Verification

```bash
# Run unit & renderer tests locally (Node.js only)
npm test

# Full build + test including RHMI XML/JSON checks (requires Python 3)
npm run build:stub
npm test

# Interactive desktop visual bench
npm run bench
```

## License & Attribution

- Cockpit+ application code: **GNU General Public License v3.0** (`LICENSE`).
- Built upon [`chyiz/idrive7-cluster-plus`](https://github.com/chyiz/idrive7-cluster-plus) (`GPL-3.0`) and [`cauliflowermossgrape/idrive7-apps`](https://github.com/cauliflowermossgrape/idrive7-apps) (`MIT`), with [`cluster_render_client.js`](vendor/cauliflowermossgrape-idrive7-apps/apps/redline/cluster_render_client.js) (`MPL-2.0`), `jpeg-js` (`Apache-2.0` / `BSD-3-Clause`), `Noto Sans CJK` (`OFL-1.1`), and `Ubuntu Font` (`UFL-1.0`).
- App icon: stock [`robertn_waze_cluster`](apps/id7_cockpit_plus/icon.png) icon as requested.
