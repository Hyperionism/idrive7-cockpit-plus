#!/usr/bin/env node
'use strict';
/**
 * release/build_catalog.js - Build & verify MGU Store tarball + catalog.json (Schema 2) + mgu-store.json.
 *
 * Usage:
 *   node release/build_catalog.js --repo <owner/repo> [--tag v0.9.3] [--skip-build] [--dry-run]
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_ID = 'id7_cockpit_plus';
const APP_DIR = path.join(ROOT, 'apps', APP_ID);
const DIST_DIR = path.join(ROOT, 'dist');
const BUILD_PY = path.join(ROOT, 'vendor', 'cauliflowermossgrape-idrive7-apps', 'kit', 'tools', 'build.py');
const MAX_TAR_BYTES = 32 * 1024 * 1024;

function parseArgs(argv) {
    const args = { repo: process.env.GITHUB_REPOSITORY || 'Hyperionism/idrive7-cockpit-plus', tag: '', skipBuild: false, dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--repo' && argv[i + 1]) { args.repo = argv[++i]; }
        else if (a === '--tag' && argv[i + 1]) { args.tag = argv[++i]; }
        else if (a === '--skip-build') { args.skipBuild = true; }
        else if (a === '--dry-run') { args.dryRun = true; }
    }
    return args;
}

function findPython() {
    const candidates = process.platform === 'win32'
        ? [
            'python3', 'python', 'py',
            path.join(process.env.LOCALAPPDATA || '', 'Python', 'bin', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Python', 'bin', 'python3.exe'),
        ]
        : ['python3', 'python'];
    for (let i = 0; i < candidates.length; i++) {
        if (!candidates[i]) continue;
        try {
            const out = execFileSync(candidates[i], ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
            if (/Python 3/i.test(out)) return candidates[i];
        } catch (e) { /* try next */ }
    }
    return null;
}

function listTarEntries(tgzPath) {
    const cmd = process.platform === 'win32' ? 'tar.exe' : 'tar';
    const out = execFileSync(cmd, ['-ztf', tgzPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function sha256File(filePath) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(filePath));
    return h.digest('hex');
}

function patchRepoLinkIfPlaceholder(appJsonPath, repo) {
    if (!repo || repo.indexOf('OWNER/') === 0) return false;
    const raw = fs.readFileSync(appJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const want = 'github.com/' + repo;
    if (parsed.repoLink && parsed.repoLink.indexOf('OWNER/') >= 0 && parsed.repoLink !== want) {
        parsed.repoLink = want;
        fs.writeFileSync(appJsonPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
        return true;
    }
    return false;
}

function verifyPackage(stageDir, tgzPath, appSpec) {
    const srcDir = fs.existsSync(path.join(stageDir, 'source', 'package.json'))
        ? path.join(stageDir, 'source')
        : stageDir;
    const stagePkgPath = path.join(srcDir, 'package.json');
    assert(fs.existsSync(stagePkgPath), 'Missing staged package.json: ' + stagePkgPath);
    const pkg = JSON.parse(fs.readFileSync(stagePkgPath, 'utf8'));
    assert.strictEqual(pkg.private, false, 'Staged package.json MUST have private: false for MGU Store');
    const mainRel = pkg.main || 'javascript/app.js';
    assert(fs.existsSync(path.join(srcDir, mainRel)), 'Missing staged main entrypoint: ' + mainRel);
    const manifestRel = pkg.oapAppSettings && pkg.oapAppSettings.someipManifest;
    assert(manifestRel && fs.existsSync(path.join(srcDir, manifestRel)), 'Missing oapAppSettings.someipManifest: ' + manifestRel);

    assert(fs.existsSync(tgzPath), 'Missing tarball: ' + tgzPath);
    const stat = fs.statSync(tgzPath);
    assert(stat.size > 0 && stat.size <= MAX_TAR_BYTES, 'Tarball size invalid: ' + stat.size);

    const entries = listTarEntries(tgzPath).map((e) => e.replace(/^\.\//, ''));
    const hasEntry = (rel) => entries.some((e) => e === rel || e === ('package/' + rel) || e.endsWith('/' + rel));
    assert(hasEntry('package.json'), 'Tarball must contain package.json');
    assert(hasEntry(mainRel), 'Tarball must contain main entrypoint: ' + mainRel);
    assert(hasEntry(manifestRel), 'Tarball must contain SOME/IP manifest: ' + manifestRel);
    const badSdk = entries.filter((e) => /(^|\/)oap-sdk(\/|$)/i.test(e));
    assert.strictEqual(badSdk.length, 0, 'Tarball MUST NOT bundle proprietary oap-sdk: ' + badSdk.join(', '));

    return {
        size: stat.size,
        sha256: sha256File(tgzPath),
        entryCount: entries.length,
        version: pkg.version || appSpec.version,
    };
}

function main() {
    const args = parseArgs(process.argv);
    const appJsonPath = path.join(APP_DIR, 'app.json');
    const appSpec = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const version = String(appSpec.version || '0.9.3');
    const tag = args.tag || ('v' + version);
    const owner = (args.repo.split('/')[0] || 'OWNER').trim();

    if (!args.dryRun && args.repo && args.repo.indexOf('OWNER/') !== 0) {
        patchRepoLinkIfPlaceholder(appJsonPath, args.repo);
    }

    if (!args.skipBuild) {
        const py = findPython();
        if (!py) {
            throw new Error('Python 3 not found on PATH; cannot run build.py (use --skip-build if dist/ already exists).');
        }
        execFileSync(py, [BUILD_PY, '--app-root', ROOT, '--omit-sdk', APP_ID], {
            cwd: ROOT,
            stdio: 'inherit',
        });
    }

    const stageDir = path.join(DIST_DIR, APP_ID);
    const tgzName = APP_ID + '@' + version + '.tgz';
    const tgzPath = path.join(DIST_DIR, tgzName);
    const verInfo = verifyPackage(stageDir, tgzPath, appSpec);

    const iconSrc = path.join(APP_DIR, 'icon.png');
    const iconName = APP_ID + '.png';
    const iconDist = path.join(DIST_DIR, iconName);
    assert(fs.existsSync(iconSrc), 'Missing app icon: ' + iconSrc);
    fs.copyFileSync(iconSrc, iconDist);

    const baseDl = 'https://github.com/' + args.repo + '/releases/download/';
    const relUrl = baseDl + encodeURIComponent(tag) + '/' + encodeURIComponent(tgzName);
    const iconUrl = baseDl + encodeURIComponent(tag) + '/' + encodeURIComponent(iconName);
    const homepage = 'https://github.com/' + args.repo;
    const nowIso = new Date().toISOString();

    const mguStoreMeta = {
        id: APP_ID,
        name: APP_ID,
        title: appSpec.title || 'Cockpit+',
        description: appSpec.description,
        version,
        category: 'apps',
        author: owner,
        license: appSpec.license || 'GPL-3.0-only',
        mguHmi: appSpec.mguHmi || ['ID7'],
        requires: appSpec.requires || { 'cluster-render': '0.4.0' },
        asset: tgzName,
        icon: iconName,
        sha256: verInfo.sha256,
        size: verInfo.size,
        homepage,
    };

    const catalog = {
        schema: 2,
        updated: nowIso,
        repository: args.repo,
        components: {
            [APP_ID]: {
                id: APP_ID,
                name: APP_ID,
                title: appSpec.title || 'Cockpit+',
                description: appSpec.description,
                category: 'apps',
                author: owner,
                license: appSpec.license || 'GPL-3.0-only',
                homepage,
                mguHmi: appSpec.mguHmi || ['ID7'],
                requires: appSpec.requires || { 'cluster-render': '0.4.0' },
                icon: iconUrl,
                latest: version,
                versions: {
                    [version]: {
                        version,
                        url: relUrl,
                        tarball: relUrl,
                        icon: iconUrl,
                        sha256: verInfo.sha256,
                        size: verInfo.size,
                        mguHmi: appSpec.mguHmi || ['ID7'],
                        requires: appSpec.requires || { 'cluster-render': '0.4.0' },
                        publishedAt: nowIso,
                    },
                },
            },
        },
    };

    fs.writeFileSync(path.join(DIST_DIR, 'mgu-store.json'), JSON.stringify(mguStoreMeta, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');

    console.log('[release] Verified ' + tgzName + ' (' + verInfo.size + ' bytes, ' + verInfo.entryCount + ' entries, sha256=' + verInfo.sha256.slice(0, 12) + '...)');
    console.log('[release] Generated dist/mgu-store.json and dist/catalog.json (Schema 2) for ' + args.repo + ' tag ' + tag);
}

if (require.main === module) {
    main();
}

module.exports = { verifyPackage, listTarEntries };
