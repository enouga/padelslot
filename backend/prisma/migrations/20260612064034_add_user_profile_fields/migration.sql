-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "locale" TEXT DEFAULT 'fr';
