import { z } from "zod";

const uuid = z.guid();

const staffFields = {
  fullName: z.string().trim().min(2, "Enter the staff member's full name.").max(120),
  email: z.email("Enter a valid work email address.").max(254),
  role: z.enum(["manager", "warehouse_team"]),
  location: z.string().trim().min(2, "Choose a location.").max(240),
  warehouseIds: z.array(uuid).max(50),
  gender: z.enum(["Male", "Female", "Prefer not to say"]).default("Prefer not to say"),
  dateOfBirth: z.union([z.iso.date(), z.literal("")]).default(""),
};

function requireWarehouseAccess(
  staff: { role: "manager" | "warehouse_team"; warehouseIds: string[] },
  context: z.core.$RefinementCtx,
) {
  if (staff.role === "warehouse_team" && staff.warehouseIds.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["warehouseIds"],
      message: "Choose at least one warehouse for a team member.",
    });
  }
}

export const createStaffInputSchema = z.object(staffFields).superRefine(requireWarehouseAccess);

export const saveStaffInputSchema = z.object({
  id: uuid.optional(),
  ...staffFields,
}).superRefine(requireWarehouseAccess);

export function normalizeStaffInput<T extends z.infer<typeof createStaffInputSchema>>(staff: T): T {
  return {
    ...staff,
    email: staff.email.trim().toLowerCase(),
    warehouseIds: staff.role === "manager" ? [] : [...new Set(staff.warehouseIds)],
  };
}

export function staffPersistenceError(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === "23505") {
    return "A staff profile already uses this email address. Edit or restore that member instead.";
  }
  return error?.message || "The staff profile could not be saved.";
}

export function staffInvitationError(error: { message?: string } | null | undefined) {
  const detail = error?.message?.trim();
  if (!detail) return "Supabase could not send the invitation.";
  if (/already (been )?registered|already exists|email.*taken/i.test(detail)) {
    return "A Supabase login already exists for this email address.";
  }
  if (/rate limit/i.test(detail)) {
    return "Supabase's email rate limit was reached.";
  }
  return detail;
}

export function staffInvitationCanRetry(error: { message?: string } | null | undefined) {
  return !/already (been )?registered|already exists|email.*taken/i.test(error?.message ?? "");
}
