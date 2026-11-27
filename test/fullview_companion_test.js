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
const { readTarEntries, verifyToolPackage, loadExtraCatalogEntries } = require(path.join(ROOT, 'release', 'build_catalog.js'));
const { patchIdriveApps, patchMguStore } = require(path.join(ROOT, 'native', 'fullview-patch.js'));
const { EventEmitter } = require('events');

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

function testRepairAndRestoreStaleClusterRenderLocalConf() {
  const tmp = mkTempDir();
  const wocDir = path.join(tmp, 'waze-on-cluster');
  const crDir = path.join(tmp, 'cluster-render');
  const mockLog = path.join(tmp, 'systemctl.log');
  fs.mkdirSync(wocDir, { recursive: true }); // open-source woc: no vehicles/ID7.conf
  fs.mkdirSync(crDir, { recursive: true });
  const staleCr = 'panel_scene_id = 0x010004f0\npanel_fallback_scene_id = 0x01000400\n';
  fs.writeFileSync(path.join(crDir, 'cluster-render.local.conf'), staleCr, 'utf8');

  const actRes = activate({ wocDir, crDir, skipSystemctl: true, mockLog });
  assert.ok(actRes.status.includes('repaired stale cluster-render.local.conf'), 'must report stale cluster-render repair');
  const repaired = fs.readFileSync(path.join(crDir, 'cluster-render.local.conf'), 'utf8');
  assert.ok(/^\s*panel_scene_id\s*=\s*0x010004f8\s*$/m.test(repaired), 'must repair panel_scene_id to 0x010004f8');
  assert.strictEqual(fs.readFileSync(path.join(crDir, 'cluster-render.local.conf.cockpit-bak'), 'utf8'), staleCr);

  // Idempotent second run must not clobber backup
  activate({ wocDir, crDir, skipSystemctl: true, mockLog });
  assert.strictEqual(fs.readFileSync(path.join(crDir, 'cluster-render.local.conf.cockpit-bak'), 'utf8'), staleCr);

  const deactRes = deactivate({ wocDir, crDir, skipSystemctl: true, mockLog });
  assert.ok(deactRes.status.includes('Restored'));
  assert.strictEqual(fs.readFileSync(path.join(crDir, 'cluster-render.local.conf'), 'utf8'), staleCr);
  assert.strictEqual(fs.existsSync(path.join(crDir, 'cluster-render.local.conf.cockpit-bak')), false);

  const calls = fs.readFileSync(mockLog, 'utf8').trim().split(/\r?\n/);
  assert.ok(calls.includes('systemctl try-restart cluster-render.service'), 'must try-restart cluster-render.service');
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testActivateNoOpWhenWazeAbsent() {
  const tmp = mkTempDir();
  const missingWoc = path.join(tmp, 'does-not-exist');
  const missingCr = path.join(tmp, 'cr-absent');
  const res = activate({ wocDir: missingWoc, crDir: missingCr, skipSystemctl: true });
  assert.ok(res.status.includes('skipped'));
  assert.strictEqual(fs.existsSync(missingWoc), false);
  const deact = deactivate({ wocDir: missingWoc, crDir: missingCr, skipSystemctl: true });
  assert.ok(deact.status.includes('nothing to restore'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testAppRequiresAndSchema2Catalog() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'id7_cockpit_plus', 'app.json'), 'utf8'));
  assert.strictEqual(appJson.requires['cluster-render'], '2.9.1');
  assert.strictEqual(appJson.requires['waze-on-cluster'], '2.9.0');
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
  assert.ok(toolEntry.texts && toolEntry.texts['zh-CN'] && toolEntry.texts['zh-CN'].title, 'tool catalog entry must include zh-CN texts');
  assert.ok(appEntry.texts && appEntry.texts['zh-CN'] && appEntry.texts['zh-CN'].title, 'app catalog entry must include zh-CN texts');
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

function testFullviewUpstreamPatcherAndExtraCatalog() {
  const tmp = mkTempDir();
  const idriveRoot = path.join(tmp, 'idrive-apps');
  const crDir = path.join(idriveRoot, 'native', 'cluster-render');
  const wocDir = path.join(idriveRoot, 'native', 'waze-on-cluster');
  const wocAppDir = path.join(idriveRoot, 'apps', 'robertn_waze_cluster');
  fs.mkdirSync(path.join(crDir, 'kit'), { recursive: true });
  fs.mkdirSync(path.join(crDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(wocDir, 'patch'), { recursive: true });
  fs.mkdirSync(path.join(wocAppDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(wocAppDir, 'package'), { recursive: true });

  fs.writeFileSync(path.join(crDir, 'kit', 'map_geometry.h'), 'constexpr uint32_t kMapAreaWidth = 1088;\nconstexpr uint32_t kMapAreaHeight = 480;\n', 'utf8');
  fs.writeFileSync(path.join(crDir, 'kit', 'map_geometry.cpp'), 'if (tex_w > kMapAreaWidth || tex_h > kMapAreaHeight)\n        return "texture larger than the 1088x480 map area";\n', 'utf8');
  fs.writeFileSync(path.join(crDir, 'kit', 'yuv_atlas.cpp'), [
    'const char *const kAtlasFragmentShader = R"(#version 100',
    'precision highp float;',
    'uniform sampler2D u_image;',
    'uniform vec2 u_size;',
    'uniform float u_opacity;',
    'varying vec2 v_uv;',
    'void main() {',
    '    vec3 rgb = vec3(y + 1.402 * v, y - 0.344136 * u - 0.714136 * v, y + 1.772 * u);',
    '    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), u_opacity);',
    '})";'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'kit', 'block_pack.cpp'), [
    'const char *const kBlockFragmentShader = R"(#version 100',
    'precision highp float;',
    'uniform sampler2D u_image;',
    'uniform vec2 u_size;',
    'uniform float u_opacity;',
    'varying vec2 v_uv;',
    'void main() {',
    '    vec3 c = sel < 0.5 ? c0 : sel < 1.5 ? c1 : sel < 2.5 ? (2.0 * c0 + c1) / 3.0 : (c0 + 2.0 * c1) / 3.0;',
    '    gl_FragColor = vec4(c, u_opacity);',
    '})";'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'src', 'video_layer.h'), [
    'struct VideoEdge {',
    '    uint32_t top = 0, bottom = 0, fade = 0, dim = 0, blur = 0;',
    '    bool on() const { return top || bottom; }',
    '    bool operator==(const VideoEdge &o) const',
    '    {',
    '        return top == o.top && bottom == o.bottom && fade == o.fade && dim == o.dim && blur == o.blur;',
    '    }',
    '    bool operator!=(const VideoEdge &o) const { return !(*this == o); }',
    '};',
    '    void make_edge_quads();',
    '    void drop_edge_quads();'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'src', 'video_layer.cpp'), [
    'if (g_ && s.drawn && opaque_ && s.opacity * s.fade >= 1.0f && !s.turned)',
    'bool VideoLayer::make_atlas_quads(Graph *g)',
    '{',
    '    const float size[2] = {(float)p_.w, (float)p_.h}, zero = 0.0f;',
    '    atlas_quad_ = g->quad(atlas_effect_, drawn_params().rect);',
    '    return atlas_quad_ && g->turn(atlas_quad_, drawn_params().turn()) && g->texture(atlas_quad_, "u_image", atlas_buf_) &&',
    '           g->uniform(atlas_quad_, "u_size", size, 2) && g->uniform(atlas_quad_, "u_opacity", &zero, 1) &&',
    '           g->show(atlas_quad_, false) && g->order(atlas_quad_, order_);',
    '}',
    '',
    'bool VideoLayer::make_block_quads(Graph *g)',
    '{',
    '    const float size[2] = {(float)p_.w, (float)p_.h}, zero = 0.0f;',
    '    block_quad_ = g->quad(block_effect_, drawn_params().rect);',
    '    return block_quad_ && g->turn(block_quad_, drawn_params().turn()) && g->texture(block_quad_, "u_image", block_buf_[0]) &&',
    '           g->uniform(block_quad_, "u_size", size, 2) && g->uniform(block_quad_, "u_opacity", &zero, 1) &&',
    '           g->show(block_quad_, false) && g->order(block_quad_, order_ + 1);',
    '}',
    '',
    'void VideoLayer::drop_quads()',
    '{',
    '    if (atlas_quad_) g_->drop_quad(atlas_quad_);',
    '    if (block_quad_) g_->drop_quad(block_quad_);',
    '    drop_edge_quads();',
    '}',
    '',
    'bool VideoLayer::set_edge(const VideoEdge &e, int atlas_effect, int block_effect)',
    '{',
    '    if (e == edge_ && (!e.on() || (atlas_effect == edge_fx_[0] && block_effect == edge_fx_[1])))',
    '        return false;',
    '    edge_ = e;',
    '    edge_fx_[0] = atlas_effect;',
    '    edge_fx_[1] = block_effect;',
    '    if (g_) {',
    '        drop_edge_quads();',
    '        make_edge_quads();',
    '    }',
    '    return true;',
    '}',
    '    blocks_shown_ = parked_ = false;',
    '    if (edge_.on() && drawn_params().rect != edge_at_) {   /* the edge\'s quads and blur follow the rect */',
    '        drop_edge_quads();',
    '        make_edge_quads();',
    '    }',
    '    set_opacity();'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'src', 'compositor.cpp'), [
    '                if (ed.on() && !edge_effects())',
    '                    ed = VideoEdge();',
    'if (!h.shown || !h.edge.on() || x0 < h.rect.x',
    'return lh && lh->host.edge.on() ? clamped(lh->host.edge) : VideoEdge();'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'src', 'server.cpp'), [
    '{"host_edge", "1"},',
    '    static const char *const edge_keys[] = {"edge_top", "edge_bottom", "edge_fade", "edge_dim", "edge_blur"};',
    '    static const double edge_max[] = {720, 720, 360, 4096, 32};',
    '    double ev[5] = {0, 0, 0, 0, 0};',
    '    for (size_t i = 0; i < 5; i++)',
    '    h.edge.dim = (uint32_t)ev[3];',
    '    h.edge.blur = (uint32_t)ev[4];'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(crDir, 'component.json'), JSON.stringify({ id: 'cluster-render', kind: 'tool', version: '0.8.13' }), 'utf8');
  fs.writeFileSync(path.join(wocDir, 'waze-on-cluster.conf'), 'tex_size = 1088x480\nhosted_vpp_scale = 0\n', 'utf8');
  fs.writeFileSync(
    path.join(wocDir, 'patch', 'patchd.js'),
    "function planArgs(panel, mode, unproven) {\n    var args = ['--panel', panel, '--coding', CODING].concat(unproven ? ['--unproven'] : []);\n    return args;\n}\nvar keep = rec && rec.enabled === true && Array.isArray(rec.args) && rec.args.length ? rec.args : null;\n",
    'utf8'
  );
  fs.writeFileSync(
    path.join(wocDir, 'patch', 'carplay_locate.js'),
    "var ALT_URL = 'maps:/car/instrumentcluster';\nvar SHOWUI_URL = ALT_URL + '?showETA=yes';\n",
    'utf8'
  );
  fs.writeFileSync(path.join(wocDir, 'component.json'), JSON.stringify({ id: 'waze-on-cluster', kind: 'tool', version: '0.14.15', requires: { 'cluster-render': '0.5.3' } }), 'utf8');
  fs.writeFileSync(path.join(wocAppDir, 'release.json'), JSON.stringify({ requires: { 'waze-on-cluster': '0.14.2' } }), 'utf8');
  fs.writeFileSync(path.join(wocAppDir, 'package', 'package.json'), JSON.stringify({ name: 'robertn_waze_cluster', version: '0.6.16' }), 'utf8');
  fs.writeFileSync(path.join(wocAppDir, 'mgu-app.json'), JSON.stringify({ id: 'robertn_waze_cluster', version: '0.6.16' }), 'utf8');
  fs.writeFileSync(
    path.join(wocAppDir, 'src', 'waze_cluster_control.js'),
    "const SIZE = '1088x480';\nconst SAFE = '504x368+286+72';\nfunction outdated(ps) { return !!((ps.mode && ps.mode !== 'avb') || (ps.panel && ps.panel !== 'high') || (ps.res && ps.res !== SIZE) || (ps.safe && ps.safe !== SAFE) || ps.mapurl === 'no-eta'); }\n",
    'utf8'
  );

  const res = patchIdriveApps(idriveRoot);
  assert.strictEqual(res.clusterRenderVersion, '2.9.1');
  assert.strictEqual(res.wazeOnClusterVersion, '2.9.0');
  assert.strictEqual(res.robertnWazeAppVersion, '0.6.17');
  assert.ok(fs.readFileSync(path.join(crDir, 'kit', 'yuv_atlas.cpp'), 'utf8').includes('if (ma <= 0.002) discard;'));
  assert.ok(fs.readFileSync(path.join(crDir, 'kit', 'block_pack.cpp'), 'utf8').includes('u_opacity * ma'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'video_layer.h'), 'utf8').includes('has_mask()'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'video_layer.h'), 'utf8').includes('mask_set_'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'video_layer.cpp'), 'utf8').includes('VideoLayer::set_mask()'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'video_layer.cpp'), 'utf8').includes('(!edge_.has_mask() && !mask_set_)'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'compositor.cpp'), 'utf8').includes('h.edge.any()'));
  assert.ok(fs.readFileSync(path.join(crDir, 'src', 'server.cpp'), 'utf8').includes('"host_mask"'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(crDir, 'component.json'), 'utf8')).uninstallable, true);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(wocDir, 'component.json'), 'utf8')).uninstallable, true);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(wocAppDir, 'package', 'package.json'), 'utf8')).version, '0.6.17');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(wocAppDir, 'mgu-app.json'), 'utf8')).version, '0.6.17');
  assert.ok(fs.readFileSync(path.join(wocAppDir, 'src', 'waze_cluster_control.js'), 'utf8').includes("ps.res !== '1632x720'"));
  assert.ok(fs.readFileSync(path.join(wocAppDir, 'src', 'waze_cluster_control.js'), 'utf8').includes("ps.safe !== '840x570+396+40'"));
  assert.ok(fs.readFileSync(path.join(wocDir, 'patch', 'patchd.js'), 'utf8').includes("840x570+396+40"));
  assert.ok(fs.readFileSync(path.join(crDir, 'kit', 'map_geometry.h'), 'utf8').includes('kMaxMapTexWidth = 1632'));
  assert.ok(fs.readFileSync(path.join(crDir, 'kit', 'map_geometry.cpp'), 'utf8').includes('tex_h > kMaxMapTexHeight'));
  assert.ok(/^\s*tex_size\s*=\s*1632x720\s*$/m.test(fs.readFileSync(path.join(wocDir, 'waze-on-cluster.conf'), 'utf8')));
  assert.ok(/^\s*hosted_vpp_scale\s*=\s*0\s*$/m.test(fs.readFileSync(path.join(wocDir, 'waze-on-cluster.conf'), 'utf8')));
  assert.ok(fs.readFileSync(path.join(wocDir, 'patch', 'patchd.js'), 'utf8').includes('cockpitFullviewResArgs'));
  assert.ok(fs.readFileSync(path.join(wocDir, 'patch', 'carplay_locate.js'), 'utf8').includes("ALT_URL + '/map'"));

  const mguRoot = path.join(tmp, 'mgu-store');
  fs.mkdirSync(path.join(mguRoot, 'native', 'mgu-render'), { recursive: true });
  fs.writeFileSync(path.join(mguRoot, 'native', 'mgu-render', 'component.json'), JSON.stringify({ id: 'mgu-render', kind: 'tool', version: '0.6.26' }), 'utf8');
  const mguRes = patchMguStore(mguRoot);
  assert.strictEqual(mguRes.mguRenderVersion, '0.6.26');

  // Verify loadExtraCatalogEntries merges upstream-built tool & app artifacts cleanly
  const upDir = path.join(tmp, 'upstream-out');
  const distTmp = path.join(tmp, 'dist-out');
  fs.mkdirSync(upDir, { recursive: true });
  fs.mkdirSync(distTmp, { recursive: true });
  fs.writeFileSync(path.join(upDir, 'cluster-render@2.9.0.tgz'), 'cr-tgz');
  fs.writeFileSync(path.join(upDir, 'extra.json'), JSON.stringify({
    components: [{
      id: 'cluster-render',
      kind: 'tool',
      title: 'Cluster renderer',
      description: 'FullView renderer',
      version: '2.9.0',
      artifact: { name: 'cluster-render@2.9.0.tgz' },
      mguHmi: ['ID7']
    }]
  }));
  const merged = loadExtraCatalogEntries([path.join(upDir, 'extra.json')], 'https://github.com/Hyperionism/idrive7-cockpit-plus/releases/download/v0.9.6', distTmp);
  assert.strictEqual(merged.entries.length, 1);
  assert.strictEqual(merged.entries[0].artifact.url, 'https://github.com/Hyperionism/idrive7-cockpit-plus/releases/download/v0.9.6/cluster-render@2.9.0.tgz');
  assert.strictEqual(fs.existsSync(path.join(distTmp, 'cluster-render@2.9.0.tgz')), true);

  fs.rmSync(tmp, { recursive: true, force: true });
}

function testOverlayRendererFullviewMapHost() {
  const builtJsDir = path.join(ROOT, 'dist', 'id7_cockpit_plus', 'source', 'javascript');
  assert.ok(fs.existsSync(path.join(builtJsDir, 'overlay_renderer.js')), 'run build.py --stub-sdk before fullview_companion_test.js');
  const { OverlayRenderer } = require(path.join(builtJsDir, 'overlay_renderer.js'));
  const { resolveUnits, decodeCarUnits } = require(path.join(builtJsDir, 'units.js'));

  const calls = { hosts: [], unhosts: [], effects: [], sets: [], uniforms: [] };
  class StubCR extends EventEmitter {
    constructor() { super(); this._next = 1; this.targets = 'map:1088x480,panel:1920x720,hud:800x480'; this.hostLayers = true; this.hostMask = true; this.renderState = true; }
    connect() { this.emit('ready'); }
    close() {}
    image() { return this._next++; }
    effect(opts) { const ref = this._next++; calls.effects.push(Object.assign({ ref }, opts)); return ref; }
    pixels() { return true; }
    set(ref, opts) { calls.sets.push({ ref, opts }); }
    uniform(ref, name, values) { calls.uniforms.push({ ref, name, values }); }
    host(into, opts) { calls.hosts.push({ into, opts }); }
    unhost(target) { calls.unhosts.push(target); }
  }

  const r = new OverlayRenderer({ ClusterRender: StubCR, allowPanel: true });
  r.connect();
  const units = resolveUnits({ unitSystem: 'metric' }, {});
  const profile = { kind: 'ice', isPhev: false, isCold: false };
  const model = { units, profile, telemetry: { speedKmh: 62, gear: 3 }, efficiency: {} };

  // 1. Default fullview_dials sends mask_mode: 1 inside native video shader (zero separate effect layers) and auto-hides speed overlay
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'fullview_dials' }, 1000);
  assert.strictEqual(calls.hosts.length, 1);
  assert.strictEqual(calls.hosts[0].into, 'panel');
  assert.deepStrictEqual(calls.hosts[0].opts, {
    target: 'map', x: 144, y: 0, w: 1632, h: 616, src_x: 0, src_y: 0, src_w: 1088, src_h: 410, shown: 1, mask_mode: 1, mask_feather: 54
  });
  assert.ok(calls.hosts[0].opts.y + calls.hosts[0].opts.h < 648, 'FullView host rect must stay strictly above KOMBI4 GEAR_WIN (y>=648)');
  assert.strictEqual(calls.effects.length, 0, 'video-shader cutout must NOT create any separate effect layer');
  assert.strictEqual(r.lastSummary.bezelMaskMode, 'dials');
  assert.strictEqual(r.lastSummary.showClusterSpeed, false, 'speed overlay auto-hides when native dials are visible');

  // 2. Switch to FullView Wide + transparent curved bezel cutout -> mask_mode: 2 and feather adjusts tight/wide, speed auto-enables
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'fullview', mapBezelMask: true, mapBezelFeather: 'tight' }, 1040);
  assert.strictEqual(calls.hosts[calls.hosts.length - 1].opts.mask_mode, 2);
  assert.strictEqual(calls.hosts[calls.hosts.length - 1].opts.mask_feather, 36);
  assert.strictEqual(r.lastSummary.bezelMaskMode, 'bezel');
  assert.strictEqual(r.lastSummary.showClusterSpeed, true, 'speed overlay auto-enables in FullView Wide mode');

  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'fullview', mapBezelMask: true, mapBezelFeather: 'wide' }, 1080);
  assert.strictEqual(calls.hosts[calls.hosts.length - 1].opts.mask_mode, 2);
  assert.strictEqual(calls.hosts[calls.hosts.length - 1].opts.mask_feather, 80);

  // 3. Explicit mapBezelMask: false in fullview wide mode omits mask_mode
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'fullview', mapBezelMask: false }, 1090);
  assert.strictEqual(calls.hosts[calls.hosts.length - 1].opts.mask_mode, undefined);
  assert.strictEqual(r.lastSummary.bezelMaskMode, 'off');

  // 4. Native / legacy center / legacy off modes ALL unhost to slot 0x100 (behind dials, zero occlusion) and auto-hide speed
  const hostsBeforeNative = calls.hosts.length;
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'center', mapBezelMask: true }, 1100);
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'native', mapBezelMask: true }, 1150);
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', mapHostMode: 'off' }, 1200);
  assert.strictEqual(calls.hosts.length, hostsBeforeNative, 'center/native/off must never host onto panel 0x203');
  assert.ok(calls.unhosts.length >= 1 && calls.unhosts.every((t) => t === 'map'), 'unhost must follow real ClusterRender.unhost(target) 1-arg signature');
  assert.strictEqual(r.lastSummary.showClusterSpeed, false);
  assert.strictEqual(calls.effects.length, 0);

  // 4. Metric unit inference when car reports Celsius temperature without explicit distance enum
  const partialMetric = decodeCarUnits({ unitOfMeasurementTemperature: 1 });
  assert.strictEqual(partialMetric.tempUnit, 'C');
  assert.strictEqual(partialMetric.distUnit, 'km', 'Celsius-only car signal must infer km distance unit');
  assert.strictEqual(partialMetric.speedUnit, 'kmh', 'Celsius-only car signal must infer km/h speed unit');
  const resolvedPartial = resolveUnits({ unitSystem: 'auto' }, partialMetric);
  assert.strictEqual(resolvedPartial.speedUnit, 'kmh');
  assert.strictEqual(resolvedPartial.distUnit, 'km');
  r.close();
}

function testClusterWidgetPlateToggles() {
  const builtJsDir = path.join(ROOT, 'dist', 'id7_cockpit_plus', 'source', 'javascript');
  const { OverlayRenderer } = require(path.join(builtJsDir, 'overlay_renderer.js'));
  const { resolveUnits } = require(path.join(builtJsDir, 'units.js'));

  const r = new OverlayRenderer({ allowPanel: true });
  const units = resolveUnits({ unitSystem: 'metric' }, {});
  const profile = { kind: 'ice', isPhev: false, isCold: false };
  // Use real NavTracker.snapshot() shape: `guide` is the provider string ('CAR_PLAY'), `show` is the maneuver object!
  const routeHudNav = {
    routeActive: true,
    turnDistMeters: 180,
    guide: 'CAR_PLAY',
    lanes: { lanes: [{ follow: 'RIGHT', others: [], hi: true, info: 'NONE' }], markers: ['DASHED', 'DASHED'], rec: 0 },
    eta: { text: '14:20', remainSec: 600, remainMeters: 5400 },
    show: { kind: 'turn', dir: 'RIGHT', dist: '180', unit: 'm', road: 'Test Road', src: 'events' }
  };
  const model = {
    units,
    profile,
    telemetry: { speedKmh: 62, gear: 3, stage: 'D', navRouteActive: true, hudNav: routeHudNav },
    efficiency: {}
  };

  function pxAt(cv, x, y) {
    const o = (y * cv.w + x) * 4;
    return [cv.d[o], cv.d[o + 1], cv.d[o + 2], cv.d[o + 3]];
  }
  function countNonZero(cv) {
    let n = 0;
    for (let i = 3; i < cv.d.length; i += 4) if (cv.d[i] > 40) n++;
    return n;
  }

  // 1. Default plate configuration: speed frameless, nav widgets natural smoked glass (neutral RGB, zero blue border)
  r.render(model, { enabled: true, clusterSlotMode: 'panel_only', clusterSpeedOverlay: 'on' }, 2000);
  assert.strictEqual(r.layers.guidance_turn_card.visible, true, 'turn card must read maneuver from hn.show when hn.guide is provider string');
  assert.strictEqual(pxAt(r.layers.speed.cv, 24, 10)[3], 0, 'speed default frameless body sample must be transparent');
  for (const name of ['lane_guidance', 'guidance_turn_card', 'eta_pill']) {
    const cv = r.layers[name].cv;
    const p = pxAt(cv, 24, 10);
    assert.ok(p[3] >= 140, `${name} glass plate must be visible at interior corner (got alpha=${p[3]})`);
    assert.ok(Math.abs(p[2] - p[0]) <= 12, `${name} glass plate must be neutral charcoal without blue tint (rgb=${p.slice(0, 3).join(',')})`);
  }

  // 2. Toggle speed ON ('glass') and nav widgets OFF ('none')
  r.render(model, {
    enabled: true,
    clusterSlotMode: 'panel_only',
    clusterSpeedOverlay: 'on',
    speedPlate: 'glass',
    laneBarPlate: 'none',
    turnCardPlate: 'none',
    etaPillPlate: 'none'
  }, 2100);
  const spGlass = pxAt(r.layers.speed.cv, 24, 10);
  assert.ok(spGlass[3] >= 140 && Math.abs(spGlass[2] - spGlass[0]) <= 12, 'speed glass plate must render cleanly with neutral fill');
  for (const name of ['lane_guidance', 'guidance_turn_card', 'eta_pill']) {
    const cv = r.layers[name].cv;
    assert.strictEqual(pxAt(cv, 24, 10)[3], 0, `${name} frameless background sample must be transparent`);
    assert.ok(countNonZero(cv) > 200, `${name} frameless mode must still render foreground glyphs`);
  }

  // 3. When hn.show is null (even though hn.guide === 'CAR_PLAY'), turn card MUST stay hidden instead of drawing placeholder '-- / Ahead'
  const noManeuverModel = Object.assign({}, model, {
    telemetry: Object.assign({}, model.telemetry, {
      hudNav: Object.assign({}, routeHudNav, { show: null })
    })
  });
  r.render(noManeuverModel, { enabled: true, clusterSlotMode: 'panel_only', turnCardTriggerM: 'always' }, 6000);
  assert.strictEqual(r.layers.guidance_turn_card.visible, false, 'turn card must hide cleanly when hn.show is null');
  r.close();
}

function testSimplifiedChineseLocaleAndPackage() {
  // After testAppRequiresAndSchema2Catalog ran build_catalog.js (default --language zh-CN),
  // inspect the built package tarball & staged files for genuine zh-CN localization.
  const appSpec = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'id7_cockpit_plus', 'app.json'), 'utf8'));
  const builtLocalePath = path.join(ROOT, 'dist', 'id7_cockpit_plus', 'source', 'javascript', 'kit', 'locale.json');
  assert.ok(fs.existsSync(builtLocalePath), 'zh-CN release build must emit kit/locale.json');
  const builtLocale = JSON.parse(fs.readFileSync(builtLocalePath, 'utf8'));
  assert.strictEqual(builtLocale.language, 'zh-CN');
  assert.strictEqual(builtLocale.strings['Full-screen CarPlay map host'], '全屏 CarPlay 地图托管模式');
  assert.strictEqual(builtLocale.strings['TIRE PRESSURE & TEMP'], '胎压与胎温');

  const appTgz = path.join(ROOT, 'dist', `id7_cockpit_plus@${appSpec.version}.tgz`);
  const entries = readTarEntries(appTgz);
  const pkgJson = JSON.parse(entries.get('package/package.json').toString('utf8'));
  assert.strictEqual(pkgJson.version, appSpec.version, 'zh-CN package must preserve clean SemVer');

  const zhBundleEntry = entries.get('package/rhmiData/variantGroups/Common/texts/zh_CN.json');
  assert.ok(zhBundleEntry, 'zh-CN package must include rhmiData/variantGroups/Common/texts/zh_CN.json');
  const bundleStrings = JSON.parse(zhBundleEntry.toString('utf8'));
  const vals = Object.values(bundleStrings);
  assert.ok(vals.includes('通用设置') && vals.includes('全屏地图与导航布局'), 'RHMI StringBundle must contain Simplified Chinese titles');
  assert.ok(Object.prototype.hasOwnProperty.call(bundleStrings, 'SID_CN_DYNAMIC_0000'), 'SID_CN_DYNAMIC pool must be pre-allocated');

  // Verify 100% of app.json UI strings have zh-CN translations
  const zhDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'runtime', 'locales', 'zh-CN.json'), 'utf8'));
  const missingAppKeys = [];
  const checkKey = (s) => { if (s && /[A-Za-z]/.test(s) && !zhDict[s]) missingAppKeys.push(s); };
  checkKey(appSpec.title);
  for (const sc of appSpec.screens || []) {
    checkKey(sc.title);
    for (const it of sc.items || []) if (it[2]) checkKey(it[2]);
    for (const it of sc.settings || []) if (Array.isArray(it) && it[2]) checkKey(it[2]);
  }
  for (const st of appSpec.settings || []) {
    checkKey(st.label);
    for (const opt of st.options || []) checkKey(opt[1]);
  }
  assert.strictEqual(missingAppKeys.length, 0, 'Missing zh-CN translations for app.json keys: ' + missingAppKeys.join(', '));

  // Verify every Chinese translation character in zh-CN.json is covered by baked cjk_gothic.pack
  const { Canvas } = require(path.join(ROOT, 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'runtime', 'canvas'));
  const fontsMod = require(path.join(ROOT, 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'runtime', 'fonts'));
  const { installStockBmwFonts } = require(path.join(ROOT, 'apps', 'id7_cockpit_plus', 'bmw_font'));
  installStockBmwFonts(fontsMod, { cacheDir: os.tmpdir(), fontDir: path.join(ROOT, 'apps', 'id7_cockpit_plus') });
  const cv = new Canvas(400, 100);
  const missing = [];
  for (const val of Object.values(zhDict)) {
    for (const ch of val) {
      if (ch.charCodeAt(0) > 0x7f && cv.textWidth(ch, 22, { font: 'bold' }) <= 0) {
        missing.push(ch);
      }
    }
  }
  assert.strictEqual(missing.length, 0, 'Missing CJK glyphs in cjk_gothic.pack: ' + missing.join(','));

  // Verify HUD road banner preserves Chinese road names instead of stripping via foldAscii
  const builtJsDir = path.join(ROOT, 'dist', 'id7_cockpit_plus', 'source', 'javascript');
  const { drawHudRoadBanner, cleanDisplayText, ROAD_W, ROAD_H } = require(path.join(builtJsDir, 'hud_nav_renderer.js'));
  assert.strictEqual(cleanDisplayText('进入 非机动车道'), '进入 非机动车道');
  const roadCv = new Canvas(ROAD_W, ROAD_H);
  assert.strictEqual(drawHudRoadBanner(roadCv, { road: '中环高架路' }), true, 'HUD road banner must render Chinese road names');
  let litPx = 0;
  for (let i = 3; i < roadCv.d.length; i += 4) if (roadCv.d[i] > 100) litPx++;
  assert.ok(litPx > 200, 'HUD Chinese road name must produce visible glyphs (got ' + litPx + ' px)');
}

function main() {
  const tests = [
    testBuildCockpitProfileDisablesPodsOnly,
    testActivateAndDeactivateWithExistingLocalConf,
    testRepairAndRestoreStaleClusterRenderLocalConf,
    testActivateNoOpWhenWazeAbsent,
    testOverlayRendererFullviewMapHost,
    testClusterWidgetPlateToggles,
    testAppRequiresAndSchema2Catalog,
    testFullviewUpstreamPatcherAndExtraCatalog,
    testSimplifiedChineseLocaleAndPackage
  ];
  for (const fn of tests) {
    fn();
    console.log(`PASS ${fn.name}`);
  }
  console.log(`All ${tests.length} fullview companion & Schema 2 catalog tests passed.`);
}

main();
