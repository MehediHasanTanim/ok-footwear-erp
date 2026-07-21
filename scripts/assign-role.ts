import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "admin@okfootwear.com" } });
  if (!user) { console.error("User not found"); return; }

  let role = await prisma.role.findUnique({ where: { name: "Super Admin" } });
  if (!role) {
    role = await prisma.role.create({
      data: { name: "Super Admin", description: "Full system access, user/role management, audit log access", isSystem: true }
    });
    console.log("Created Super Admin role:", role.id);
  }

  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: role.id } }
  });

  if (existing) {
    console.log("Already has Super Admin role. No changes needed.");
  } else {
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    console.log("Assigned Super Admin role to admin@okfootwear.com");
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: true }
  });
  console.log("\nCurrent roles for", user.email + ":");
  userRoles.forEach(ur => console.log("  -", ur.role.name, ur.role.isSystem ? "(system)" : ""));

  await prisma.$disconnect();
}
main();
