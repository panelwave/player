/**
 * Safe Markdown subset for scroll text layers (schema 1.10+).
 *
 * Escape-first: the source is HTML-escaped before any markup is produced, so
 * no input can create a tag or attribute the renderer did not write itself.
 * Supported: headings (`#` and `##` → h2, `###` → h3, `####` → h4 — the
 * page owns h1, and a widget's first heading must not skip a level), paragraphs, `**bold**` / `__bold__`, `*italic*` / `_italic_`,
 * `` `code` ``, bullet (`-`, `*`, `+`) and numbered (`1.`) lists, and
 * `[text](url)` links with http(s) / mailto URLs only (opened in a new tab,
 * `rel="noopener noreferrer"`). Anything else is plain text.
 *
 * Pure and dependency-free: the CMS copies this file for its editor preview
 * (keep it self-contained).
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Link targets the renderer accepts (checked on the escaped text). */
function safeHref(escapedUrl: string): string | null {
  const url = escapedUrl.trim();
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(url) ? url : null;
}

/** Bold / italic on escaped text without code spans or links. */
function renderEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
}

/** Inline formatting of one escaped line. */
function renderInline(escaped: string): string {
  // Code spans and links become placeholders first, so emphasis never runs
  // inside code or inside an href.
  const tokens: string[] = [];
  const hold = (html: string) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };
  let out = escaped.replace(/`([^`]+)`/g, (_m, code: string) => hold(`<code>${code}</code>`));
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url);
    return href ? hold(`<a href="${href}" target="_blank" rel="noopener noreferrer">${renderEmphasis(text)}</a>`) : m;
  });
  out = renderEmphasis(out);
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => tokens[Number(i)]);
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'h'; level: number; text: string };

/** Render the Markdown subset to HTML (safe to bind with [innerHTML]). */
export function renderSafeMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  // Control characters (incl. the placeholder NUL) never reach the output.
  // eslint-disable-next-line no-control-regex
  const lines = escapeHtml(source.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')).split(/\r?\n/);
  const blocks: Block[] = [];
  let current: Block | null = null as Block | null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s*(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'h', level: Math.min(4, Math.max(2, heading[1].length)), text: heading[2] });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (current?.type !== type) {
        flush();
        current = { type, items: [] };
      }
      (current as { items: string[] }).items.push(text);
      continue;
    }
    if (current?.type !== 'p') {
      flush();
      current = { type: 'p', lines: [] };
    }
    (current as { lines: string[] }).lines.push(line.trim());
  }
  flush();

  return blocks
    .map((b) => {
      switch (b.type) {
        case 'h':
          return `<h${b.level}>${renderInline(b.text)}</h${b.level}>`;
        case 'ul':
        case 'ol':
          return `<${b.type}>${b.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${b.type}>`;
        default:
          return `<p>${renderInline(b.lines.join(' '))}</p>`;
      }
    })
    .join('');
}

/** Plain text with paragraphs: escaped, blank lines → paragraphs, line breaks kept. */
export function renderPlainText(source: string | null | undefined): string {
  if (!source) return '';
  return source
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}
