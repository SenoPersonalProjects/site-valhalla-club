-- Logout revokes all previously issued access tokens for the user.
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
