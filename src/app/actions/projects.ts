"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

const ProjectSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(2),
  address: z.string().optional().default(""),
});

/** Manual project creation for an existing customer (no lead in the chain). */
export async function createProject(form: FormData) {
  const user = await requireUser();
  const data = ProjectSchema.parse(Object.fromEntries(form));

  const projectId = await withTenant({ tenantId: user.tenantId, scope: "tenant" }, async ({ raw: sql }) => {
    const [row] = await sql`
      insert into projects (tenant_id, customer_id, name, address, status)
      values (${user.tenantId}, ${data.customerId}, ${data.name}, ${data.address || null}, 'active')
      returning id`;
    return row.id as string;
  });

  await audit(user.tenantId, user.id, "project", projectId, "create");
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

const STATUSES = ["active", "on_hold", "completed", "cancelled"] as const;

export async function updateProjectStatus(projectId: string, status: (typeof STATUSES)[number]) {
  const user = await requireUser();

  await withTenant({ tenantId: user.tenantId, scope: user.scope }, async ({ raw: sql }) => {
    await sql`update projects set status = ${status} where id = ${projectId}`;
  });

  await audit(user.tenantId, user.id, "project", projectId, `status:${status}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}
