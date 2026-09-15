# Hive Inspect — Template Importer · Database Schema

PostgreSQL via Prisma. Written for Supabase Postgres from day one (jsonb, no MySQL-only types).
Local dev uses the container's Postgres with an identical schema.

## Prisma models

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Template {
  id             String   @id @default(cuid())
  name           String
  source         String   @default("spectora_html_text") // provenance
  sourceFileName String?                                  // original .xlsx filename
  importSummary  Json?    // snapshot: counts, warning list, report digest at import time
  isSynthetic    Boolean  @default(false) // true only for clearly-labeled demo seeds
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  sections       Section[]
  @@map("templates")
}

model Section {
  id         String   @id @default(cuid())
  templateId String
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  name       String
  position   Int
  items      Item[]
  @@index([templateId, position])
  @@map("sections")
}

model Item {
  id        String  @id @default(cuid())
  sectionId String
  section   Section @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  name      String
  position  Int
  comments  Comment[]
  @@index([sectionId, position])
  @@map("items")
}

model Comment {
  id       String  @id @default(cuid())
  itemId   String
  item     Item    @relation(fields: [itemId], references: [id], onDelete: Cascade)
  name     String?
  text     String  // raw HTML from HTML-text export, preserved verbatim; sanitized at render
  type     String  @default("info") // info | limit | defect | unknown
  category Int?    // -1 low | 0 med | 1 high
  position Int
  extra    Json?   // every other populated Spectora column, verbatim (key = canonical column)
  @@index([itemId, position])
  @@map("comments")
}
```

## Design notes

- **Hierarchy & ordering**: single `position` Int per level, assigned in spreadsheet encounter
  order (or `Order (w/i item)` where populated). Composite indexes `(parent, position)` for
  ordered tree reads.
- **Never-opaque storage**: the template is fully relational; only `extra` (per-comment column
  map) and `importSummary` (audit snapshot) are jsonb — both are queryable and surfaced in the UI.
- **Faithful rich text**: `text` keeps exactly what Spectora exported. Sanitization happens at
  render time only, so the stored data remains the faithful source of truth.
- **Duplication**: deep copy creates new rows for template/sections/items/comments with new IDs,
  copying `extra` verbatim. Independence is guaranteed structurally (no shared rows) and verified
  by tests.
- **Cascade deletes** from Template down; duplication never touches the original.

## Column mapping (canonical Spectora HTML-text export, per official docs)

First-class (editable): Section Name → Section.name · Item Name → Item.name ·
Comment Name → Comment.name · Comment Text → Comment.text · Comment Type → Comment.type ·
Category → Comment.category · Order (w/i item) → ordering input.

Stored verbatim in `Comment.extra`: Multiple Choice Options, Unit Type Options, Recommendation,
Answer Type, Default Value, Default Value 2, Default Unit Type, Default Location,
Default Estimate Min/Max, Locked, Simple Format, Disable Photos, Uses,
Default Photo 1–3 (+ captions), Last Modified — each reported as *present but not first-class*.
Columns absent from the file (or entirely empty) are reported as *absent in source* — never as lost.
