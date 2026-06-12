-- CreateTable
CREATE TABLE "club_slug_aliases" (
    "slug" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_slug_aliases_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "club_slug_aliases_club_id_idx" ON "club_slug_aliases"("club_id");

-- AddForeignKey
ALTER TABLE "club_slug_aliases" ADD CONSTRAINT "club_slug_aliases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
