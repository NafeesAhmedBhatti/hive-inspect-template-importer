import { prisma } from '@/lib/db';
import type { ImportReport, ImportWarning, ParsedTemplate } from '@/lib/spectora/types';

/**
 * Transactional persistence: parsed IR → Postgres.
 *
 * Everything (template + sections + items + comments + import summary
 * snapshot) commits in ONE transaction; any failure rolls back fully, so a
 * partial import is impossible. Section/item `position` comes straight from
 * the IR (encounter order, or Order-column adjusted comment order).
 */

export class ImportServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface PersistInput {
  template: ParsedTemplate;
  warnings: ImportWarning[];
  report: ImportReport;
  /** User-facing name override (falls back to the parsed name). */
  templateName?: string;
  /** Source label, e.g. "spectora_html_text" (default) or "synthetic_seed". */
  source?: string;
  /** True ONLY for clearly-labeled synthetic seed templates. */
  isSynthetic?: boolean;
}

export async function persistTemplate(input: PersistInput): Promise<{ id: string; name: string }> {
  const { template, warnings, report } = input;
  if (!template?.sections?.length) {
    throw new ImportServiceError('EMPTY_TEMPLATE', 'The parsed template has no sections — nothing to import.');
  }

  const name = (input.templateName ?? template.name).trim();
  if (!name) {
    throw new ImportServiceError('MISSING_NAME', 'The template has no name.');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.template.create({
        data: {
          name,
          source: input.source ?? template.source ?? 'spectora_html_text',
          sourceFileName: template.sourceFileName ?? null,
          isSynthetic: input.isSynthetic ?? false,
          importSummary: {
            importedAt: new Date().toISOString(),
            totals: report.totals,
            columns: report.columns,
            unknownColumns: report.unknownColumns,
            warningCount: warnings.length,
            warnings: warnings.slice(0, 200), // audit snapshot; pathological files are capped
          },
        },
      });

      for (const section of template.sections) {
        const createdSection = await tx.section.create({
          data: {
            templateId: created.id,
            name: section.name,
            position: section.position,
          },
        });
        for (const item of section.items) {
          const createdItem = await tx.item.create({
            data: {
              sectionId: createdSection.id,
              name: item.name,
              position: item.position,
            },
          });
          // Comments with no position need one — the parser always assigns
          // encounter-order positions, but guard against hand-built IR.
          let autoPosition = 0;
          for (const comment of item.comments) {
            await tx.comment.create({
              data: {
                itemId: createdItem.id,
                name: comment.name,
                text: comment.text,
                type: comment.type,
                category: comment.category,
                position: comment.position ?? autoPosition,
                extra: comment.extra && Object.keys(comment.extra).length > 0 ? comment.extra : undefined,
              },
            });
            autoPosition++;
          }
        }
      }

      return { id: created.id, name: created.name };
    });
  } catch (e) {
    if (e instanceof ImportServiceError) throw e;
    throw new ImportServiceError(
      'PERSIST_FAILED',
      `The template could not be saved: ${e instanceof Error ? e.message : 'unknown database error'} — nothing was committed.`
    );
  }
}
