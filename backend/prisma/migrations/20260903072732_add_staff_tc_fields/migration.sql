-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "tc_no_encrypted" BYTEA,
ADD COLUMN     "tc_no_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_tc_no_hash_key" ON "staff_profiles"("tc_no_hash");
