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
  clusterRenderVersion: '2.9.1',
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

const HOST_MASK_GLSL_BLOCK = [
  '    float ma = 1.0;',
  '    if (u_mask.x > 0.5) {',
  '        float wx = u_mask.z + v_uv.x * u_mask_sz.x;',
  '        float wy = u_mask.w + v_uv.y * u_mask_sz.y;',
  '        float ax = abs(wx - 960.0);',
  '        float fPx = clamp(u_mask.y > 1.0 ? u_mask.y : 54.0, 16.0, 120.0);',
  '        float botA = 1.0 - smoothstep(616.0 - max(36.0, fPx * 0.8), 614.0, wy);',
  '        if (u_mask.x < 1.5) {',
  '            float halfW = 232.0;',
  '            if (wy >= 95.0 && wy < 345.0) {',
  '                halfW = mix(232.0, 372.0, smoothstep(0.0, 1.0, (wy - 95.0) / 250.0));',
  '            } else if (wy >= 345.0) {',
  '                halfW = mix(372.0, 268.0, smoothstep(0.0, 1.0, clamp((wy - 345.0) / 263.0, 0.0, 1.0)));',
  '            }',
  '            float sideA = 1.0 - smoothstep(halfW - fPx, halfW, ax);',
  '            float topA = smoothstep(0.0, 14.0, wy);',
  '            ma = min(min(sideA, botA), topA);',
  '        } else {',
  '            float nx = ax / 800.0;',
  '            float ny = (wy - 308.0) / 308.0;',
  '            float dOuter = pow(pow(max(nx, 0.0001), 3.2) + pow(max(abs(ny), 0.0001), 3.2), 1.0 / 3.2);',
  '            float fNorm = clamp(fPx / 800.0, 0.03, 0.14);',
  '            float outerA = 1.0 - smoothstep(1.0 - fNorm, 1.0, dOuter);',
  '            ma = min(outerA, botA);',
  '        }',
  '        if (ma <= 0.002) discard;',
  '    }'
].join('\n');

function patchHostVideoMask(crDir) {
  // 1. kit/yuv_atlas.cpp: alpha mask + discard inside kAtlasFragmentShader
  const atlasPath = path.join(crDir, 'kit', 'yuv_atlas.cpp');
  let atlas = fs.readFileSync(atlasPath, 'utf8');
  if (atlas.indexOf('u_mask_sz') === -1) {
    atlas = replaceExactOrThrow(
      atlas,
      'uniform vec2 u_size;\nuniform float u_opacity;\nvarying vec2 v_uv;',
      'uniform vec2 u_size;\nuniform float u_opacity;\nuniform vec4 u_mask;\nuniform vec2 u_mask_sz;\nvarying vec2 v_uv;',
      'kit/yuv_atlas.cpp uniforms'
    );
    atlas = replaceExactOrThrow(
      atlas,
      '    vec3 rgb = vec3(y + 1.402 * v, y - 0.344136 * u - 0.714136 * v, y + 1.772 * u);\n    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), u_opacity);',
      '    vec3 rgb = vec3(y + 1.402 * v, y - 0.344136 * u - 0.714136 * v, y + 1.772 * u);\n' +
        HOST_MASK_GLSL_BLOCK + '\n' +
        '    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), u_opacity * ma);',
      'kit/yuv_atlas.cpp shader body'
    );
    fs.writeFileSync(atlasPath, atlas, 'utf8');
  }

  // 2. kit/block_pack.cpp: identical alpha mask + discard inside kBlockFragmentShader
  const blockPath = path.join(crDir, 'kit', 'block_pack.cpp');
  let block = fs.readFileSync(blockPath, 'utf8');
  if (block.indexOf('u_mask_sz') === -1) {
    block = replaceExactOrThrow(
      block,
      'uniform vec2 u_size;\nuniform float u_opacity;\nvarying vec2 v_uv;',
      'uniform vec2 u_size;\nuniform float u_opacity;\nuniform vec4 u_mask;\nuniform vec2 u_mask_sz;\nvarying vec2 v_uv;',
      'kit/block_pack.cpp uniforms'
    );
    block = replaceExactOrThrow(
      block,
      '    vec3 c = sel < 0.5 ? c0 : sel < 1.5 ? c1 : sel < 2.5 ? (2.0 * c0 + c1) / 3.0 : (c0 + 2.0 * c1) / 3.0;\n    gl_FragColor = vec4(c, u_opacity);',
      '    vec3 c = sel < 0.5 ? c0 : sel < 1.5 ? c1 : sel < 2.5 ? (2.0 * c0 + c1) / 3.0 : (c0 + 2.0 * c1) / 3.0;\n' +
        HOST_MASK_GLSL_BLOCK + '\n' +
        '    gl_FragColor = vec4(c, u_opacity * ma);',
      'kit/block_pack.cpp shader body'
    );
    fs.writeFileSync(blockPath, block, 'utf8');
  }

  // 3. src/video_layer.h: mask_mode & mask_feather fields + has_mask() / any() + set_mask()
  const vlHPath = path.join(crDir, 'src', 'video_layer.h');
  let vlH = fs.readFileSync(vlHPath, 'utf8');
  if (vlH.indexOf('has_mask()') === -1) {
    vlH = replaceExactOrThrow(
      vlH,
      [
        'struct VideoEdge {',
        '    uint32_t top = 0, bottom = 0, fade = 0, dim = 0, blur = 0;',
        '    bool on() const { return top || bottom; }',
        '    bool operator==(const VideoEdge &o) const',
        '    {',
        '        return top == o.top && bottom == o.bottom && fade == o.fade && dim == o.dim && blur == o.blur;',
        '    }',
        '    bool operator!=(const VideoEdge &o) const { return !(*this == o); }',
        '};'
      ].join('\n'),
      [
        'struct VideoEdge {',
        '    uint32_t top = 0, bottom = 0, fade = 0, dim = 0, blur = 0, mask_mode = 0, mask_feather = 54;',
        '    bool on() const { return top || bottom; }',
        '    bool has_mask() const { return mask_mode > 0; }',
        '    bool any() const { return on() || has_mask(); }',
        '    bool operator==(const VideoEdge &o) const',
        '    {',
        '        return top == o.top && bottom == o.bottom && fade == o.fade && dim == o.dim && blur == o.blur &&',
        '               mask_mode == o.mask_mode && mask_feather == o.mask_feather;',
        '    }',
        '    bool operator!=(const VideoEdge &o) const { return !(*this == o); }',
        '};'
      ].join('\n'),
      'src/video_layer.h VideoEdge'
    );
    vlH = replaceExactOrThrow(
      vlH,
      '    void make_edge_quads();\n    void drop_edge_quads();',
      '    void make_edge_quads();\n    void drop_edge_quads();\n    bool mask_set_ = false;\n    void set_mask();',
      'src/video_layer.h set_mask'
    );
    fs.writeFileSync(vlHPath, vlH, 'utf8');
  }

  // 4. src/video_layer.cpp: bind u_mask/u_mask_sz, update in set_edge()/place(), skip opaque occlude() when masked
  const vlCppPath = path.join(crDir, 'src', 'video_layer.cpp');
  let vlCpp = fs.readFileSync(vlCppPath, 'utf8');
  if (vlCpp.indexOf('VideoLayer::set_mask()') === -1) {
    vlCpp = replaceExactOrThrow(
      vlCpp,
      'if (g_ && s.drawn && opaque_ && s.opacity * s.fade >= 1.0f && !s.turned)',
      'if (g_ && s.drawn && opaque_ && s.opacity * s.fade >= 1.0f && !s.turned && !edge_.has_mask())',
      'src/video_layer.cpp occlude'
    );
    vlCpp = replaceExactOrThrow(
      vlCpp,
      [
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
        '}'
      ].join('\n'),
      [
        'bool VideoLayer::make_atlas_quads(Graph *g)',
        '{',
        '    const Rect r = drawn_params().rect;',
        '    const float size[2] = {(float)p_.w, (float)p_.h}, zero = 0.0f;',
        '    atlas_quad_ = g->quad(atlas_effect_, r);',
        '    bool ok = atlas_quad_ && g->turn(atlas_quad_, drawn_params().turn()) && g->texture(atlas_quad_, "u_image", atlas_buf_) &&',
        '              g->uniform(atlas_quad_, "u_size", size, 2) && g->uniform(atlas_quad_, "u_opacity", &zero, 1) &&',
        '              g->show(atlas_quad_, false) && g->order(atlas_quad_, order_);',
        '    if (ok && edge_.has_mask()) {',
        '        const float mask[4] = {(float)edge_.mask_mode, (float)edge_.mask_feather, (float)r.x, (float)r.y};',
        '        const float mask_sz[2] = {(float)r.w, (float)r.h};',
        '        ok = g->uniform(atlas_quad_, "u_mask", mask, 4) && g->uniform(atlas_quad_, "u_mask_sz", mask_sz, 2);',
        '    }',
        '    mask_set_ = ok && edge_.has_mask();',
        '    return ok;',
        '}',
        '',
        'bool VideoLayer::make_block_quads(Graph *g)',
        '{',
        '    const Rect r = drawn_params().rect;',
        '    const float size[2] = {(float)p_.w, (float)p_.h}, zero = 0.0f;',
        '    block_quad_ = g->quad(block_effect_, r);',
        '    bool ok = block_quad_ && g->turn(block_quad_, drawn_params().turn()) && g->texture(block_quad_, "u_image", block_buf_[0]) &&',
        '              g->uniform(block_quad_, "u_size", size, 2) && g->uniform(block_quad_, "u_opacity", &zero, 1) &&',
        '              g->show(block_quad_, false) && g->order(block_quad_, order_ + 1);',
        '    if (ok && edge_.has_mask()) {',
        '        const float mask[4] = {(float)edge_.mask_mode, (float)edge_.mask_feather, (float)r.x, (float)r.y};',
        '        const float mask_sz[2] = {(float)r.w, (float)r.h};',
        '        ok = g->uniform(block_quad_, "u_mask", mask, 4) && g->uniform(block_quad_, "u_mask_sz", mask_sz, 2);',
        '    }',
        '    return ok;',
        '}',
        '',
        'void VideoLayer::set_mask()',
        '{',
        '    if (!g_ || !atlas_quad_ || (!edge_.has_mask() && !mask_set_))',
        '        return;',
        '    const Rect r = drawn_params().rect;',
        '    const float mask[4] = {(float)edge_.mask_mode, (float)edge_.mask_feather, (float)r.x, (float)r.y};',
        '    const float mask_sz[2] = {(float)r.w, (float)r.h};',
        '    g_->uniform(atlas_quad_, "u_mask", mask, 4);',
        '    g_->uniform(atlas_quad_, "u_mask_sz", mask_sz, 2);',
        '    if (block_quad_) {',
        '        g_->uniform(block_quad_, "u_mask", mask, 4);',
        '        g_->uniform(block_quad_, "u_mask_sz", mask_sz, 2);',
        '    }',
        '    mask_set_ = edge_.has_mask();',
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
        '        set_mask();',
        '        drop_edge_quads();',
        '        make_edge_quads();',
        '    }',
        '    return true;',
        '}'
      ].join('\n'),
      'src/video_layer.cpp quads/set_edge'
    );
    vlCpp = replaceExactOrThrow(
      vlCpp,
      '    blocks_shown_ = parked_ = false;',
      '    blocks_shown_ = parked_ = mask_set_ = false;',
      'src/video_layer.cpp detach'
    );
    vlCpp = replaceExactOrThrow(
      vlCpp,
      '    if (edge_.on() && drawn_params().rect != edge_at_) {   /* the edge\'s quads and blur follow the rect */\n        drop_edge_quads();\n        make_edge_quads();\n    }\n    set_opacity();',
      '    if (edge_.on() && drawn_params().rect != edge_at_) {   /* the edge\'s quads and blur follow the rect */\n        drop_edge_quads();\n        make_edge_quads();\n    }\n    set_mask();\n    set_opacity();',
      'src/video_layer.cpp place'
    );
    fs.writeFileSync(vlCppPath, vlCpp, 'utf8');
  }

  // 5. src/compositor.cpp: propagate mask_mode/mask_feather via edge_for() even without edge_effects()
  const compPath = path.join(crDir, 'src', 'compositor.cpp');
  let comp = fs.readFileSync(compPath, 'utf8');
  if (comp.indexOf('edge.any()') === -1) {
    comp = replaceExactOrThrow(
      comp,
      '                if (ed.on() && !edge_effects())\n                    ed = VideoEdge();',
      '                if (ed.on() && !edge_effects())\n                    ed.top = ed.bottom = ed.fade = ed.dim = ed.blur = 0;',
      'src/compositor.cpp arrange'
    );
    comp = replaceExactOrThrow(
      comp,
      'if (!h.shown || !h.edge.on() || x0 < h.rect.x',
      'if (!h.shown || !h.edge.any() || x0 < h.rect.x',
      'src/compositor.cpp scene host'
    );
    comp = replaceExactOrThrow(
      comp,
      'return lh && lh->host.edge.on() ? clamped(lh->host.edge) : VideoEdge();',
      'return lh && lh->host.edge.any() ? clamped(lh->host.edge) : VideoEdge();',
      'src/compositor.cpp layer host'
    );
    fs.writeFileSync(compPath, comp, 'utf8');
  }

  // 6. src/server.cpp: advertise host_mask=1 & parse mask_mode / mask_feather in op_host()
  const srvPath = path.join(crDir, 'src', 'server.cpp');
  let srv = fs.readFileSync(srvPath, 'utf8');
  if (srv.indexOf('"host_mask"') === -1) {
    srv = replaceExactOrThrow(
      srv,
      '{"host_edge", "1"},',
      '{"host_edge", "1"},\n                                 {"host_mask", "1"},',
      'src/server.cpp hello'
    );
    srv = replaceExactOrThrow(
      srv,
      [
        '    static const char *const edge_keys[] = {"edge_top", "edge_bottom", "edge_fade", "edge_dim", "edge_blur"};',
        '    static const double edge_max[] = {720, 720, 360, 4096, 32};',
        '    double ev[5] = {0, 0, 0, 0, 0};',
        '    for (size_t i = 0; i < 5; i++)'
      ].join('\n'),
      [
        '    static const char *const edge_keys[] = {"edge_top", "edge_bottom", "edge_fade", "edge_dim", "edge_blur", "mask_mode", "mask_feather"};',
        '    static const double edge_max[] = {720, 720, 360, 4096, 32, 2, 120};',
        '    double ev[7] = {0, 0, 0, 0, 0, 0, 54};',
        '    for (size_t i = 0; i < 7; i++)'
      ].join('\n'),
      'src/server.cpp edge_keys'
    );
    srv = replaceExactOrThrow(
      srv,
      '    h.edge.dim = (uint32_t)ev[3];\n    h.edge.blur = (uint32_t)ev[4];',
      '    h.edge.dim = (uint32_t)ev[3];\n    h.edge.blur = (uint32_t)ev[4];\n    h.edge.mask_mode = (uint32_t)ev[5];\n    h.edge.mask_feather = (uint32_t)ev[6];',
      'src/server.cpp host edge assign'
    );
    fs.writeFileSync(srvPath, srv, 'utf8');
  }
}

function patchIdriveApps(rootDir) {
  const crDir = path.join(rootDir, 'native', 'cluster-render');
  const wocDir = path.join(rootDir, 'native', 'waze-on-cluster');
  const wocAppDir = path.join(rootDir, 'apps', 'robertn_waze_cluster');

  // 1. Unlock native 1632x720 map texture ceiling while keeping 1088x480 map_quad default
  patchMapGeometry(crDir);
  // 1b. Embed alpha-cutout dial/bezel mask + discard directly in video shaders so KOMBI4 dials stay 100% intact
  patchHostVideoMask(crDir);

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
    'cluster-render': '2.9.0'
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
  patchHostVideoMask,
  patchIdriveApps,
  patchMguStore
};
