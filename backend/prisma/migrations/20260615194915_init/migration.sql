-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('equal', 'exact', 'percentage', 'shares');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'REVIEWING', 'CONFIRMED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnomalyResolution" AS ENUM ('PENDING', 'DELETE', 'KEEP', 'MERGE', 'OVERRIDE', 'SKIP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "amount_inr" DECIMAL(12,2) NOT NULL,
    "exchange_rate_used" DECIMAL(10,4),
    "split_type" "SplitType" NOT NULL,
    "paid_by" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "import_row_id" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurring_interval" TEXT,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "share_amount" DECIMAL(12,2) NOT NULL,
    "share_pct" DECIMAL(6,3),
    "share_units" INTEGER,

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "from_user" TEXT NOT NULL,
    "to_user" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sessions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "report_json" JSONB,

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_anomalies" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_row" JSONB NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "anomaly_detail" TEXT NOT NULL,
    "resolution" "AnomalyResolution" NOT NULL DEFAULT 'PENDING',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "override_data" JSONB,

    CONSTRAINT "import_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_cache" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_key" ON "group_memberships"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_splits_expense_id_user_id_key" ON "expense_splits"("expense_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_cache_date_from_currency_to_currency_key" ON "exchange_rate_cache"("date", "from_currency", "to_currency");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
