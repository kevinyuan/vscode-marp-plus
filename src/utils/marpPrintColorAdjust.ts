/**
 * Injects a CSS override that forces Chromium/LibreOffice's headless-browser
 * renderer to keep background colors, gradients, and box-shadows when
 * converting a Marp deck to PDF or PPTX.
 *
 * Why this is necessary:
 *   Puppeteer's `page.pdf()` (used by marp-cli for both PDF and PPTX/image
 *   export) mirrors a browser's "print" media rendering, which by default
 *   omits background graphics — background-color, background-image
 *   (including gradients), and box-shadow/filter halos — exactly like the
 *   "Print backgrounds" checkbox unchecked in Chrome's print dialog. This is
 *   why a slide's background color, a gradient underline, or a glow effect
 *   can look correct in the live VS Code preview (a normal browser view) but
 *   disappear or look washed out in the exported PDF/PPTX.
 *
 *   Setting `print-color-adjust: exact` (and its -webkit- prefix, needed by
 *   the bundled Chromium) on every element opts back into rendering exactly
 *   what's on screen.
 *
 *   The injection is idempotent (checked via a marker comment) and only
 *   triggers when the document has YAML front-matter (i.e. is a Marp file).
 */

const PRINT_COLOR_ADJUST_MARKER = 'tikz-marp-print-color-adjust';

const PRINT_COLOR_ADJUST_STYLE_BLOCK =
  `<style data-${PRINT_COLOR_ADJUST_MARKER}>\n` +
  `*, *::before, *::after {\n` +
  `  -webkit-print-color-adjust: exact !important;\n` +
  `  print-color-adjust: exact !important;\n` +
  `  color-adjust: exact !important;\n` +
  `}\n` +
  `</style>\n`;

export function injectPrintColorAdjust(md: string): string {
  // Idempotent: skip if already injected.
  if (md.includes(`data-${PRINT_COLOR_ADJUST_MARKER}`)) {
    return md;
  }

  const fmMatch = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!fmMatch) {
    return md;
  }

  const fmEnd = fmMatch[0];
  const rest = md.slice(fmEnd.length);
  return `${fmEnd}\n${PRINT_COLOR_ADJUST_STYLE_BLOCK}\n${rest}`;
}
