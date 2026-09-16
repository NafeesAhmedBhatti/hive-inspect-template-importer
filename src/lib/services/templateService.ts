import { prisma } from '@/lib/db';

/**
 * Template library reads: ordered tree fetch, field updates, delete.
 * Ordering always comes from (parent position) composite order.
 */

export interface TemplateTreeNode {
  id: string;
  /** Comment Name — nullable (some exports carry text only). */
  name: string | null;
  commentType: string;
  category: number | null;
  text: string;
  position: number;
  extra: Record<string, string> | null;
}

export interface TemplateTreeItem {
  id: string;
  name: string;
  position: number;
  comments: TemplateTreeNode[];
}

export interface TemplateTreeSection {
  id: string;
  name: string;
  position: number;
  items: TemplateTreeItem[];
}

export interface TemplateTree {
  id: string;
  name: string;
  source: string;
  sourceFileName: string | null;
  isSynthetic: boolean;
  importSummary: unknown;
  createdAt: Date;
  updatedAt: Date;
  counts: { sections: number; items: number; comments: number };
  sections: TemplateTreeSection[];
}

export async function getTemplateTree(id: string): Promise<TemplateTree | null> {
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: {
              comments: { orderBy: { position: 'asc' } },
            },
          },
        },
      },
    },
  });
  if (!template) return null;

  let items = 0;
  let comments = 0;
  const sections: TemplateTreeSection[] = template.sections.map((s) => {
    items += s.items.length;
    return {
      id: s.id,
      name: s.name,
      position: s.position,
      items: s.items.map((i) => {
        comments += i.comments.length;
        return {
          id: i.id,
          name: i.name,
          position: i.position,
          comments: i.comments.map((c) => ({
            id: c.id,
            name: c.name,
            commentType: c.type,
            category: c.category,
            text: c.text,
            position: c.position,
            extra: (c.extra as Record<string, string> | null) ?? null,
          })),
        };
      }),
    };
  });

  return {
    id: template.id,
    name: template.name,
    source: template.source,
    sourceFileName: template.sourceFileName,
    isSynthetic: template.isSynthetic,
    importSummary: template.importSummary,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    counts: { sections: template.sections.length, items, comments },
    sections,
  };
}

export interface TemplateListItem {
  id: string;
  name: string;
  source: string;
  sourceFileName: string | null;
  isSynthetic: boolean;
  createdAt: Date;
  updatedAt: Date;
  counts: { sections: number; items: number; comments: number };
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const templates = await prisma.template.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  // Items and comments hang off sections, so a single join query produces
  // accurate per-template counts for all three levels. NOTE: identifiers are
  // case-sensitive in Postgres — always double-quote the camelCase names.
  const counts = await prisma.$queryRaw<{
    templateid: string;
    sections: bigint;
    items: bigint;
    comments: bigint;
  }[]>`
    SELECT t.id AS templateid,
           COUNT(DISTINCT sec.id) AS sections,
           COUNT(DISTINCT it.id)  AS items,
           COUNT(c.id)            AS comments
    FROM templates t
    LEFT JOIN sections sec ON sec."template_id" = t.id
    LEFT JOIN items    it  ON it."section_id"  = sec.id
    LEFT JOIN comments c   ON c."item_id"      = it.id
    GROUP BY t.id
  `;
  const countMap = new Map(counts.map((r) => [r.templateid, r]));

  return templates.map((t) => {
    const c = countMap.get(t.id);
    return {
      id: t.id,
      name: t.name,
      source: t.source,
      sourceFileName: t.sourceFileName,
      isSynthetic: t.isSynthetic,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      counts: {
        sections: Number(c?.sections ?? 0),
        items: Number(c?.items ?? 0),
        comments: Number(c?.comments ?? 0),
      },
    };
  });
}

export async function renameTemplate(id: string, name: string): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, code: 'EMPTY_NAME', message: 'Template name cannot be empty.' };
  if (trimmed.length > 500) return { ok: false, code: 'NAME_TOO_LONG', message: 'Template name is limited to 500 characters.' };
  const existing = await prisma.template.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, code: 'NOT_FOUND', message: 'Template not found.' };
  await prisma.template.update({ where: { id }, data: { name: trimmed } });
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<void> {
  await prisma.template.delete({ where: { id } }); // cascades to sections/items/comments
}
