import { collapseGradientRuns, encodePng, MIN_RUN_LENGTH } from './pptxGradientCollapse';

function sliver(i: number, rgb: string, text = ''): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${i + 2}" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>` +
    `<a:xfrm><a:off x="${i * 1000}" y="0"/><a:ext cx="1000" cy="5000"/></a:xfrm>` +
    `<a:custGeom><a:pathLst><a:path w="10" h="50"><a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
    `<a:lnTo><a:pt x="0" y="50"/></a:lnTo><a:lnTo><a:pt x="10" y="50"/></a:lnTo><a:lnTo><a:pt x="10" y="0"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>` +
    `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill></p:spPr>` +
    `<p:txBody><a:p>${text ? `<a:r><a:t>${text}</a:t></a:r>` : ''}</a:p></p:txBody></p:sp>`;
}
const ramp = (n: number) => Array.from({ length: n }, (_, i) => sliver(i, (i * 5).toString(16).padStart(2, '0') + '00ff'));
const wrap = (inner: string) => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>${inner}</p:spTree>`;

describe('collapseGradientRuns', () => {
  it('replaces a colour ramp with a single picture', () => {
    const r = collapseGradientRuns(wrap(ramp(40).join('')));
    expect(r.collapsedShapes).toBe(40);
    expect(r.images).toHaveLength(1);
    expect(r.xml).not.toContain('<p:sp>');
    expect(r.xml).toContain(`r:embed="${r.images[0].placeholder}"`);
    expect(r.images[0].png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('leaves short runs, single-colour runs and text shapes alone', () => {
    const short = wrap(ramp(MIN_RUN_LENGTH - 1).join(''));
    expect(collapseGradientRuns(short).images).toHaveLength(0);
    const flat = wrap(Array.from({ length: 30 }, (_, i) => sliver(i, 'ff0000')).join(''));
    expect(collapseGradientRuns(flat).images).toHaveLength(0);
    const withText = wrap(ramp(30).map((s, i) => i === 15 ? sliver(15, '112233', 'hi') : s).join(''));
    // text shape splits the ramp into two runs of 15 → both still collapse, text shape is kept
    const r = collapseGradientRuns(withText);
    expect(r.xml).toContain('<a:t>hi</a:t>');
  });

  it('allocates a unique shape id for the picture', () => {
    const r = collapseGradientRuns(wrap(ramp(20).join('')));
    expect(r.xml).toMatch(/<p:cNvPr id="22" name="Gradient effect 1"/);
  });
});

describe('encodePng', () => {
  it('writes a valid signature and IEND', () => {
    const png = encodePng(new Uint8Array(2 * 2 * 4), 2, 2);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(-8, -4).toString()).toBe('IEND');
  });
});
