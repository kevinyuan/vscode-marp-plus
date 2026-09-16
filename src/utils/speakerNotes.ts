import * as path from 'path';

/** Return the 0-based source line number where each Marp slide starts.
 *  Slide 0 starts after the frontmatter; subsequent slides start at each `---`. */
export function parseSlideLineNumbers(markdown: string): number[] {
  const lines = markdown.split('\n');
  const slideLines: number[] = [];
  let inFrontmatter = false;
  let frontmatterEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && lines[i].trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter && lines[i].trim() === '---') { frontmatterEnd = i; break; }
  }

  slideLines.push(frontmatterEnd + 1); // first slide starts after frontmatter
  for (let i = frontmatterEnd + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { slideLines.push(i); }
  }
  return slideLines;
}

/** Parse Marp speaker notes from markdown source.
 *  Notes are HTML comments (<!-- ... -->) within each slide. */
export function parseSpeakerNotes(markdown: string): string[] {
  const lines = markdown.split('\n');
  const notes: string[] = [];
  let currentNotes: string[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inComment = false;
  let commentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip frontmatter
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter && line.trim() === '---') { inFrontmatter = false; frontmatterDone = true; continue; }
    if (inFrontmatter || !frontmatterDone) { continue; }

    // Slide separator
    if (line.trim() === '---') {
      notes.push(currentNotes.join('\n').trim());
      currentNotes = [];
      continue;
    }

    // Multi-line comment handling
    if (inComment) {
      const endIdx = line.indexOf('-->');
      if (endIdx >= 0) {
        commentLines.push(line.substring(0, endIdx));
        currentNotes.push(commentLines.join('\n').trim());
        commentLines = [];
        inComment = false;
      } else {
        commentLines.push(line);
      }
      continue;
    }

    // Single-line comment: <!-- ... -->
    const singleMatch = line.match(/<!--\s*(.*?)\s*-->/);
    if (singleMatch) {
      // Skip directives like <!-- _class: title -->
      const content = singleMatch[1];
      if (content && !content.match(/^_?\w+\s*:/)) {
        currentNotes.push(content);
      }
      continue;
    }

    // Start of multi-line comment: <!--
    const startMatch = line.match(/<!--\s*(.*)/);
    if (startMatch) {
      inComment = true;
      commentLines = [startMatch[1]];
      continue;
    }
  }
  // Last slide
  notes.push(currentNotes.join('\n').trim());

  return notes;
}

/** A place the Notes panel can send the user to edit a slide's notes: either a %!notes file
 *  or a specific line inside the deck itself. */
export interface SlideNoteLink {
  label: string;
  href: string;
}

/** Matches a %!notes directive line — mirrors MarkdownIncludeResolver's own regex, kept
 *  separate because that one carries /g state across calls. */
const SLIDE_NOTES_DIRECTIVE_RE = /^[ \t]*%!notes[ \t]+(.+?)[ \t]*$/;

/** Find every %!notes file a slide's raw source lines point to (a slide may have several). */
function findSlideNotesFiles(lines: string[], startLine: number, endLine: number): string[] {
  const files: string[] = [];
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const match = lines[i].match(SLIDE_NOTES_DIRECTIVE_RE);
    if (match) { files.push(match[1].trim()); }
  }
  return files;
}

/** 0-based line of a slide's first speaker-note HTML comment, skipping Marp directive
 *  comments (e.g. `<!-- _class: title -->`). Undefined if the slide has none. */
function findSlideNoteCommentLine(lines: string[], startLine: number, endLine: number): number | undefined {
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const lineText = lines[i];

    const singleMatch = lineText.match(/<!--\s*(.*?)\s*-->/);
    if (singleMatch) {
      const content = singleMatch[1] ?? '';
      if (content && content.match(/^_?\w+\s*:/)) { continue; } // directive, not a note
      return i;
    }

    if (lineText.match(/<!--\s*(.*)$/) && lineText.indexOf('-->') === -1) {
      return i; // start of a multi-line comment
    }
  }
  return undefined;
}

/**
 * Build, for every slide, the link(s) its Notes panel entry can offer for editing: one per
 * %!notes file when the slide uses those, otherwise a single line-anchored link into the deck
 * itself (VS Code's built-in preview resolves a plain relative link like `deck.md#L42` to that
 * exact line — no custom messaging needed).
 *
 * Must run on the *raw*, un-resolved document source: %!notes is expanded into a `<!-- -->`
 * comment before Marp/parseSpeakerNotes ever see it (see MarkdownIncludeResolver), which would
 * hide the very directive this function looks for.
 */
export function computeSlideNoteLinks(rawSrc: string, deckBasename: string, baseDir: string): SlideNoteLink[][] {
  const lines = rawSrc.split('\n');
  const slideLines = parseSlideLineNumbers(rawSrc);

  return slideLines.map((start, i) => {
    const end = i + 1 < slideLines.length ? slideLines[i + 1] : lines.length;

    const notesFiles = findSlideNotesFiles(lines, start, end);
    if (notesFiles.length > 0) {
      return notesFiles.map(rawFile => ({
        label: path.basename(rawFile),
        href: path.isAbsolute(rawFile) ? path.relative(baseDir, rawFile) : rawFile,
      }));
    }

    const noteLine = findSlideNoteCommentLine(lines, start, end);
    if (noteLine !== undefined) {
      return [{ label: 'Edit', href: `${deckBasename}#L${noteLine + 1}` }];
    }
    return [{ label: 'Add notes', href: `${deckBasename}#L${start + 1}` }];
  });
}
