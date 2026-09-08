-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('yonetici', 'egitmen', 'veli');

-- CreateEnum
CREATE TYPE "StaffSpecialty" AS ENUM ('antrenor', 'diyetisyen', 'psikolog');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('psikolog_gorusu', 'diyetisyen_gorusu', 'antrenor_gorusu');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('saha', 'diyet', 'psikolog');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('var', 'yok');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('odenmedi', 'odendi');

-- CreateEnum
CREATE TYPE "PreRegStatus" AS ENUM ('beklemede', 'onaylandi', 'reddedildi');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('text', 'image');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('erkek', 'kiz');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "specialty" "StaffSpecialty" NOT NULL,
    "meta_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age_range" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tc_no_encrypted" BYTEA NOT NULL,
    "tc_no_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "gender" "Gender",
    "blood_type" TEXT,
    "height_cm" INTEGER,
    "weight_kg" INTEGER,
    "email" TEXT,
    "address" TEXT,
    "photo_url" TEXT,
    "mother_name" TEXT,
    "mother_phone" TEXT,
    "mother_job" TEXT,
    "father_name" TEXT,
    "father_phone" TEXT,
    "father_job" TEXT,
    "emergency_name" TEXT,
    "emergency_phone" TEXT,
    "group_id" TEXT,
    "parent_user_id" TEXT,
    "payment_due_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_students" (
    "instructor_user_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_students_pkey" PRIMARY KEY ("instructor_user_id","student_id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME,
    "session_type" "SessionType" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT,
    "session_date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "marked_by" TEXT,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "author_id" TEXT,
    "category" "NoteCategory" NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "due_day" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 3500.00,
    "status" "PaymentStatus" NOT NULL DEFAULT 'odenmedi',
    "paid_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "overdue_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "monthly_fee" DECIMAL(10,2) NOT NULL DEFAULT 3500.00,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "fee_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_registrations" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "tc_no_encrypted" BYTEA NOT NULL,
    "tc_no_hash" TEXT NOT NULL,
    "gender" "Gender",
    "dob" DATE,
    "age_group" TEXT,
    "parent_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "il" TEXT,
    "ilce" TEXT,
    "status" "PreRegStatus" NOT NULL DEFAULT 'beklemede',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "converted_student_id" TEXT,

    CONSTRAINT "pre_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publish_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_content_blocks" (
    "id" TEXT NOT NULL,
    "block_key" TEXT NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "value" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "site_content_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_slides" (
    "id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE INDEX "staff_profiles_specialty_idx" ON "staff_profiles"("specialty");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "students_tc_no_hash_key" ON "students"("tc_no_hash");

-- CreateIndex
CREATE UNIQUE INDEX "students_parent_user_id_key" ON "students"("parent_user_id");

-- CreateIndex
CREATE INDEX "students_group_id_idx" ON "students"("group_id");

-- CreateIndex
CREATE INDEX "instructor_students_student_id_idx" ON "instructor_students"("student_id");

-- CreateIndex
CREATE INDEX "training_sessions_group_id_idx" ON "training_sessions"("group_id");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_session_date_idx" ON "attendance_records"("student_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_student_id_session_date_session_id_key" ON "attendance_records"("student_id", "session_date", "session_id");

-- CreateIndex
CREATE INDEX "student_notes_student_id_period_year_period_month_idx" ON "student_notes"("student_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "student_notes_category_idx" ON "student_notes"("category");

-- CreateIndex
CREATE INDEX "payments_period_year_period_month_due_day_idx" ON "payments"("period_year", "period_month", "due_day");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_student_id_period_year_period_month_key" ON "payments"("student_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "pre_registrations_converted_student_id_key" ON "pre_registrations"("converted_student_id");

-- CreateIndex
CREATE INDEX "pre_registrations_status_idx" ON "pre_registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_blocks_block_key_key" ON "site_content_blocks"("block_key");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_students" ADD CONSTRAINT "instructor_students_instructor_user_id_fkey" FOREIGN KEY ("instructor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_students" ADD CONSTRAINT "instructor_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_settings" ADD CONSTRAINT "fee_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_content_blocks" ADD CONSTRAINT "site_content_blocks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
