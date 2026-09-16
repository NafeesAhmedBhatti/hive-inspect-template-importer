import { prisma } from '@/lib/db';

/**
 * Field-level mutations for the editor. Each mutator validates input and
 * throws EditorError with a stable code; API routes map codes to HTTP.
 */

export class EditorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function requireSection(id: string) {
  const section = await prisma.section.findUnique({ where: { id } });
  if (!section) throw new EditorError('NOT_FOUND', 'Section not found.');
  return section;
}

async function requireItem(id: string) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new EditorError('NOT_FOUND', 'Item not found.');
  return item;
}

async function requireComment(id: string) {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) throw new EditorError('NOT_FOUND', 'Comment not found.');
  return comment;
}

function cleanName(name: unknown, what: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new EditorError('EMPTY_NAME', `${what} name cannot be empty.`);
  }
  if (name.length > 500) throw new EditorError('NAME_TOO_LONG', `${what} name is limited to 500 characters.`);
  return name.trim();
}

export async function renameSection(id: string, name: unknown): Promise<void> {
  await requireSection(id);
  await prisma.section.update({ where: { id }, data: { name: cleanName(name, 'Section') } });
}

export async function renameItem(id: string, name: unknown): Promise<void> {
  await requireItem(id);
  await prisma.item.update({ where: { id }, data: { name: cleanName(name, 'Item') } });
}

const COMMENT_TYPES = ['info', 'limit', 'defect', 'unknown'];

export interface CommentUpdate {
  name?: string | null;
  text?: string;
  type?: string;
  category?: number | null;
}

export async function updateComment(id: string, patch: CommentUpdate): Promise<void> {
  await requireComment(id);

  const data: { name?: string | null; text?: string; type?: string; category?: number | null } = {};

  if ('name' in patch) {
    if (patch.name === null || patch.name === undefined || patch.name === '') {
      data.name = null;
    } else {
      if (typeof patch.name !== 'string') throw new EditorError('INVALID_NAME', 'Comment name must be a string.');
      data.name = patch.name.trim() || null;
    }
  }

  if ('text' in patch) {
    if (typeof patch.text !== 'string') throw new EditorError('INVALID_TEXT', 'Comment text must be a string.');
    data.text = patch.text; // stored verbatim; sanitized only at render
  }

  if ('type' in patch) {
    if (typeof patch.type !== 'string' || !COMMENT_TYPES.includes(patch.type)) {
      throw new EditorError('INVALID_TYPE', `Comment type must be one of: ${COMMENT_TYPES.join(', ')}.`);
    }
    data.type = patch.type;
  }

  if ('category' in patch) {
    if (patch.category === null || patch.category === undefined) {
      data.category = null;
    } else if (Number.isInteger(patch.category) && [-1, 0, 1].includes(patch.category)) {
      data.category = patch.category;
    } else {
      throw new EditorError('INVALID_CATEGORY', 'Category must be -1 (low), 0 (medium) or 1 (high), or empty.');
    }
  }

  await prisma.comment.update({ where: { id }, data });
}
