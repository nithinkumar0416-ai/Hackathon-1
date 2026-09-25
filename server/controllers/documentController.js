import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;

import supabase from '../config/supabaseClient.js';
import { runGeminiAnalysis } from './aiController.js';

// ─── Text extraction per file type ───────────────────────────────────────────
async function extractText(buffer, mimetype, filename) {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

  // PDF — gracefully handle password-protected and corrupted files
  if (ext === '.pdf' || mimetype === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 10) return data.text;
      return '[PDF had no extractable text — may be image-based or scanned]';
    } catch {
      return '[PDF could not be parsed — file may be password-protected or corrupted. Text extraction skipped.]';
    }
  }

  // DOCX
  if (ext === '.docx' || ext === '.doc') {
    try {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '[DOCX had no extractable text]';
    } catch (e) {
      return `[DOCX extraction failed: ${e.message}]`;
    }
  }

  // TXT / MD and everything else
  return buffer.toString('utf-8');
}

// ─── Upload & instantly analyze ───────────────────────────────────────────────
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const userId = req.user.user_id;

    // Extract text (never reject — always returns something)
    const extractedText = await extractText(buffer, mimetype, originalname);
    const title = originalname.replace(/\.[^/.]+$/, '');

    // Save document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert([{
        user_id: userId,
        title,
        file_path: `uploads/${userId}/${Date.now()}_${originalname}`,
        extracted_text: extractedText,
      }])
      .select('id, title, file_path, created_at')
      .single();

    if (docError) {
      console.error('Document insert error:', docError);
      return res.status(500).json({ error: 'Failed to save document' });
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

    // ── Instant AI analysis (only if no cached insights exist) ─────────────
    let insights = null;
    try {
      // Check if insights already exist (avoids burning API quota on re-upload)
      const { data: existingInsights } = await supabase
        .from('insights')
        .select('id')
        .eq('document_id', document.id)
        .single();

      if (!existingInsights) {
        insights = await runGeminiAnalysis(extractedText, title);
        await supabase.from('insights').insert([{
          document_id: document.id,
          summary:     insights.executiveSummary || '',
          key_entities:    { entities: insights.entities || [], relationships: insights.relationships || [] },
          claims_analysis: { keyClaims: insights.keyClaims || [] },
        }]);
      } else {
        // Return cached insights directly
        const { data: cached } = await supabase
          .from('insights')
          .select('summary, key_entities, claims_analysis')
          .eq('document_id', document.id)
          .single();
        if (cached) {
          insights = {
            executiveSummary: cached.summary,
            entities:         cached.key_entities?.entities      || [],
            keyClaims:        cached.claims_analysis?.keyClaims  || [],
            relationships:    cached.key_entities?.relationships  || [],
          };
        }
      }
    } catch (aiErr) {
      console.error('Instant AI analysis failed (non-fatal):', aiErr.message);
      // Upload still succeeds even if AI fails
    }

    return res.status(201).json({
      success: true,
      document: {
        ...document,
        word_count: wordCount,
        text_preview: extractedText.slice(0, 200),
      },
      insights, // null if AI failed, populated if it worked
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error during upload' });
  }
};

// ─── List documents ───────────────────────────────────────────────────────────
export const listDocuments = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, file_path, created_at, extracted_text')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch documents' });

    const docsWithMeta = (documents || []).map(doc => ({
      id: doc.id,
      title: doc.title,
      file_path: doc.file_path,
      created_at: doc.created_at,
      word_count: doc.extracted_text?.split(/\s+/).filter(Boolean).length || 0,
      has_text: !!doc.extracted_text,
    }));

    return res.status(200).json({ success: true, documents: docsWithMeta });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Get single document ──────────────────────────────────────────────────────
export const getDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;

    const { data: document, error } = await supabase
      .from('documents')
      .select('id, title, file_path, extracted_text, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !document) return res.status(404).json({ error: 'Document not found' });

    return res.status(200).json({ success: true, document });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Delete document ──────────────────────────────────────────────────────────
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;

    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete document' });

    return res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
