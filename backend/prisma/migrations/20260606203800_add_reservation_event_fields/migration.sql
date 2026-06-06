-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "title" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;
