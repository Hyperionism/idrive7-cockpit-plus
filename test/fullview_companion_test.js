#!/usr/bin/env node
/**
 * Unit & integration tests for cockpit-fullview companion tool,
 * Schema 2 catalog.json output, and dual-package MGU Store tarballs.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const {
  PROFILE_NAME,
  buildCockpitProfileText,
  activate,
  deactivate
} = require(path.join(ROOT, 'tools', 'cockpit-fullview', 'files', 'cockpit_fullview.js'));
const { readTarEntries, verifyToolPackage } = require(path.join(ROOT, 'release', 'build_catalog.js'));

const SAMPLE_ID7_CONF = [
  '# FullView ID7 profile',
  'fullview_mode = panel-safe',
  'panel_pos = 144,0',
  'shape_bottom = 408x168',
  'shape_top = 374x354',
  '',
  '[waze-on-cluster]',
  'speed_pod = 1',
  'guidance_pod = 1',
  'trip_pod = 1',
  'alert = 1',
  'units = km/h',
  ''
].join('\n');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-fv-test-'));
}

function testBuildCockpitProfileDisablesPodsOnly() {
  const out = buildCockpitProfileText(SAMPLE_ID7_CONF);
  assert.ok(out.includes('fullview_mode = panel-safe'), 'preserves fullview_mode');
  assert.ok(out.includes('shape_top = 374x354'), 'preserves KOMBI4 top contour mask');
  assert.ok(out.includes('shape_bottom = 408x168'), 'preserves KOMBI4 bottom contour mask');
  assert.ok(out.includes('alert = 1'), 'preserves overspeed red halo alert');
  assert.ok(/^\s*speed_pod\s*=\s*0\s*$/m.test(out), 'sets speed_pod = 0');
  assert.ok(/^\s*guidance_pod\s*=\s*0\s*$/m.test(out), 'sets guidance_pod = 0');
  assert.ok(/^\s*trip_pod\s*=\s*0\s*$/m.test(out), 'sets trip_pod = 0');
}

function testActivateAndDeactivateWithExistingLocalConf() {
  const tmp = mkTempDir();
  const wocDir = path.join(tmp, 'waze-on-cluster');
  const mockLog = path.join(tmp, 'systemctl.log');
  fs.mkdirSync(path.join(wocDir, 'vehicles'), { recursive: true });
  fs.writeFileSync(path.join(wocDir, 'vehicles', 'ID7.conf'), SAMPLE_ID7_CONF, 'utf8');
  const origLocal = '# User custom settings\nunits = km/h\nhud_width_pct = 85\n';
  fs.writeFileSync(path.join(wocDir, 'waze-on-cluster.local.conf'), origLocal, 'utf8');

  const actRes = activate({ wocDir, skipSystemctl: true, mockLog });
  assert.ok(actRes.status.includes(PROFILE_NAME));

  const generatedProfile = fs.readFileSync(path.join(wocDir, 'vehicles', `${PROFILE_NAME}.conf`), 'utf8');
  assert.ok(/^\s*speed_pod\s*=\s*0\s*$/m.test(generatedProfile));
  assert.ok(/^\s*guidance_pod\s*=\s*0\s*$/m.test(generatedProfile));
  assert.ok(/^\s*trip_pod\s*=\s*0\s*$/m.test(generatedProfile));

  const updatedLocal = fs.readFileSync(path.join(wocDir, 'waze-on-cluster.local.conf'), 'utf8');
  assert.ok(updatedLocal.includes('units = km/h'), 'preserves existing local.conf settings');
  assert.ok(updatedLocal.includes('hud_width_pct = 85'), 'preserves hud setting');
  assert.ok(/^\s*fullview_profile\s*=\s*ID7-cockpit\s*$/m.test(updatedLocal));
  assert.ok(/^\s*speed_pod\s*=\s*0\s*$/m.test(updatedLocal));

  // Idempotent second activate must not overwrite .cockpit-bak backup
  fs.writeFileSync(path.join(wocDir, 'waze-on-cluster.local.conf'), updatedLocal + '\nspeed_pod = 0\n', 'utf8');
  activate({ wocDir, skipSystemctl: true, mockLog });
  assert.strictEqual(fs.readFileSync(path.join(wocDir, 'waze-on-cluster.local.conf.cockpit-bak'), 'utf8'), origLocal);

  const deactRes = deactivate({ wocDir, skipSystemctl: true, mockLog });
  assert.ok(deactRes.status.includes('Restored'));
  assert.strictEqual(fs.readFileSync(path.join(wocDir, 'waze-on-cluster.local.conf'), 'utf8'), origLocal);
  assert.strictEqual(fs.existsSync(path.join(wocDir, 'vehicles', `${PROFILE_NAME}.conf`)), false);
  assert.strictEqual(fs.existsSync(path.join(wocDir, 'waze-on-cluster.local.conf.cockpit-bak')), false);
  assert.strictEqual(fs.existsSync(path.join(wocDir, 'cockpit-fullview.state.json')), false);

  const calls = fs.readFileSync(mockLog, 'utf8').trim().split(/\r?\n/);
  assert.ok(calls.length >= 2 && calls.every((c) => c === 'systemctl try-restart waze-on-cluster.service'));

  fs.rmSync(tmp, { recursive: true, force: true });
}

function testActivateNoOpWhenWazeAbsent() {
  const tmp = mkTempDir();
  const missingWoc = path.join(tmp, 'does-not-exist');
  const res = activate({ wocDir: missingWoc, skipSystemctl: true });
  assert.ok(res.status.includes('skipped'));
  assert.strictEqual(fs.existsSync(missingWoc), false);
  const deact = deactivate({ wocDir: missingWoc, skipSystemctl: true });
  assert.ok(deact.status.includes('nothing to restore'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testAppRequiresAndSchema2Catalog() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'id7_cockpit_plus', 'app.json'), 'utf8'));
  assert.strictEqual(appJson.requires['cluster-render'], '0.4.0');
  assert.strictEqual(appJson.requires['cockpit-fullview'], '1.0.0');

  const dryRes = childProcess.execFileSync(
    process.execPath,
    [path.join(ROOT, 'release', 'build_catalog.js'), '--repo', 'Hyperionism/idrive7-cockpit-plus', '--dry-run'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.ok(dryRes.includes('Schema 2 catalog.json'));

  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'catalog.json'), 'utf8'));
  assert.strictEqual(catalog.schema, 2);
  assert.ok(Array.isArray(catalog.components), 'Schema 2 catalog components must be an array');
  assert.strictEqual(catalog.components.length, 2);

  const toolEntry = catalog.components.find((c) => c.id === 'cockpit-fullview');
  const appEntry = catalog.components.find((c) => c.id === 'id7_cockpit_plus');
  assert.ok(toolEntry && toolEntry.kind === 'tool' && toolEntry.artifact && toolEntry.artifact.sha256);
  assert.ok(appEntry && appEntry.kind === 'app' && appEntry.artifact && appEntry.artifact.sha256);
  assert.strictEqual(appEntry.requires['cockpit-fullview'], toolEntry.version);

  const toolTgz = path.join(ROOT, 'dist', toolEntry.artifact.name);
  const verifiedTool = verifyToolPackage(toolTgz);
  assert.strictEqual(verifiedTool.id, 'cockpit-fullview');
  const entries = readTarEntries(toolTgz);
  assert.ok(entries.has('component.json'));
  assert.ok(entries.has('files/cockpit_fullview.js'));

  const mguStoreMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'mgu-store.json'), 'utf8'));
  assert.ok(mguStoreMeta.apps && mguStoreMeta.apps.id7_cockpit_plus);
}

function main() {
  const tests = [
    testBuildCockpitProfileDisablesPodsOnly,
    testActivateAndDeactivateWithExistingLocalConf,
    testActivateNoOpWhenWazeAbsent,
    testAppRequiresAndSchema2Catalog
  ];
  for (const fn of tests) {
    fn();
    console.log(`PASS ${fn.name}`);
  }
  console.log(`All ${tests.length} fullview companion & Schema 2 catalog tests passed.`);
}

main();
