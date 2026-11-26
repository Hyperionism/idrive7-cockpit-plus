'use strict';
/**
 * bench/run-app.js - Child worker launching the staged dist/id7_cockpit_plus bundle
 * inside MGU App Kit's hu-stub runtime and streaming telemetry to bench/server.js.
 */

const fs = require('fs');
const path = require('path');

const stageDir = process.argv[2];
const dataRoot = process.argv[3];
if (!stageDir || !dataRoot) {
    console.error('usage: node bench/run-app.js <dist/id7_cockpit_plus> <dataDir>');
    process.exit(2);
}

const VENDOR_TOOLS = path.join(__dirname, '..', 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'tools');

function postToParent(msg) {
    if (typeof process.send === 'function' && process.connected) process.send(msg);
}

function formatArgs(args) {
    const out = [];
    for (let i = 0; i < args.length; i++) {
        const item = args[i];
        if (item && item.stack) out.push(item.stack);
        else if (typeof item === 'object') out.push(JSON.stringify(item));
        else out.push(String(item));
    }
    return out.join(' ');
}

const benchLogger = {
    info() {
        const s = formatArgs(arguments);
        console.log('[id7_cockpit_plus] ' + s);
        postToParent({ t: 'log', level: 'info', s });
    },
    warn() {
        const s = formatArgs(arguments);
        console.warn('[id7_cockpit_plus] WARN ' + s);
        postToParent({ t: 'log', level: 'warn', s });
    },
    error() {
        const s = formatArgs(arguments);
        console.warn('[id7_cockpit_plus] ERROR ' + s);
        postToParent({ t: 'log', level: 'error', s });
    },
    debug() {},
};

process.on('uncaughtException', (err) => {
    benchLogger.error('uncaught exception: ' + ((err && err.stack) || err));
    process.exit(1);
});

const ipcDir = path.join(dataRoot, 'ipc');
fs.mkdirSync(ipcDir, { recursive: true });
process.env.CLUSTER_INFO_DIR = ipcDir;
process.env.COCKPIT_PLUS_BENCH = '1';
process.env.CLUSTER_METRICS_BENCH = '1';

const { headUnit } = require(path.join(VENDOR_TOOLS, 'hu-stub.js'));
const hu = headUnit(stageDir, { live: true, dataDir: dataRoot, log: benchLogger, image: () => Promise.resolve() });

const origUiText = hu.ui.text;
hu.ui.text = (compName, value, row, cell) => {
    if (compName === 'STATUS' && !row) postToParent({ t: 'status', s: String(value) });
    return origUiText(compName, value, row, cell);
};

function publishSettings() {
    postToParent({
        t: 'settings',
        schema: hu.spec.settings,
        values: Object.assign({}, hu.settings.values),
    });
}
hu.settings.onChange(publishSettings);

function applyBenchSetting(key, val) {
    const meta = hu.settings.item(key);
    if (!meta) return benchLogger.warn('unknown setting key: ' + key);
    const widget = hu.ui.comp('SET_' + key.toUpperCase());
    if (meta.type === 'bool') {
        if (Boolean(hu.settings.get(key)) !== Boolean(val)) widget.emit('action', {});
        return;
    }
    const candidates = meta.type === 'choice' ? meta.options.map((opt) => opt[0]) : meta.steps;
    const idx = candidates.indexOf(val);
    if (idx < 0) return benchLogger.warn('invalid value for ' + key + ': ' + JSON.stringify(val));
    widget.emit('action', { row: idx });
}

const { DemoGenerator, computeFrictionBrake } = require(path.join(stageDir, 'source', 'javascript', 'signals.js'));
const demoSource = new DemoGenerator();

const ENCODE = {
    rpm: [0.25, 0],
    speed: [0.015625, 0],
    accel: [0.002, -65],
    temp: [1, -48],
    boost: [0.01, 0],
    battTemp: [1, -50],
    pedal: [0.025, 0],
    torque: [0.5, -1023.5],
};
const encodeSignal = (k, physical) => Math.round((physical - ENCODE[k][1]) / ENCODE[k][0]);

let simMode = 'demo';
let manualState = {
    speed: 62, rpm: 1850, gear: 5, stage: 'D', program: 'D',
    oil: 92, coolant: 90, boost: 0.28, gLong: 0.02, pedalPct: 22,
    driverBraking: false, absActive: false, torqueNm: 165, massKg: 1580,
    brakeBar: null, tyreFlBar: 2.4, navActive: true,
};
let fuelCounterRaw = 10000;
let tickStep = 0;

function readNum(key, fallback) {
    const v = manualState[key];
    return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function pushManualSignals() {
    const gear = Math.round(readNum('gear', 5));
    const rpm = readNum('rpm', 1850);
    const speed = readNum('speed', 62);
    if (rpm > 350) fuelCounterRaw += Math.round(rpm * 0.14);

    // G20 330i Metric BN2020 units (Celsius, bar, km, L/100km)
    hu.feed('de.bmw.infrastructure.EnvironmentalInformation', 'UnitBN2020', {
        temperature: 1, pressure: 1, distance: 1, unitOfMeasurementConsumptionFuel: 1,
    });
    hu.feed('de.bmw.infotainment.KombiIF', 'statusRangeTankStatus', { range: 410, mileageKilometre: 38240 });
    hu.feed('de.bmw.infotainment.KombiIF', 'statusBordcomputerTravelData', { wayPassed: 28, rideDurationHours: 0, rideDurationMinutes: 36 });
    hu.feed('de.bmw.infotainment.KombiIF', 'statusBordcomputerAverage', {
        consumptionAverage1BC1: 86, statusUnitOfMeasurementConsumptionBC: 'L_100KM',
    });

    hu.feed('de.bmw.infotainment.vehicle.CDS', 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: encodeSignal('rpm', rpm) });
    hu.feed('de.bmw.infotainment.vehicle.CDS', 'statusEngineTemperature', {
        temperatureEngineDrive: encodeSignal('temp', readNum('coolant', 90)),
        temperatureEngineOilDrive: encodeSignal('temp', readNum('oil', 92)),
    });
    hu.feed('de.bmw.infotainment.vehicle.CDS2', 'statusInjectionVolume', {
        injectionVolumeFuelEngine: fuelCounterRaw,
        oilTemperature: encodeSignal('temp', readNum('oil', 92)),
    });
    hu.feed('de.bmw.infotainment.vehicle.CDS2', 'statusLongitudinalAccelerationMassCenter', {
        longitudinalAccelerationCentreOfGravity: encodeSignal('accel', readNum('gLong', 0.02) * 9.80665),
    });
    hu.feed('de.bmw.infotainment.vehicle.Vehicle2', 'statusCarSpeed2', { speedVehicleCentreOfGravity: encodeSignal('speed', speed) });
    hu.feed('de.bmw.infotainment.vehicle.Vehicle2', 'statusVehicleMass', { massVehicle: Math.round(readNum('massKg', 1580)) });
    hu.feed('de.bmw.infrastructure.VehicleInformation', 'statusGearboxDrive', {
        statusActualGearDrive: (manualState.stage === 'P' || gear <= 0) ? 'N_OR_P' : ('G' + gear),
        statusActualStageDrive: manualState.stage || 'D',
    });
    hu.feed('de.bmw.infotainment.misc.MDrive', 'dataDisplayGearbox', {
        displayProgramGearbox: manualState.program === 'S' ? 'S_MINUS_PROGRAMM' : manualState.program === 'M' ? 'M_MINUS_PROGRAMM' : 'D_PROGRAMM',
    });
    hu.feed('de.bmw.infotainment.drivingexcitement.FES', 'statusSwitchDriveDynamicSport2', {
        displayBoostPressure: encodeSignal('boost', Math.max(0, readNum('boost', 0))),
    });
    hu.feed('de.bmw.infotainment.drivingexcitement.FES', 'statusFESVehicleDynamicSwitchHMI', {
        actualValueModeDrivingExperience: manualState.program === 'S' ? 1 : 4,
    });
    hu.feed('de.bmw.infotainment.drivingexcitement.FES', 'statusActualValueTorque2', {
        actualValueTorqueCrankshaft: encodeSignal('torque', rpm > 350 ? readNum('torqueNm', 165) : 0),
    });
    hu.feed('de.bmw.chassis.VehicleStabilizationManagement', 'StabilizationManagement', {
        statusBrakingDriver: manualState.driverBraking ? 1 : 0,
        qualifierFunctionABS: manualState.absActive ? 1 : 0,
    });
    hu.feed('de.bmw.powertrain.AcceleratorPedal', 'AngleAcceleratorPedal', {
        actualValueAngleAcceleratorPedal: encodeSignal('pedal', readNum('pedalPct', 22)),
    });
    const flBar = readNum('tyreFlBar', 2.4);
    hu.feed('de.bmw.infotainment.vehicle.TPMS', 'statusTyrePressure', {
        actualValuePressureTyreFLH: Math.round(flBar * 10),
        actualValuePressureTyreFRH: 24,
        actualValuePressureTyreRLH: 26,
        actualValuePressureTyreRRH: 26,
    });
    hu.feed('de.bmw.infotainment.vehicle.TPMS', 'statusTargetTyrePressure', {
        targetPressureTyreFLH: 24, targetPressureTyreFRH: 24, targetPressureTyreRLH: 26, targetPressureTyreRRH: 26,
    });

    if (manualState.navActive !== false) {
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'guidanceState', 'ACTIVE');
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'guidingProvider', 'CAR_PLAY');
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'conclusiveDart', {
            maneuver: {
                intersection: {
                    direction: 'RIGHT',
                    formattedDistance: { rawDistance: 220, distance: '220', unit: 'METER' },
                    description: { elements: [{ text: '天府大道中段' }] },
                },
            },
        });
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'nextIntersection', {
            distance: { rawDistance: 220, distance: '220', unit: 'METER' },
            intersection: { elements: [{ text: '天府大道中段' }] },
        });
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'finalDestinationInfo', {
            estimatedArrivalTime: { time: { hour: 20, minute: 45, invalid: false } },
            travelTime: 1320,
            formattedDistance: { rawDistance: 12400 },
        });
        hu.feed('de.bmw.infotainment.navigation.projectedmodeguiding.ProjectedModeGuiding', 'currentLaneGuiding', {
            rows: [{
                lanes: [
                    { directionToFollow: 'LEFT', otherDirections: [], isHighlighted: false },
                    { directionToFollow: 'STRAIGHT_ON', otherDirections: [], isHighlighted: false },
                    { directionToFollow: 'STRAIGHT_ON', otherDirections: ['RIGHT'], isHighlighted: true },
                    { directionToFollow: 'RIGHT', otherDirections: [], isHighlighted: true },
                ],
                laneMarkers: ['SOLID', 'DASHED', 'DASHED', 'DASHED', 'SOLID'],
                recommendedCarPositionLaneIndex: 2,
            }],
        });
        hu.feed('de.bmw.infotainment.a4a.carplay.CarPlayManager', 'projectedGuidanceActive', true);
    } else {
        hu.feed('de.bmw.infotainment.navigation.guiding.Guidance', 'guidanceState', 'INACTIVE');
        hu.feed('de.bmw.infotainment.a4a.carplay.CarPlayManager', 'projectedGuidanceActive', false);
    }

    const edrivePath = path.join(ipcDir, 'edrive.json');
    if (typeof manualState.brakeBar === 'number' && isFinite(manualState.brakeBar)) {
        fs.writeFileSync(edrivePath, JSON.stringify({
            t: Date.now(), app: 'dsc_bench', brake: { bar: manualState.brakeBar },
        }));
    } else {
        try { if (fs.existsSync(edrivePath)) fs.unlinkSync(edrivePath); } catch (e) { /* ignore */ }
    }
}

function publishTelemetrySnapshot() {
    if (simMode === 'manual') {
        const gear = Math.round(readNum('gear', 5));
        const rpm = readNum('rpm', 1850);
        const speedKmh = readNum('speed', 62);
        const fb = computeFrictionBrake({
            speedKmh,
            rpm,
            gear,
            hvKw: null,
            gLong: readNum('gLong', 0.02),
            pedalPct: readNum('pedalPct', 22),
            driverBraking: Boolean(manualState.driverBraking),
            absActive: Boolean(manualState.absActive),
            torqueNm: rpm > 350 ? readNum('torqueNm', 165) : 0,
            massKg: readNum('massKg', 1580),
            brakeBar: typeof manualState.brakeBar === 'number' ? manualState.brakeBar : null,
        });
        postToParent({
            t: 'telemetry',
            v: {
                mode: 'manual',
                speedKmh,
                rpm,
                gear,
                stage: manualState.stage || 'D',
                program: manualState.program || 'D',
                hvKw: null,
                soc: null,
                battTempC: null,
                oilTempC: readNum('oil', 92),
                coolantTempC: readNum('coolant', 90),
                boostBar: readNum('boost', 0.28),
                gLong: readNum('gLong', 0.02),
                pedalPct: readNum('pedalPct', 22),
                driverBraking: Boolean(manualState.driverBraking),
                absActive: Boolean(manualState.absActive),
                frictionG: fb.frictionG,
                frictionKw: fb.frictionKw,
                pureRegen: false,
                erangeKm: null,
                frangeKm: 410,
                ambientC: 18.5,
                driveMode: manualState.program === 'S' ? 'sport' : 'comfort',
                isEv: false,
            },
        });
    } else {
        const simPref = hu.settings.get('demo') || 'ice';
        const vehPref = hu.settings.get('vehicle') || 'ice';
        const simKind = (simPref === 'phev' || simPref === 'charging') ? simPref : (vehPref === 'phev' ? 'phev' : 'ice');
        const sample = demoSource.sample(simKind, Date.now());
        postToParent({
            t: 'telemetry',
            v: Object.assign({ mode: 'demo', simKind, isEv: simKind === 'phev' && (sample.rpm || 0) < 450 }, sample),
        });
    }
}

setInterval(() => {
    tickStep++;
    if (simMode === 'manual') pushManualSignals();
    if (tickStep % 2 === 0) publishTelemetrySnapshot();
}, 100);

process.on('message', (msg) => {
    if (!msg) return;
    if (msg.t === 'signals') {
        simMode = msg.mode === 'manual' ? 'manual' : 'demo';
        manualState = Object.assign({}, manualState, msg.values || {});
        if (hu.settings.get('demo') !== (simMode === 'manual' ? 'off' : 'ice')) {
            applyBenchSetting('demo', simMode === 'manual' ? 'off' : 'ice');
        }
    } else if (msg.t === 'set') {
        applyBenchSetting(msg.key, msg.value);
    }
});

const exitNow = () => process.exit(0);
process.on('disconnect', exitNow);
process.on('SIGTERM', exitNow);

const settingsFile = path.join(dataRoot, 'settings.json');
const hadSavedSettings = fs.existsSync(settingsFile);
hu.start();
if (!hadSavedSettings) {
    applyBenchSetting('vehicle', 'ice');
    applyBenchSetting('unitSystem', 'metric');
    applyBenchSetting('demo', 'ice');
    applyBenchSetting('hvSocGauge', false);
}
publishSettings();
benchLogger.info('G20 330i ICE metric bench active (' + path.relative(process.cwd(), stageDir) + ')');
