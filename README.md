# Cockpit+ (`id7_cockpit_plus`) for BMW iDrive 7

**Cockpit+** is an open-source MGU OAP instrument cluster and HUD overlay app for **BMW iDrive 7 (`ID7` / KOMBI4)** vehicles (G30, G20, G05, etc.).

Built on the calibrated [**Cluster+**](https://github.com/chyiz/idrive7-cluster-plus) (`v0.9.3`) wing-widget and powertrain engine, Cockpit+ adds top-center CarPlay / Baidu Maps / BMW lane guidance in the unused 5AU IR-camera pocket, an iOS-style proximity turn card, an auto-hiding arrival ETA capsule, a frameless digital speedometer overlay, and per-widget layout customization.

---

## Key Features

### Calibrated Cluster+ Wing & Powertrain Telemetry
- **Right-Wing Gauge Pocket (`right_widget`, `1244, 88, 536x520`)**: Calibrated KOMBI4 right-wing homography backdrop for Media (album artwork + CJK/Cyrillic/Latin title pagination), Trip/Powertrain stats, TPMS & Smart Alerts, and PHEV Charging finish time — cycle pages with the left-stalk **BC** button.
- **Left Below-Speed Readouts (`below_speed`, `392, 445`)**: Live efficiency (`mi/kWh`, `kWh/100km`, `MPG`, `L/100km`), EV power / charging `kW`, ICE RPM & turbo boost, with individual Line 1 / Line 2 Off toggles and clean `---` display at `0 km/h`.
- **Corner & Chassis Overlays**:
  - KOMBI4 `GEAR_WIN`-safe gear digit (`gear_d`, `x >= 1461`) & HVAC-colored interior cabin temperature (`cabin_temp`)
  - 20-segment DSC hydraulic friction-brake & PHEV ICE-charging rail (`brake_rail`)
  - Oil & coolant / gearbox temps (`corner_left`), 12V SoC / voltage / IAT (`corner_right`), and PHEV HV battery `%` (`hv_soc_gauge`)
- **Bold HUD Overlay (`0x323`)**: 3-line configurable HUD metrics, lead-car headway distance/time, road/exit banner, and vector turn-by-turn navigation that auto-yields only for BMW intersection mini-maps.

### Cockpit+ Navigation & Speed Overlays
- **5AU Top-Center Lane Guidance (`lane_guidance`, default `760, 20, 400x78`)**: Uses the unused top-center IR-camera space (`x=760..1160`, clear of the left speedometer `<=722` and right redline `>=1198`). Decodes `ProjectedModeGuiding.currentLaneGuiding` and `Guidance.currentLaneGuiding` (Apple Maps / Baidu Maps / BMW Navigation), even before an upcoming turn card appears.
- **Centered iOS Turn Card (`guidance_turn_card`, default `760, 110, 400x104`)**: Automatically appears within **`350 m`** (configurable) of an upcoming turn with a `2.5s` smooth dismiss hold, Redline vector maneuver arrows, highway exit badges, and CJK/Latin street names — positioned strictly left of `right_widget` (`1160 < 1244`) with zero overlap.
- **Bottom Arrival ETA Capsule (`eta_pill`, default `760, 648, 400x46`)**: Displays arrival time, remaining duration, and remaining distance from `ProjectedModeGuiding.waypoints` and `Guidance.{finalDestinationInfo,nextDestinationInfo}`, hiding cleanly once navigation stops.
- **Frameless Digital Speed (`speed`, default `372, 328, 220x90`)**: Toggleable box-free speedometer readout inside the left dial.

---

## Requirements

- **Vehicle**: BMW with **iDrive 7 (`ID7`)** MGU head unit and MGU Store / OAP support
- **Required Dependency**: `cluster-render` `>= 0.4.0` configured on default slot **`panel_slot = 0x203`**
- **Clean Install Note**: If switching from another cluster overlay app that renders on slots `0x203` / `0x323`, uninstall the previous app in MGU Store before installing Cockpit+. If a legacy setup switched `/var/opt/cluster-render/cluster-render.local.conf` to `panel_slot = 0x202`, restore default `0x203`:
  ```sh
  sh scripts/configure-cluster-slot.sh --revert
  ```
- **Using Alongside `waze-on-cluster` (Optional)**: To hide Waze's stock lower-left `speed_pod` / `guidance_pod` / `trip_pod` over Cockpit+'s centered navigation overlays:
  ```sh
  sh scripts/configure-waze-pods.sh
  ```

---

## Installation (MGU Store)

1. Connect your MGU head unit to Wi-Fi or a mobile hotspot and open **MGU Store**.
2. Add GitHub source (**Releases**):
   ```text
   Hyperionism/idrive7-cockpit-plus
   ```
   *(Repo Tree on branch `main` is also supported via `mgu-repo.json`, though **Releases** is recommended for faster one-click installs.)*
3. Ensure **`cluster-render`** (`>= 0.4.0`) is installed, then install **`Cockpit+` (`id7_cockpit_plus`)**.
4. Reboot the head unit (or restart HMI) after installation.

---

## Layout & Settings Customization

`right_widget` (`right_media`, `right_trip`, `right_tpms`, `right_charging`) stays **locked** to preserve the calibrated KOMBI4 right-wing bezel mask. Every other cluster overlay can be customized in two ways:

1. **In-Car iDrive Menu**: Open **Cockpit+ -> Cluster -> Nav & Speed Positions / Trigger...** to toggle each widget, choose turn-card trigger distance (`200 m` / `350 m` / `500 m` / `800 m` / `Always`), and adjust X/Y offsets.
2. **Runtime JSON Override (Hot-Reload, No Rebuild Required)**: Place `/var/opt/cluster-render/cockpit_layout.json` on the head unit (reloads within ~1s):
   ```json
   {
     "widgets": {
       "lane_guidance": { "enabled": true, "x": 760, "y": 20, "w": 400, "h": 78 },
       "guidance_turn_card": { "enabled": true, "x": 760, "y": 110, "w": 400, "h": 104, "autoTriggerDistanceMeters": 350, "dismissDelaySeconds": 2.5 },
       "eta_pill": { "enabled": true, "x": 760, "y": 648, "w": 400, "h": 46 },
       "speed": { "enabled": true, "x": 372, "y": 328, "w": 220, "h": 90, "fontSize": 72, "showUnit": true }
     }
   }
   ```
   *(Any attempt to override `right_widget` in JSON is ignored automatically, and `gear_d` always enforces `x >= 1461` to protect KOMBI4 `GEAR_WIN`.)*

---

## Development, Testing & Release Builds

Requires **Node.js** and **Python 3**:

```bash
# Build stub-SDK package (required for RHMI XML/JSON & hu-stub runtime tests)
npm run build:stub

# Run the full 29-test verification suite
npm test

# Interactive desktop cluster & HUD simulator (http://127.0.0.1:8078)
npm run bench

# Build clean no-SDK release bundle & Schema 2 MGU Store catalog
node release/build_catalog.js --repo Hyperionism/idrive7-cockpit-plus --tag v0.9.3
```

Never bundle BMW's proprietary `oap-sdk` into published packages; `--omit-sdk` releases rely on MGU Store donor-linking on the car.

---

## License & Credits

- Application source code: **GNU General Public License v3.0** ([`LICENSE`](LICENSE)).
- Derived from [`chyiz/idrive7-cluster-plus`](https://github.com/chyiz/idrive7-cluster-plus) (`GPL-3.0`).
- Runtime kit, vector navigation primitives, and RHMI tooling from [`cauliflowermossgrape/idrive7-apps`](https://github.com/cauliflowermossgrape/idrive7-apps) (`MIT`).
- IPC client [`cluster_render_client.js`](vendor/cauliflowermossgrape-idrive7-apps/apps/redline/cluster_render_client.js) (`MPL-2.0`, Robert Nisipeanu).
- `jpeg-js` (`Apache-2.0` / `BSD-3-Clause`), `Noto Sans CJK` (`OFL-1.1`), and `Ubuntu Font` (`UFL-1.0`).
- App launcher icon from `robertn_waze_cluster`.
