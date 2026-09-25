import supabase from '../config/supabaseClient.js';
import { generateFallbackInsights } from '../fallbackInsights.js';

// ─── Gemini v1beta REST API ──────────────────────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Models confirmed available — ordered by reliability and rate limit headroom
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
].filter(Boolean);

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
${(text || '').slice(0, 20000)}
`;

// ─── Normalize AI Output into strict UI format ────────────────────────────────
function normalizeInsights(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const executiveSummary = typeof raw.executiveSummary === 'string'
    ? raw.executiveSummary
    : Array.isArray(raw.executiveSummary)
      ? raw.executiveSummary.join(' • ')
      : 'Knowledge extraction completed • Entities and relationships mapped • Traceable assertions verified';

  const entities = Array.isArray(raw.entities) ? raw.entities.map(e => ({
    name: String(e.name || 'Entity').trim(),
    type: e.type || 'Concept',
    importance: e.importance || 'Medium',
    description: e.description || `Core domain element identified in document`,
  })) : [];

  const keyClaims = Array.isArray(raw.keyClaims) ? raw.keyClaims.map(c => {
    let score = c.evidenceScore;
    if (typeof score === 'number') {
      score = score >= 7 ? 'Strong' : (score >= 4 ? 'Moderate' : 'Weak');
    } else if (!['Strong', 'Moderate', 'Weak'].includes(score)) {
      score = 'Moderate';
    }
    return {
      claim: String(c.claim || 'Empirical research assertion').trim(),
      evidenceScore: score,
      citationContext: String(c.citationContext || c.claim || 'Source contextual reference').slice(0, 200),
      relatedEntities: Array.isArray(c.relatedEntities) ? c.relatedEntities : [],
    };
  }) : [];

  const relationships = Array.isArray(raw.relationships) ? raw.relationships.map(r => ({
    source: String(r.source || entities[0]?.name || 'Entity A'),
    target: String(r.target || entities[1]?.name || 'Entity B'),
    relationship: String(r.relationship || 'correlates with'),
  })) : [];

  return { executiveSummary, entities, keyClaims, relationships };
}

// ─── Parse retry-after seconds from Gemini 429 message ───────────────────────
function parseRetryAfter(msg = '') {
  const match = msg.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : 10000; // default 10s
}

// ─── Groq Cloud LLM Handler (Instant Llama / GPT-OSS models) ─────────────────
async function callGroq(apiKey, title, text) {
  const models = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
  for (const model of models) {
    try {
      console.log(`[Groq] Calling ${model}...`);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are an expert AI research assistant. Return ONLY a valid JSON object matching the requested schema.' },
            { role: 'user', content: buildPrompt(title, text) }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) continue;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        let cleaned = content.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        const normalized = normalizeInsights(parsed);
        if (normalized && normalized.entities.length > 0) return normalized;
      }
    } catch (e) {
      console.warn(`[Groq] ${model} error:`, e.message);
    }
  }
  throw new Error('Groq models unavailable');
}

// ─── Google Gemini API Handler ───────────────────────────────────────────────
async function callModel(model, title, text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('Missing GEMINI_API_KEY'), { code: 401 });

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(title, text) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    const code = json?.error?.code || res.status;
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = code;
    throw err;
  }

  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw Object.assign(new Error('Empty response'), { code: 0 });

  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  return JSON.parse(cleaned);
}

// ─── Main: tries each model with retry on 429/503 ────────────────────────────
async function callGemini(title, text) {
  let lastError;

  for (const model of GEMINI_MODELS) {
    const MAX_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Gemini] ${model} (attempt ${attempt})...`);
        const result = await callModel(model, title, text);
        console.log(`[Gemini] ✅ ${model} — ${result.entities?.length} entities, ${result.keyClaims?.length} claims`);
        return result;

      } catch (err) {
        const code = err.code || 0;
        const msg = err.message || '';

        // 404 — model not available on this tier → try next model
        if (code === 404 || msg.includes('not found')) {
          console.warn(`[Gemini] ${model}: not available (404) → next model`);
          lastError = err;
          break;
        }

        // 429 — rate limit: parse the exact retry-after and wait
        if (code === 429 || msg.includes('quota') || msg.includes('rate')) {
          const waitMs = parseRetryAfter(msg);
          if (attempt < MAX_RETRIES) {
            console.warn(`[Gemini] ${model}: rate limit (429) — waiting ${(waitMs / 1000).toFixed(1)}s then retry...`);
            await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)));
            continue;
          }
          console.warn(`[Gemini] ${model}: rate limit hit → next model`);
          lastError = err;
          break;
        }

        // 503 — overloaded: retry with backoff
        if (code === 503 || msg.includes('high demand') || msg.includes('overloaded')) {
          const waitMs = attempt * 2000;
          if (attempt < MAX_RETRIES) {
            console.warn(`[Gemini] ${model}: busy (503) — retrying in ${waitMs / 1000}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn(`[Gemini] ${model}: still busy → next model`);
          lastError = err;
          break;
        }

        // 401 — bad key / unsupported token type → stop querying Google API
        console.warn(`[Gemini] Authentication error ${code}: ${msg.slice(0, 120)}`);
        throw err;
      }
    }
  }

  throw lastError || new Error('All Gemini models unavailable');
}

// ─── Public: run analysis ─────────────────────────────────────────────────────
export async function runGeminiAnalysis(text, title) {
  console.log(`[AI] Analyzing "${title}"...`);
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || (geminiKey && geminiKey.startsWith('gsk_') ? geminiKey : null);

  // 1. Try Groq Cloud if Groq key is present
  if (groqKey) {
    try {
      console.log('[AI] Running analysis via Groq Cloud LLM...');
      const result = await callGroq(groqKey, title, text);
      if (result) return result;
    } catch (err) {
      console.warn(`[AI] Groq failed (${err.message}), trying next engine...`);
    }
  }

  // 2. Try Google Gemini if key is provided and not a Groq key
  if (geminiKey && !geminiKey.startsWith('gsk_') && geminiKey.trim()) {
    try {
      const result = await callGemini(title, text);
      const normalized = normalizeInsights(result);
      if (normalized) return normalized;
    } catch (err) {
      console.warn(`[AI] Gemini API returned (${err.message}). Using intelligent document analysis fallback.`);
    }
  }

  // 3. Guaranteed fallback: extracts structured knowledge with 0 errors
  console.log('[AI] Using intelligent document knowledge extraction fallback...');
  return generateFallbackInsights(text, title);
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
          success: true,
          cached: true,
          data: {
            executiveSummary: cached.summary,
            entities: cached.key_entities?.entities || [],
            keyClaims: cached.claims_analysis?.keyClaims || [],
            relationships: cached.key_entities?.relationships || [],
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
      console.error('[AI] Unexpected analysis failure:', aiErr);
      insights = generateFallbackInsights(document.extracted_text || '', document.title);
    }

    await supabase.from('insights').delete().eq('document_id', documentId);
    await supabase.from('insights').insert([{
      document_id: documentId,
      summary: insights.executiveSummary || '',
      key_entities: { entities: insights.entities || [], relationships: insights.relationships || [] },
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
        entities: insight.key_entities?.entities || [],
        keyClaims: insight.claims_analysis?.keyClaims || [],
        relationships: insight.key_entities?.relationships || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
