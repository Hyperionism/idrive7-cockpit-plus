#!/usr/bin/env node
/**
 * Applies deterministic FullView (1632x720) & Cockpit+ ecosystem patches to pinned
 * upstream open-source trees (`robertnisipeanu/idrive-apps` & `robertnisipeanu/mgu-store`)
 * during cloud CI/Release builds so the repository stays compact (<100 files) while
 * compiling authentic GPL-3.0 / MPL-2.0 native MGU binaries.
 *
 * Usage:
 *   node native/fullview-patch.js --idrive-apps <dir> [--mgu-store <dir>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UPSTREAM_PINS = {
  idriveAppsRepo: 'robertnisipeanu/idrive-apps',
  idriveAppsCommit: '9da968c8644ef4f6bcce174b0836f9f24d8db7fb',
  mguStoreRepo: 'robertnisipeanu/mgu-store',
  mguStoreCommit: '37702a880f1ed5fd346f4c944127fb276920be9c',
  clusterRenderVersion: '2.9.0',
  wazeOnClusterVersion: '2.9.0',
  robertnWazeAppVersion: '0.6.17',
  mguRenderVersion: '0.6.26'
};

function replaceExactOrThrow(text, target, replacement, label) {
  if (text.indexOf(target) === -1) {
    throw new Error('fullview-patch: expected snippet not found in ' + label);
  }
  return text.split(target).join(replacement);
}

function setIniLine(text, key, newValue) {
  const re = new RegExp('^(' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=).*$', 'm');
  if (!re.test(text)) {
    throw new Error('fullview-patch: INI key not found: ' + key);
  }
  return text.replace(re, '$1 ' + newValue);
}

function patchMapGeometry(crDir) {
  const hPath = path.join(crDir, 'kit', 'map_geometry.h');
  const cppPath = path.join(crDir, 'kit', 'map_geometry.cpp');

  let hText = fs.readFileSync(hPath, 'utf8');
  if (hText.indexOf('kMaxMapTexWidth') === -1) {
    hText = replaceExactOrThrow(
      hText,
      'constexpr uint32_t kMapAreaHeight = 480;',
      'constexpr uint32_t kMapAreaHeight = 480;\nconstexpr uint32_t kMaxMapTexWidth = 1632;\nconstexpr uint32_t kMaxMapTexHeight = 720;',
      'kit/map_geometry.h'
    );
    fs.writeFileSync(hPath, hText, 'utf8');
  }

  let cppText = fs.readFileSync(cppPath, 'utf8');
  if (cppText.indexOf('kMaxMapTexWidth') === -1) {
    cppText = replaceExactOrThrow(
      cppText,
      'if (tex_w > kMapAreaWidth || tex_h > kMapAreaHeight)\n        return "texture larger than the 1088x480 map area";',
      'if (tex_w > kMaxMapTexWidth || tex_h > kMaxMapTexHeight)\n        return "texture larger than 1632x720";',
      'kit/map_geometry.cpp'
    );
    fs.writeFileSync(cppPath, cppText, 'utf8');
  }
}

function patchIdriveApps(rootDir) {
  const crDir = path.join(rootDir, 'native', 'cluster-render');
  const wocDir = path.join(rootDir, 'native', 'waze-on-cluster');
  const wocAppDir = path.join(rootDir, 'apps', 'robertn_waze_cluster');

  // 1. Unlock native 1632x720 map texture ceiling while keeping 1088x480 map_quad default
  patchMapGeometry(crDir);

  // 2. Bump cluster-render SemVer cleanly (> 2.0.29 forks) & ensure uninstallable in MGU Store
  const crCompPath = path.join(crDir, 'component.json');
  const crComp = JSON.parse(fs.readFileSync(crCompPath, 'utf8'));
  crComp.version = UPSTREAM_PINS.clusterRenderVersion;
  crComp.uninstallable = true;
  fs.writeFileSync(crCompPath, JSON.stringify(crComp, null, 2) + '\n', 'utf8');

  // 3. Configure waze-on-cluster defaults for crisp 1632x720 hosted FullView (keep opt-in keys = 0 for opt_in_test)
  const wocConfPath = path.join(wocDir, 'waze-on-cluster.conf');
  let wocConf = fs.readFileSync(wocConfPath, 'utf8');
  wocConf = setIniLine(wocConf, 'tex_size', '1632x720');
  fs.writeFileSync(wocConfPath, wocConf, 'utf8');

  // 4. Patch patchd.js so --panel high defaults to 1632x720 when waze-on-cluster.conf sets tex_size = 1632x720
  // (Leaving mock unit tests without that conf expecting 1088x480 passing 100%)
  const patchdPath = path.join(wocDir, 'patch', 'patchd.js');
  let patchd = fs.readFileSync(patchdPath, 'utf8');
  if (patchd.indexOf('COCKPIT_FULLVIEW_RES') === -1) {
    patchd = replaceExactOrThrow(
      patchd,
      'function planArgs(panel, mode, unproven) {',
      [
        'function cockpitFullviewResArgs() {',
        '    try {',
        "        var cf = fs.existsSync('/var/opt/waze-on-cluster/current/waze-on-cluster.conf')",
        "            ? '/var/opt/waze-on-cluster/current/waze-on-cluster.conf'",
        "            : '/var/opt/waze-on-cluster/waze-on-cluster.conf';",
        "        if (fs.existsSync(cf) && /^\\s*tex_size\\s*=\\s*1632x720\\b/m.test(fs.readFileSync(cf, 'utf8'))) {",
        "            return ['--res', '1632x720', '--safe', '840x570+396+40'];",
        '        }',
        '    } catch (e) {}',
        '    return [];',
        '}',
        '/* COCKPIT_FULLVIEW_RES */',
        'function planArgs(panel, mode, unproven) {'
      ].join('\n'),
      'patch/patchd.js'
    );
    patchd = replaceExactOrThrow(
      patchd,
      "    var args = ['--panel', panel, '--coding', CODING].concat(unproven ? ['--unproven'] : []);",
      "    var args = ['--panel', panel, '--coding', CODING].concat(unproven ? ['--unproven'] : []).concat(panel === 'high' ? cockpitFullviewResArgs() : []);",
      'patch/patchd.js args'
    );
    if (patchd.indexOf('var keep = rec && rec.enabled === true && Array.isArray(rec.args) && rec.args.length ? rec.args : null;') !== -1) {
      patchd = replaceExactOrThrow(
        patchd,
        'var keep = rec && rec.enabled === true && Array.isArray(rec.args) && rec.args.length ? rec.args : null;',
        "var keep = rec && rec.enabled === true && Array.isArray(rec.args) && rec.args.length ? rec.args.map(function (a) { return a === '690x490+380+110' ? '840x570+396+40' : a; }) : null;",
        'patch/patchd.js keep migration'
      );
    }
    fs.writeFileSync(patchdPath, patchd, 'utf8');
  }

  // 4b. Patch carplay_locate.js so ShowUI requests pure map-only mode (maps:/car/instrumentcluster/map, itemType 1)
  // on the head unit when tex_size = 1632x720, suppressing Apple Maps' duplicate grey turn card & ETA pill
  // while leaving host unit tests (where /var/opt/waze-on-cluster is absent) on stock ?showETA=yes.
  const locatePath = path.join(wocDir, 'patch', 'carplay_locate.js');
  if (fs.existsSync(locatePath)) {
    let loc = fs.readFileSync(locatePath, 'utf8');
    if (loc.indexOf('COCKPIT_MAP_ONLY_SHOWUI') === -1) {
      loc = replaceExactOrThrow(
        loc,
        "var SHOWUI_URL = ALT_URL + '?showETA=yes';",
        [
          'var COCKPIT_MAP_ONLY_SHOWUI = (function () {',
          '    try {',
          "        var _fs = require('fs');",
          "        var cf = _fs.existsSync('/var/opt/waze-on-cluster/current/waze-on-cluster.conf')",
          "            ? '/var/opt/waze-on-cluster/current/waze-on-cluster.conf'",
          "            : '/var/opt/waze-on-cluster/waze-on-cluster.conf';",
          "        return _fs.existsSync(cf) && /^\\s*tex_size\\s*=\\s*1632x720\\b/m.test(_fs.readFileSync(cf, 'utf8'));",
          '    } catch (e) { return false; }',
          '})();',
          '/* COCKPIT_MAP_ONLY_SHOWUI */',
          "var SHOWUI_URL = COCKPIT_MAP_ONLY_SHOWUI ? (ALT_URL + '/map') : (ALT_URL + '?showETA=yes');"
        ].join('\n'),
        'patch/carplay_locate.js'
      );
      fs.writeFileSync(locatePath, loc, 'utf8');
    }
  }

  // 5. Bump waze-on-cluster SemVer (> 2.0.29 forks), ensure uninstallable & align app release/UI
  const wocCompPath = path.join(wocDir, 'component.json');
  const wocComp = JSON.parse(fs.readFileSync(wocCompPath, 'utf8'));
  wocComp.version = UPSTREAM_PINS.wazeOnClusterVersion;
  wocComp.uninstallable = true;
  wocComp.requires = Object.assign({}, wocComp.requires || {}, {
    'cluster-render': UPSTREAM_PINS.clusterRenderVersion
  });
  fs.writeFileSync(wocCompPath, JSON.stringify(wocComp, null, 2) + '\n', 'utf8');

  const wocRelPath = path.join(wocAppDir, 'release.json');
  if (fs.existsSync(wocRelPath)) {
    const wocRel = JSON.parse(fs.readFileSync(wocRelPath, 'utf8'));
    wocRel.requires = Object.assign({}, wocRel.requires || {}, {
      'waze-on-cluster': UPSTREAM_PINS.wazeOnClusterVersion
    });
    fs.writeFileSync(wocRelPath, JSON.stringify(wocRel, null, 2) + '\n', 'utf8');
  }

  // 6. Patch Maps on cluster UI (_outdated) so 1632x720 + 840x570+396+40 shows "Patched" instead of "Update needed"
  const wocCtrlPath = path.join(wocAppDir, 'src', 'waze_cluster_control.js');
  if (fs.existsSync(wocCtrlPath)) {
    let wocCtrl = fs.readFileSync(wocCtrlPath, 'utf8');
    if (wocCtrl.indexOf("'1632x720'") === -1) {
      wocCtrl = replaceExactOrThrow(
        wocCtrl,
        "(ps.res && ps.res !== SIZE) || (ps.safe && ps.safe !== SAFE) || ps.mapurl === 'no-eta'",
        "(ps.res && ps.res !== SIZE && ps.res !== '1632x720') || (ps.safe && ps.safe !== SAFE && ps.safe !== '840x570+396+40') || ps.mapurl === 'no-eta'",
        'apps/robertn_waze_cluster/src/waze_cluster_control.js'
      );
      fs.writeFileSync(wocCtrlPath, wocCtrl, 'utf8');
    }
  }
  const wocAppMetaPaths = [
    path.join(wocAppDir, 'package', 'package.json'),
    path.join(wocAppDir, 'mgu-app.json')
  ];
  for (const mp of wocAppMetaPaths) {
    if (fs.existsSync(mp)) {
      const mj = JSON.parse(fs.readFileSync(mp, 'utf8'));
      mj.version = UPSTREAM_PINS.robertnWazeAppVersion;
      fs.writeFileSync(mp, JSON.stringify(mj, null, 2) + '\n', 'utf8');
    }
  }

  return {
    clusterRenderVersion: crComp.version,
    wazeOnClusterVersion: wocComp.version,
    robertnWazeAppVersion: UPSTREAM_PINS.robertnWazeAppVersion
  };
}

function patchMguStore(rootDir) {
  const mrCompPath = path.join(rootDir, 'native', 'mgu-render', 'component.json');
  const mrComp = JSON.parse(fs.readFileSync(mrCompPath, 'utf8'));
  if (!mrComp.mguHmi) mrComp.mguHmi = ['ID7', 'ID8'];
  mrComp.version = mrComp.version || UPSTREAM_PINS.mguRenderVersion;
  fs.writeFileSync(mrCompPath, JSON.stringify(mrComp, null, 2) + '\n', 'utf8');
  return { mguRenderVersion: mrComp.version };
}

function parseCli(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--idrive-apps' && argv[i + 1]) out.idriveApps = argv[++i];
    else if (argv[i] === '--mgu-store' && argv[i + 1]) out.mguStore = argv[++i];
  }
  return out;
}

if (require.main === module) {
  const opts = parseCli(process.argv.slice(2));
  if (!opts.idriveApps && !opts.mguStore) {
    process.stderr.write('Usage: node native/fullview-patch.js --idrive-apps <dir> [--mgu-store <dir>]\n');
    process.exit(2);
  }
  const summary = {};
  if (opts.idriveApps) summary.idriveApps = patchIdriveApps(path.resolve(opts.idriveApps));
  if (opts.mguStore) summary.mguStore = patchMguStore(path.resolve(opts.mguStore));
  console.log('[fullview-patch]', JSON.stringify(summary));
}

module.exports = {
  UPSTREAM_PINS,
  patchMapGeometry,
  patchIdriveApps,
  patchMguStore
};
