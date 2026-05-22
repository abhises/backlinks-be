-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "websiteName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "niche" TEXT,
    "country" TEXT,
    "language" TEXT,
    "monthlyTraffic" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "giverWorkspaceId" TEXT NOT NULL,
    "receiverWorkspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeThread_giverWorkspaceId_fkey" FOREIGN KEY ("giverWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeThread_receiverWorkspaceId_fkey" FOREIGN KEY ("receiverWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ExchangeThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT,
    "giverWorkspaceId" TEXT NOT NULL,
    "receiverWorkspaceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "datePlaced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkPlacement_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ExchangeThread" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LinkPlacement_giverWorkspaceId_fkey" FOREIGN KEY ("giverWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LinkPlacement_receiverWorkspaceId_fkey" FOREIGN KEY ("receiverWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_domain_key" ON "Workspace"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_workspaceId_key" ON "TeamMember"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPlacement_threadId_key" ON "LinkPlacement"("threadId");
