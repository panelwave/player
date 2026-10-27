import { escapeHtml, renderPlainText, renderSafeMarkdown } from './safe-markdown';

describe('safe-markdown', () => {
  describe('renderSafeMarkdown', () => {
    it('renders headings as h2–h4', () => {
      expect(renderSafeMarkdown('# A')).toBe('<h2>A</h2>');
      expect(renderSafeMarkdown('## B')).toBe('<h3>B</h3>');
      expect(renderSafeMarkdown('### C')).toBe('<h4>C</h4>');
      expect(renderSafeMarkdown('#### D')).toBe('<h4>D</h4>');
    });

    it('joins paragraph lines and splits on blank lines', () => {
      expect(renderSafeMarkdown('one\ntwo\n\nthree')).toBe('<p>one two</p><p>three</p>');
    });

    it('renders bullet and numbered lists', () => {
      expect(renderSafeMarkdown('- a\n* b\n+ c')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
      expect(renderSafeMarkdown('1. a\n2) b')).toBe('<ol><li>a</li><li>b</li></ol>');
      expect(renderSafeMarkdown('- a\n1. b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
    });

    it('renders bold, italic and code', () => {
      expect(renderSafeMarkdown('**b** __c__ *i* _j_ `x*y*`')).toBe(
        '<p><strong>b</strong> <strong>c</strong> <em>i</em> <em>j</em> <code>x*y*</code></p>'
      );
    });

    it('does not treat snake_case or 2*3*4 as emphasis', () => {
      expect(renderSafeMarkdown('snake_case_name')).toBe('<p>snake_case_name</p>');
    });

    it('renders http(s) and mailto links with a safe rel', () => {
      expect(renderSafeMarkdown('[Wiki](https://en.wikipedia.org/wiki/Meander_(river))')).toContain(
        '<a href="https://en.wikipedia.org/wiki/Meander_(river" target="_blank" rel="noopener noreferrer">Wiki</a>'
      );
      expect(renderSafeMarkdown('[Mail](mailto:a@b.org)')).toContain('href="mailto:a@b.org"');
    });

    it('keeps emphasis out of hrefs', () => {
      const html = renderSafeMarkdown('[x](https://ex.org/a_b_c)');
      expect(html).toContain('href="https://ex.org/a_b_c"');
      expect(html).not.toContain('<em>');
    });

    it('drops links with unsafe schemes (text stays literal)', () => {
      for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.org', 'JaVaScRiPt:alert(1)']) {
        const html = renderSafeMarkdown(`[click](${url})`);
        expect(html).not.toContain('<a ');
        expect(html).not.toMatch(/<(script|b)\b/i);
      }
    });

    it('escapes every raw HTML input (XSS vectors)', () => {
      const vectors = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '"><iframe src=javascript:alert(1)>',
        '<a href="javascript:alert(1)">x</a>',
        '[x](https://ok.org" onmouseover="alert(1))',
        '**<b onclick=alert(1)>x</b>**',
        '`<script>`',
        '&lt;script&gt;',
      ];
      for (const v of vectors) {
        const html = renderSafeMarkdown(v);
        // The only tags in the output are the ones the renderer writes.
        const tags = html.match(/<\/?([a-z0-9]+)/gi) ?? [];
        for (const tag of tags) {
          expect(['<p', '</p', '<strong', '</strong', '<em', '</em', '<code', '</code', '<a', '</a']).toContain(tag.toLowerCase());
        }
        expect(html).not.toMatch(/<[^>]*\son\w+=/i);
        expect(html).not.toMatch(/href="(?!https?:|mailto:)/i);
      }
    });

    it('strips control characters including the placeholder byte', () => {
      expect(renderSafeMarkdown('a\u0000 0\u0000b')).toBe('<p>a 0b</p>');
    });

    it('returns empty for empty input', () => {
      expect(renderSafeMarkdown('')).toBe('');
      expect(renderSafeMarkdown(null)).toBe('');
      expect(renderSafeMarkdown('\n\n')).toBe('');
    });
  });

  it('escapeHtml escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('renderPlainText keeps paragraphs and line breaks, escaped', () => {
    expect(renderPlainText('a\nb\n\n<c>')).toBe('<p>a<br>b</p><p>&lt;c&gt;</p>');
    expect(renderPlainText('')).toBe('');
  });
});
