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
  name: "get_family",
  title: "Get family",
  description: "Fetch a single family record (with all fields and appointments) by family id.",
  inputSchema: {
    id: z.string().min(1).describe("Family id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = client(ctx);
    const { data: family, error } = await sb
      .from("families")
      .select("id, data, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!family) return { content: [{ type: "text", text: "Family not found" }], isError: true };
    const { data: appointments } = await sb
      .from("appointments")
      .select("id, date, type, created_at")
      .eq("family_id", id)
      .order("date", { ascending: false });
    const payload = { ...family, appointments: appointments ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
