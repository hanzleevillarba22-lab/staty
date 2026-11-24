import { Router } from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getStoragePaths } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';
import {
  extractStructuredContentFromFile,
  formatGeminiError,
  isGeminiConfigured,
  runStatyChatStream,
  runStatyChatTurn,
  speakTextWithGemini,
  transcribeAudioWithGemini,
  type StatyActionItem,
} from '../services/aiService.ts';
import { parseTabularBuffer } from '../services/dataProcessing.ts';

const router = Router();
router.use(requireAuth);

const ALLOWED_EXTS = new Set(['.pdf', '.docx', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg']);
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext) && ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported attachment type. Allowed: PDF, DOCX, CSV, XLSX, XLS, PNG, JPG, JPEG.'));
    }
  },
});

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
]);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (ALLOWED_AUDIO_MIMES.has(baseMime) || baseMime.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format. Please record or upload WebM, MP4, M4A, MP3, OGG, or WAV audio.'));
    }
  },
});

function resolveSafeUploadPath(filename: string): string {
  const { uploadsDir } = getStoragePaths();
  const baseDir = path.resolve(uploadsDir);
  const safeName = path.basename(filename);
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid upload storage path.');
  }
  return resolved;
}

function prepareChatInputs(req: AuthenticatedRequest) {
  const convId = Number(req.params.id);
  const userId = req.user!.id;

  const conv = db
    .prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(convId, userId) as { id: number; title: string } | undefined;

  if (!conv) {
    return { ok: false as const, errorStatus: 404, errorPayload: { error: 'Conversation not found.' } };
  }

  if (!isGeminiConfigured()) {
    return {
      ok: false as const,
      errorStatus: 503,
      errorPayload: {
        configured: false,
        error:
          'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
      },
    };
  }

  const content = sanitizeText(req.body?.message, 4000);
  const datasetId = req.body?.datasetId ? Number(req.body.datasetId) : null;
  const currentAppRoute = sanitizeText(req.body?.currentAppRoute, 60) || undefined;
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!content && attachments.length === 0) {
    return {
      ok: false as const,
      errorStatus: 400,
      errorPayload: { error: 'Please enter a message or attach a file.' },
    };
  }

  let datasetContext: { id: number; name: string; variables: unknown[] } | null = null;
  if (datasetId) {
    const ds = db
      .prepare('SELECT id, name FROM datasets WHERE id = ? AND user_id = ?')
      .get(datasetId, userId) as { id: number; name: string } | undefined;
    if (!ds) {
      return {
        ok: false as const,
        errorStatus: 404,
        errorPayload: { error: 'Referenced dataset not found.' },
      };
    }
    const vars = db
      .prepare('SELECT name, data_type, measurement_level FROM dataset_variables WHERE dataset_id = ? ORDER BY position')
      .all(datasetId);
    datasetContext = { id: ds.id, name: ds.name, variables: vars };
  }

  const historyRows = db
    .prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(convId) as Array<{ role: 'user' | 'assistant'; content: string }>;

  const userMsgInfo = db
    .prepare(
      `INSERT INTO ai_messages (conversation_id, role, content, context_json)
       VALUES (?, 'user', ?, ?)`,
    )
    .run(
      convId,
      content || '(Attached research files)',
      datasetContext
        ? JSON.stringify({ datasetId: datasetContext.id, datasetName: datasetContext.name })
        : null,
    );
  const userMessageId = Number(userMsgInfo.lastInsertRowid);

  const attachmentContext: Array<{
    filename: string;
    mimeType: string;
    extractedText?: string | null;
    buffer?: Buffer;
  }> = [];

  for (const att of attachments) {
    const storedName = path.basename(String(att.storedName || ''));
    if (!storedName || !storedName.startsWith(`u${userId}_att_`)) continue;
    let buf: Buffer | undefined;
    try {
      const safePath = resolveSafeUploadPath(storedName);
      if (fs.existsSync(safePath)) buf = fs.readFileSync(safePath);
    } catch {
      // ignore invalid path
    }
    db.prepare(
      `INSERT INTO ai_attachments (message_id, user_id, filename, mime_type, file_size, storage_path, extracted_text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userMessageId,
      userId,
      sanitizeText(att.filename, 180) || 'attachment',
      sanitizeText(att.mimeType, 100) || 'application/octet-stream',
      Number(att.fileSize || 0),
      storedName,
      typeof att.extractedText === 'string' ? att.extractedText : null,
    );
    attachmentContext.push({
      filename: String(att.filename || 'attachment'),
      mimeType: String(att.mimeType || 'application/octet-stream'),
      extractedText: typeof att.extractedText === 'string' ? att.extractedText : null,
      buffer: buf,
    });
  }

  return {
    ok: true as const,
    convId,
    userId,
    conv,
    content,
    currentAppRoute,
    datasetContext,
    historyRows,
    userMessageId,
    attachmentContext,
  };
}

function saveAssistantTurn(params: {
  convId: number;
  convTitle: string;
  historyCount: number;
  userContent: string;
  reply: string;
  verifiedAnalysis?: unknown;
  actions?: StatyActionItem[];
  emotion?: string;
  gesture?: string;
}) {
  const ctxPayload = {
    verifiedAnalysis: params.verifiedAnalysis || null,
    actions: params.actions && params.actions.length > 0 ? params.actions : undefined,
    emotion: params.emotion || 'happy',
    gesture: params.gesture || 'nod',
  };

  const assistantMsgInfo = db
    .prepare(
      `INSERT INTO ai_messages (conversation_id, role, content, context_json)
       VALUES (?, 'assistant', ?, ?)`,
    )
    .run(params.convId, params.reply, JSON.stringify(ctxPayload));

  if (params.historyCount === 0 && params.convTitle === 'New Research Chat' && params.userContent) {
    db.prepare(`UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(
      params.userContent.slice(0, 60),
      params.convId,
    );
  } else {
    db.prepare(`UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?`).run(
      params.convId,
    );
  }

  return Number(assistantMsgInfo.lastInsertRowid);
}

router.get('/status', (_req, res) => {
  res.json({
    configured: isGeminiConfigured(),
    message: isGeminiConfigured()
      ? 'STATY AI is ready.'
      : 'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
  });
});

router.get('/conversations', (req: AuthenticatedRequest, res) => {
  const conversations = db
    .prepare(
      `SELECT c.*, p.title as project_title,
        (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) as message_count
       FROM ai_conversations c
       LEFT JOIN research_projects p ON p.id = c.project_id
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`,
    )
    .all(req.user!.id);

  res.json({ conversations });
});

router.post('/conversations', (req: AuthenticatedRequest, res) => {
  const title = sanitizeText(req.body?.title, 160) || 'New Research Chat';
  const projectId = req.body?.projectId ? Number(req.body.projectId) : null;

  if (projectId) {
    const proj = db
      .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
      .get(projectId, req.user!.id);
    if (!proj) {
      res.status(404).json({ error: 'Selected project not found.' });
      return;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO ai_conversations (user_id, project_id, title)
       VALUES (?, ?, ?)`,
    )
    .run(req.user!.id, projectId, title);

  const conversation = db
    .prepare('SELECT * FROM ai_conversations WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ conversation });
});

router.get('/conversations/:id', (req: AuthenticatedRequest, res) => {
  const convId = Number(req.params.id);
  const conv = db
    .prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const messages = db
    .prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(convId) as Array<{
    id: number;
    conversation_id: number;
    role: string;
    content: string;
    context_json: string | null;
    created_at: string;
  }>;

  const enriched = messages.map((m) => {
    const attachments = db
      .prepare('SELECT id, filename, mime_type, file_size, extracted_text, created_at FROM ai_attachments WHERE message_id = ?')
      .all(m.id);
    return {
      ...m,
      context: m.context_json ? JSON.parse(m.context_json) : null,
      attachments,
    };
  });

  res.json({ conversation: conv, messages: enriched });
});

router.delete('/conversations/:id', (req: AuthenticatedRequest, res) => {
  const convId = Number(req.params.id);
  const conv = db
    .prepare('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const files = db
    .prepare(
      `SELECT a.storage_path FROM ai_attachments a
       JOIN ai_messages m ON m.id = a.message_id
       WHERE m.conversation_id = ? AND a.user_id = ?`,
    )
    .all(convId, req.user!.id) as Array<{ storage_path: string }>;

  for (const f of files) {
    try {
      const p = resolveSafeUploadPath(f.storage_path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore missing file
    }
  }

  db.prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?').run(convId, req.user!.id);
  res.json({ ok: true });
});

// Attachment inspection & OCR/Document extraction preview before sending to chat
router.post('/attachments/extract', (req: AuthenticatedRequest, res) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Attachment upload failed.' });
      return;
    }

    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: 'No valid attachment uploaded.' });
      return;
    }

    try {
      const results = [];
      for (const file of uploadedFiles) {
        const ext = path.extname(file.originalname).toLowerCase();
        const storedName = `u${req.user!.id}_att_${crypto.randomUUID()}${ext}`;
        const safePath = resolveSafeUploadPath(storedName);
        fs.writeFileSync(safePath, file.buffer);

        if (ext === '.csv' || ext === '.xlsx' || ext === '.xls') {
          const parsed = parseTabularBuffer(file.buffer, file.originalname);
          results.push({
            filename: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            storedName,
            kind: 'dataset',
            extractedText: `Dataset "${file.originalname}" (${parsed.rowCount} rows × ${parsed.colCount} columns). Variables: ${parsed.variables.map((v) => `${v.name} (${v.dataType}, ${v.measurementLevel})`).join(', ')}. Sample rows: ${JSON.stringify(parsed.rows.slice(0, 5))}`,
            uncertainties: parsed.headerWarnings,
            requiresConfirmation: false,
          });
        } else if (ext === '.docx') {
          const doc = await mammoth.extractRawText({ buffer: file.buffer });
          results.push({
            filename: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            storedName,
            kind: 'document',
            extractedText: doc.value.slice(0, 12000),
            uncertainties: [],
            requiresConfirmation: false,
          });
        } else {
          if (!isGeminiConfigured()) {
            results.push({
              filename: file.originalname,
              mimeType: file.mimetype,
              fileSize: file.size,
              storedName,
              kind: ext === '.pdf' ? 'document' : 'image',
              extractedText: '',
              uncertainties: [
                'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
              ],
              requiresConfirmation: true,
            });
          } else {
            const mime =
              ext === '.png'
                ? 'image/png'
                : ext === '.jpg' || ext === '.jpeg'
                  ? 'image/jpeg'
                  : 'application/pdf';
            const extracted = await extractStructuredContentFromFile({
              mimeType: mime,
              buffer: file.buffer,
              filename: file.originalname,
            });

            let textSummary = extracted.extractedText || '';
            if (extracted.suggestedHeaders && extracted.suggestedRows) {
              textSummary += `\n\nExtracted Table (${extracted.suggestedHeaders.join(' | ')}):\n${JSON.stringify(extracted.suggestedRows, null, 2)}`;
            }

            results.push({
              filename: file.originalname,
              mimeType: mime,
              fileSize: file.size,
              storedName,
              kind: ext === '.pdf' ? 'document' : 'image',
              extractedText: textSummary,
              uncertainties: extracted.uncertainties || [],
              requiresConfirmation: true,
            });
          }
        }
      }

      res.json({ attachments: results });
    } catch (procErr) {
      res.status(502).json({
        error: formatGeminiError(procErr),
      });
    }
  });
});

// Speech-to-Text microphone transcription via Gemini 3.5 Transcribe
router.post('/transcribe', (req: AuthenticatedRequest, res) => {
  audioUpload.single('audio')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Audio upload failed.' });
      return;
    }

    if (!isGeminiConfigured()) {
      res.status(503).json({
        configured: false,
        error:
          'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
      });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      res.status(400).json({ error: 'No audio recording was received.' });
      return;
    }

    try {
      const mime = file.mimetype === 'video/webm' ? 'audio/webm' : file.mimetype;
      const text = await transcribeAudioWithGemini({
        buffer: file.buffer,
        mimeType: mime || 'audio/webm',
      });
      res.json({ text });
    } catch (txErr) {
      res.status(502).json({ error: formatGeminiError(txErr) });
    }
  });
});

// Read-Aloud Text-to-Speech via Gemini 3.8 Flash Lite TTS
router.post('/speak', async (req: AuthenticatedRequest, res) => {
  if (!isGeminiConfigured()) {
    res.status(503).json({
      configured: false,
      error:
        'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
    });
    return;
  }

  const text = sanitizeText(req.body?.text, 1600);
  if (!text) {
    res.status(400).json({ error: 'No message text provided to read aloud.' });
    return;
  }

  try {
    const audioBase64 = await speakTextWithGemini(text);
    res.json({ mimeType: 'audio/wav', audioBase64 });
  } catch (ttsErr) {
    res.status(502).json({ error: formatGeminiError(ttsErr) });
  }
});

// Real-time Server-Sent Events (SSE) Streaming Chat Endpoint
router.post('/conversations/:id/messages/stream', async (req: AuthenticatedRequest, res) => {
  const prep = prepareChatInputs(req);
  if (!prep.ok) {
    res.status(prep.errorStatus).json(prep.errorPayload);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('start', { userMessageId: prep.userMessageId });

  try {
    const aiReply = await runStatyChatStream(
      {
        userId: prep.userId,
        history: prep.historyRows,
        userMessage: prep.content || 'Please review the attached research files.',
        currentAppRoute: prep.currentAppRoute,
        datasetContext: prep.datasetContext,
        attachmentContext: prep.attachmentContext,
      },
      {
        onStatus: (status) => sendEvent('status', status),
        onDelta: (text) => sendEvent('delta', { text }),
        onAction: (action) => sendEvent('action', action),
      },
    );

    const assistantMessageId = saveAssistantTurn({
      convId: prep.convId,
      convTitle: prep.conv.title,
      historyCount: prep.historyRows.length,
      userContent: prep.content,
      reply: aiReply.reply,
      verifiedAnalysis: aiReply.verifiedAnalysis,
      actions: aiReply.actions,
      emotion: aiReply.emotion,
      gesture: aiReply.gesture,
    });

    sendEvent('done', {
      userMessageId: prep.userMessageId,
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: aiReply.reply,
        verifiedAnalysis: aiReply.verifiedAnalysis ?? null,
        actions: aiReply.actions,
        emotion: aiReply.emotion,
        gesture: aiReply.gesture,
      },
    });
    res.end();
  } catch (err) {
    // Roll back the orphaned user turn so retries do not create duplicate unanswered messages
    try {
      db.prepare('DELETE FROM ai_messages WHERE id = ?').run(prep.userMessageId);
    } catch {
      // ignore rollback glitch
    }
    sendEvent('error', {
      error: formatGeminiError(err),
      emotion: 'error',
      gesture: 'shake',
    });
    res.end();
  }
});

// Standard JSON Chat Endpoint (kept for compatibility)
router.post('/conversations/:id/messages', async (req: AuthenticatedRequest, res) => {
  const prep = prepareChatInputs(req);
  if (!prep.ok) {
    res.status(prep.errorStatus).json(prep.errorPayload);
    return;
  }

  try {
    const aiReply = await runStatyChatTurn({
      userId: prep.userId,
      history: prep.historyRows,
      userMessage: prep.content || 'Please review the attached research files.',
      currentAppRoute: prep.currentAppRoute,
      datasetContext: prep.datasetContext,
      attachmentContext: prep.attachmentContext,
    });

    const assistantMessageId = saveAssistantTurn({
      convId: prep.convId,
      convTitle: prep.conv.title,
      historyCount: prep.historyRows.length,
      userContent: prep.content,
      reply: aiReply.reply,
      verifiedAnalysis: aiReply.verifiedAnalysis,
      actions: aiReply.actions,
      emotion: aiReply.emotion,
      gesture: aiReply.gesture,
    });

    res.json({
      userMessageId: prep.userMessageId,
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: aiReply.reply,
        verifiedAnalysis: aiReply.verifiedAnalysis ?? null,
        actions: aiReply.actions ?? [],
        emotion: aiReply.emotion,
        gesture: aiReply.gesture,
      },
    });
  } catch (err) {
    try {
      db.prepare('DELETE FROM ai_messages WHERE id = ?').run(prep.userMessageId);
    } catch {
      // ignore rollback glitch
    }
    res.status(502).json({
      error: formatGeminiError(err),
    });
  }
});

export default router;
