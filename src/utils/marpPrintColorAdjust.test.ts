import { injectPrintColorAdjust } from './marpPrintColorAdjust';

describe('injectPrintColorAdjust', () => {
  it('injects a style block into the body when front-matter exists', () => {
    const input = `---\nmarp: true\ntheme: default\n---\n\n# Title\n`;
    const out = injectPrintColorAdjust(input);
    expect(out).toContain('<style data-tikz-marp-print-color-adjust>');
    expect(out).toContain('-webkit-print-color-adjust: exact !important;');
    expect(out).toContain('print-color-adjust: exact !important;');
    expect(out).toContain('# Title');
  });

  it('injects even when front-matter already has a style: key (user style is preserved)', () => {
    const input = `---\nmarp: true\nstyle: |\n  section { background: linear-gradient(red, blue); }\n---\n\nbody\n`;
    const out = injectPrintColorAdjust(input);
    expect(out).toContain('<style data-tikz-marp-print-color-adjust>');
    expect(out).toContain('section { background: linear-gradient(red, blue); }');
  });

  it('is idempotent — calling twice does not inject twice', () => {
    const input = `---\nmarp: true\n---\n\nbody\n`;
    const once = injectPrintColorAdjust(input);
    const twice = injectPrintColorAdjust(once);
    expect(twice).toBe(once);
    const matches = twice.match(/data-tikz-marp-print-color-adjust/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('does nothing when there is no front-matter', () => {
    const input = `# Title\n\nno front-matter here\n`;
    expect(injectPrintColorAdjust(input)).toBe(input);
  });

  it('handles CRLF line endings in front-matter', () => {
    const input = `---\r\nmarp: true\r\ntheme: default\r\n---\r\n\r\nbody\r\n`;
    const out = injectPrintColorAdjust(input);
    expect(out).toContain('<style data-tikz-marp-print-color-adjust>');
    expect(out).toContain('marp: true');
    expect(out).toContain('theme: default');
  });

  it('places the style block after the closing front-matter delimiter', () => {
    const input = `---\nmarp: true\n---\n\nbody content\n`;
    const out = injectPrintColorAdjust(input);
    const fmEnd = out.indexOf('---\n', 4) + 4;
    const styleIdx = out.indexOf('<style data-tikz-marp-print-color-adjust>');
    const bodyIdx = out.indexOf('body content');
    expect(styleIdx).toBeGreaterThan(fmEnd);
    expect(bodyIdx).toBeGreaterThan(styleIdx);
  });
});
