import supabase from '../config/supabaseClient.js';

// ─── Gemini v1 REST API ───────────────────────────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1/models';

// Models confirmed available — ordered by reliability / rate limit headroom
const GEMINI_MODELS = [
  'gemini-3.5-flash',       // lighter, higher quota headroom
  'gemini-3.8-flash',       // primary
  'gemini-3.1-flash-lite',  // lightest, almost always available
  'gemini-2.5-flash',       // extra fallback
];

// ─── Prompt ───────────────────────────────────────────────────────────────────
const buildPrompt = (title, text) => `
You are an expert AI Research Assistant. Analyze the document titled "${title}" and extract structured knowledge.

Return ONLY a valid JSON object with exactly this structure (no markdown, no extra text):

{
  "executiveSummary": "3 key findings separated by • bullet character",
  "entities": [
    { "name": "Entity name", "type": "Concept|Methodology|Organization|Person|Technology|Location", "importance": "High|Medium|Low", "description": "One sentence role in document" }
  ],
  "keyClaims": [
    { "claim": "Specific factual statement", "evidenceScore": "Strong|Moderate|Weak", "citationContext": "Direct quote or paraphrase from text", "relatedEntities": ["Entity A", "Entity B"] }
  ],
  "relationships": [
    { "source": "Entity A", "target": "Entity B", "relationship": "how they relate" }
  ]
}

Rules:
- Extract 5–15 entities, 4–10 claims, 5–12 relationships
- Entity names in relatedEntities/relationships MUST exactly match entity names
- Return ONLY the JSON object

Document:
${text.slice(0, 20000)}
`;

// ─── Parse retry-after seconds from Gemini 429 message ───────────────────────
function parseRetryAfter(msg = '') {
  const match = msg.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : 10000; // default 10s
}

// ─── Core: calls one model, returns parsed JSON or throws typed error ─────────
async function callModel(model, title, text) {
  const key = process.env.GEMINI_API_KEY;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(title, text) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    const code = json?.error?.code || res.status;
    const msg  = json?.error?.message || `HTTP ${res.status}`;
    const err  = new Error(msg);
    err.code   = code;
    throw err;
  }

  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw Object.assign(new Error('Empty response'), { code: 0 });

  return JSON.parse(raw);
}

// ─── Main: tries each model with retry on 429/503 ────────────────────────────
async function callGemini(title, text) {
  let lastError;

  for (const model of GEMINI_MODELS) {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Gemini] ${model} (attempt ${attempt})...`);
        const result = await callModel(model, title, text);
        console.log(`[Gemini] ✅ ${model} — ${result.entities?.length} entities, ${result.keyClaims?.length} claims`);
        return result;

      } catch (err) {
        const code = err.code || 0;
        const msg  = err.message || '';

        // 404 — model not available on this key tier → try next model
        if (code === 404 || msg.includes('not found')) {
          console.warn(`[Gemini] ${model}: not available (404) → next model`);
          lastError = err;
          break;
        }

        // 429 — rate limit: parse the exact retry-after and wait
        if (code === 429 || msg.includes('quota') || msg.includes('rate')) {
          const waitMs = parseRetryAfter(msg);
          if (attempt < MAX_RETRIES) {
            console.warn(`[Gemini] ${model}: rate limit (429) — waiting ${(waitMs/1000).toFixed(1)}s then retry...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn(`[Gemini] ${model}: rate limit hit ${MAX_RETRIES}x → next model`);
          lastError = err;
          break;
        }

        // 503 — overloaded: retry with backoff
        if (code === 503 || msg.includes('high demand') || msg.includes('overloaded')) {
          const waitMs = attempt * 3000;
          if (attempt < MAX_RETRIES) {
            console.warn(`[Gemini] ${model}: busy (503) — retrying in ${waitMs/1000}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn(`[Gemini] ${model}: still busy after ${MAX_RETRIES} attempts → next model`);
          lastError = err;
          break;
        }

        // 401 — bad key, 500 — server error → stop everything
        console.error(`[Gemini] ${model}: hard error ${code}: ${msg.slice(0, 100)}`);
        throw err;
      }
    }
  }

  throw lastError || new Error('All models unavailable');
}

// ─── Friendly error messages for the UI ──────────────────────────────────────
function friendlyError(err) {
  const msg = err.message || '';
  const code = err.code || 0;

  if (code === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('exceeded')) {
    return 'Rate limit reached — all models tried. Wait ~30 seconds and click Re-analyze.';
  }
  if (code === 503 || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('unavailable')) {
    return 'Gemini servers are busy right now. Click Re-analyze to try again.';
  }
  if (code === 401 || msg.includes('API key')) {
    return 'Invalid Gemini API key. Please check your GEMINI_API_KEY in server/.env';
  }
  return 'Analysis failed. Click Re-analyze to try again.';
}

// ─── Public: run analysis ─────────────────────────────────────────────────────
export async function runGeminiAnalysis(text, title) {
  console.log(`[AI] Analyzing "${title}"...`);
  try {
    return await callGemini(title, text);
  } catch (err) {
    const msg = friendlyError(err);
    console.error(`[AI] Failed: ${err.message}`);
    throw new Error(msg);
  }
}

// ─── HTTP: analyze on demand ──────────────────────────────────────────────────
export const analyzeDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.user_id;

    // Serve cached unless ?refresh=true
    if (req.query.refresh !== 'true') {
      const { data: cached } = await supabase
        .from('insights')
        .select('summary, key_entities, claims_analysis')
        .eq('document_id', documentId)
        .single();

      if (cached) {
        return res.status(200).json({
          success: true, cached: true,
          data: {
            executiveSummary: cached.summary,
            entities:         cached.key_entities?.entities      || [],
            keyClaims:        cached.claims_analysis?.keyClaims  || [],
            relationships:    cached.key_entities?.relationships  || [],
          },
        });
      }
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, extracted_text, user_id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !document) return res.status(404).json({ error: 'Document not found' });

    let insights;
    try {
      insights = await runGeminiAnalysis(document.extracted_text || '', document.title);
    } catch (aiErr) {
      return res.status(429).json({ error: aiErr.message });
    }

    await supabase.from('insights').delete().eq('document_id', documentId);
    await supabase.from('insights').insert([{
      document_id: documentId,
      summary:     insights.executiveSummary || '',
      key_entities:    { entities: insights.entities || [], relationships: insights.relationships || [] },
      claims_analysis: { keyClaims: insights.keyClaims || [] },
    }]);

    return res.status(200).json({ success: true, cached: false, data: insights });
  } catch (err) {
    console.error('analyzeDocument error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── HTTP: get cached insights ────────────────────────────────────────────────
export const getInsights = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.user_id;

    const { data: doc } = await supabase
      .from('documents').select('id').eq('id', documentId).eq('user_id', userId).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { data: insight, error } = await supabase
      .from('insights').select('summary, key_entities, claims_analysis').eq('document_id', documentId).single();

    if (error || !insight) return res.status(404).json({ error: 'No insights yet — click Analyze with AI.' });

    return res.status(200).json({
      success: true,
      data: {
        executiveSummary: insight.summary,
        entities:         insight.key_entities?.entities      || [],
        keyClaims:        insight.claims_analysis?.keyClaims  || [],
        relationships:    insight.key_entities?.relationships  || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
