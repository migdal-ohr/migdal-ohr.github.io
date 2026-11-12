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
  name: "list_potentials",
  title: "List potential students",
  description: "List potential (prospective) students in the CRM.",
  inputSchema: {
    includeConverted: z.boolean().optional().describe("Include potentials already converted to families (default false)."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ includeConverted, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = client(ctx)
      .from("potentials")
      .select("id, full_name, id_number, date_of_birth, grade, source, converted, converted_family_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (!includeConverted) q = q.eq("converted", false);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { potentials: data ?? [] },
    };
  },
});
