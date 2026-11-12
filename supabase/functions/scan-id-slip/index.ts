import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Child {
  fullName: string;
  idNumber: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender?: string;
}

const MAX_PAGES = 12;
const MAX_TOTAL_BASE64 = 25 * 1024 * 1024; // ~18MB of images

/** Israeli ID (Teudat Zehut) check digit validation. */
const isValidIsraeliId = (raw: string): boolean => {
  const id = (raw || '').replace(/\D/g, '');
  if (id.length < 5 || id.length > 9) return false;
  const padded = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Require authenticated caller (staff) to prevent unauthenticated AI quota abuse.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims || claimsData.claims.role !== 'authenticated') {
      return json({ error: 'Unauthorized' }, 401);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const body = await req.json();
    const mimeType: string = body.mimeType || 'image/jpeg';
    const images: string[] = Array.isArray(body.images) && body.images.length > 0
      ? body.images
      : (body.imageBase64 ? [body.imageBase64] : []);

    if (images.length === 0) return json({ error: 'images or imageBase64 required' }, 400);
    if (images.length > MAX_PAGES) return json({ error: `עד ${MAX_PAGES} עמודים בקובץ אחד` }, 413);
    const total = images.reduce((s, b) => s + (b?.length ?? 0), 0);
    if (total > MAX_TOTAL_BASE64) return json({ error: 'הקובץ גדול מדי לסריקה' }, 413);

    const imageParts = images.map((b64) => ({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${b64}` },
    }));

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You are a strict, dumb OCR machine. DO NOT guess, infer, or autocomplete Hebrew names. Read the pixels exactly. Do not invent names under any circumstances.',
              'Your only job is raw visual OCR from Israeli ID appendix documents (ספח תעודת זהות). Prioritize exact printed text extraction over language-model reasoning.',
              '',
              'CRITICAL LAYOUT RULES — READ CAREFULLY:',
              '1. The document contains a GRID of distinct child BLOCKS arranged in TWO COLUMNS (a right column and a left column, since the document is Hebrew RTL). Each block is a self-contained rectangle that holds ONE child\'s data.',
              '2. Each block contains exact printed key-value labels. Within EACH block, explicitly locate these labels and extract ONLY the value next to the same label in the same physical block:',
              '   - "שם הפרטי" -> first name / Hebrew name value. Copy the visible Hebrew letters exactly as printed.',
              '   - "מספר זהות" -> 9-digit ID number value.',
              '   - "תאריך לידה" -> date of birth value, converted to YYYY-MM-DD when clearly readable.',
              '   - "מין" -> gender value, exactly "זכר" or "נקבה" when printed.',
              '3. You MUST extract Name + ID + DOB + Gender from the EXACT SAME physical block. It is STRICTLY FORBIDDEN to combine a name from one block/column with an ID, DOB, or Gender from a different block/column. If you are not 100% sure two fields belong to the same block, leave the uncertain field empty rather than guessing.',
              '4. Process blocks one at a time. Visually isolate the block boundaries (borders, spacing, alignment) before reading the text inside it.',
              '',
              'HEBREW READING RULES:',
              '5. Read the Hebrew letters EXACTLY as printed. Do NOT invent, guess, infer, autocomplete, autocorrect, normalize, or substitute a more common Hebrew name. If the name field is blurry, copy only the visible letters or use an empty string. Never create a plausible name from context.',
              '6. Forbidden hallucination examples: do NOT output "יואל" when the document shows "יסכה"; do NOT output "יוחנן אליפז" unless those exact letters are visibly printed in the "שם הפרטי" value of that same block.',
              '7. A correct ID number or date of birth does NOT justify guessing the name. If the name is not clearly readable, fullName must be an empty string.',
              '8. Do not translate or transliterate. Keep the original Hebrew spelling.',
              '',
              'COMPLETENESS RULES:',
              '9. Scan EVERY block across ALL provided page images. Do not skip any child, even if the row looks partial or continues on another page.',
              '10. Extract ALL children exactly as printed, including adults and infants. DO NOT filter by age. Gender filtering is performed by backend code after extraction.',
              '',
              'OUTPUT: Return ONLY strict JSON. No prose, no markdown. Use this exact shape: {"children":[{"fullName":"","idNumber":"","dateOfBirth":"YYYY-MM-DD","gender":"זכר"}]}. Use empty strings for unreadable fields.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Perform strict OCR on every child block from these Israeli ID appendix pages. For EACH self-contained block, look for the exact labels "שם הפרטי", "מספר זהות", "תאריך לידה", and "מין", then extract only the value printed beside each label in that SAME block. Never mix columns or blocks. Never guess or autocomplete Hebrew names; if the printed name is not clearly readable, use an empty string. Return strictly as JSON: {"children":[{"fullName":"<Hebrew letters exactly as printed beside שם הפרטי>","idNumber":"<9 digits beside מספר זהות>","dateOfBirth":"YYYY-MM-DD from תאריך לידה>","gender":"זכר or נקבה from מין"}]}. Include EVERY block on EVERY page before any filtering.',
              },
              ...imageParts,
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) return json({ error: 'יותר מדי סריקות ברגע זה — נסו שוב בעוד דקה' }, 429);
      if (aiRes.status === 402) return json({ error: 'נגמרה מכסת ה-AI בחשבון Lovable' }, 402);
      return json({ error: `AI gateway ${aiRes.status}: ${text.slice(0, 300)}` }, 502);
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson.choices?.[0]?.message?.content ?? '{}';
    let parsed: { children?: Child[] } = {};
    try {
      parsed = JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim());
    } catch {
      parsed = {};
    }
    const children = Array.isArray(parsed.children) ? parsed.children : [];
    const boysOnly = children
      .filter((child) => (child.gender || '').trim() === 'זכר')
      .map((c) => ({
        fullName: (c.fullName || '').trim(),
        idNumber: (c.idNumber || '').replace(/\D/g, ''),
        dateOfBirth: (c.dateOfBirth || '').trim(),
        idValid: isValidIsraeliId(c.idNumber || ''),
      }));

    return json({ children: boysOnly, totalDetected: children.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});
