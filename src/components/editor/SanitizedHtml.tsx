import { sanitizeHtmlText } from '@/lib/spectora/sanitize';

/**
 * Server-rendered comment text: raw stored HTML → allowlist sanitizer →
 * dangerouslySetInnerHTML. This is the ONLY sanctioned raw-HTML sink; storage
 * is never modified, and script/style/iframe/event handlers cannot pass.
 */
export function SanitizedHtml({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtmlText(html) }} />;
}
