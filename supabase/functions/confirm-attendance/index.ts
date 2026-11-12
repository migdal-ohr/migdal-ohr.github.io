// DEPRECATED (v2): RSVP now goes through the token-based `submit_rsvp` RPC.
// The old endpoint accepted a guessable studentId and let anyone change any
// family's RSVP. It is kept only to answer old links gracefully.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "gone", message: "קישור ישן — נא לפנות למזכירות" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
