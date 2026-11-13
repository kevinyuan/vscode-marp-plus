/**
 * Pre-renders CSS gradients to PNG before an editable-PPTX export.
 *
 * Why: `marp --pptx-editable` goes Markdown → Chromium PDF → LibreOffice. Chromium writes a CSS
 * gradient as a PDF shading, and LibreOffice's PDF importer tessellates a shading into thousands
 * of tiny solid shapes (82k shapes / 10.7 MB / 143 s on a 27-slide deck). If the gradient is a
 * plain image by the time Chromium prints it, the PDF holds one bitmap and LibreOffice imports
 * one picture (313 shapes / 1.0 MB / 21 s on the same deck).
 *
 * This module rewrites `background[-image]: <gradients>` declarations into `url(data:image/png…)`
 * with `background-size: 100% 100%`. Anything it cannot render faithfully is left untouched (the
 * post-export sliver collapse in pptxGradientCollapse.ts remains as the fallback).
 *
 * Supported: linear-gradient, radial-gradient (circle/ellipse, keyword or length sizes, `at`
 * positions), multiple layers, hex/rgb()/rgba()/named/transparent colours, `var(--x)` references,
 * premultiplied-alpha interpolation like browsers.
 * Not supported (skipped): repeating-*, conic-*, hsl(), layers with extra background properties,
 * and size-dependent gradients on elements whose size is unknown.
 */
import { encodePng } from './pptxGradientCollapse';

type RGBA = [number, number, number, number]; // r,g,b 0..255, a 0..1
interface Stop { t: number; c: RGBA; } // t: fraction along the gradient line/radius

const NAMED: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0], black: [0, 0, 0, 1], white: [255, 255, 255, 1],
  red: [255, 0, 0, 1], green: [0, 128, 0, 1], blue: [0, 0, 255, 1],
};

class Unsupported extends Error {}

/** Split on commas that are not inside parentheses. */
function splitTop(s: string, sep = ','): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; } else if (ch === ')') { depth--; }
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; } else { cur += ch; }
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out;
}

export function parseColor(src: string): RGBA {
  const s = src.trim().toLowerCase();
  if (NAMED[s]) { return [...NAMED[s]] as RGBA; }
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) { h = h.split('').map(c => c + c).join(''); }
    if (h.length !== 6 && h.length !== 8) { throw new Unsupported(src); }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) { throw new Unsupported(src); }
    const ch = (v: string) => v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v);
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const rgba: RGBA = [ch(parts[0]), ch(parts[1]), ch(parts[2]), a];
    if (rgba.some(Number.isNaN)) { throw new Unsupported(src); }
    return rgba;
  }
  throw new Unsupported(src);
}

/** "12px" | "40%" → resolver(base) ; throws on other units. */
function parseLen(tok: string): (base: number) => number {
  const m = /^(-?[\d.]+)(px|%)?$/.exec(tok.trim());
  if (!m) { throw new Unsupported(tok); }
  const v = parseFloat(m[1]);
  if (m[2] === '%') { return base => (v / 100) * base; }
  if (m[2] === 'px' || (m[2] === undefined && v === 0)) { return () => v; }
  throw new Unsupported(tok);
}

/** Parse "color [pos [pos]]" stops and apply CSS stop fix-up. `base` converts a stop length to a fraction. */
function parseStops(args: string[], base: number): Stop[] {
  const raw: Array<{ c: RGBA; t: number | null }> = [];
  for (const a of args) {
    const m = /^(.*?)(?:\s+(-?[\d.]+(?:px|%)))?(?:\s+(-?[\d.]+(?:px|%)))?$/.exec(a.trim());
    if (!m) { throw new Unsupported(a); }
    const c = parseColor(m[1]);
    const pos = [m[2], m[3]].filter(Boolean) as string[];
    if (pos.length === 0) { raw.push({ c, t: null }); }
    for (const p of pos) { raw.push({ c, t: parseLen(p)(base) / base }); }
  }
  if (raw.length < 2) { throw new Unsupported('stops'); }
  if (raw[0].t === null) { raw[0].t = 0; }
  if (raw[raw.length - 1].t === null) { raw[raw.length - 1].t = 1; }
  let max = -Infinity;
  for (const r of raw) { if (r.t !== null) { r.t = Math.max(r.t, max); max = r.t; } }
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].t !== null) { continue; }
    let j = i; while (raw[j].t === null) { j++; }
    const a = raw[i - 1].t as number, b = raw[j].t as number;
    for (let k = i; k < j; k++) { raw[k].t = a + ((b - a) * (k - i + 1)) / (j - i + 1); }
  }
  return raw.map(r => ({ t: r.t as number, c: r.c }));
}

const LUT_SIZE = 2048;
/** Premultiplied-alpha colour lookup table over t ∈ [0,1] (clamped outside the stop range). */
function buildLut(stops: Stop[], t0: number, t1: number): Float32Array {
  const lut = new Float32Array(LUT_SIZE * 4);
  let k = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = t0 + ((t1 - t0) * i) / (LUT_SIZE - 1);
    while (k < stops.length - 2 && t > stops[k + 1].t) { k++; }
    const a = stops[k], b = stops[k + 1];
    const span = b.t - a.t;
    const f = span <= 1e-9 ? (t >= b.t ? 1 : 0) : Math.min(1, Math.max(0, (t - a.t) / span));
    const pa = a.c[3], pb = b.c[3];
    const alpha = pa + (pb - pa) * f;
    for (let ch = 0; ch < 3; ch++) {
      lut[i * 4 + ch] = (a.c[ch] * pa + (b.c[ch] * pb - a.c[ch] * pa) * f) / 255; // premultiplied 0..1
    }
    lut[i * 4 + 3] = alpha;
  }
  return lut;
}

interface Layer { paint(buf: Float32Array, W: number, H: number): void; }

function linearLayer(args: string[], W: number, H: number): Layer {
  let angle = 180; // deg, default "to bottom"
  const first = args[0];
  let rest = args;
  const am = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(first);
  let dx = 0, dy = 0, haveVec = false;
  if (am) {
    const v = parseFloat(am[1]);
    angle = am[2] === 'deg' ? v : am[2] === 'turn' ? v * 360 : am[2] === 'rad' ? (v * 180) / Math.PI : v * 0.9;
    rest = args.slice(1);
  } else if (/^to\s+/.test(first)) {
    const words = first.slice(3).trim().split(/\s+/);
    const sx = words.includes('right') ? 1 : words.includes('left') ? -1 : 0;
    const sy = words.includes('bottom') ? 1 : words.includes('top') ? -1 : 0;
    if (sx === 0 && sy === 0) { throw new Unsupported(first); }
    if (sx !== 0 && sy !== 0) { dx = sx * H; dy = sy * W; haveVec = true; }
    else { angle = sx === 1 ? 90 : sx === -1 ? 270 : sy === -1 ? 0 : 180; }
    rest = args.slice(1);
  }
  if (!haveVec) { const r = (angle * Math.PI) / 180; dx = Math.sin(r); dy = -Math.cos(r); }
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const L = Math.abs(W * dx) + Math.abs(H * dy);
  const stops = parseStops(rest, L);
  const lut = buildLut(stops, 0, 1);
  return {
    paint(buf) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = ((x + 0.5 - W / 2) * dx + (y + 0.5 - H / 2) * dy) / L + 0.5;
          over(buf, (y * W + x) * 4, lut, t);
        }
      }
    },
  };
}

function radialLayer(args: string[], W: number, H: number): Layer {
  let shape: 'circle' | 'ellipse' | null = null;
  let sizeKw: string | null = null;
  const lens: Array<(b: number) => number> = [];
  let cx = W / 2, cy = H / 2;
  let rest = args;
  if (/^(circle|ellipse|closest-|farthest-|at\s|[\d.-])/i.test(args[0])) {
    const [shapeSize, at] = args[0].split(/\s+at\s+/);
    const head = /^at\s+/.test(shapeSize) ? '' : shapeSize;
    const atStr = /^at\s+/.test(args[0]) ? args[0].replace(/^at\s+/, '') : at;
    for (const tok of head.trim().split(/\s+/).filter(Boolean)) {
      if (tok === 'circle' || tok === 'ellipse') { shape = tok; }
      else if (/^(closest|farthest)-(side|corner)$/.test(tok)) { sizeKw = tok; }
      else { lens.push(parseLen(tok)); }
    }
    if (atStr) {
      const toks = atStr.trim().split(/\s+/);
      const axis = (t: string, base: number, kw: Record<string, number>) =>
        t in kw ? kw[t] * base : parseLen(t)(base);
      const [a, b] = toks;
      const horiz = { left: 0, center: 0.5, right: 1 }, vert = { top: 0, center: 0.5, bottom: 1 };
      if (toks.length === 1) {
        if (a in vert && a !== 'center') { cx = W / 2; cy = vert[a as 'top'] * H; }
        else { cx = axis(a, W, horiz); cy = H / 2; }
      } else if (a in vert && a !== 'center' && b in horiz) { cx = horiz[b as 'left'] * W; cy = vert[a as 'top'] * H; }
      else { cx = axis(a, W, horiz); cy = axis(b, H, vert); }
    }
    rest = args.slice(1);
  }
  let rx: number, ry: number;
  const dxs = [cx, W - cx], dys = [cy, H - cy];
  if (lens.length > 0) {
    rx = lens[0](W); ry = lens.length > 1 ? lens[1](H) : (shape === 'ellipse' ? lens[0](H) : rx);
    if (shape !== 'ellipse' && lens.length === 1) { ry = rx; }
  } else {
    const kw = sizeKw ?? 'farthest-corner';
    const isCircle = shape === 'circle';
    const closestSide = kw.startsWith('closest');
    const sx = closestSide ? Math.min(...dxs) : Math.max(...dxs);
    const sy = closestSide ? Math.min(...dys) : Math.max(...dys);
    if (kw.endsWith('side')) {
      if (isCircle) { rx = ry = closestSide ? Math.min(sx, sy) : Math.max(sx, sy); } else { rx = sx; ry = sy; }
    } else if (isCircle) {
      rx = ry = Math.hypot(sx, sy);
    } else {
      // Ellipse keeps the side-size aspect ratio and passes through the corner at (sx, sy): scale by √2.
      rx = sx * Math.SQRT2; ry = sy * Math.SQRT2;
    }
  }
  rx = Math.max(rx, 1e-6); ry = Math.max(ry, 1e-6);
  const stops = parseStops(rest, rx);
  const lut = buildLut(stops, 0, 1);
  return {
    paint(buf) {
      for (let y = 0; y < H; y++) {
        const ny = (y + 0.5 - cy) / ry;
        for (let x = 0; x < W; x++) {
          const nx = (x + 0.5 - cx) / rx;
          over(buf, (y * W + x) * 4, lut, Math.sqrt(nx * nx + ny * ny));
        }
      }
    },
  };
}

/** source-over of the LUT colour at t onto a premultiplied float buffer. */
function over(buf: Float32Array, o: number, lut: Float32Array, t: number): void {
  const i = Math.min(LUT_SIZE - 1, Math.max(0, Math.round(t * (LUT_SIZE - 1)))) * 4;
  const sa = lut[i + 3];
  if (sa <= 0) { return; }
  const k = 1 - sa;
  buf[o] = lut[i] + buf[o] * k; buf[o + 1] = lut[i + 1] + buf[o + 1] * k;
  buf[o + 2] = lut[i + 2] + buf[o + 2] * k; buf[o + 3] = sa + buf[o + 3] * k;
}

/**
 * Render a comma-separated list of gradient layers (first = topmost) to a PNG.
 * Throws if any layer uses unsupported syntax.
 */
export function renderGradientLayers(value: string, W: number, H: number): Buffer {
  const layers = splitTop(value).map(l => {
    const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(l.trim());
    if (!m) { throw new Unsupported(l); }
    const args = splitTop(m[2]);
    return m[1] === 'linear' ? linearLayer(args, W, H) : radialLayer(args, W, H);
  });
  const buf = new Float32Array(W * H * 4);
  for (let i = layers.length - 1; i >= 0; i--) { layers[i].paint(buf, W, H); }
  const rgba = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const a = buf[p * 4 + 3];
    if (a <= 0) { continue; }
    for (let ch = 0; ch < 3; ch++) { rgba[p * 4 + ch] = Math.max(0, Math.min(255, Math.round((buf[p * 4 + ch] / a) * 255))); }
    rgba[p * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  return encodePng(rgba, W, H);
}

// ── Markdown/CSS rewriting ──────────────────────────────────────────────────

export interface PrerenderResult { md: string; replaced: number; skipped: number; }

const DECL_RE = /(?<![\w-])(background-image|background)\s*:\s*(?=[^;{}]*-gradient\()/g;
const SIZE_DEPENDENT = /\d(px|em|rem|vw|vh|pt)\b/;

function slideSize(md: string): [number, number] {
  return /^\s*size\s*:\s*4\s*:\s*3\s*$/m.test(md) ? [960, 720] : [1280, 720];
}

export function prerenderGradients(md: string): PrerenderResult {
  const vars = new Map<string, string>();
  for (const m of md.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) { vars.set(m[1], m[2].trim()); }
  const resolve = (v: string) => {
    for (let i = 0; i < 5 && /var\(/.test(v); i++) {
      v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (full, n) => vars.get(n) ?? full);
    }
    return v;
  };
  const [SW, SH] = slideSize(md);
  const cache = new Map<string, string>();
  let out = '', pos = 0, replaced = 0, skipped = 0;
  DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECL_RE.exec(md)) !== null) {
    if (m.index < pos) { continue; }
    // value: to ';' / '}' at paren depth 0
    let i = m.index + m[0].length, depth = 0;
    for (; i < md.length; i++) {
      const c = md[i];
      if (c === '(') { depth++; } else if (c === ')') { depth--; }
      else if ((c === ';' || c === '}') && depth === 0) { break; }
    }
    let value = md.slice(m.index + m[0].length, i).trim();
    const important = /\s*!important\s*$/.test(value) ? ' !important' : '';
    value = value.replace(/\s*!important\s*$/, '');

    const ruleStart = md.lastIndexOf('{', m.index);
    // Inline style="…": we are inside a tag that has not been closed yet (last '<' after last '>').
    const lt = md.lastIndexOf('<', m.index), gt = md.lastIndexOf('>', m.index);
    const inlineStyle = lt > gt && /style\s*=/.test(md.slice(lt, m.index));
    if (ruleStart < 0 || inlineStyle) { skipped++; continue; }
    const selStart = Math.max(md.lastIndexOf('}', ruleStart), md.lastIndexOf(';', ruleStart), md.lastIndexOf('*/', ruleStart)) + 1;
    const selector = md.slice(selStart, ruleStart).trim();
    const ruleBody = md.slice(ruleStart, md.indexOf('}', i) < 0 ? md.length : md.indexOf('}', i));
    const isPseudo = /::?(before|after)\s*$/.test(selector);

    try {
      const css = resolve(value);
      if (/var\(/.test(css)) { throw new Unsupported('var'); }
      let W: number, H: number;
      const wm = /(?<![-\w])width\s*:\s*(\d+)px/.exec(ruleBody), hm = /(?<![-\w])height\s*:\s*(\d+)px/.exec(ruleBody);
      if (!isPseudo && /(^|[\s,>+~])section(?![\w-])[^\s]*$/.test(selector.split(',').pop()!.trim())) {
        // The slide itself: gradient sizes (px radii, % positions) are exact at slide size.
        [W, H] = [SW, SH];
      } else {
        // Other elements: rendered at a stand-in size then stretched, so only size-independent gradients qualify.
        if (SIZE_DEPENDENT.test(css) || /\bcircle\b/.test(css)) { throw new Unsupported('size-dependent'); }
        W = wm ? +wm[1] : SW; H = hm ? +hm[1] : SH;
        if (W * H > SW * SH) { throw new Unsupported('too large'); }
      }
      const key = `${W}x${H}:${css}`;
      let uri = cache.get(key);
      if (!uri) {
        uri = `url(data:image/png;base64,${renderGradientLayers(css, W, H).toString('base64')})`;
        cache.set(key, uri);
      }
      const rewritten = m[1] === 'background'
        ? `background: ${uri} 0 0 / 100% 100% no-repeat${important}`
        : `background-image: ${uri}${important}; background-size: 100% 100%; background-repeat: no-repeat`;
      out += md.slice(pos, m.index) + rewritten;
      pos = i; replaced++;
    } catch (e) {
      if (!(e instanceof Unsupported)) { throw e; }
      skipped++;
    }
  }
  return { md: out + md.slice(pos), replaced, skipped };
}
