import * as sanitizeHtml from 'sanitize-html';

/**
 * Render-time allowlist HTML sanitizer.
 *
 * Storage stays faithful: `Comment.text` keeps exactly what Spectora exported.
 * Sanitization happens ONLY here, at render time, so the stored data remains
 * the source of truth while the browser never sees executable markup.
 *
 * Documented limitation: iframes are stripped (counted in the preservation
 * report, rendered elsewhere as a link placeholder) — script/style/iframe can
 * never execute through this renderer.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'span', 'div',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTRS = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
  span: ['style'],
  div: ['style'],
  p: ['style'],
  td: ['style'],
  th: ['style'],
  table: ['style'],
};

export function sanitizeHtmlText(input: string): string {
  return sanitizeHtml.default(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    // style attributes pass through the allowlist below — declarations like
    // position:fixed or expression() are dropped.
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3,8}$/],
        'background-color': [/^#[0-9a-fA-F]{3,8}$/],
        'font-weight': [/^(bold|[1-9]00)$/],
        'text-align': [/^(left|center|right|justify)$/],
        'text-decoration': [/^(underline|line-through|none)$/],
      },
    },
    disallowedTagsMode: 'discard',
    transformTags: {
      // Links never navigate the preview to arbitrary targets/protocols.
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }, true),
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
  });
}

/** True when a cell value contains HTML markup (tags, entities, or raw HTML comments). */
export function containsRichContent(value: string): boolean {
  return /<\/?[a-zA-Z][^>]*>|&[a-zA-Z#0-9]+;|<!--/.test(value);
}

/**
 * True when the value had an iframe/embed in the SOURCE. Used by the report
 * to count "present but rendered as a link placeholder" cases honestly.
 */
export function containsEmbeddedFrame(value: string): boolean {
  return /<\s*(iframe|object|embed)\b/i.test(value);
}
