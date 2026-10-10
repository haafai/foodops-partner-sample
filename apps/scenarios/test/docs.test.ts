import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The guides under docs/wiki name files, npm scripts and settings. Each of those can be renamed without anyone
// opening the guides, so this test fails when a page points at something that is no longer there.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const wikiDir = path.join(root, 'docs', 'wiki');
const pages = readdirSync(wikiDir).filter((name) => name.endsWith('.md')).sort();
const read = (file: string): string => readFileSync(file, 'utf8');

/** A page without its fenced code blocks: a link is prose, and JSON in a code block must not look like one. */
const prose = (markdown: string): string => markdown.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces to hyphens. */
function headingAnchor(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
}

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  for (const match of prose(read(file)).matchAll(/^#{1,6}\s+(.+)$/gm)) anchors.add(headingAnchor(match[1]));
  return anchors;
}

interface Link { page: string; target: string }

function linksOf(page: string): Link[] {
  const links: Link[] = [];
  for (const match of prose(read(path.join(wikiDir, page))).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(match[1])) links.push({ page, target: match[1] });
  }
  return links;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Every setting some code reads from the environment, plus every one `.env.example` lists (commented out or not). */
function knownSettings(): Set<string> {
  const known = new Set<string>();
  for (const match of read(path.join(root, '.env.example')).matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) known.add(match[1]);
  const code = ['packages', 'apps', 'scripts'].flatMap((dir) => sourceFiles(path.join(root, dir)));
  for (const file of code) {
    if (file.includes(`${path.sep}test${path.sep}`)) continue;
    for (const match of read(file).matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)) known.add(match[1]);
  }
  return known;
}

/**
 * The settings a page names: any ALL_CAPS word with an underscore, plus a one-word name used as a setting
 * (`PORT=4011 npm run mock`, "the `PORT` environment variable").
 */
function settingsNamedIn(markdown: string): string[] {
  const names = new Set<string>();
  for (const match of markdown.matchAll(/(?<![A-Za-z0-9_])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![A-Za-z0-9_])/g)) names.add(match[0]);
  for (const match of markdown.matchAll(/\b([A-Z][A-Z0-9_]*)=\S* npm run\b/g)) names.add(match[1]);
  for (const match of markdown.matchAll(/`([A-Z][A-Z0-9_]*)` environment variable/g)) names.add(match[1]);
  return [...names];
}

describe('docs/wiki', () => {
  it('has Home and the other twelve pages', () => {
    expect(pages).toContain('Home.md');
    expect(pages.length).toBeGreaterThanOrEqual(13);
  });

  it('links only to files and headings that exist', () => {
    const broken: string[] = [];
    for (const { page, target } of pages.flatMap(linksOf)) {
      const [file, anchor] = target.split('#');
      const resolved = file === '' ? path.join(wikiDir, page) : path.resolve(wikiDir, file);
      if (!existsSync(resolved)) broken.push(`${page}: ${target} (no such file)`);
      else if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor)) broken.push(`${page}: ${target} (no such heading)`);
    }
    expect(broken).toEqual([]);
  });

  it('links to the three reference documents', () => {
    const targets = new Set(pages.flatMap(linksOf).map((link) => path.resolve(wikiDir, link.target.split('#')[0])));
    for (const reference of ['README.md', 'CONTRACT.md', path.join('docs', 'integration-guide.md')]) {
      expect(existsSync(path.join(root, reference)), reference).toBe(true);
    }
    expect(targets.has(path.join(root, 'CONTRACT.md'))).toBe(true);
    expect(targets.has(path.join(root, 'docs', 'integration-guide.md'))).toBe(true);
  });

  it('names only npm scripts that the root package.json has', () => {
    const scripts = Object.keys((JSON.parse(read(path.join(root, 'package.json'))) as { scripts: Record<string, string> }).scripts);
    const unknown: string[] = [];
    for (const page of pages) {
      for (const match of read(path.join(wikiDir, page)).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
        if (!scripts.includes(match[1])) unknown.push(`${page}: npm run ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('names only settings that .env.example lists or that some code reads', () => {
    const known = knownSettings();
    const unknown: string[] = [];
    for (const page of pages) {
      for (const name of settingsNamedIn(read(path.join(wikiDir, page)))) {
        if (!known.has(name)) unknown.push(`${page}: ${name}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('recognises a setting, a heading anchor, and what is neither', () => {
    expect(settingsNamedIn('Set `WEBHOOK_PORT`, or run `PORT=4011 npm run mock`. `PUT webhook` and `SO-10001` are not settings.').sort())
      .toEqual(['PORT', 'WEBHOOK_PORT']);
    expect(headingAnchor('6. Webhooks, with polling as the backstop')).toBe('6-webhooks-with-polling-as-the-backstop');
    expect(headingAnchor('`403 outlet_restricted_key`')).toBe('403-outlet_restricted_key');
  });
});
