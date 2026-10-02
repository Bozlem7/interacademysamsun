-- CreateEnum
CREATE TYPE "FinanceTransactionType" AS ENUM ('gelir', 'gider');

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "student_id" TEXT,
    "payment_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_payment_id_key" ON "finance_transactions"("payment_id");

-- CreateIndex
CREATE INDEX "finance_transactions_transaction_date_idx" ON "finance_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "finance_transactions_created_by_idx" ON "finance_transactions"("created_by");

-- CreateIndex
CREATE INDEX "finance_transactions_type_idx" ON "finance_transactions"("type");

-- CreateIndex
CREATE INDEX "finance_transactions_student_id_idx" ON "finance_transactions"("student_id");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: Prisma şeması bunu modelleyemiyor (triggers.sql'deki yaklaşımla aynı mantık) —
-- veritabanı seviyesinde pozitif tutar garantisi, uygulama katmanındaki validasyona ek savunma.
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_amount_positive" CHECK ("amount" > 0);
