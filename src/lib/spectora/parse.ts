import { isCanonicalColumn, isFirstClassColumn } from './columns';
import type { ImportWarning, ParsedComment, ParsedItem, ParsedSection, ParsedTemplate } from './types';
import type { RawRow, RawWorkbook } from './readWorkbook';

/**
 * Spectora HTML-text export → typed IR.
 *
 * Grouping rules (per phase-2 spec):
 *  - rows group into consecutive runs of identical Section Name, then
 *    identical Item Name within the section — spreadsheet row order is
 *    authoritative;
 *  - a non-contiguous repeat of a section name becomes a SEPARATE section
 *    (order-faithful) with an info warning — never merged;
 *  - an item row with an empty section lands in a clearly-labeled "(Unfiled)"
 *    section with a warning;
 *  - a row whose comment name AND text are empty is skipped, WITH a warning
 *    when the row carried comment-like data (Type/Category) — never silent.
 *
 * This function is pure and re-entrant: all state is local to the call.
 */

export const UNFILED_SECTION_NAME = '(Unfiled)';

function get(row: RawRow, column: string): string {
  return row.cells.get(column) ?? '';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface ParseOutput {
  ok: true;
  template: ParsedTemplate;
  warnings: ImportWarning[];
}

export interface ParseFailure {
  ok: false;
  code: string;
  message: string;
  action: string;
}

interface OrderRequest {
  comment: ParsedComment;
  item: ParsedItem;
  rowNumber: number;
  orderRaw: string;
}

export function parse(
  workbook: RawWorkbook,
  opts: { templateName: string; sourceFileName: string }
): ParseOutput | ParseFailure {
  const warnings: ImportWarning[] = [...workbook.warnings];
  const orderRequests: OrderRequest[] = [];

  // ---- Unknown columns: never crash, always disclose -----------------------
  for (const u of workbook.unknownHeaders) {
    const hasData = workbook.rows.some((r) => r.cells.get(`__unknown__:${u.raw}`) !== undefined);
    if (hasData) {
      warnings.push({
        level: 'warning',
        code: 'UNKNOWN_COLUMN',
        message: `Column "${u.raw}" is not part of the canonical Spectora HTML-text export — its data is preserved verbatim in each comment's extra data and listed in the preservation report.`,
        context: { column: u.raw },
      });
    }
  }

  // ---- Required-column gate ------------------------------------------------
  const hasSection = workbook.columnMap.has('Section Name');
  const hasItem = workbook.columnMap.has('Item Name');
  if (!hasSection || !hasItem) {
    const absent = [!hasSection ? '"Section Name"' : null, !hasItem ? '"Item Name"' : null].filter(
      (x): x is string => x !== null
    );
    return {
      ok: false,
      code: 'MISSING_REQUIRED_COLUMNS',
      message: `Required column${absent.length > 1 ? 's' : ''} ${absent.join(' and ')} not found in the header row.`,
      action: `Confirm the export is a Spectora "HTML Text" spreadsheet (it must include ${absent.join(
        ' and '
      )}). Headers found: ${
        workbook.rawHeaders.filter((h) => h.trim() !== '').map((h) => `"${h}"`).join(', ') || '(none)'
      }.`,
    };
  }

  // ---- Walk rows → section/item/comment runs -------------------------------
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let currentItem: ParsedItem | null = null;

  // name → section index; used to detect NON-CONTIGUOUS repeats.
  const firstSectionAt = new Map<string, number>();
  // `${sectionIndex}|${itemName}` → item index; detects non-contiguous items.
  const firstItemAt = new Map<string, number>();

  for (const row of workbook.rows) {
    const sectionName = get(row, 'Section Name');
    const itemName = get(row, 'Item Name');
    const commentName = get(row, 'Comment Name');
    const commentText = get(row, 'Comment Text');

    // ---- Empty-comment handling (before hierarchy work) --------------------
    if (commentName === '' && commentText === '') {
      if (get(row, 'Comment Type') !== '' || get(row, 'Category') !== '') {
        warnings.push({
          level: 'warning',
          code: 'COMMENT_ROW_EMPTY',
          message: `Row ${row.rowNumber} (${sectionName || currentSection?.name || '?'} → ${
            itemName || currentItem?.name || '?'
          }): comment row has no Comment Name and no Comment Text — skipped.`,
          context: { row: row.rowNumber, section: sectionName || currentSection?.name, item: itemName || currentItem?.name },
        });
      } else if (sectionName === '' && itemName === '') {
        const hasAnyData = [...row.cells.keys()].some((k) => !isFirstClassColumn(k.replace(/^__unknown__:/, '')));
        if (hasAnyData) {
          warnings.push({
            level: 'warning',
            code: 'ROW_WITHOUT_HIERARCHY',
            message: `Row ${row.rowNumber}: extra-column data without Section/Item/Comment context — skipped.`,
            context: { row: row.rowNumber },
          });
        }
      }
      // A clean section-only or item-only row is a normal Spectora pattern
      // (comment-less items) — handled below without any warning.
    }

    // ---- Section run --------------------------------------------------------
    const newSectionNeeded =
      (sectionName !== '' && (!currentSection || currentSection.name !== sectionName)) ||
      (sectionName === '' && itemName !== '' && currentSection?.name !== UNFILED_SECTION_NAME);

    if (newSectionNeeded) {
      if (sectionName !== '') {
        const at = firstSectionAt.get(sectionName);
        if (at !== undefined && sections[at] !== currentSection) {
          warnings.push({
            level: 'info',
            code: 'NONCONTIGUOUS_SECTION',
            message: `Section "${sectionName}" appears again at row ${row.rowNumber}; kept as a separate section to preserve the export order (contents were not merged).`,
            context: { row: row.rowNumber, section: sectionName },
          });
        } else if (at === undefined) {
          firstSectionAt.set(sectionName, sections.length);
        }
        currentSection = { name: sectionName, position: sections.length, items: [], sourceRow: row.rowNumber };
      } else {
        // Item row with no Section Name → "(Unfiled)".
        currentSection = { name: UNFILED_SECTION_NAME, position: sections.length, items: [], sourceRow: row.rowNumber };
        warnings.push({
          level: 'warning',
          code: 'ITEM_WITHOUT_SECTION',
          message: `Row ${row.rowNumber}: item "${itemName}" has no Section Name; placed in the "${UNFILED_SECTION_NAME}" section.`,
          context: { row: row.rowNumber, item: itemName },
        });
      }
      sections.push(currentSection);
      currentItem = null; // a new section always starts a fresh item run
    }

    // ---- Item run -----------------------------------------------------------
    if (itemName !== '' && (!currentItem || currentItem.name !== itemName)) {
      const key = `${sections.indexOf(currentSection!)}|${itemName}`;
      if (firstItemAt.has(key) && currentSection!.items[firstItemAt.get(key)!] !== undefined && currentSection!.items[firstItemAt.get(key)!] !== currentItem) {
        warnings.push({
          level: 'info',
          code: 'NONCONTIGUOUS_ITEM',
          message: `Item "${itemName}" appears again inside section "${currentSection!.name}" at row ${row.rowNumber}; kept as a separate item to preserve export order.`,
          context: { row: row.rowNumber, section: currentSection!.name, item: itemName },
        });
      } else if (!firstItemAt.has(key)) {
        firstItemAt.set(key, currentSection!.items.length);
      }
      currentItem = { name: itemName, position: currentSection!.items.length, comments: [], sourceRow: row.rowNumber };
      currentSection!.items.push(currentItem);
    }

    // ---- Comment row --------------------------------------------------------
    if (commentName === '' && commentText === '') continue;

    if (!currentSection || !currentItem) {
      warnings.push({
        level: 'warning',
        code: 'COMMENT_WITHOUT_HIERARCHY',
        message: `Row ${row.rowNumber}: comment data appeared before any Section/Item row — skipped.`,
        context: { row: row.rowNumber },
      });
      continue;
    }

    const commentTypeRaw = get(row, 'Comment Type');
    const categoryRaw = get(row, 'Category');
    const orderRaw = get(row, 'Order (w/i item)');

    // ---- Extra columns: every populated verbatim column (built first so
    //      fallbacks below can preserve unrecognized first-class values) ----
    const extra: Record<string, string> = {};
    for (const [key, value] of row.cells) {
      if (key.startsWith('__unknown__:')) {
        extra[key.slice('__unknown__:'.length)] = value;
      } else if (!isFirstClassColumn(key) && isCanonicalColumn(key) && value !== '') {
        extra[key] = value;
      }
    }

    // ---- Comment Type normalization ----------------------------------------
    let type = commentTypeRaw.toLowerCase();
    if (type === '') type = 'info';
    if (!['info', 'limit', 'defect'].includes(type)) {
      warnings.push({
        level: 'info',
        code: 'COMMENT_TYPE_UNRECOGNIZED',
        message: `Row ${row.rowNumber}: Comment Type "${commentTypeRaw}" is not one of info/limit/defect — stored as "unknown".`,
        context: { row: row.rowNumber, value: commentTypeRaw },
      });
      type = 'unknown';
    }

    // ---- Category normalization --------------------------------------------
    let category: number | null = null;
    if (categoryRaw !== '') {
      const n = Number(categoryRaw);
      if (Number.isInteger(n) && [-1, 0, 1].includes(n)) {
        category = n;
      } else {
        extra['Category'] = categoryRaw; // never silently drop the value
        warnings.push({
          level: 'warning',
          code: 'CATEGORY_UNRECOGNIZED',
          message: `Row ${row.rowNumber}: Category "${categoryRaw}" is not -1/0/1 — preserved in the comment's extra data instead.`,
          context: { row: row.rowNumber, value: categoryRaw },
        });
      }
    }

    const comment: ParsedComment = {
      name: commentName === '' ? null : commentName,
      text: commentText,
      type,
      category,
      position: currentItem.comments.length,
      extra,
      sourceRow: row.rowNumber,
    };
    currentItem.comments.push(comment);

    if (orderRaw !== '') {
      orderRequests.push({ comment, item: currentItem, rowNumber: row.rowNumber, orderRaw });
    }
  }

  if (sections.length === 0) {
    return {
      ok: false,
      code: 'NO_DATA_ROWS',
      message: 'The sheet has a header but no data rows.',
      action: 'Confirm the template actually contains sections, items and comments, then re-export.',
    };
  }

  applyCommentOrdering(orderRequests, warnings);

  const template: ParsedTemplate = {
    name: opts.templateName,
    source: 'spectora_html_text',
    sourceFileName: opts.sourceFileName,
    sections,
  };

  return { ok: true, template, warnings };
}

/**
 * `Order (w/i item)` handling: for each item with ≥1 populated order value,
 * stable-sort that item's comments by the numeric order (ties and un-ordered
 * cells keep spreadsheet row order), then re-number positions.
 */
function applyCommentOrdering(requests: OrderRequest[], warnings: ImportWarning[]): void {
  const byItem = new Map<ParsedItem, OrderRequest[]>();
  for (const req of requests) {
    const list = byItem.get(req.item) ?? [];
    list.push(req);
    byItem.set(req.item, list);
  }

  for (const [item, reqs] of byItem) {
    if (reqs.length < item.comments.length) {
      warnings.push({
        level: 'info',
        code: 'ORDER_PARTIALLY_POPULATED',
        message: `Item "${item.name}" has "Order (w/i item)" on ${plural(reqs.length, 'row', 'rows')} of ${
          item.comments.length
        } — ordering applied to the whole item; rows without a value keep their row order.`,
        context: { item: item.name },
      });
    }

    const orderValue = new Map<ParsedComment, number>();
    for (const req of reqs) {
      const n = Number(req.orderRaw);
      if (Number.isFinite(n)) {
        orderValue.set(req.comment, n);
      } else {
        warnings.push({
          level: 'warning',
          code: 'ORDER_VALUE_NONNUMERIC',
          message: `Row ${req.rowNumber}: "Order (w/i item)" value "${req.orderRaw}" is not numeric — row order kept for that comment.`,
          context: { row: req.rowNumber, value: req.orderRaw },
        });
      }
    }

    const withRowOrder = [...item.comments]; // row order = insertion order
    item.comments = withRowOrder.sort((a, b) => {
      const oa = orderValue.get(a);
      const ob = orderValue.get(b);
      if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
      if (oa !== undefined && ob === undefined) return -1;
      if (oa === undefined && ob !== undefined) return 1;
      return withRowOrder.indexOf(a) - withRowOrder.indexOf(b); // stable: row order
    });
    item.comments.forEach((c, i) => (c.position = i));

    warnings.push({
      level: 'info',
      code: 'ORDER_APPLIED',
      message: `Comment order inside item "${item.name}" applied from "Order (w/i item)" (${plural(orderValue.size, 'value', 'values')}).`,
      context: { item: item.name },
    });
  }
}
