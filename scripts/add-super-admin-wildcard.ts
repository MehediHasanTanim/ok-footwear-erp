import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();

async function main() {
  // Upsert the *:* wildcard permission
  const wildcard = await prisma.permission.upsert({
    where: { module_action: { module: "*", action: "*" } },
    create: { module: "*", action: "*", description: "Super Admin wildcard — bypasses all permission checks" },
    update: {},
  });
  console.log("Wildcard permission:", wildcard.module + ":" + wildcard.action);

  // Assign to Super Admin role
  const superAdmin = await prisma.role.findUnique({ where: { name: "Super Admin" } });
  if (!superAdmin) { console.error("Super Admin role not found"); return; }

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: wildcard.id } },
    create: { roleId: superAdmin.id, permissionId: wildcard.id },
    update: {},
  });

  console.log("Assigned *:* to Super Admin role");

  // Invalidate Redis permission cache for all Super Admin users
  // so the wildcard takes effect immediately on next login
  try {
    const redisUrl = process.env["REDIS_URL"] || "redis://localhost:7379";
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
    await redis.connect();

    const superAdminUsers = await prisma.userRole.findMany({
      where: { roleId: superAdmin.id },
      select: { userId: true },
    });

    for (const { userId } of superAdminUsers) {
      await redis.del(`permissions:${userId}`);
      console.log(`Invalidated permission cache for user ${userId}`);
    }
    redis.disconnect();
  } catch (err) {
    console.warn("Could not invalidate Redis cache (Redis may be unreachable):", (err as Error).message);
    console.warn("Permissions will take effect after cache TTL (5 min) or next login.");
  }

  console.log("\nSuper Admin now bypasses ALL RBAC checks via *:* wildcard.");
  console.log("Re-login to get a new JWT with the wildcard permission.");
  await prisma.$disconnect();
}
main();
