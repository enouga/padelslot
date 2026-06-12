-- AlterTable
ALTER TABLE "sponsors" ADD COLUMN     "offer_until" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;
