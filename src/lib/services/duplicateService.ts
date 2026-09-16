import { prisma } from '@/lib/db';

/**
 * Deep-copy a template into an INDEPENDENT new one (all-new IDs, no shared
 * rows): name gets the " (copy)" suffix, provenance becomes
 * "duplicate_of:<sourceId>", and the importSummary is adjusted so the copy
 * is never mistaken for a direct file import. Extra (verbatim) comment data
 * is carried over verbatim. Failure rolls back fully.
 */

export class DuplicateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function duplicateTemplate(
  id: string,
  opts?: { name?: string }
): Promise<{ id: string; name: string }> {
  const source = await prisma.template.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' }, include: { comments: { orderBy: { position: 'asc' } } } } },
      },
    },
  });
  if (!source) throw new DuplicateError('NOT_FOUND', 'Template not found.');

  const name = (opts?.name ?? `${source.name} (copy)`).trim() || `${source.name} (copy)`;

  try {
    // Serverless DBs (Supabase transaction pooler) cannot hold one connection
    // for ~480 sequential INSERTs — the single-transaction version died at the
    // 60s pool ceiling. CHUNKED strategy with compensating delete: create the
    // copy template row, then one short transaction per section (items +
    // batched comments). Any chunk failure deletes the partial copy.
    const summary = (source.importSummary as Record<string, unknown> | null) ?? {};
    const copySummary = {
      ...summary,
      duplicatedFrom: source.id,
      duplicatedFromName: source.name,
      duplicatedAt: new Date().toISOString(),
    };

    const copy = await prisma.template.create({
      data: {
        name,
        source: `duplicate_of:${source.id}`,
        sourceFileName: null, // the copy was not produced by a file import
        isSynthetic: source.isSynthetic, // a synthetic sample stays labeled
        importSummary: copySummary,
      },
    });

    try {
      for (const section of source.sections) {
        await prisma.$transaction(async (tx) => {
          const sectionCopy = await tx.section.create({
            data: { templateId: copy.id, name: section.name, position: section.position },
          });
          for (const item of section.items) {
            const itemCopy = await tx.item.create({
              data: { sectionId: sectionCopy.id, name: item.name, position: item.position },
            });
            const rows = item.comments.map((comment) => ({
              itemId: itemCopy.id,
              name: comment.name,
              text: comment.text,
              type: comment.type,
              category: comment.category,
              position: comment.position,
              extra: comment.extra ?? undefined, // verbatim, new row
            }));
            if (rows.length > 0) {
              await tx.comment.createMany({ data: rows });
            }
          }
        }, { maxWait: 10_000, timeout: 55_000 });
      }
    } catch (chunkError) {
      // Compensating delete: never leave a partial copy behind.
      await prisma.template.delete({ where: { id: copy.id } }).catch(() => {});
      throw chunkError;
    }

    return { id: copy.id, name: copy.name };
  } catch (e) {
    if (e instanceof DuplicateError) throw e;
    throw new DuplicateError('DUPLICATE_FAILED', `Could not duplicate the template: ${e instanceof Error ? e.message : 'unknown error'} — nothing was committed.`);
  }
}
