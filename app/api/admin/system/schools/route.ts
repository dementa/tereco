import { NextRequest } from "next/server";
import { z } from "zod";
import { listSchools, createSchool } from "@/lib/entities/schools";
import { createClass } from "@/lib/entities/classes";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const schools = await listSchools();
    return successResponse({ data: schools });
  } catch (error) {
    console.error("Error listing schools:", error);
    return errorResponse("Failed to list schools", 500);
  }
}

// contactPerson/contactNumber are gone: the contact is a real staff profile
// (schools.contact_profile_id), set once that person has an account.
const CreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  joinedOn: z.string().optional(),
  // Which rungs of the fixed P.1-P.7 ladder this school actually runs, with an
  // optional label for schools that call them something else (J1, ELITE).
  classes: z
    .array(
      z.object({
        level: z.number().int().min(1).max(7).nullable().optional(),
        alias: z.string().optional(),
        hasStreams: z.boolean().default(false),
      })
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const { classes, ...schoolInput } = validated;
    const school = await createSchool({ ...schoolInput, createdBy: profile.id });

    // Classes are created with the school, so a new school is immediately
    // usable rather than an empty shell someone must remember to fill in.
    for (const entry of classes ?? []) {
      await createClass({
        schoolId: school.id,
        level: entry.level ?? null,
        alias: entry.alias ?? null,
        hasStreams: entry.hasStreams,
        createdBy: profile.id,
      });
    }

    return successResponse({ data: school });
  } catch (error) {
    return handleApiError(error, "Failed to create school");
  }
}
