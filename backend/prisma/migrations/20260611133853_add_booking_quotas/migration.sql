-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "booking_quotas" JSONB;

-- CreateIndex
CREATE INDEX "reservations_user_id_start_time_idx" ON "reservations"("user_id", "start_time");
