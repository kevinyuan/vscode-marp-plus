/**
 * Collapses "gradient confetti" in editable PPTX files.
 *
 * Why: with `--pptx-editable`, marp-cli renders the deck to PDF and lets
 * LibreOffice import it. Chromium emits CSS gradients / glows / blurred
 * shadows as PDF shading patterns, and LibreOffice's PDF importer tessellates
 * those into thousands of tiny opaque freeform shapes (one per colour step).
 * That makes the conversion slow and the .pptx huge.
 *
 * Fix: find runs of consecutive text-less, solid-filled freeform shapes that
 * span several distinct colours, rasterise them (painter's order, exactly as
 * they were stacked) into ONE transparent PNG and replace the whole run with a
 * single <p:pic>. The look is preserved; shape count and size collapse.
 *
 * PDF export does not need this: Chromium keeps gradients as native PDF
 * shadings, which are tiny and render natively in every PDF viewer.
 */
import * as zlib from 'zlib';

/** Minimum number of consecutive slivers before a run is considered a gradient. */
export const MIN_RUN_LENGTH = 12;
/** A real gradient steps through several colours; a run of identical fills is not one. */
export const MIN_DISTINCT_COLORS = 4;
/** Longest side of a generated bitmap, in pixels (after downsampling). */
const MAX_RASTER_SIDE = 2048;
/** Bitmap pixels per slide pixel (1 slide px = 9525 EMU) before the side cap applies. */
const TARGET_DENSITY = 2;
/** Supersampling factor for edge anti-aliasing (render N× then box-filter down). */
const SUPERSAMPLE = 2;
/** Bitmaps larger than this many final pixels skip supersampling: they are already dense, and
 *  a 4096-px internal buffer per effect made a 30-slide deck take minutes. */
const SUPERSAMPLE_MAX_PIXELS = 400_000;
/** Slivers whose bounding boxes lie within this many EMU belong to the same effect. */
const ADJACENCY_EMU = 2000;

interface Sliver {
  /** Offset into the slide XML where this <p:sp> starts / ends. */
  start: number;
  end: number;
  x: number; y: number; w: number; h: number; // EMU
  polys: number[][][]; // polygons in local path units: [ [x,y], ... ]
  pathW: number; pathH: number;
  flipH: boolean; flipV: boolean;
  rgb: [number, number, number];
  alpha: number; // 0..1
}

const SP_RE = /<p:sp>[\s\S]*?<\/p:sp>/g;

/** Parse one <p:sp> into a Sliver, or null if it is not a plain solid freeform. */
function parseSliver(sp: string, start: number): Sliver | null {
  if (sp.includes('<a:t>') || sp.includes('<a:t ')) { return null; }
  const spPr = /<p:spPr>([\s\S]*?)<\/p:spPr>/.exec(sp);
  if (!spPr) { return null; }
  const body = spPr[1];
  if (!body.includes('<a:custGeom>')) { return null; }
  if (/<a:(gradFill|blipFill|pattFill)/.test(body) || /<a:effectLst>\s*<a:\w/.test(body)) { return null; }

  const xfrm = /<a:xfrm([^>]*)>\s*<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(body);
  if (!xfrm || /\brot=/.test(xfrm[1])) { return null; }

  const afterGeom = body.slice(body.indexOf('</a:custGeom>'));
  const fill = /<a:solidFill>\s*<a:srgbClr val="([0-9a-fA-F]{6})"\s*(?:\/>|>([\s\S]*?)<\/a:srgbClr>)/.exec(afterGeom);
  if (!fill) { return null; }
  const hex = fill[1];
  const alphaM = fill[2] ? /<a:alpha val="(\d+)"/.exec(fill[2]) : null;

  const pathM = /<a:path\b[^>]*\bw="(\d+)"[^>]*\bh="(\d+)"[^>]*>([\s\S]*?)<\/a:path>/.exec(body);
  if (!pathM) { return null; }
  const polys = parsePath(pathM[3]);
  if (!polys) { return null; }

  return {
    start, end: start + sp.length,
    x: +xfrm[2], y: +xfrm[3], w: +xfrm[4], h: +xfrm[5],
    polys, pathW: +pathM[1] || 1, pathH: +pathM[2] || 1,
    flipH: /flipH="1"/.test(xfrm[1]), flipV: /flipV="1"/.test(xfrm[1]),
    rgb: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)],
    alpha: alphaM ? Math.min(1, +alphaM[1] / 100000) : 1,
  };
}

/** Flatten moveTo/lnTo/cubicBezTo/quadBezTo/close into polygons. Returns null on unsupported commands. */
function parsePath(xml: string): number[][][] | null {
  if (/<a:arcTo/.test(xml)) { return null; }
  const polys: number[][][] = [];
  let cur: number[][] = [];
  const flush = () => { if (cur.length >= 3) { polys.push(cur); } cur = []; };
  const cmdRe = /<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(xml)) !== null) {
    const pts = [...(m[2] ?? '').matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"/g)].map(p => [+p[1], +p[2]]);
    switch (m[1]) {
      case 'moveTo': flush(); if (pts[0]) { cur.push(pts[0]); } break;
      case 'lnTo': if (pts[0]) { cur.push(pts[0]); } break;
      case 'quadBezTo':
      case 'cubicBezTo': {
        const p0 = cur[cur.length - 1];
        if (!p0 || pts.length < (m[1] === 'cubicBezTo' ? 3 : 2)) { return null; }
        const N = 8;
        for (let i = 1; i <= N; i++) {
          const t = i / N, u = 1 - t;
          if (m[1] === 'cubicBezTo') {
            cur.push([0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * pts[0][k] + 3 * u * t * t * pts[1][k] + t * t * t * pts[2][k]));
          } else {
            cur.push([0, 1].map(k => u * u * p0[k] + 2 * u * t * pts[0][k] + t * t * pts[1][k]));
          }
        }
        break;
      }
      case 'close': flush(); break;
    }
  }
  flush();
  return polys.length > 0 ? polys : null;
}

/** Split slivers into spatially connected groups (touching/overlapping bounding boxes). */
function connectedGroups(slivers: Sliver[]): Sliver[][] {
  const parent = slivers.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const order = slivers.map((_, i) => i).sort((a, b) => slivers[a].x - slivers[b].x);
  for (let oi = 0; oi < order.length; oi++) {
    const a = slivers[order[oi]];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const b = slivers[order[oj]];
      if (b.x > a.x + a.w + ADJACENCY_EMU) { break; }
      if (b.y <= a.y + a.h + ADJACENCY_EMU && a.y <= b.y + b.h + ADJACENCY_EMU) {
        parent[find(order[oj])] = find(order[oi]);
      }
    }
  }
  const groups = new Map<number, Sliver[]>();
  slivers.forEach((s, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); });
  return [...groups.values()];
}

const isGradient = (g: Sliver[]) =>
  g.length >= MIN_RUN_LENGTH && new Set(g.map(s => s.rgb.join(','))).size >= MIN_DISTINCT_COLORS;

/**
 * Find gradient effects: runs of consecutive slivers (nothing but whitespace
 * between them), split into spatially separate groups so unrelated effects
 * and solid decorations are not merged into one bitmap. Each group is in
 * z-order.
 */
function findRuns(xml: string): Sliver[][] {
  const runs: Sliver[][] = [];
  let run: Sliver[] = [];
  const close = () => {
    if (run.length >= MIN_RUN_LENGTH) {
      for (const g of connectedGroups(run)) {
        if (isGradient(g)) { runs.push(g.sort((a, b) => a.start - b.start)); }
      }
    }
    run = [];
  };
  SP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SP_RE.exec(xml)) !== null) {
    const s = parseSliver(m[0], m.index);
    const contiguous = run.length === 0 || xml.slice(run[run.length - 1].end, m.index).trim() === '';
    if (s && contiguous) { run.push(s); continue; }
    close();
    if (s) { run.push(s); }
  }
  close();
  return runs;
}

// ── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasterisation ───────────────────────────────────────────────────────────

export interface RasterResult { png: Buffer; x: number; y: number; w: number; h: number; }

function rasterizeRun(run: Sliver[]): RasterResult | null {
  const x0 = Math.min(...run.map(s => s.x)), y0 = Math.min(...run.map(s => s.y));
  const x1 = Math.max(...run.map(s => s.x + s.w)), y1 = Math.max(...run.map(s => s.y + s.h));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) { return null; }
  // Final bitmap size: TARGET_DENSITY px per slide px, capped; internal buffer is SUPERSAMPLE× larger.
  const finalPerEmu = Math.min(TARGET_DENSITY / 9525, MAX_RASTER_SIDE / Math.max(w, h));
  const fw = Math.max(1, Math.round(w * finalPerEmu)), fh = Math.max(1, Math.round(h * finalPerEmu));
  const ss = fw * fh <= SUPERSAMPLE_MAX_PIXELS ? SUPERSAMPLE : 1;
  const W = fw * ss, H = fh * ss;
  const rgba = new Uint8Array(W * H * 4);

  for (const s of run) {
    // local path units → internal raster pixels
    const sx = (s.w / s.pathW) * (W / w), sy = (s.h / s.pathH) * (H / h);
    const ox = (s.x - x0) * (W / w), oy = (s.y - y0) * (H / h);
    const tx = (px: number) => (s.flipH ? s.pathW - px : px) * sx + ox;
    const ty = (py: number) => (s.flipV ? s.pathH - py : py) * sy + oy;
    const edges: Array<[number, number, number, number]> = [];
    let minY = Infinity, maxY = -Infinity;
    for (const poly of s.polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ax = tx(a[0]), ay = ty(a[1]), bx = tx(b[0]), by = ty(b[1]);
        if (ay === by) { continue; }
        edges.push([ax, ay, bx, by]);
        minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by);
      }
    }
    if (edges.length === 0) { continue; }
    const rowStart = Math.max(0, Math.floor(minY)), rowEnd = Math.min(H - 1, Math.ceil(maxY));
    for (let row = rowStart; row <= rowEnd; row++) {
      const yc = row + 0.5;
      const xs: number[] = [];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const c0 = Math.max(0, Math.ceil(xs[i] - 0.5)), c1 = Math.min(W - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
        for (let col = c0; col <= c1; col++) {
          const o = (row * W + col) * 4;
          if (s.alpha >= 1) {
            rgba[o] = s.rgb[0]; rgba[o + 1] = s.rgb[1]; rgba[o + 2] = s.rgb[2]; rgba[o + 3] = 255;
          } else {
            // source-over onto the (possibly transparent) buffer
            const da = rgba[o + 3] / 255, oa = s.alpha + da * (1 - s.alpha);
            for (let k = 0; k < 3; k++) {
              rgba[o + k] = Math.round((s.rgb[k] * s.alpha + rgba[o + k] * da * (1 - s.alpha)) / (oa || 1));
            }
            rgba[o + 3] = Math.round(oa * 255);
          }
        }
      }
    }
  }
  return { png: encodePng(ss > 1 ? downsample(rgba, W, H, ss) : rgba, fw, fh), x: x0, y: y0, w, h };
}

/** Alpha-weighted box filter: shrink by an integer factor without dark/light fringes at edges. */
function downsample(src: Uint8Array, W: number, H: number, f: number): Uint8Array {
  const fw = W / f, fh = H / f;
  const out = new Uint8Array(fw * fh * 4);
  const n = f * f;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const o = ((y * f + dy) * W + (x * f + dx)) * 4;
          const al = src[o + 3];
          r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
        }
      }
      const o = (y * fw + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ── Slide-level transform ───────────────────────────────────────────────────

export interface CollapseResult {
  xml: string;
  /** PNGs to add to the package, in the order their placeholders appear. */
  images: Array<{ placeholder: string; png: Buffer }>;
  collapsedShapes: number;
}

/**
 * Replace every gradient run in a slide with one <p:pic> that references the
 * relationship id `placeholder` (caller rewrites it to a real rId).
 */
export function collapseGradientRuns(xml: string): CollapseResult {
  const runs = findRuns(xml);
  if (runs.length === 0) { return { xml, images: [], collapsedShapes: 0 }; }

  let maxId = 1;
  for (const m of xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)) { maxId = Math.max(maxId, +m[1]); }

  const images: CollapseResult['images'] = [];
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let collapsed = 0;
  runs.forEach((run, r) => {
    const ras = rasterizeRun(run);
    if (!ras) { return; }
    const placeholder = `__FXRID_${r}__`;
    const id = ++maxId;
    const pic =
      `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Gradient effect ${r + 1}"/>` +
      `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${placeholder}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="${ras.x}" y="${ras.y}"/><a:ext cx="${ras.w}" cy="${ras.h}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    run.forEach((s, i) => edits.push({ start: s.start, end: s.end, text: i === 0 ? pic : '' }));
    images.push({ placeholder, png: ras.png });
    collapsed += run.length;
  });
  // Single forward pass: per-edit slice() on a multi-MB string is quadratic with tens of thousands of slivers.
  edits.sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let pos = 0;
  for (const e of edits) { parts.push(xml.slice(pos, e.start), e.text); pos = e.end; }
  parts.push(xml.slice(pos));
  const out = parts.join('');
  return { xml: out, images, collapsedShapes: collapsed };
}

/**
 * Apply collapseGradientRuns to every slide in a PPTX zip (JSZip instance),
 * registering media, relationships and the png content type. Returns the
 * number of shapes removed.
 */
export async function collapseGradientsInZip(zip: any): Promise<number> {
  let total = 0;
  const slideRe = /^ppt\/slides\/slide(\d+)\.xml$/;
  for (const name of Object.keys(zip.files)) {
    const sm = slideRe.exec(name);
    if (!sm) { continue; }
    const relsName = `ppt/slides/_rels/slide${sm[1]}.xml.rels`;
    const relsFile = zip.file(relsName);
    if (!relsFile) { continue; }
    const res = collapseGradientRuns(await zip.file(name).async('string'));
    if (res.images.length === 0) { continue; }

    let rels: string = await relsFile.async('string');
    let nextRid = 1;
    for (const m of rels.matchAll(/Id="rId(\d+)"/g)) { nextRid = Math.max(nextRid, +m[1] + 1); }
    let xml = res.xml;
    res.images.forEach((img, i) => {
      const rid = `rId${nextRid++}`;
      const media = `fx-gradient-${sm[1]}-${i + 1}.png`;
      zip.file(`ppt/media/${media}`, img.png);
      rels = rels.replace('</Relationships>',
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/></Relationships>`);
      xml = xml.split(img.placeholder).join(rid);
    });
    zip.file(name, xml);
    zip.file(relsName, rels);
    total += res.collapsedShapes;
  }
  if (total > 0) {
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      const ct: string = await ctFile.async('string');
      if (!/Extension="png"/i.test(ct)) {
        zip.file('[Content_Types].xml', ct.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>'));
      }
    }
  }
  return total;
}
