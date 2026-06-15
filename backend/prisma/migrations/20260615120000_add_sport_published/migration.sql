-- Disponibilité d'un sport aux clubs. Nouveaux sports = brouillon (false) ;
-- les sports déjà présents restent disponibles (backfill true).
ALTER TABLE "sports" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
UPDATE "sports" SET "published" = true;
