# Marp Plus for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/installs-short/kevinyuan.vscode-tikzjax.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=kevinyuan.vscode-tikzjax)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/kevinyuan/vscode-tikzjax?label=Open%20VSX&logo=vscodium)](https://open-vsx.org/extension/kevinyuan/vscode-tikzjax)

Also available for Obsidian: [![GitHub](https://img.shields.io/badge/GitHub-obsidian--marp--tikz-black?logo=github)](https://github.com/kevinyuan/obsidian-marp-tikz) [![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Marp%20TikZ-7c3aed?logo=obsidian)](https://obsidian.md/plugins?id=marp-tikz)

**Build presentations the way you build software.** Marp Plus turns VS Code into a workbench for [Marp](https://marp.app/) slide decks that is friendly to AI agents, precise enough for engineering content, and comfortable enough to replace PowerPoint for the whole authoring cycle.

- **AI-friendly.** A deck is plain text all the way down: Markdown slides, a YAML theme, TikZ diagrams and Markdown speaker notes, split into small files with `%!include`. Every piece is easy to prompt for, review, diff and version. Whatever writes to disk, you or an agent, the preview is fresh on the next save.
- **Engineering precision.** Circuits, plots, chemical structures, commutative diagrams and any other TikZ/LaTeX figure render as vector graphics with real TeX fonts, identically in the preview and in the exported file.
- **A professional presentation workflow.** A slide navigator with thumbnails and outline, a live speaker notes panel, and one-click export to editable PPTX (native text, math and tables) or PDF.

The same diagrams and includes also work in the ordinary Markdown preview, so nothing here is limited to slides.

## Main Features

### AI-friendly authoring

- **Plain text end to end** — slides, theme, diagrams and notes are Markdown, YAML and TikZ. No binary files, no proprietary format, nothing an agent cannot read or write.
- **Modular decks** — `%!include` pulls in TikZ files and shared YAML frontmatter, `%!notes` pulls in speaker notes, so every diagram, theme and script lives in its own file and can be edited independently.
- **Always-fresh preview** — saving any file re-renders the deck, its included files and its local images. A **Force Refresh Rendering** command bypasses every cache when you want to be sure.
- **Scriptable export** — the bundled `marp-tikz.js` CLI produces PPTX or PDF from the command line for CI jobs and agent pipelines.

### Engineering precision

- **TikZ / LaTeX diagrams in slides and documents** — `tikz` code blocks render to crisp SVG: circuitikz, pgfplots, chemfig, tikz-cd, tikz-3dplot and anything else TikZ can draw.
- **Exact typography** — the real TeX fonts are bundled and embedded, so math and symbols look the same in the preview, in PPTX and in PDF.
- **Offline, sandboxed rendering** — a WebAssembly TeX engine runs in a separate worker process. Nothing leaves your machine, a runaway diagram is killed at the timeout, and finished diagrams are cached across workspaces.
- **Theme-aware colours** — diagrams follow light and dark editor themes automatically.

### Professional presentation experience

- **Slide navigator** — a sidebar with small thumbnails, large thumbnails or an outline view; click to jump, page with ↑/↓, and stay in sync with the editor as you scroll.
- **Speaker notes panel** — notes for the current slide shown next to the preview, rendered as full Markdown.
- **Editable PPTX export** — real text and shapes, native PowerPoint math (OMML), native tables, embedded CJK fonts and speaker notes in the notes pane. One click from the editor or preview title bar.
- **PDF export** — the same button, with the last used format remembered.

## Gallery

<table>
<tr>
<td align="center"><em>TikZ diagrams in Marp slides with one-click PPTX export</em></td>
</tr>
<tr>
<td align="center"><img src="imgs/tikz-in-marp-export.png" width="800" alt="TikZ in Marp slide export" /></td>
</tr>
</table>

<table>
<tr>
<td align="center"><em>PCIe board layout</em></td>
</tr>
<tr>
<td align="center"><img src="imgs/pcie.png" width="800" alt="PCIe board layout" /></td>
</tr>
</table>

<table>
<tr>
<td align="center"><em>Log-log trade-off chart</em></td>
<td align="center"><em>Wafer die layout</em></td>
<td align="center"><em>Package floorplan</em></td>
</tr>
<tr>
<td align="center"><img src="imgs/fig-3-w.png" width="260" alt="log-log frequency vs PE count trade-off" /></td>
<td align="center"><img src="imgs/wafer.png" width="260" alt="wafer die layout" /></td>
<td align="center"><img src="imgs/pkg.png" width="260" alt="package floorplan" /></td>
</tr>
</table>

More TikZ diagram examples can be found in this article: [Decoding the Taalas HC1 — A Quantitative Analysis](https://kevinyuan1.substack.com/p/decoding-the-taalas-hc1-a-quantitative)

## Quick Start

1. Install Marp Plus together with [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode), which provides the slide layout and themes.
2. Create a Markdown file with `marp: true` in the frontmatter and add a slide:

````markdown
---
marp: true
theme: default
---

# Signal Path

```tikz
\usepackage{circuitikz}
\begin{document}
\begin{circuitikz}
  \draw (0,0) to[battery1, l=$V$] (0,3)
        to[R=$R_1$] (3,3)
        to[R=$R_2$] (3,0)
        -- (0,0);
\end{circuitikz}
\end{document}
```

<!-- Mention that R2 sets the output swing. -->
````

3. Open the Markdown preview (`Ctrl+Shift+V` / `Cmd+Shift+V`). The diagram renders in place.
4. Click the hamburger button in the preview to open the slide navigator, and the notes icon to show the speaker notes panel.
5. Click the export button in the title bar to produce an editable PPTX or a PDF.

TikZ blocks work the same way in a plain Markdown document without the `marp: true` line.

## Slide Navigator and Speaker Notes

When previewing a Marp deck, a navigator sits inside the preview pane:

- **Thumbnail sidebar**: Click the hamburger button (top-left) to open. Thumbnails stay synced with your scroll position.
- **Three view modes**: Switch between small thumbnails, large thumbnails and outline view using the toolbar icons.
- **Click to navigate**: Click any thumbnail or outline item to smoothly scroll to that slide.
- **Keyboard navigation**: Press ↑/↓ anywhere in the slide preview to switch pages with smooth animation. When focus is in the sidebar, ↑/↓ moves the selection without scrolling the sidebar itself.
- **Speaker notes panel**: Toggle it from the toolbar to see the notes for the current slide. Notes come from HTML comments in your Markdown (`<!-- Your notes here -->`) or from `%!notes` files, and are rendered as **full Markdown**: headings, bold, italic, inline code, lists, tables and links.
- **State persistence**: Sidebar, view mode and notes panel state survive preview reloads and tab switches.
- **Command palette**: `Marp Plus: Toggle Slide Thumbnails` toggles the sidebar; `Marp Plus: Toggle Speaker Notes Export` controls whether notes go into the exported PPTX.

## Export to PPTX and PDF

When a Marp file is open (`marp: true` in frontmatter), an export button appears in the title bar of both the editor and the preview. Click it and choose **PPTX**, **PPTX + Notes** or **PDF**; the last choice is remembered for next time.

For PPTX the extension:
1. Renders every TikZ diagram to SVG with its TeX fonts embedded
2. Runs `marp-cli` with `--pptx-editable` to produce an editable `.pptx`
3. Post-processes the file to inject native math objects and native tables, fix layout, and attach speaker notes
4. Saves the output next to the source file (timestamped)

The exported PPTX contains editable text and shapes, not one image per slide. CSS backgrounds, images and coloured slide backgrounds are preserved, and CJK text is exported with an embedded webfont so it survives the headless-browser render. The export shows progress in a notification with cancel support, and offers "Open File" / "Reveal in Finder" actions on completion.

### Math Formula Support in PPTX

LaTeX math formulas (`$...$` inline and `$$...$$` display) in Marp slides are converted to **native PowerPoint math objects** (OMML) — not images. This means formulas are fully editable in PowerPoint and render crisply at any zoom level.

- **Display math** (`$$...$$`) is centered and automatically given sufficient vertical space
- **Inline math** spacing with `\quad`, `\qquad` is preserved
- **Bold/italic math** (`\mathbf`, `\mathit`) uses native PowerPoint bold/italic styling
- **Accents** (`\hat`, `\tilde`, `\vec`, etc.) render correctly using combining diacritics
- **N-ary operators** (`\sum`, `\prod`, `\int`, etc.) with limits render as native PowerPoint nary elements

> **Prerequisites**: Install [marp-cli](https://github.com/marp-team/marp-cli) (`npm install -g @marp-team/marp-cli`) and [LibreOffice](https://www.libreoffice.org/) (required for editable PPTX conversion).

### CLI Export

For CI jobs and agent pipelines, the bundled `marp-tikz.js` script pre-renders the TikZ blocks and hands the deck to marp-cli:

```bash
node marp-tikz.js slides.md -- --pptx --allow-local-files --html
node marp-tikz.js slides.md -- --pdf --allow-local-files --html
```

## Modular Decks with Includes

A deck rarely wants to be one file. Splitting it into a theme, a set of diagrams and a set of speaker notes keeps each piece small enough to review, reuse across decks, and hand to an AI agent one at a time. All include paths resolve relative to the Markdown file being previewed, changes are picked up on save, and unchanged files are served from an mtime-checked cache.

### Diagram files

Keep the deck readable by storing TikZ diagrams in separate `.tikz` files and referencing them with `%!include`:

````markdown
```tikz
%!include diagrams/circuit.tikz
```
````

The included file should contain complete TikZ code (with `\begin{document}` / `\end{document}`):

```latex
% diagrams/circuit.tikz
\usepackage{circuitikz}
\begin{document}
\begin{circuitikz}
  \draw (0,0) to[battery1, l=$V$] (0,3)
        to[R=$R_1$] (3,3)
        to[R=$R_2$] (3,0)
        -- (0,0);
\end{circuitikz}
\end{document}
```

- **Relative paths** are resolved from the Markdown file's directory
- **Absolute paths** are also supported
- **Auto-refresh**: The preview updates automatically when the included file is saved or changes on disk
- **Per-file caching**: Unchanged files are not re-read or re-rendered

### Shared frontmatter

Place `%!include filename.yaml` on any line inside the frontmatter block:

````markdown
---
marp: true
%!include _theme.yaml
author: Alice
---
````

`_theme.yaml` contains the YAML keys to merge:

```yaml
theme: default
paginate: true
backgroundColor: white
```

The included content is inserted in-place; keys declared before or after the directive are preserved. Multiple `%!include` lines are supported.

### Shared speaker notes

Add a `%!notes filename.md` line anywhere inside a slide (not inside a comment). The extension replaces it with a proper Marp speaker notes comment before rendering, so the notes panel displays the file content as Markdown:

````markdown
# My Slide

%!notes notes/slide1.md
````

`notes/slide1.md` can contain any Markdown:

```markdown
## Key points

- Remember to mention the benchmark results
- Audience question likely: *why not use approach X?*
```

## Always-Fresh Preview

Saving a Markdown file always re-renders its preview, even if nothing changed since the last keystroke, and even if the change came from another editor or an agent writing to disk. Files the deck depends on are refreshed too:

- Markdown, YAML and TikZ files pulled in with `%!include` or `%!notes` are re-read on save or when they change on disk.
- Local images (`svg`, `png`, `jpg`, …) are stamped with their modification time in the preview, so a regenerated image is re-fetched instead of served from the webview's cache.
- Rendered diagrams are content-addressed, so an unchanged diagram is never re-rendered and a changed one can never be served stale.

**Marp Plus: Force Refresh Rendering** (also a refresh button in the editor and preview title bar) drops the include caches, the diagram caches and the webview image cache for the current document, then re-renders everything.

## TikZ Diagrams

Any fenced code block with the `tikz` language identifier is compiled by a bundled TeX engine and rendered as SVG, in Marp slides and in plain Markdown alike. The block must contain a complete document body (`\begin{document}` … `\end{document}`); `\usepackage` and `\usetikzlibrary` lines are honoured.

### Basic diagram

Create geometric shapes and drawings:

````markdown
```tikz
\begin{document}
\begin{tikzpicture}
  % Rectangle
  \draw[thick] (0,0) rectangle (2,1.5);

  % Circle
  \draw[fill=blue!20] (4,0.75) circle (0.75);

  % Triangle
  \draw[fill=red!20] (6,0) -- (7.5,0) -- (6.75,1.5) -- cycle;
\end{tikzpicture}
\end{document}
```
````

### Graph with nodes

````markdown
```tikz
\begin{document}
\begin{tikzpicture}[node distance=2cm]
  \node[circle,draw] (A) {A};
  \node[circle,draw] (B) [right of=A] {B};
  \node[circle,draw] (C) [below of=A] {C};
  \node[circle,draw] (D) [right of=C] {D};

  \draw[->] (A) -- (B);
  \draw[->] (A) -- (C);
  \draw[->] (B) -- (D);
  \draw[->] (C) -- (D);
\end{tikzpicture}
\end{document}
```
````

### Diagram sizing in Marp slides

Marp renders slides at a fixed 1280x720 resolution, then scales the entire slide to fit the preview pane. This means TikZ diagrams may appear smaller than in standard Markdown preview, since they occupy a smaller proportion of the 1280px-wide slide.

To make diagrams larger in Marp slides, use TikZ's `scale` option:

````markdown
```tikz
\begin{document}
\begin{tikzpicture}[scale=2]
  \draw (0,0) rectangle (3,2);
  \node at (1.5,1) {\Large Hello!};
\end{tikzpicture}
\end{document}
```
````

A `scale=2` factor generally makes diagrams appear at a similar visual size to the standard Markdown preview.

### Supported packages

The engine ships with the packages needed for specialised diagrams:

#### Chemistry: chemfig

Draw chemical structures and molecules:

````markdown
```tikz
\usepackage{chemfig}
\begin{document}
\chemfig{H_3C-CH_2-OH}
\end{document}
```
````

#### Circuits: circuitikz

Create electronic circuit diagrams:

````markdown
```tikz
\usepackage{circuitikz}
\begin{document}
\begin{circuitikz}
  \draw (0,0) to[battery1, l=$V$] (0,3)
        to[R=$R_1$] (3,3)
        to[R=$R_2$] (3,0)
        -- (0,0);
\end{circuitikz}
\end{document}
```
````

#### Plots: pgfplots

Plot mathematical functions and data:

````markdown
```tikz
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\begin{document}
\begin{tikzpicture}
  \begin{axis}[
    xlabel=$x$,
    ylabel=$y$,
    domain=-2:2,
    samples=100
  ]
    \addplot[blue, thick] {x^2};
    \addplot[red, thick] {x^3};
  \end{axis}
\end{tikzpicture}
\end{document}
```
````

#### Commutative diagrams: tikz-cd

Create category theory diagrams:

````markdown
```tikz
\usepackage{tikz-cd}
\begin{document}
\begin{tikzcd}
  A \arrow[r, "f"] \arrow[d, "g"] & B \arrow[d, "h"] \\
  C \arrow[r, "k"] & D
\end{tikzcd}
\end{document}
```
````

#### 3D figures: tikz-3dplot

Draw three-dimensional figures:

````markdown
```tikz
\usepackage{tikz-3dplot}
\begin{document}
\tdplotsetmaincoords{60}{110}
\begin{tikzpicture}[tdplot_main_coords]
  \draw[thick,->] (0,0,0) -- (3,0,0) node[anchor=north east]{$x$};
  \draw[thick,->] (0,0,0) -- (0,3,0) node[anchor=north west]{$y$};
  \draw[thick,->] (0,0,0) -- (0,0,3) node[anchor=south]{$z$};
\end{tikzpicture}
\end{document}
```
````

#### Mathematics: amsmath, amstext, amsfonts, amssymb

Full support for advanced mathematical notation and symbols.

#### Arrays: array

Create complex array and table structures within diagrams.

## Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| **Marp Plus: Open Preview** | Open the Markdown/Marp preview beside the editor |
| **Marp Plus: Force Refresh Rendering** | Bypass every cache (included files, diagram results, images) and re-render the preview. Also available as a refresh button in the editor/preview title bar |
| **Marp Plus: Refresh TikZ Diagrams** | Re-render all diagrams in the current document |
| **Marp Plus: Clear Diagram Cache (All Workspaces)** | Clear cached diagrams and force fresh rendering |
| **Marp Plus: Reset TikZ Engine** | Reset the rendering engine (useful after errors) |
| **Marp Plus: Toggle Slide Thumbnails** | Show/hide the slide thumbnail sidebar in Marp preview |
| **Marp Plus: Export Marp Slides to PPTX** | Export the current Marp deck to editable PPTX or PDF |
| **Marp Plus: Toggle Speaker Notes Export** | Toggle whether speaker notes are included in PPTX export |

All commands are available when editing Markdown files.

## Configuration

Customize the extension behavior through VS Code settings:

### `tikzjax.marpPptxNotes`

**Type:** `boolean`
**Default:** `true`

Include speaker notes (HTML comments `<!-- ... -->`) when exporting Marp slides to PPTX. When enabled, notes appear in the PowerPoint notes pane for each slide. Toggle quickly with the **Marp Plus: Toggle Speaker Notes Export** command.

```json
{
  "tikzjax.marpPptxNotes": true
}
```

### `tikzjax.invertColorsInDarkMode`

**Type:** `boolean`
**Default:** `true`

Automatically invert diagram colors when using a dark theme. Black colors become the current text color, and white colors match the background.

```json
{
  "tikzjax.invertColorsInDarkMode": true
}
```

### `tikzjax.renderTimeout`

**Type:** `number` (milliseconds)
**Default:** `15000`
**Range:** 1000 - 60000

Maximum time to wait for a diagram to render before timing out. Increase this for complex diagrams.

```json
{
  "tikzjax.renderTimeout": 20000
}
```

### `tikzjax.autoPreview`

**Type:** `boolean`
**Default:** `false`

Automatically open the preview panel when opening a Markdown file containing TikZ diagrams.

```json
{
  "tikzjax.autoPreview": true
}
```

### `tikzjax.previewPosition`

**Type:** `"side" | "below" | "window"`
**Default:** `"side"`

Default position for the preview panel:
- `"side"`: Open beside the editor (recommended)
- `"below"`: Open below the editor
- `"window"`: Open in a separate window

```json
{
  "tikzjax.previewPosition": "side"
}
```

## Tips and Tricks

### Multiple Diagrams

You can include multiple tikz code blocks in a single Markdown file. Each diagram renders independently.

### Error Handling

If a diagram fails to render, the extension displays an error message inline. Common issues:

- **Syntax errors**: Check your LaTeX syntax
- **Missing packages**: Ensure you've included the correct `\usepackage{}` statement
- **Timeout**: Increase `tikzjax.renderTimeout` for complex diagrams

Use the **Retry** button or **Marp Plus: Reset TikZ Engine** command to recover from errors.

### Performance

- **Caching**: Rendered diagrams are cached automatically. Unchanged diagrams load instantly.
- **Incremental Updates**: Only modified diagrams are re-rendered when you edit.
- **Clear Cache**: Use **Marp Plus: Clear Diagram Cache** if you need to force re-rendering everywhere; **Marp Plus: Force Refresh Rendering** does it for the current document only.

Cached SVGs are stored as files in the extension's global storage directory
(`<VS Code user dir>/globalStorage/kevinyuan.vscode-tikzjax/svg-cache/`), shared across
all workspaces and capped at 2000 diagrams / 64 MB with least-recently-used eviction.
Deleting that folder is equivalent to **Marp Plus: Clear Diagram Cache**.

Diagrams are rendered in a separate worker process, so a diagram that hangs or takes
too long cannot destabilise VS Code — it is killed at the **Render Timeout** and the
engine restarts cleanly for the next one.

### Fonts

TikZ output references TeX fonts (`cmr10`, `cmmi10`, `cmsy10`, …) by name rather than
embedding glyph outlines, and those fonts are **not** Unicode-encoded — each character
sits at its position in the font, not at its Unicode codepoint. `\alpha` is emitted as
U+00AE, `\sum` as U+0050, `\leq` as U+2219. Without the real fonts loaded, a browser
substitutes a fallback and renders those literally as `®`, `P`, `∙`.

The extension therefore bundles the BaKoMa TeX fonts: the preview loads them as a
stylesheet, and exported diagrams carry them embedded so each `.svg` renders correctly
on its own. If diagram text ever looks like unrelated symbols, that is a font-loading
problem, not a caching one — clearing the cache will not help, because the cached SVG
is already correct.

> **CJK inside `tikz` blocks is not supported.** The bundled TeX engine has no Chinese,
> Japanese or Korean fonts, so a `tikz` block containing CJK characters fails to compile
> rather than rendering. Put CJK text in the surrounding Markdown or Marp slide instead,
> where it renders normally.

### Dark Mode

The extension automatically adjusts diagram colors for dark themes. If you prefer original colors, disable this feature:

```json
{
  "tikzjax.invertColorsInDarkMode": false
}
```

## Troubleshooting

### Diagrams not rendering

1. Ensure you're editing a Markdown file (`.md` extension)
2. Check that your code block uses the `tikz` language identifier
3. Open the Markdown preview (`Ctrl+Shift+V` / `Cmd+Shift+V`)
4. Check the error message if displayed

### Slow rendering

1. Increase the timeout: `"tikzjax.renderTimeout": 30000`
2. Simplify complex diagrams
3. Use the cache — unchanged diagrams load instantly

### Preview not updating

1. Save the file, or run **Marp Plus: Force Refresh Rendering** (refresh button in the title bar)
2. Try **Marp Plus: Reset TikZ Engine** if diagrams still do not update
3. Close and reopen the preview panel

### Colors look wrong in dark mode

1. Toggle `tikzjax.invertColorsInDarkMode` setting
2. Use explicit colors in your diagrams if needed
3. Refresh the preview after changing themes

## Requirements

- VS Code 1.85.0 or higher
- No internet connection required — rendering is fully offline
- [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) for slide decks (plain Markdown documents work without it)
- **For PPTX / PDF export** (optional):
  - [marp-cli](https://github.com/marp-team/marp-cli) v4.1.0+ (`npm install -g @marp-team/marp-cli`)
  - [LibreOffice](https://www.libreoffice.org/) (used by marp-cli for ODP→PPTX conversion)

## License

MIT License - see [LICENSE.md](LICENSE.md) for details.

## Acknowledgments

- **[node-tikzjax](https://github.com/drgrice1/node-tikzjax)** by @drgrice1 - Server-side TikZ rendering engine
- **[obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax)** by @artisticat1 - Original Obsidian plugin
- **[TikZJax](https://github.com/kisonecat/tikzjax)** by @kisonecat - Browser-based TikZ compiler

---

**Enjoy building your next deck!** If you encounter issues or have suggestions, please [file an issue on GitHub](https://github.com/kevinyuan/vscode-tikz/issues).
