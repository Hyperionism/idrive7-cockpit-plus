#!/usr/bin/env node
/**
 * Build Cockpit+ release packages (`cockpit-fullview` + `id7_cockpit_plus`),
 * optionally merge upstream-built native MGU components (`cluster-render`,
 * `waze-on-cluster`, `robertn_waze_cluster`, `mgu-render`) from an upstream
 * catalog JSON (`--extra-catalog <path>`), and emit unified MGU Store Schema 2
 * `catalog.json` + `mgu-store.json`.
 *
 * Usage:
 *   node release/build_catalog.js --repo <owner/repo> [--tag v0.9.4] [--extra-catalog a.json,b.json] [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'apps', 'id7_cockpit_plus');
const TOOL_DIR = path.join(ROOT, 'tools', 'cockpit-fullview');
const BUILD_PY = path.join(ROOT, 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'tools', 'build.py');
const DIST_DIR = path.join(ROOT, 'dist');

function parseArgs(argv) {
  const opts = {
    repo: process.env.GITHUB_REPOSITORY || 'Hyperionism/idrive7-cockpit-plus',
    tag: '',
    language: 'zh-CN',
    extraCatalogs: [],
    dryRun: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo' && argv[i + 1]) opts.repo = argv[++i];
    else if (a === '--tag' && argv[i + 1]) opts.tag = argv[++i];
    else if (a === '--language' && argv[i + 1]) opts.language = argv[++i];
    else if (a === '--extra-catalog' && argv[i + 1]) {
      opts.extraCatalogs = opts.extraCatalogs.concat(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    }
    else if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function findPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push({ cmd: process.env.PYTHON, args: [] });
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) {
      const localBin = path.join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe');
      if (fs.existsSync(localBin)) candidates.push({ cmd: localBin, args: [] });
    }
    candidates.push({ cmd: 'python', args: [] });
    candidates.push({ cmd: 'py', args: ['-3'] });
  } else {
    candidates.push({ cmd: 'python3', args: [] });
    candidates.push({ cmd: 'python', args: [] });
  }
  for (const c of candidates) {
    const res = childProcess.spawnSync(c.cmd, [...c.args, '--version'], { encoding: 'utf8' });
    if (res.status === 0 && /Python 3\./.test((res.stdout || '') + (res.stderr || ''))) {
      return c;
    }
  }
  throw new Error('Python 3 executable not found (set PYTHON env var or add python3 to PATH)');
}

function readTarEntries(tgzPath) {
  const gz = fs.readFileSync(tgzPath);
  const raw = zlib.gunzipSync(gz);
  const entries = new Map();
  let off = 0;
  while (off + 512 <= raw.length) {
    const hdr = raw.subarray(off, off + 512);
    off += 512;
    if (hdr.every((b) => b === 0)) break;
    const nameRaw = hdr.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = hdr.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = (prefix ? prefix + '/' + nameRaw : nameRaw).replace(/^\.\//, '');
    const sizeStr = hdr.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = String.fromCharCode(hdr[156] || 48);
    const data = size > 0 ? raw.subarray(off, off + size) : Buffer.alloc(0);
    if (size > 0) {
      off += Math.ceil(size / 512) * 512;
    }
    if (typeFlag === '0' || typeFlag === '\0') {
      entries.set(fullName, Buffer.from(data));
    }
  }
  return entries;
}

function verifyPackage(stageDir, tgzPath, appSpec) {
  const entries = readTarEntries(tgzPath);
  const names = Array.from(entries.keys());
  const required = [
    'package/package.json',
    'package/manifest.json',
    'package/javascript/app.js'
  ];
  for (const r of required) {
    if (!names.includes(r)) {
      throw new Error(`Missing required file in OAP app package: ${r} (got ${names.slice(0, 8).join(', ')})`);
    }
  }
  const hasSdk = names.some((f) => f.includes('oap-sdk'));
  if (hasSdk) {
    throw new Error('Release package must not bundle @oap/sdk (check --omit-sdk)');
  }
  const sourcePkgPath = path.join(stageDir, 'source', 'package.json');
  if (fs.existsSync(sourcePkgPath) && appSpec && appSpec.id) {
    const pkg = JSON.parse(fs.readFileSync(sourcePkgPath, 'utf8'));
    if (pkg.name !== appSpec.id) {
      throw new Error(`Package name mismatch: ${pkg.name} !== ${appSpec.id}`);
    }
  }
  return {
    size: fs.statSync(tgzPath).size,
    entryCount: names.length,
    entries: names
  };
}

function verifyToolPackage(tgzPath) {
  const entries = readTarEntries(tgzPath);
  if (!entries.has('component.json')) {
    throw new Error('Tool archive missing root component.json');
  }
  const comp = JSON.parse(entries.get('component.json').toString('utf8'));
  if (comp.kind !== 'tool') throw new Error(`Expected tool kind, got ${comp.kind}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(comp.id)) throw new Error(`Invalid tool id: ${comp.id}`);
  if (!Array.isArray(comp.files) || comp.files.length === 0) throw new Error('Tool files[] must be non-empty');
  for (const f of comp.files) {
    const tarKey = `files/${f.path}`;
    if (!entries.has(tarKey)) throw new Error(`Tool archive missing ${tarKey}`);
    const actualSha = sha256Buffer(entries.get(tarKey));
    if (actualSha !== f.sha256) {
      throw new Error(`SHA-256 mismatch for ${tarKey}: expected ${f.sha256}, got ${actualSha}`);
    }
  }
  return comp;
}

function buildToolArchive(py, outTgz) {
  const compPath = path.join(TOOL_DIR, 'component.json');
  const comp = JSON.parse(fs.readFileSync(compPath, 'utf8'));
  comp.files = (comp.files || []).map((f) => {
    const filePath = path.join(TOOL_DIR, 'files', f.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Tool payload file missing: ${filePath}`);
    }
    return {
      path: f.path,
      mode: f.mode || '0644',
      sha256: sha256File(filePath)
    };
  });

  const pyScript = [
    'import json, os, sys, tarfile, io',
    'comp = json.loads(sys.argv[1])',
    'tool_dir = sys.argv[2]',
    'out_tgz = sys.argv[3]',
    'comp_bytes = (json.dumps(comp, indent=2) + "\\n").encode("utf-8")',
    'with tarfile.open(out_tgz, "w:gz", format=tarfile.USTAR_FORMAT) as tf:',
    '    ti = tarfile.TarInfo("component.json")',
    '    ti.size = len(comp_bytes)',
    '    ti.mode = 0o644',
    '    ti.mtime = 0',
    '    ti.uid = 0',
    '    ti.gid = 0',
    '    tf.addfile(ti, io.BytesIO(comp_bytes))',
    '    for f in comp["files"]:',
    '        src = os.path.join(tool_dir, "files", f["path"])',
    '        data = open(src, "rb").read()',
    '        fi = tarfile.TarInfo("files/" + f["path"].replace("\\\\", "/"))',
    '        fi.size = len(data)',
    '        fi.mode = int(f.get("mode", "0644"), 8)',
    '        fi.mtime = 0',
    '        fi.uid = 0',
    '        fi.gid = 0',
    '        tf.addfile(fi, io.BytesIO(data))'
  ].join('\n');

  const res = childProcess.spawnSync(
    py.cmd,
    [...py.args, '-c', pyScript, JSON.stringify(comp), TOOL_DIR, outTgz],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`Failed to pack tool archive:\n${res.stdout || ''}\n${res.stderr || ''}`);
  }
  return comp;
}

function loadExtraCatalogEntries(catalogPaths, baseReleaseUrl, distDir) {
  const byId = new Map();
  const extraApps = {};
  for (const catPathRaw of catalogPaths) {
    const catPath = path.resolve(catPathRaw);
    const catDir = path.dirname(catPath);
    const data = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    const list = Array.isArray(data.components) ? data.components : [];
    for (const rawEntry of list) {
      if (!rawEntry || !rawEntry.id || !rawEntry.artifact || !rawEntry.artifact.name) continue;
      const entry = JSON.parse(JSON.stringify(rawEntry));
      const srcArt = path.join(catDir, entry.artifact.name);
      const dstArt = path.join(distDir, entry.artifact.name);
      if (fs.existsSync(srcArt) && srcArt !== dstArt) {
        fs.copyFileSync(srcArt, dstArt);
      }
      if (!fs.existsSync(dstArt)) {
        throw new Error(`Extra catalog artifact missing: ${srcArt}`);
      }
      entry.artifact.size = fs.statSync(dstArt).size;
      entry.artifact.sha256 = sha256File(dstArt);
      entry.artifact.url = `${baseReleaseUrl}/${entry.artifact.name}`;
      if (entry.icon) {
        const srcIcon = path.join(catDir, entry.icon);
        const dstIcon = path.join(distDir, entry.icon);
        if (fs.existsSync(srcIcon) && srcIcon !== dstIcon) {
          fs.copyFileSync(srcIcon, dstIcon);
        }
        if (fs.existsSync(dstIcon)) {
          entry.iconSha256 = sha256File(dstIcon);
        }
      }
      if (entry.kind === 'app') {
        extraApps[entry.id] = {
          title: entry.title,
          description: entry.description,
          icon: entry.icon,
          iconSha256: entry.iconSha256
        };
      }
      byId.set(entry.id, entry);
    }
  }
  return { entries: Array.from(byId.values()), appsMeta: extraApps };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const appManifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8'));
  const tag = opts.tag || `v${appManifest.version}`;
  const py = findPython();

  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. Build Cockpit+ OAP app tarball (--omit-sdk) with Simplified Chinese UI by default
  const buildArgs = [...py.args, BUILD_PY, '--app-root', ROOT, '--language', opts.language, '--omit-sdk', appManifest.id];
  const buildRes = childProcess.spawnSync(py.cmd, buildArgs, { cwd: ROOT, encoding: 'utf8' });
  if (buildRes.status !== 0) {
    throw new Error(`build.py failed:\n${buildRes.stdout || ''}\n${buildRes.stderr || ''}`);
  }

  const appStageDir = path.join(DIST_DIR, appManifest.id);
  const appTgzName = `${appManifest.id}@${appManifest.version}.tgz`;
  const appTgzPath = path.join(DIST_DIR, appTgzName);
  if (!fs.existsSync(appTgzPath)) {
    throw new Error(`Expected tarball not produced: ${appTgzPath}`);
  }
  const appVerified = verifyPackage(appStageDir, appTgzPath, appManifest);

  // 2. Build cockpit-fullview companion root tool tarball
  const rawTool = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'component.json'), 'utf8'));
  const toolTgzName = `${rawTool.id}@${rawTool.version}.tgz`;
  const toolTgzPath = path.join(DIST_DIR, toolTgzName);
  const toolManifest = buildToolArchive(py, toolTgzPath);
  verifyToolPackage(toolTgzPath);

  // 3. Copy app icon & compute SHA-256 checksums
  const iconName = `${appManifest.id}.png`;
  const iconSrc = path.join(APP_DIR, 'icon.png');
  const iconDest = path.join(DIST_DIR, iconName);
  fs.copyFileSync(iconSrc, iconDest);

  const iconSha = sha256File(iconDest);
  const appTgzSha = sha256File(appTgzPath);
  const appTgzSize = fs.statSync(appTgzPath).size;
  const toolTgzSha = sha256File(toolTgzPath);
  const toolTgzSize = fs.statSync(toolTgzPath).size;

  const baseReleaseUrl = `https://github.com/${opts.repo}/releases/download/${tag}`;

  // Merge any upstream-built native & control components cleanly
  const mergedExtras = loadExtraCatalogEntries(opts.extraCatalogs, baseReleaseUrl, DIST_DIR);

  const localComponents = [
    {
      id: toolManifest.id,
      kind: 'tool',
      title: toolManifest.title,
      description: toolManifest.description,
      texts: {
        'zh-CN': {
          title: 'Cockpit+ 全屏地图伴侣工具',
          description: '为 Cockpit+ 自动配置全屏 1632x720 仪表地图托管环境，自动修复旧版 cluster-render.local.conf 冲突并可逆关闭重叠的 C++ 浮窗'
        }
      },
      author: toolManifest.author,
      version: toolManifest.version,
      artifact: {
        name: toolTgzName,
        size: toolTgzSize,
        sha256: toolTgzSha,
        url: `${baseReleaseUrl}/${toolTgzName}`
      },
      uninstallable: toolManifest.uninstallable !== false,
      mguHmi: toolManifest.mguHmi || ['ID7']
    },
    {
      id: appManifest.id,
      kind: 'app',
      title: appManifest.title,
      description: appManifest.description,
      texts: {
        'zh-CN': {
          title: 'Cockpit+ 驾驶舱增强',
          description: 'BMW iDrive 7 全开源仪表全屏导航与驾驶舱套件：原生托管 1632x720 CarPlay/高德/百度全屏地图，内置 5AU 顶部车道引导、居中转向卡、底部 ETA 胶囊、无框数字车速、右侧媒体/行程/胎压卡片与 HUD 导航（简体中文界面）'
        }
      },
      author: appManifest.author,
      version: appManifest.version,
      artifact: {
        name: appTgzName,
        size: appTgzSize,
        sha256: appTgzSha,
        url: `${baseReleaseUrl}/${appTgzName}`
      },
      uninstallable: true,
      mguHmi: appManifest.mguHmi || ['ID7'],
      requires: appManifest.requires || {},
      icon: iconName,
      iconSha256: iconSha
    }
  ];

  // Put tools first, then apps cleanly
  const allComponents = mergedExtras.entries.concat(localComponents);
  allComponents.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'tool' ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const catalog = {
    schema: 2,
    components: allComponents
  };

  const mguStoreMeta = {
    apps: Object.assign({}, mergedExtras.appsMeta, {
      [appManifest.id]: {
        title: appManifest.title,
        description: appManifest.description,
        author: appManifest.author,
        icon: iconName,
        iconSha256: iconSha
      }
    })
  };

  fs.writeFileSync(path.join(DIST_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'mgu-store.json'), JSON.stringify(mguStoreMeta, null, 2) + '\n', 'utf8');

  console.log(`[build_catalog] Built ${appTgzName} (${appTgzSize} B, ${appVerified.entryCount} files, sha256=${appTgzSha.slice(0, 12)}...)`);
  console.log(`[build_catalog] Built ${toolTgzName} (${toolTgzSize} B, sha256=${toolTgzSha.slice(0, 12)}...)`);
  console.log(`[build_catalog] Schema 2 catalog.json (${allComponents.length} components) & mgu-store.json written for ${opts.repo} @ ${tag}${opts.dryRun ? ' (dry-run)' : ''}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  readTarEntries,
  verifyPackage,
  verifyToolPackage,
  buildToolArchive,
  loadExtraCatalogEntries
};
