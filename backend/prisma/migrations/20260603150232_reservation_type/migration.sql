-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('COURT', 'COACHING', 'TOURNAMENT', 'EVENT');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "type" "ReservationType" NOT NULL DEFAULT 'COURT';
