import * as fs from 'fs';
import * as path from 'path';

/**
 * Appends a modification-time query string to local image references so the
 * preview webview re-fetches an image when the file on disk changes.
 *
 * Why: the webview keeps a per-document image cache keyed by URL. After a
 * preview refresh, an `<img>` whose `src` is unchanged is painted from that
 * cache even when the PNG/SVG behind it was regenerated. Making the URL carry
 * the file's mtime turns "the file changed" into "the URL changed", which the
 * browser cannot ignore. VS Code's link normalizer preserves the query string
 * when it rewrites relative paths to webview resource URIs, and its resource
 * loader ignores it when reading the file, so the file still resolves.
 *
 * Handled forms:
 *   - Markdown images: `![alt](path)`, `![alt](path "title")`, `![bg](path)`
 *     (Marp background directives share the image syntax)
 *   - Raw HTML: `<img src="path">`
 *   - Reference definitions: `[id]: path`
 *
 * Fenced code blocks are left untouched, so TikZ/code samples never change.
 */

const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp|bmp|avif|apng|ico)$/i;

/** Rewrite one link destination. Returns the input unchanged when not applicable. */
function bustOne(rawTarget: string, baseDir: string, statFn: (p: string) => number | undefined): string {
    const target = rawTarget.trim();
    if (!target) { return rawTarget; }
    // Skip URLs with a scheme (http:, data:, vscode-resource:, file:, …),
    // protocol-relative URLs, anchors, and anything already carrying a query.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#')) {
        return rawTarget;
    }
    if (target.includes('?')) { return rawTarget; }

    const hashIdx = target.indexOf('#');
    const filePart = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
    const fragment = hashIdx >= 0 ? target.slice(hashIdx) : '';
    if (!IMAGE_EXT_RE.test(filePart)) { return rawTarget; }

    let decoded = filePart;
    try { decoded = decodeURI(filePart); } catch { /* keep as-is */ }
    const abs = path.isAbsolute(decoded) ? decoded : path.resolve(baseDir, decoded);
    const mtime = statFn(abs);
    if (mtime === undefined) { return rawTarget; }

    return `${filePart}?v=${Math.floor(mtime)}${fragment}`;
}

function defaultStat(p: string): number | undefined {
    try {
        const st = fs.statSync(p);
        return st.isFile() ? st.mtimeMs : undefined;
    } catch {
        return undefined;
    }
}

// `![alt](dest "title")` / `![alt](<dest> "title")`. Alt may contain nested brackets
// one level deep (e.g. Marp `![bg left:40%](…)` never nests, but `![a [b]](…)` might).
const MD_IMAGE_RE = /(!\[(?:[^[\]]|\[[^[\]]*\])*\]\()(<[^>]*>|[^()\s]+(?:\([^()\s]*\)[^()\s]*)*)((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\))/g;
// `<img … src="…">` / `src='…'`
const HTML_IMG_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)')/gi;
// `[id]: dest` reference definitions (line-anchored)
const REF_DEF_RE = /^([ \t]{0,3}\[[^\]]+\]:[ \t]*)(<[^>]*>|\S+)/;

function bustLine(line: string, baseDir: string, statFn: (p: string) => number | undefined): string {
    let out = line.replace(MD_IMAGE_RE, (_m, open: string, dest: string, close: string) => {
        if (dest.startsWith('<') && dest.endsWith('>')) {
            return `${open}<${bustOne(dest.slice(1, -1), baseDir, statFn)}>${close}`;
        }
        return `${open}${bustOne(dest, baseDir, statFn)}${close}`;
    });
    out = out.replace(HTML_IMG_SRC_RE, (_m, prefix: string, _q: string, dq?: string, sq?: string) => {
        if (dq !== undefined) { return `${prefix}"${bustOne(dq, baseDir, statFn)}"`; }
        return `${prefix}'${bustOne(sq ?? '', baseDir, statFn)}'`;
    });
    out = out.replace(REF_DEF_RE, (_m, prefix: string, dest: string) => {
        if (dest.startsWith('<') && dest.endsWith('>')) {
            return `${prefix}<${bustOne(dest.slice(1, -1), baseDir, statFn)}>`;
        }
        return `${prefix}${bustOne(dest, baseDir, statFn)}`;
    });
    return out;
}

/**
 * Add `?v=<mtime>` to every local image reference in a Markdown source.
 *
 * @param src      Markdown text
 * @param baseDir  Directory used to resolve relative image paths
 * @param statFn   Injectable stat (returns mtimeMs, or undefined when missing) — for tests
 */
export function bustImageCache(
    src: string,
    baseDir: string,
    statFn: (p: string) => number | undefined = defaultStat
): string {
    // Fast path: nothing that could be an image reference.
    if (!/!\[|<img|\]:/i.test(src)) { return src; }

    const lines = src.split('\n');
    let fence: string | undefined; // the fence marker currently open (``` or ~~~ of any length)

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (!fence) {
                fence = marker;
                continue;
            }
            // A closing fence uses the same character and is at least as long.
            if (marker[0] === fence[0] && marker.length >= fence.length && /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.test(line)) {
                fence = undefined;
                continue;
            }
        }
        if (fence) { continue; }
        lines[i] = bustLine(line, baseDir, statFn);
    }

    return lines.join('\n');
}

/**
 * Collect the absolute paths of every local image referenced by a Markdown source
 * (same detection rules as {@link bustImageCache}). Used to watch them for changes.
 */
export function collectLocalImagePaths(src: string, baseDir: string): Set<string> {
    const found = new Set<string>();
    bustImageCache(src, baseDir, (p) => { found.add(p); return undefined; });
    return found;
}
