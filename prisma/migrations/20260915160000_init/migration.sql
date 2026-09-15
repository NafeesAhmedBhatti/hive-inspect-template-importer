-- Hive Inspect — Template Importer · initial schema
-- Template → Section → Item → Comment with positional ordering,
-- cascade deletes, and composite (parent, position) indexes.
-- Rendered from prisma/schema.prisma (Prisma 5 · PostgreSQL).

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'spectora_html_text',
    "source_file_name" TEXT,
    "import_summary" JSONB,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "category" INTEGER,
    "position" INTEGER NOT NULL,
    "extra" JSONB,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sections_template_id_position_idx" ON "sections"("template_id", "position");

-- CreateIndex
CREATE INDEX "items_section_id_position_idx" ON "items"("section_id", "position");

-- CreateIndex
CREATE INDEX "comments_item_id_position_idx" ON "comments"("item_id", "position");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
