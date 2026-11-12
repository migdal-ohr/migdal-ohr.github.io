import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "create_potential",
  title: "Create potential student",
  description: "Add a prospective (potential) student to the CRM.",
  inputSchema: {
    fullName: z.string().trim().min(1).describe("Full name in Hebrew."),
    dateOfBirth: z.string().describe("Date of birth as YYYY-MM-DD."),
    grade: z.number().int().min(1).max(12).describe("Grade (1-12)."),
    idNumber: z.string().optional().describe("Israeli ID number, optional."),
    source: z.string().optional().describe("Lead source, optional."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ fullName, dateOfBirth, grade, idNumber, source }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await client(ctx)
      .from("potentials")
      .insert({
        full_name: fullName,
        date_of_birth: dateOfBirth,
        grade,
        id_number: idNumber ?? null,
        source: source ?? null,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { potential: data },
    };
  },
});
