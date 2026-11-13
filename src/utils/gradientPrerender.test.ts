import * as zlib from 'zlib';
import { parseColor, prerenderGradients, renderGradientLayers } from './gradientPrerender';

function pixel(png: Buffer, W: number, x: number, y: number): number[] {
  // Decode our own (filter-0, RGBA 8-bit) PNG: inflate IDAT.
  const idat: Buffer[] = [];
  let p = 8;
  while (p < png.length) {
    const len = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') { idat.push(png.subarray(p + 8, p + 8 + len)); }
    p += 12 + len;
  }
  const raw: Buffer = zlib.inflateSync(Buffer.concat(idat));
  const o = y * (W * 4 + 1) + 1 + x * 4;
  return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]];
}

describe('parseColor', () => {
  it('parses hex, rgba and keywords', () => {
    expect(parseColor('#f00')).toEqual([255, 0, 0, 1]);
    expect(parseColor('#00ff0080')[3]).toBeCloseTo(0.502, 2);
    expect(parseColor('rgba(185, 131, 255, 0.12)')).toEqual([185, 131, 255, 0.12]);
    expect(parseColor('transparent')[3]).toBe(0);
  });
  it('rejects unsupported colours', () => { expect(() => parseColor('hsl(10,10%,10%)')).toThrow(); });
});

describe('renderGradientLayers', () => {
  it('linear 90deg runs left → right', () => {
    const png = renderGradientLayers('linear-gradient(90deg, #000000, #ffffff)', 100, 4);
    expect(pixel(png, 100, 0, 1)[0]).toBeLessThan(5);
    expect(pixel(png, 100, 99, 1)[0]).toBeGreaterThan(250);
    expect(pixel(png, 100, 50, 1)[0]).toBeGreaterThan(120);
    expect(pixel(png, 100, 50, 1)[0]).toBeLessThan(135);
  });
  it('radial closest-side is opaque at centre and transparent at the edge', () => {
    const png = renderGradientLayers('radial-gradient(closest-side, rgba(255,0,0,1), rgba(255,0,0,0))', 101, 101);
    expect(pixel(png, 101, 50, 50)[3]).toBeGreaterThan(250);
    expect(pixel(png, 101, 0, 50)[3]).toBeLessThan(5);
  });
  it('interpolates alpha premultiplied (no dark fringe toward transparent)', () => {
    const png = renderGradientLayers('linear-gradient(90deg, #ff0000, transparent)', 100, 1);
    const mid = pixel(png, 100, 50, 0);
    expect(mid[0]).toBeGreaterThan(250); // stays red, only alpha falls
    expect(mid[3]).toBeGreaterThan(110); expect(mid[3]).toBeLessThan(145);
  });
  it('throws on unsupported gradients', () => {
    expect(() => renderGradientLayers('conic-gradient(red, blue)', 10, 10)).toThrow();
  });
});

describe('prerenderGradients', () => {
  const css = (body: string) => `---\nmarp: true\n---\n<style>\n:root{--a:#ff0000;}\n${body}\n</style>\n# x\n`;

  it('rewrites a section background-image and resolves var()', () => {
    const r = prerenderGradients(css('section{background-image: radial-gradient(400px 300px at 10% 10%, var(--a), transparent 60%);}'));
    expect(r.replaced).toBe(1);
    expect(r.md).toContain('background-image: url(data:image/png;base64,');
    expect(r.md).toContain('background-size: 100% 100%');
    expect(r.md).not.toContain('radial-gradient');
  });
  it('rewrites the shorthand to a self-contained background', () => {
    const r = prerenderGradients(css('h1::after{height:3px;background: linear-gradient(90deg, #f00, #00f);}'));
    expect(r.md).toMatch(/background: url\(data:image\/png;base64,[^)]+\) 0 0 \/ 100% 100% no-repeat/);
  });
  it('keeps !important', () => {
    expect(prerenderGradients(css('section{background-image: linear-gradient(#000,#fff) !important;}')).md).toContain('!important');
  });
  it('leaves size-dependent gradients on non-section elements alone', () => {
    const r = prerenderGradients(css('.card{background: radial-gradient(60px 40px at 50% 50%, #f00, transparent);}'));
    expect(r.replaced).toBe(0); expect(r.skipped).toBe(1);
    expect(r.md).toContain('radial-gradient(60px 40px');
  });
  it('leaves unsupported syntax and inline style attributes alone', () => {
    const a = prerenderGradients(css('section{background: repeating-linear-gradient(#000, #fff 10px);}'));
    expect(a.md).toContain('repeating-linear-gradient');
    const b = prerenderGradients(css('') + '<div style="background:linear-gradient(#000,#fff)"></div>');
    expect(b.md).toContain('style="background:linear-gradient');
  });
  it('is a no-op without gradients', () => {
    const md = css('section{background:#000}');
    expect(prerenderGradients(md)).toEqual({ md, replaced: 0, skipped: 0 });
  });
});

describe('prerenderGradients rule detection', () => {
  it('handles rules containing quotes and child combinators', () => {
    const md = '<style>\nsection > h1::after {\n  content: ""; height: 3px;\n  background: linear-gradient(90deg, #f00, #00f);\n}\n</style>\n';
    expect(prerenderGradients(md).replaced).toBe(1);
  });
});
