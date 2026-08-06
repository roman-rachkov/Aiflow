-- AlterTable
ALTER TABLE "ProjectMeta" ADD COLUMN     "giteaOwner" TEXT,
ADD COLUMN     "giteaRepo" TEXT,
ADD COLUMN     "giteaDefaultBranch" TEXT NOT NULL DEFAULT 'main';

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeta_giteaOwner_giteaRepo_key" ON "ProjectMeta"("giteaOwner", "giteaRepo");
