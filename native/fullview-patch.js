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
  clusterRenderVersion: '2.9.4',
  wazeOnClusterVersion: '2.9.2',
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

const MASK_VIDEO_SHADERS_CPP = [
  'const char *const kMaskAtlasFragmentShader = R"(#version 100',
  'precision highp float;',
  'uniform sampler2D u_image;',
  'uniform vec2 u_size;',
  'uniform float u_opacity;',
  'uniform vec4 u_mask;',
  'uniform vec2 u_mask_sz;',
  'varying vec2 v_uv;',
  'float smin_m(float a, float b, float k) {',
  '    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
  '    return mix(b, a, h) - k * h * (1.0 - h);',
  '}',
  'void main() {',
  '    vec2 l = v_uv * u_size;',
  '    float th = u_size.y * 1.5;',
  '    vec2 c = clamp(vec2(l.x * 0.5 + 0.25, l.y * 0.5), vec2(0.5), u_size * 0.5 - 0.5);',
  '    float y = texture2D(u_image, vec2(v_uv.x, clamp(l.y, 0.5, u_size.y - 0.5) / th)).r;',
  '    float u = texture2D(u_image, vec2(c.x / u_size.x, (u_size.y + c.y) / th)).r - 128.0 / 255.0;',
  '    float v = texture2D(u_image, vec2((u_size.x * 0.5 + c.x) / u_size.x, (u_size.y + c.y) / th)).r - 128.0 / 255.0;',
  '    vec3 rgb = vec3(y + 1.402 * v, y - 0.344136 * u - 0.714136 * v, y + 1.772 * u);',
  '    float ma = 1.0;',
  '    if (u_mask.x > 0.5) {',
  '        float wx = u_mask.z + v_uv.x * u_mask_sz.x;',
  '        float wy = u_mask.w + v_uv.y * u_mask_sz.y;',
  '        float ax = abs(wx - 960.0);',
  '        float fPx = clamp(u_mask.y > 1.0 ? u_mask.y : 96.0, 28.0, 160.0);',
  '        if (u_mask.x < 1.5) {',
  '            float halfW;',
  '            float dHalf;',
  '            if (wy <= 360.0) {',
  '                float u = clamp((360.0 - wy) / 237.0, 0.0, 1.4);',
  '                float su = sqrt(max(u, 0.0001));',
  '                float u2 = u * u;',
  '                halfW = 808.0 - 191.2 * u * su + 41.3 * u2 * su - 108.2 * u2 * u2;',
  '                dHalf = (191.2 * 1.5 * su - 41.3 * 2.5 * u * su + 108.2 * 4.0 * u2 * u) / 237.0;',
  '            } else {',
  '                float v = clamp((wy - 360.0) / 239.0, 0.0, 1.4);',
  '                float sv = sqrt(max(v, 0.0001));',
  '                halfW = 808.0 - 121.7 * v * sv - 34.6 * v * v * sv;',
  '                dHalf = (-121.7 * 1.5 * sv - 34.6 * 2.5 * v * sv) / 239.0;',
  '            }',
  '            float sdSide = (ax - halfW) / sqrt(1.0 + dHalf * dHalf);',
  '            float tBr = clamp((ax - 285.0) / 263.0, 0.0, 1.4);',
  '            float browY = 91.0 + 13.0 * tBr + 19.1 * tBr * tBr;',
  '            float dBrow = (13.0 + 38.2 * tBr) / 263.0;',
  '            float kCenter = smoothstep(180.0, 330.0, ax);',
  '            float tC = clamp((ax - 180.0) / 150.0, 0.0, 1.0);',
  '            float dkCenter = (6.0 * tC * (1.0 - tC)) / 150.0;',
  '            float topY = mix(20.0, browY, kCenter);',
  '            float dTop = (browY - 20.0) * dkCenter + dBrow * kCenter;',
  '            float sdTop = (topY - wy) / sqrt(1.0 + dTop * dTop);',
  '            float kBot = smoothstep(320.0, 490.0, ax);',
  '            float tB = clamp((ax - 320.0) / 170.0, 0.0, 1.0);',
  '            float dkBot = (6.0 * tB * (1.0 - tB)) / 170.0;',
  '            float botY = 664.0 - 65.0 * kBot;',
  '            float dBot = -65.0 * dkBot;',
  '            float sdBot = (wy - botY) / sqrt(1.0 + dBot * dBot);',
  '            float sd = -smin_m(-sdSide, -sdTop, 28.0);',
  '            sd = -smin_m(-sd, -sdBot, 32.0);',
  '            float fEff = fPx * (0.50 + 0.72 * smoothstep(200.0, 560.0, ax));',
  '            ma = 1.0 - smoothstep(-fEff, 0.0, sd);',
  '        } else {',
  '            float dy = (wy - 350.0) / 260.0;',
  '            float halfW = 468.0 - 155.0 * dy * dy;',
  '            float dHalf = (-310.0 * dy) / 260.0;',
  '            float sdSide = (ax - halfW) / sqrt(1.0 + dHalf * dHalf);',
  '            float topBase = u_mask.x < 2.5 ? 80.0 : 96.0;',
  '            float topY = topBase + 16.0 * smoothstep(0.0, 420.0, ax);',
  '            float sdTop = topY - wy;',
  '            float botY = 644.0 - 16.0 * smoothstep(180.0, 420.0, ax);',
  '            float sdBot = wy - botY;',
  '            float sd = -smin_m(-sdSide, -sdTop, 32.0);',
  '            sd = -smin_m(-sd, -sdBot, 32.0);',
  '            float fC = clamp(fPx * 0.65, 28.0, 96.0);',
  '            ma = 1.0 - smoothstep(-fC, 0.0, sd);',
  '            if (u_mask.x < 2.5) {',
  '                float qx = abs(wx - 538.0) - 102.0;',
  '                float qy = abs(wy - 378.0) - 34.0;',
  '                float sdSpd = length(max(vec2(qx, qy), vec2(0.0))) + min(max(qx, qy), 0.0) - 20.0;',
  '                float spdA = smoothstep(0.0, clamp(fC * 0.65, 22.0, 56.0), sdSpd);',
  '                ma = min(ma, spdA);',
  '            }',
  '        }',
  '        if (ma <= 0.002) discard;',
  '    }',
  '    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), u_opacity * ma);',
  '})";',
  '',
  'const char *const kMaskBlockFragmentShader = R"(#version 100',
  'precision highp float;',
  'uniform sampler2D u_image;',
  'uniform vec2 u_size;',
  'uniform float u_opacity;',
  'uniform vec4 u_mask;',
  'uniform vec2 u_mask_sz;',
  'varying vec2 v_uv;',
  'float byte_of(float s) { return floor(s * 255.0 + 0.5); }',
  'float smin_m(float a, float b, float k) {',
  '    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
  '    return mix(b, a, h) - k * h * (1.0 - h);',
  '}',
  'vec3 rgb565(float lo, float hi) {',
  '    float v = hi * 256.0 + lo;',
  '    float r = floor(v / 2048.0);',
  '    float g = floor(mod(v, 2048.0) / 32.0);',
  '    float b = mod(v, 32.0);',
  '    return vec3(r / 31.0, g / 63.0, b / 31.0);',
  '}',
  'void main() {',
  '    vec2 p = clamp(floor(v_uv * u_size), vec2(0.0), u_size - 1.0);',
  '    vec2 blk = floor(p / 4.0);',
  '    vec2 q = p - blk * 4.0;',
  '    vec2 tex = vec2(u_size.x * 0.5, u_size.y * 0.25);',
  '    vec4 e = texture2D(u_image, vec2(blk.x * 2.0 + 0.5, blk.y + 0.5) / tex);',
  '    vec4 s = texture2D(u_image, vec2(blk.x * 2.0 + 1.5, blk.y + 0.5) / tex);',
  '    vec3 c0 = rgb565(byte_of(e.r), byte_of(e.g));',
  '    vec3 c1 = rgb565(byte_of(e.b), byte_of(e.a));',
  '    float row = byte_of(q.y < 1.0 ? s.r : q.y < 2.0 ? s.g : q.y < 3.0 ? s.b : s.a);',
  '    float div = q.x < 1.0 ? 1.0 : q.x < 2.0 ? 4.0 : q.x < 3.0 ? 16.0 : 64.0;',
  '    float sel = mod(floor(row / div), 4.0);',
  '    vec3 c = sel < 0.5 ? c0 : sel < 1.5 ? c1 : sel < 2.5 ? (2.0 * c0 + c1) / 3.0 : (c0 + 2.0 * c1) / 3.0;',
  '    float ma = 1.0;',
  '    if (u_mask.x > 0.5) {',
  '        float wx = u_mask.z + v_uv.x * u_mask_sz.x;',
  '        float wy = u_mask.w + v_uv.y * u_mask_sz.y;',
  '        float ax = abs(wx - 960.0);',
  '        float fPx = clamp(u_mask.y > 1.0 ? u_mask.y : 96.0, 28.0, 160.0);',
  '        if (u_mask.x < 1.5) {',
  '            float halfW;',
  '            float dHalf;',
  '            if (wy <= 360.0) {',
  '                float u = clamp((360.0 - wy) / 237.0, 0.0, 1.4);',
  '                float su = sqrt(max(u, 0.0001));',
  '                float u2 = u * u;',
  '                halfW = 808.0 - 191.2 * u * su + 41.3 * u2 * su - 108.2 * u2 * u2;',
  '                dHalf = (191.2 * 1.5 * su - 41.3 * 2.5 * u * su + 108.2 * 4.0 * u2 * u) / 237.0;',
  '            } else {',
  '                float v = clamp((wy - 360.0) / 239.0, 0.0, 1.4);',
  '                float sv = sqrt(max(v, 0.0001));',
  '                halfW = 808.0 - 121.7 * v * sv - 34.6 * v * v * sv;',
  '                dHalf = (-121.7 * 1.5 * sv - 34.6 * 2.5 * v * sv) / 239.0;',
  '            }',
  '            float sdSide = (ax - halfW) / sqrt(1.0 + dHalf * dHalf);',
  '            float tBr = clamp((ax - 285.0) / 263.0, 0.0, 1.4);',
  '            float browY = 91.0 + 13.0 * tBr + 19.1 * tBr * tBr;',
  '            float dBrow = (13.0 + 38.2 * tBr) / 263.0;',
  '            float kCenter = smoothstep(180.0, 330.0, ax);',
  '            float tC = clamp((ax - 180.0) / 150.0, 0.0, 1.0);',
  '            float dkCenter = (6.0 * tC * (1.0 - tC)) / 150.0;',
  '            float topY = mix(20.0, browY, kCenter);',
  '            float dTop = (browY - 20.0) * dkCenter + dBrow * kCenter;',
  '            float sdTop = (topY - wy) / sqrt(1.0 + dTop * dTop);',
  '            float kBot = smoothstep(320.0, 490.0, ax);',
  '            float tB = clamp((ax - 320.0) / 170.0, 0.0, 1.0);',
  '            float dkBot = (6.0 * tB * (1.0 - tB)) / 170.0;',
  '            float botY = 664.0 - 65.0 * kBot;',
  '            float dBot = -65.0 * dkBot;',
  '            float sdBot = (wy - botY) / sqrt(1.0 + dBot * dBot);',
  '            float sd = -smin_m(-sdSide, -sdTop, 28.0);',
  '            sd = -smin_m(-sd, -sdBot, 32.0);',
  '            float fEff = fPx * (0.50 + 0.72 * smoothstep(200.0, 560.0, ax));',
  '            ma = 1.0 - smoothstep(-fEff, 0.0, sd);',
  '        } else {',
  '            float dy = (wy - 350.0) / 260.0;',
  '            float halfW = 468.0 - 155.0 * dy * dy;',
  '            float dHalf = (-310.0 * dy) / 260.0;',
  '            float sdSide = (ax - halfW) / sqrt(1.0 + dHalf * dHalf);',
  '            float topBase = u_mask.x < 2.5 ? 80.0 : 96.0;',
  '            float topY = topBase + 16.0 * smoothstep(0.0, 420.0, ax);',
  '            float sdTop = topY - wy;',
  '            float botY = 644.0 - 16.0 * smoothstep(180.0, 420.0, ax);',
  '            float sdBot = wy - botY;',
  '            float sd = -smin_m(-sdSide, -sdTop, 32.0);',
  '            sd = -smin_m(-sd, -sdBot, 32.0);',
  '            float fC = clamp(fPx * 0.65, 28.0, 96.0);',
  '            ma = 1.0 - smoothstep(-fC, 0.0, sd);',
  '            if (u_mask.x < 2.5) {',
  '                float qx = abs(wx - 538.0) - 102.0;',
  '                float qy = abs(wy - 378.0) - 34.0;',
  '                float sdSpd = length(max(vec2(qx, qy), vec2(0.0))) + min(max(qx, qy), 0.0) - 20.0;',
  '                float spdA = smoothstep(0.0, clamp(fC * 0.65, 22.0, 56.0), sdSpd);',
  '                ma = min(ma, spdA);',
  '            }',
  '        }',
  '        if (ma <= 0.002) discard;',
  '    }',
  '    gl_FragColor = vec4(c, u_opacity * ma);',
  '})";',
  ''
].join('\n');

function patchHostVideoMask(crDir) {
  // Keep kit/yuv_atlas.cpp and kit/block_pack.cpp 100% untouched so upstream TraceGpu
  // golden shader/call hashes match byte-for-byte; lazily compile dedicated mask shaders
  // only when a host requests mask_mode > 0 (matching Compositor::edge_effects()).

  // 1. src/video_layer.h: mask_mode & mask_feather + dedicated mask shaders + set_mask()
  const vlHPath = path.join(crDir, 'src', 'video_layer.h');
  let vlH = fs.readFileSync(vlHPath, 'utf8');
  if (vlH.indexOf('kMaskAtlasFragmentShader') === -1) {
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
        '    uint32_t top = 0, bottom = 0, fade = 0, dim = 0, blur = 0, mask_mode = 0, mask_feather = 96;',
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
      'extern const char *const kEdgeAtlasFragmentShader;\nextern const char *const kEdgeBlockFragmentShader;',
      'extern const char *const kEdgeAtlasFragmentShader;\nextern const char *const kEdgeBlockFragmentShader;\nextern const char *const kMaskAtlasFragmentShader;\nextern const char *const kMaskBlockFragmentShader;',
      'src/video_layer.h mask shader decls'
    );
    vlH = replaceExactOrThrow(
      vlH,
      'bool set_edge(const VideoEdge &e, int atlas_effect, int block_effect);',
      'bool set_edge(const VideoEdge &e, int atlas_effect, int block_effect, int mask_atlas = 0, int mask_block = 0);',
      'src/video_layer.h set_edge decl'
    );
    vlH = replaceExactOrThrow(
      vlH,
      '    void make_edge_quads();\n    void drop_edge_quads();',
      '    void make_edge_quads();\n    void drop_edge_quads();\n    int mask_fx_[2] = {0, 0};\n    bool masked_quads_ = false;\n    void set_mask();',
      'src/video_layer.h set_mask'
    );
    fs.writeFileSync(vlHPath, vlH, 'utf8');
  }

  // 2. src/video_layer.cpp: define mask shaders, swap quads lazily on mask_mode > 0, skip occlude() when masked
  const vlCppPath = path.join(crDir, 'src', 'video_layer.cpp');
  let vlCpp = fs.readFileSync(vlCppPath, 'utf8');
  if (vlCpp.indexOf('kMaskAtlasFragmentShader') === -1) {
    vlCpp = replaceExactOrThrow(
      vlCpp,
      'VideoLayer::VideoLayer(uint32_t id, int target, uint64_t seq, crk::UploadPacer &pacer, int atlas_effect,',
      MASK_VIDEO_SHADERS_CPP + '\nVideoLayer::VideoLayer(uint32_t id, int target, uint64_t seq, crk::UploadPacer &pacer, int atlas_effect,',
      'src/video_layer.cpp mask shaders'
    );
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
        '    const bool masked = edge_.has_mask() && mask_fx_[0] && (!p_.pan_blocks || mask_fx_[1]);',
        '    atlas_quad_ = g->quad(masked ? mask_fx_[0] : atlas_effect_, r);',
        '    bool ok = atlas_quad_ && g->turn(atlas_quad_, drawn_params().turn()) && g->texture(atlas_quad_, "u_image", atlas_buf_) &&',
        '              g->uniform(atlas_quad_, "u_size", size, 2) && g->uniform(atlas_quad_, "u_opacity", &zero, 1) &&',
        '              g->show(atlas_quad_, false) && g->order(atlas_quad_, order_);',
        '    if (ok && masked) {',
        '        const float mask[4] = {(float)edge_.mask_mode, (float)edge_.mask_feather, (float)r.x, (float)r.y};',
        '        const float mask_sz[2] = {(float)r.w, (float)r.h};',
        '        ok = g->uniform(atlas_quad_, "u_mask", mask, 4) && g->uniform(atlas_quad_, "u_mask_sz", mask_sz, 2);',
        '    }',
        '    masked_quads_ = ok && masked;',
        '    return ok;',
        '}',
        '',
        'bool VideoLayer::make_block_quads(Graph *g)',
        '{',
        '    const Rect r = drawn_params().rect;',
        '    const float size[2] = {(float)p_.w, (float)p_.h}, zero = 0.0f;',
        '    const bool masked = edge_.has_mask() && mask_fx_[0] && mask_fx_[1];',
        '    block_quad_ = g->quad(masked ? mask_fx_[1] : block_effect_, r);',
        '    bool ok = block_quad_ && g->turn(block_quad_, drawn_params().turn()) && g->texture(block_quad_, "u_image", block_buf_[0]) &&',
        '              g->uniform(block_quad_, "u_size", size, 2) && g->uniform(block_quad_, "u_opacity", &zero, 1) &&',
        '              g->show(block_quad_, false) && g->order(block_quad_, order_ + 1);',
        '    if (ok && masked) {',
        '        const float mask[4] = {(float)edge_.mask_mode, (float)edge_.mask_feather, (float)r.x, (float)r.y};',
        '        const float mask_sz[2] = {(float)r.w, (float)r.h};',
        '        ok = g->uniform(block_quad_, "u_mask", mask, 4) && g->uniform(block_quad_, "u_mask_sz", mask_sz, 2);',
        '    }',
        '    return ok;',
        '}',
        '',
        'void VideoLayer::set_mask()',
        '{',
        '    if (!g_ || !atlas_quad_ || !masked_quads_)',
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
        '}',
        '',
        'void VideoLayer::drop_quads()',
        '{',
        '    if (atlas_quad_) g_->drop_quad(atlas_quad_);',
        '    if (block_quad_) g_->drop_quad(block_quad_);',
        '    drop_edge_quads();',
        '}',
        '',
        'bool VideoLayer::set_edge(const VideoEdge &e, int atlas_effect, int block_effect, int mask_atlas, int mask_block)',
        '{',
        '    if (e == edge_ && (!e.on() || (atlas_effect == edge_fx_[0] && block_effect == edge_fx_[1])) &&',
        '        (!e.has_mask() || (mask_atlas == mask_fx_[0] && mask_block == mask_fx_[1])))',
        '        return false;',
        '    edge_ = e;',
        '    edge_fx_[0] = atlas_effect;',
        '    edge_fx_[1] = block_effect;',
        '    mask_fx_[0] = mask_atlas;',
        '    mask_fx_[1] = mask_block;',
        '    if (g_) {',
        '        const bool want_mask = edge_.has_mask() && mask_fx_[0] && (!p_.pan_blocks || mask_fx_[1]);',
        '        if (want_mask != masked_quads_ && atlas_quad_) {',
        '            g_->drop_quad(atlas_quad_);',
        '            atlas_quad_ = 0;',
        '            if (block_quad_) {',
        '                g_->drop_quad(block_quad_);',
        '                block_quad_ = 0;',
        '            }',
        '            make_atlas_quads(g_);',
        '            if (p_.pan_blocks && block_buf_[0]) {',
        '                make_block_quads(g_);',
        '                if (block_quad_ && block_bank_)',
        '                    g_->texture(block_quad_, "u_image", block_buf_[block_bank_]);',
        '            }',
        '            show_quads(blocks_shown_);',
        '            set_opacity();',
        '        } else if (masked_quads_) {',
        '            set_mask();',
        '        }',
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
      '    blocks_shown_ = parked_ = masked_quads_ = false;',
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

  // 3. src/compositor.h: lazy mask_fx_[2] & mask_effects() declaration
  const compHPath = path.join(crDir, 'src', 'compositor.h');
  let compH = fs.readFileSync(compHPath, 'utf8');
  if (compH.indexOf('mask_effects()') === -1) {
    compH = replaceExactOrThrow(
      compH,
      '    int edge_fx_[2] = {0, 0};   /* kEdgeAtlasFragmentShader, kEdgeBlockFragmentShader; 0: no edges */\n    bool edge_tried_ = false;\n    bool edge_effects();',
      '    int edge_fx_[2] = {0, 0};   /* kEdgeAtlasFragmentShader, kEdgeBlockFragmentShader; 0: no edges */\n    bool edge_tried_ = false;\n    bool edge_effects();\n    int mask_fx_[2] = {0, 0};\n    bool mask_tried_ = false;\n    bool mask_effects();',
      'src/compositor.h mask_effects'
    );
    fs.writeFileSync(compHPath, compH, 'utf8');
  }

  // 4. src/compositor.cpp: lazy mask_effects() compile/drop & propagate mask_mode/mask_feather
  const compPath = path.join(crDir, 'src', 'compositor.cpp');
  let comp = fs.readFileSync(compPath, 'utf8');
  if (comp.indexOf('Compositor::mask_effects()') === -1) {
    comp = replaceExactOrThrow(
      comp,
      '    for (int fx : edge_fx_)\n        if (fx) gpu_->drop_effect(fx);',
      '    for (int fx : edge_fx_)\n        if (fx) gpu_->drop_effect(fx);\n    for (int fx : mask_fx_)\n        if (fx) gpu_->drop_effect(fx);',
      'src/compositor.cpp dtor'
    );
    comp = replaceExactOrThrow(
      comp,
      '    return edge_fx_[0] != 0;\n}',
      [
        '    return edge_fx_[0] != 0;',
        '}',
        '',
        'bool Compositor::mask_effects()',
        '{',
        '    if (!mask_tried_) {',
        '        mask_tried_ = true;',
        '        std::string why;',
        '        if (!(mask_fx_[0] = gpu_->effect(kQuadVertexShader, kMaskAtlasFragmentShader, &why)))',
        '            log_warn("compositor: no mask for hosts: %s", why.c_str());',
        '        else if (!(mask_fx_[1] = gpu_->effect(kQuadVertexShader, kMaskBlockFragmentShader, &why)))',
        '            log_warn("compositor: no mask for hosts\' packed videos: %s", why.c_str());',
        '    }',
        '    return mask_fx_[0] != 0 && mask_fx_[1] != 0;',
        '}'
      ].join('\n'),
      'src/compositor.cpp mask_effects'
    );
    comp = replaceExactOrThrow(
      comp,
      [
        '                if (ed.on() && !edge_effects())',
        '                    ed = VideoEdge();',
        '                if (static_cast<VideoLayer *>(e.layer.get())->set_edge(ed, edge_fx_[0], edge_fx_[1])) {'
      ].join('\n'),
      [
        '                if (ed.on() && !edge_effects())',
        '                    ed.top = ed.bottom = ed.fade = ed.dim = ed.blur = 0;',
        '                if (ed.has_mask() && !mask_effects())',
        '                    ed.mask_mode = 0;',
        '                if (static_cast<VideoLayer *>(e.layer.get())->set_edge(ed, edge_fx_[0], edge_fx_[1], mask_fx_[0], mask_fx_[1])) {'
      ].join('\n'),
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

  // 5. src/server.cpp: advertise host_mask=1 & parse mask_mode / mask_feather in op_host()
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
        '    static const double edge_max[] = {720, 720, 360, 4096, 32, 3, 160};',
        '    double ev[7] = {0, 0, 0, 0, 0, 0, 96};',
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

  // 3. Configure waze-on-cluster defaults for crisp 1632x720 hosted FullView & engine-off standby keep-alive (keep opt-in keys = 0 for opt_in_test)
  const wocConfPath = path.join(wocDir, 'waze-on-cluster.conf');
  let wocConf = fs.readFileSync(wocConfPath, 'utf8');
  wocConf = setIniLine(wocConf, 'tex_size', '1632x720');
  wocConf = setIniLine(wocConf, 'idle_ms', '600000');
  wocConf = setIniLine(wocConf, 'stall_ms', '60000');
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
  patchHostVideoMask,
  patchIdriveApps,
  patchMguStore
};
