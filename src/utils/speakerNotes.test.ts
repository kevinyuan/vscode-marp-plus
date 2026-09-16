import { parseSlideLineNumbers, parseSpeakerNotes, computeSlideNoteLinks } from './speakerNotes';

describe('parseSlideLineNumbers', () => {
  it('starts the first slide after the frontmatter', () => {
    const md = '---\nmarp: true\n---\n\n# Slide 1\n---\n\n# Slide 2';
    expect(parseSlideLineNumbers(md)).toEqual([3, 5]);
  });

  it('returns a single entry for a one-slide deck', () => {
    const md = '---\nmarp: true\n---\n\n# Only slide';
    expect(parseSlideLineNumbers(md)).toEqual([3]);
  });
});

describe('parseSpeakerNotes', () => {
  it('extracts a single-line comment per slide', () => {
    const md = '---\nmarp: true\n---\n\n# Slide 1\n<!-- note one -->\n---\n\n# Slide 2\n<!-- note two -->';
    expect(parseSpeakerNotes(md)).toEqual(['note one', 'note two']);
  });

  it('skips Marp directive comments like _class', () => {
    const md = '---\nmarp: true\n---\n<!-- _class: title -->\n# Slide 1\n<!-- real note -->';
    expect(parseSpeakerNotes(md)).toEqual(['real note']);
  });

  it('joins multi-line comments', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n<!--\nline one\nline two\n-->';
    expect(parseSpeakerNotes(md)).toEqual(['line one\nline two']);
  });

  it('returns an empty string for slides with no notes', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n---\n# Slide 2\n<!-- note -->';
    expect(parseSpeakerNotes(md)).toEqual(['', 'note']);
  });
});

describe('computeSlideNoteLinks', () => {
  const deck = 'deck.md';
  const baseDir = '/decks';

  it('links to a %!notes file by its relative path', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n%!notes notes/slide1.md';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'slide1.md', href: 'notes/slide1.md' }]]);
  });

  it('rewrites an absolute %!notes path relative to baseDir', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n%!notes /decks/notes/slide1.md';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'slide1.md', href: 'notes/slide1.md' }]]);
  });

  it('emits one link per %!notes file when a slide has several', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n%!notes notes/a.md\ncontent\n%!notes notes/b.md';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[
      { label: 'a.md', href: 'notes/a.md' },
      { label: 'b.md', href: 'notes/b.md' },
    ]]);
  });

  it('links to the deck itself at the existing note comment line when there is no %!notes', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n<!-- a note -->';
    // frontmatter: lines 0-2, slide starts at line 3 ("# Slide 1"), note comment at line 4
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'Edit', href: 'deck.md#L5' }]]);
  });

  it('offers to add notes at the slide start when the slide has none at all', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\ncontent only';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'Add notes', href: 'deck.md#L4' }]]);
  });

  it('skips a Marp directive comment and still offers to add notes', () => {
    const md = '---\nmarp: true\n---\n<!-- _class: title -->\n# Slide 1';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'Add notes', href: 'deck.md#L4' }]]);
  });

  it('prefers %!notes over an inline comment on the same slide', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n<!-- inline -->\n%!notes notes/a.md';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toEqual([[{ label: 'a.md', href: 'notes/a.md' }]]);
  });

  it('returns one entry per slide, in order', () => {
    const md = '---\nmarp: true\n---\n# Slide 1\n<!-- note one -->\n---\n# Slide 2\n%!notes notes/two.md';
    const links = computeSlideNoteLinks(md, deck, baseDir);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual([{ label: 'Edit', href: 'deck.md#L5' }]);
    expect(links[1]).toEqual([{ label: 'two.md', href: 'notes/two.md' }]);
  });
});
