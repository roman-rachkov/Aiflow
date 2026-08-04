-- AlterEnum
BEGIN;
CREATE TYPE "ProjectStatus_new" AS ENUM ('ACTIVE', 'ARCHIVED');
ALTER TABLE "ProjectMeta" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProjectMeta" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING ("status"::text::"ProjectStatus_new");
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
DROP TYPE "ProjectStatus_old";
ALTER TABLE "ProjectMeta" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "DeploymentMeta" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectMeta" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProjectMeta_deletedAt_idx" ON "ProjectMeta"("deletedAt");

