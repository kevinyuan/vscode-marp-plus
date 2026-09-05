import * as path from 'path';
import { bustImageCache, collectLocalImagePaths } from './imageCacheBuster';

const BASE = path.resolve('/deck');

/** Fake stat: files in the map exist with the given mtime; everything else is missing. */
function statOf(files: Record<string, number>) {
    return (p: string): number | undefined => files[p];
}

describe('bustImageCache', () => {
    const files = {
        [path.join(BASE, 'a.png')]: 1000,
        [path.join(BASE, 'img', 'b.svg')]: 2000.7,
        [path.join(BASE, 'sp ace.png')]: 3000,
    };
    const stat = statOf(files);

    it('appends the mtime to markdown images', () => {
        expect(bustImageCache('![alt](a.png)', BASE, stat)).toBe('![alt](a.png?v=1000)');
    });

    it('handles titles, angle brackets and encoded spaces', () => {
        expect(bustImageCache('![alt](img/b.svg "Title")', BASE, stat)).toBe('![alt](img/b.svg?v=2000 "Title")');
        expect(bustImageCache('![alt](<a.png>)', BASE, stat)).toBe('![alt](<a.png?v=1000>)');
        expect(bustImageCache('![alt](sp%20ace.png)', BASE, stat)).toBe('![alt](sp%20ace.png?v=3000)');
    });

    it('handles Marp background directives', () => {
        expect(bustImageCache('![bg left:40%](a.png)', BASE, stat)).toBe('![bg left:40%](a.png?v=1000)');
        expect(bustImageCache('![bg](a.png) ![bg](img/b.svg)', BASE, stat))
            .toBe('![bg](a.png?v=1000) ![bg](img/b.svg?v=2000)');
    });

    it('handles raw <img> tags and reference definitions', () => {
        expect(bustImageCache('<img src="a.png" width="50%">', BASE, stat)).toBe('<img src="a.png?v=1000" width="50%">');
        expect(bustImageCache("<img src='a.png'>", BASE, stat)).toBe("<img src='a.png?v=1000'>");
        expect(bustImageCache('[logo]: a.png', BASE, stat)).toBe('[logo]: a.png?v=1000');
    });

    it('preserves fragments', () => {
        expect(bustImageCache('![i](img/b.svg#icon)', BASE, stat)).toBe('![i](img/b.svg?v=2000#icon)');
    });

    it('leaves remote, data, already-queried, non-image and missing targets alone', () => {
        const cases = [
            '![r](https://example.com/a.png)',
            '![d](data:image/png;base64,AAAA)',
            '![q](a.png?x=1)',
            '![n](notes.md)',
            '![m](missing.png)',
            '[link](a.png)',
            '![anchor](#top)',
        ];
        for (const c of cases) {
            expect(bustImageCache(c, BASE, stat)).toBe(c);
        }
    });

    it('does not touch fenced code blocks', () => {
        const src = [
            '![a](a.png)',
            '```tikz',
            '% ![x](a.png)',
            '```',
            '~~~',
            '![y](a.png)',
            '~~~',
            '![z](a.png)',
        ].join('\n');
        expect(bustImageCache(src, BASE, stat)).toBe([
            '![a](a.png?v=1000)',
            '```tikz',
            '% ![x](a.png)',
            '```',
            '~~~',
            '![y](a.png)',
            '~~~',
            '![z](a.png?v=1000)',
        ].join('\n'));
    });

    it('treats a longer backtick fence as nested content', () => {
        const src = '````md\n```\n![a](a.png)\n```\n````\n![b](a.png)';
        expect(bustImageCache(src, BASE, stat)).toBe('````md\n```\n![a](a.png)\n```\n````\n![b](a.png?v=1000)');
    });

    it('returns the input unchanged when there is nothing to do', () => {
        const src = '# Title\n\nplain text';
        expect(bustImageCache(src, BASE, stat)).toBe(src);
    });

    it('resolves absolute paths as-is', () => {
        const abs = path.join(BASE, 'a.png');
        expect(bustImageCache(`![a](${abs})`, '/elsewhere', stat)).toBe(`![a](${abs}?v=1000)`);
    });
});

describe('collectLocalImagePaths', () => {
    it('returns absolute paths of every local image reference', () => {
        const src = '![a](a.png)\n<img src="img/b.svg">\n![r](https://x/y.png)';
        expect([...collectLocalImagePaths(src, BASE)].sort()).toEqual([
            path.join(BASE, 'a.png'),
            path.join(BASE, 'img', 'b.svg'),
        ].sort());
    });
});
