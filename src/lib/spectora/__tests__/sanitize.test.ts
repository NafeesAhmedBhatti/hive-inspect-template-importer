/**
 * Unit tests — sanitize + validate.
 * Synthetic test values only; no real Spectora content is used or claimed.
 */
import { describe, expect, it } from 'vitest';
import { containsEmbeddedFrame, containsRichContent, sanitizeHtmlText } from '@/lib/spectora/sanitize';
import { validateFile } from '@/lib/spectora/validate';

describe('sanitize (render-time allowlist sanitizer)', () => {
  it('keeps benign formatting HTML', () => {
    const html = '<p style="color: #ff0000">Water <b>damage</b> &amp; stains</p><ul><li>Item 1</li></ul>';
    const out = sanitizeHtmlText(html);
    expect(out).toContain('<b>damage</b>');
    expect(out).toContain('<li>Item 1</li>');
    expect(out).toContain('#ff0000'); // sanitizer normalizes style whitespace
  });

  it('never lets script/style/iframe execute', () => {
    const evil = '<script>alert(1)</script><style>body{}</style><iframe src="https://x.test"></iframe><p>ok</p>';
    const out = sanitizeHtmlText(evil);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<p>ok</p>');
  });

  it('strips event handlers and javascript: URLs', () => {
    const evil = '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a>';
    const out = sanitizeHtmlText(evil);
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
  });

  it('forces safe link attrs and schemes', () => {
    const out = sanitizeHtmlText('<a href="https://example.test" target="_blank">x</a>');
    expect(out).toContain('rel=');
    expect(out).toContain('noopener');
    const protocolRelative = sanitizeHtmlText('<a href="//evil.test/x">y</a>');
    expect(protocolRelative).not.toContain('//evil.test');
  });

  it('detects rich content and embedded frames', () => {
    expect(containsRichContent('<b>bold</b>')).toBe(true);
    expect(containsRichContent('plain text &amp; entities')).toBe(true);
    expect(containsRichContent('plain text only')).toBe(false);
    expect(containsEmbeddedFrame('<iframe src="https://x.test"></iframe>')).toBe(true);
    expect(containsEmbeddedFrame('<b>no frames</b>')).toBe(false);
  });
});

describe('validate (pre-parse gates beyond readWorkbook)', () => {
  it('passes a valid xlsx payload', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 1, 2, 3]);
    expect(validateFile('real-export.xlsx', bytes)).toEqual({ ok: true });
  });

  it('blocks >25MB payloads with an actionable message', () => {
    const bytes = new Uint8Array(25 * 1024 * 1024 + 1);
    const res = validateFile('big.xlsx', bytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FILE_TOO_LARGE');
  });
});
