const http = require('http');
const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Populate .env values when missing OR blank in process env.
    if (!(key in process.env) || process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_FALLBACK_MODELS = (
  process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.0-flash,gemini-1.5-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const QUIZ_GEMINI_MODEL = process.env.QUIZ_GEMINI_MODEL || 'gemini-2.5-pro';
const ROOT = __dirname;
const SERVER_BUILD = '2026-03-08-b1';
let discoveredModelCache = null;

class StateStore {
  constructor() {
    this.pool = null;
    this.memory = new Map();
    this.ready = this.init();
  }

  async init() {
    if (!process.env.DATABASE_URL) {
      return;
    }
    let pg;
    try {
      pg = require('pg');
    } catch {
      console.warn('`pg` package not installed. Using in-memory state fallback.');
      return;
    }

    try {
      this.pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000
      });

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS smartnotes_state (
          id BIGSERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          doc_type TEXT NOT NULL,
          doc_id TEXT NOT NULL DEFAULT 'default',
          state JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(client_id, doc_type, doc_id)
        );
      `);
    } catch (err) {
      console.warn(`Postgres unavailable (${err.message}). Falling back to in-memory state.`);
      this.pool = null;
    }
  }

  key(clientId, docType, docId) {
    return `${clientId}::${docType}::${docId}`;
  }

  async save(clientId, docType, docId, state) {
    await this.ready;
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO smartnotes_state (client_id, doc_type, doc_id, state)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (client_id, doc_type, doc_id)
         DO UPDATE SET state = EXCLUDED.state, updated_at = NOW();`,
        [clientId, docType, docId, JSON.stringify(state)]
      );
      return;
    }
    this.memory.set(this.key(clientId, docType, docId), {
      state,
      updatedAt: new Date().toISOString()
    });
  }

  async load(clientId, docType, docId) {
    await this.ready;
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT state, updated_at
         FROM smartnotes_state
         WHERE client_id = $1 AND doc_type = $2 AND doc_id = $3
         LIMIT 1;`,
        [clientId, docType, docId]
      );
      if (!result.rowCount) return null;
      return {
        state: result.rows[0].state,
        updatedAt: result.rows[0].updated_at
      };
    }
    return this.memory.get(this.key(clientId, docType, docId)) || null;
  }
}

const stateStore = new StateStore();

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function extractModelText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(' ').trim() || '';
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGeminiWithModel(prompt, modelName) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini model ${modelName} error (${response.status}): ${detail}`);
  }
  return response.json();
}

function normalizeModelName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const raw = n.startsWith('models/') ? n.slice('models/'.length) : n;
  // Some aliases are not accepted by the generateContent endpoint.
  if (/latest$/i.test(raw)) return '';
  return raw;
}

async function discoverGeminiModels() {
  if (discoveredModelCache) return discoveredModelCache;
  if (!GEMINI_API_KEY) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const payload = await res.json();
    const models = Array.isArray(payload?.models) ? payload.models : [];
    const names = models
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => normalizeModelName(m.name))
      .filter(Boolean);
    discoveredModelCache = [...new Set(names)];
    return discoveredModelCache;
  } catch {
    return [];
  }
}

async function callGemini(prompt) {
  const attempted = [];
  const configured = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS]
    .map(normalizeModelName)
    .filter(Boolean);
  const discovered = await discoverGeminiModels();
  const preferredDiscovered = discovered.filter((m) =>
    /(gemini-(2\.5|2\.0|1\.5)-flash)/i.test(m)
  );
  const models = [...new Set([...configured, ...preferredDiscovered, ...discovered])]
    .map(normalizeModelName)
    .filter(Boolean);
  for (const model of models) {
    attempted.push(model);
    try {
      const payload = await callGeminiWithModel(prompt, model);
      return { payload, model };
    } catch (err) {
      // Try next model.
      if (model === models[models.length - 1]) {
        throw new Error(`${err.message}; attempted models: ${attempted.join(', ')}`);
      }
    }
  }
  throw new Error(`No Gemini model succeeded; attempted models: ${attempted.join(', ')}`);
}

async function callGeminiForQuiz(prompt) {
  const preferred = normalizeModelName(QUIZ_GEMINI_MODEL);
  if (preferred) {
    try {
      const payload = await callGeminiWithModel(prompt, preferred);
      return { payload, model: preferred };
    } catch {
      // Fall through to standard model chain.
    }
  }
  return callGemini(prompt);
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractReadableTextFromHtml(html) {
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const clean = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title,
    text: decodeHtmlEntities(clean).slice(0, 12000)
  };
}

function parseKeyPointsFromModelText(text) {
  const parsed = extractFirstJsonObject(text);
  if (Array.isArray(parsed?.keyPoints)) {
    return parsed.keyPoints.map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
  }
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-*•\d\.\)\s]+/, '').trim())
    .filter(Boolean);
  return [...new Set(lines)].slice(0, 8);
}

function heuristicKeyPoints({ source, title, transcript }) {
  const points = [];
  if (title) {
    points.push(`Topic: ${title}`);
  }
  const sentences = splitSentences(transcript || '');
  for (const sentence of sentences) {
    const cleaned = sentence.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 35 && cleaned.length <= 220) {
      points.push(cleaned);
    }
    if (points.length >= 6) break;
  }
  if (!points.length) {
    points.push(`Context from source: ${String(source).slice(0, 120)}`);
    points.push('No transcript detected. Enable captions or provide a video with subtitles.');
    points.push('Try a clearer source or upload a local video for stronger key-point extraction.');
  }
  return [...new Set(points)].slice(0, 8);
}

function secondsToLabel(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function buildHeuristicTimedKeyPoints(segments, keyPoints) {
  if (!Array.isArray(segments) || !segments.length) {
    return keyPoints.slice(0, 6).map((text, idx) => ({
      timeSec: idx * 60,
      label: secondsToLabel(idx * 60),
      text
    }));
  }
  const stride = Math.max(1, Math.floor(segments.length / Math.min(6, segments.length)));
  const out = [];
  for (let i = 0; i < segments.length && out.length < 6; i += stride) {
    const seg = segments[i];
    out.push({
      timeSec: Number(seg.timeSec || 0),
      label: secondsToLabel(seg.timeSec || 0),
      text: seg.text
    });
  }
  return out;
}

function spreadSegmentsAcrossDuration(segments, durationSec, targetCount) {
  if (!Array.isArray(segments) || !segments.length) return [];
  const duration = Math.max(
    durationSec || 0,
    Number(segments[segments.length - 1]?.timeSec || 0)
  );
  if (!duration) {
    const stride = Math.max(1, Math.floor(segments.length / Math.max(1, targetCount)));
    const out = [];
    for (let i = 0; i < segments.length && out.length < targetCount; i += stride) {
      out.push(segments[i]);
    }
    return out;
  }
  const out = [];
  for (let i = 0; i < targetCount; i += 1) {
    const t = Math.floor((i / Math.max(1, targetCount - 1)) * duration);
    let best = segments[0];
    for (const s of segments) {
      if (Math.abs(Number(s.timeSec || 0) - t) < Math.abs(Number(best.timeSec || 0) - t)) {
        best = s;
      }
    }
    out.push(best);
  }
  const uniq = [];
  const seen = new Set();
  for (const s of out) {
    const k = `${Math.floor(Number(s.timeSec || 0) / 5)}|${String(s.text || '').slice(0, 60)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(s);
  }
  return uniq;
}

function mergeTimedCoverage(primary, segments, durationSec, targetCount = 10) {
  const cleaned = (primary || [])
    .map((p) => ({
      timeSec: Math.max(0, Number(p.timeSec || 0)),
      text: String(p.text || '').trim()
    }))
    .filter((p) => p.text);

  const maxPrimary = cleaned.reduce((m, p) => Math.max(m, p.timeSec), 0);
  const duration = Math.max(durationSec || 0, Number(segments?.[segments.length - 1]?.timeSec || 0));
  const needsCoverageBoost = duration > 0 && maxPrimary < duration * 0.75;

  if (!needsCoverageBoost && cleaned.length >= 6) {
    return cleaned
      .sort((a, b) => a.timeSec - b.timeSec)
      .slice(0, targetCount)
      .map((p) => ({ ...p, label: secondsToLabel(p.timeSec) }));
  }

  const spread = spreadSegmentsAcrossDuration(segments || [], duration, targetCount);
  const merged = [...cleaned];
  for (const s of spread) {
    merged.push({
      timeSec: Math.max(0, Number(s.timeSec || 0)),
      text: String(s.text || '').trim()
    });
  }

  merged.sort((a, b) => a.timeSec - b.timeSec);
  const out = [];
  for (const p of merged) {
    if (!p.text) continue;
    if (out.length && Math.abs(out[out.length - 1].timeSec - p.timeSec) < 8) continue;
    out.push(p);
    if (out.length >= targetCount) break;
  }
  return out.map((p) => ({ ...p, label: secondsToLabel(p.timeSec) }));
}

function parseScreenshotSuggestions(parsed, timedKeyPoints, videoId) {
  const arr = Array.isArray(parsed?.screenshotSuggestions) ? parsed.screenshotSuggestions : [];
  const out = arr
    .map((s, idx) => {
      const timeSec = Math.max(0, Number(s?.timeSec || timedKeyPoints[idx]?.timeSec || 0));
      const caption = String(s?.caption || '').trim();
      if (!caption) return null;
      const label = secondsToLabel(timeSec);
      const imageUrl = videoId
        ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${['1.jpg', '2.jpg', '3.jpg'][idx % 3]}`
        : '';
      return { timeSec, label, caption, imageUrl };
    })
    .filter(Boolean)
    .slice(0, 3);
  return out;
}

function heuristicScreenshotSuggestions(timedKeyPoints, videoId) {
  return (timedKeyPoints || [])
    .slice(0, 3)
    .map((p, idx) => ({
      timeSec: Number(p.timeSec || 0),
      label: p.label || secondsToLabel(p.timeSec || 0),
      caption: `Important because this moment introduces or reinforces a core concept: ${String(p.text || '').slice(0, 140)}`,
      imageUrl: videoId
        ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${['1.jpg', '2.jpg', '3.jpg'][idx % 3]}`
        : ''
    }));
}

function extractYouTubeVideoId(input) {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '').trim() || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        return u.searchParams.get('v');
      }
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseTimedTextXml(xml) {
  const segments = [];
  const re = /<text\b[^>]*start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const start = Math.floor(Number(m[1] || 0));
    const text = decodeXmlEntities(m[2]).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    segments.push({ timeSec: start, text });
  }
  return segments;
}

async function fetchTimedTextFallback(videoId) {
  const variants = [
    `https://www.youtube.com/api/timedtext?lang=en&v=${encodeURIComponent(videoId)}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?lang=en&kind=asr&v=${encodeURIComponent(videoId)}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?lang=en&v=${encodeURIComponent(videoId)}`,
    `https://www.youtube.com/api/timedtext?lang=en&kind=asr&v=${encodeURIComponent(videoId)}`
  ];

  for (const url of variants) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (!r.ok) continue;
      const body = await r.text();
      if (!body || body.trim().length < 20) continue;

      if (body.trim().startsWith('{')) {
        const data = JSON.parse(body);
        const events = Array.isArray(data?.events) ? data.events : [];
        const segments = [];
        for (const ev of events) {
          const t = Math.floor(Number(ev?.tStartMs || 0) / 1000);
          if (!Array.isArray(ev?.segs)) continue;
          const txt = ev.segs
            .map((s) => String(s?.utf8 || '').replace(/\n/g, ' ').trim())
            .filter(Boolean)
            .join(' ')
            .trim();
          if (txt) segments.push({ timeSec: t, text: txt });
        }
        if (segments.length) return segments;
      } else if (body.includes('<text')) {
        const segments = parseTimedTextXml(body);
        if (segments.length) return segments;
      }
    } catch {
      // try next variant
    }
  }
  return [];
}

async function fetchYouTubeTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const watchRes = await fetch(watchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  if (!watchRes.ok) {
    throw new Error(`YouTube watch fetch failed (${watchRes.status})`);
  }
  const html = await watchRes.text();

  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(' - YouTube', '').trim()) : '';

  const playerMatch =
    html.match(/ytInitialPlayerResponse\s*=\s*({.*?});<\/script>/s) ||
    html.match(/"PLAYER_CONFIG":\s*({.*?})\s*,\s*"EXPERIMENT_FLAGS"/s);
  if (!playerMatch) {
    return { title, transcript: '', segments: [], durationSec: 0 };
  }

  let player;
  try {
    player = JSON.parse(playerMatch[1]);
  } catch {
    return { title, transcript: '', segments: [], durationSec: 0 };
  }

  const durationSec = Number(player?.videoDetails?.lengthSeconds || 0);

  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
    player?.args?.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
    [];
  if (!tracks.length) {
    const fallbackSegments = await fetchTimedTextFallback(videoId);
    const fallbackTranscript = fallbackSegments.map((s) => s.text).join(' ').trim();
    return {
      title,
      transcript: fallbackTranscript,
      segments: fallbackSegments,
      durationSec
    };
  }

  const preferred =
    tracks.find((t) => String(t.languageCode || '').toLowerCase().startsWith('en')) || tracks[0];
  if (!preferred?.baseUrl) {
    const fallbackSegments = await fetchTimedTextFallback(videoId);
    const fallbackTranscript = fallbackSegments.map((s) => s.text).join(' ').trim();
    return {
      title,
      transcript: fallbackTranscript,
      segments: fallbackSegments,
      durationSec
    };
  }

  const captionUrl = preferred.baseUrl.includes('fmt=')
    ? preferred.baseUrl
    : `${preferred.baseUrl}&fmt=json3`;
  const captionRes = await fetch(captionUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  if (!captionRes.ok) {
    const fallbackSegments = await fetchTimedTextFallback(videoId);
    const fallbackTranscript = fallbackSegments.map((s) => s.text).join(' ').trim();
    return {
      title,
      transcript: fallbackTranscript,
      segments: fallbackSegments,
      durationSec
    };
  }

  const data = await captionRes.json();
  const events = Array.isArray(data?.events) ? data.events : [];
  const chunks = [];
  const segments = [];
  for (const ev of events) {
    if (!Array.isArray(ev?.segs)) continue;
    const timeSec = Math.floor(Number(ev?.tStartMs || 0) / 1000);
    for (const seg of ev.segs) {
      const text = String(seg?.utf8 || '').replace(/\n/g, ' ').trim();
      if (text) {
        chunks.push(text);
        segments.push({ timeSec, text });
      }
    }
  }
  return { title, transcript: chunks.join(' ').trim(), segments, durationSec };
}

async function handleVideoAnalyze(req, res) {
  const body = await readJsonBody(req);
  const source = String(body.source || '').slice(0, 1500);
  const stage = String(body.stage || 'full').toLowerCase();
  if (!source) {
    return sendJson(res, 400, { error: 'source is required' });
  }

  let extraContext = '';
  let ytTitle = '';
  let ytTranscript = '';
  let ytSegments = [];
  let ytDurationSec = 0;
  const videoId = extractYouTubeVideoId(source);
  if (stage === 'quick') {
    const quickPrompt =
      `Generate quick draft study suggestions from this video source.\n` +
      `Source: ${source}\n` +
      `Return JSON only: {"keyPoints":["..."],"timedKeyPoints":[{"timeSec":number,"text":"..."}],"screenshotSuggestions":[{"timeSec":number,"caption":"..."}]}.\n` +
      `Return 5 keyPoints and 5 timedKeyPoints spread from start to later parts if possible.\n` +
      `Return 3 screenshotSuggestions with captions explaining why each screenshot is important to note.`;
    try {
      const { payload } = await callGemini(quickPrompt);
      const text = extractModelText(payload);
      const parsed = extractFirstJsonObject(text);
      const keyPoints = Array.isArray(parsed?.keyPoints)
        ? parsed.keyPoints.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
        : parseKeyPointsFromModelText(text).slice(0, 6);
      const timedRaw = Array.isArray(parsed?.timedKeyPoints)
        ? parsed.timedKeyPoints
            .map((p) => ({
              timeSec: Math.max(0, Number(p?.timeSec || 0)),
              text: String(p?.text || '').trim()
            }))
            .filter((p) => p.text)
            .slice(0, 8)
        : [];
      const timed = mergeTimedCoverage(timedRaw, [], 0, 6);
      const screenshotSuggestions = parseScreenshotSuggestions(parsed, timed, videoId);
      return sendJson(res, 200, {
        keyPoints: keyPoints.length ? keyPoints : heuristicKeyPoints({ source, title: '', transcript: '' }),
        timedKeyPoints: timed.length
          ? timed
          : buildHeuristicTimedKeyPoints([], keyPoints.length ? keyPoints : heuristicKeyPoints({ source, title: '', transcript: '' })),
        screenshotSuggestions: screenshotSuggestions.length
          ? screenshotSuggestions
          : heuristicScreenshotSuggestions(timed, videoId),
        usedYouTubeTranscript: false,
        analysisMode: 'gemini',
        provisional: true
      });
    } catch (err) {
      const fallback = heuristicKeyPoints({ source, title: '', transcript: '' });
      return sendJson(res, 200, {
        keyPoints: fallback,
        timedKeyPoints: buildHeuristicTimedKeyPoints([], fallback),
        screenshotSuggestions: heuristicScreenshotSuggestions(buildHeuristicTimedKeyPoints([], fallback), videoId),
        usedYouTubeTranscript: false,
        analysisMode: 'fallback',
        provisional: true,
        warning: `Gemini failed: ${err.message}`
      });
    }
  }

  if (videoId) {
    try {
      const yt = await fetchYouTubeTranscript(videoId);
      if (yt.title) {
        ytTitle = yt.title;
        extraContext += `\nVideo title: ${yt.title}\n`;
      }
      if (yt.transcript) {
        ytTranscript = yt.transcript;
        ytSegments = yt.segments || [];
        ytDurationSec = Number(yt.durationSec || 0);
        // Keep prompt size bounded.
        const timestamped = ytSegments
          .slice(0, 140)
          .map((s) => `[${secondsToLabel(s.timeSec)}] ${s.text}`)
          .join('\n');
        extraContext += `\nTranscript excerpt:\n${yt.transcript.slice(0, 10000)}\n`;
        if (timestamped) {
          extraContext += `\nTimestamped transcript lines:\n${timestamped}\n`;
        }
        if (ytDurationSec > 0) {
          extraContext += `\nVideo duration (seconds): ${ytDurationSec}\n`;
        }
      } else {
        extraContext += '\nNo captions were available for this YouTube video.\n';
      }
    } catch {
      extraContext += '\nCould not fetch YouTube transcript metadata.\n';
    }
  }

  const prompt =
    `You are generating study notes from a lecture/video source.\n` +
    `Source: ${source}\n` +
    `${extraContext}\n` +
    `Return JSON only in this exact shape: ` +
    `{"keyPoints":["..."],"timedKeyPoints":[{"timeSec":123,"text":"..."}],"screenshotSuggestions":[{"timeSec":123,"caption":"..."}]}. ` +
    `Provide 8 concise, accurate key points suitable for drag-and-drop notes. ` +
    `Provide 8-12 timedKeyPoints distributed across the FULL video timeline (start/middle/end). ` +
    `If transcript timestamps exist, timedKeyPoints must align to those moments in the video.\n` +
    `Also provide 3 screenshotSuggestions with captions that explain why each frame should be noted.`;
  try {
    const { payload } = await callGemini(prompt);
    const text = extractModelText(payload);
    const keyPoints = parseKeyPointsFromModelText(text);
    const parsed = extractFirstJsonObject(text);
    const timedKeyPointsRaw = Array.isArray(parsed?.timedKeyPoints)
      ? parsed.timedKeyPoints
          .map((p) => ({
            timeSec: Math.max(0, Number(p?.timeSec || 0)),
            text: String(p?.text || '').trim()
          }))
          .filter((p) => p.text)
          .slice(0, 14)
      : [];
    const timedKeyPoints = mergeTimedCoverage(
      timedKeyPointsRaw,
      ytSegments,
      ytDurationSec,
      10
    );
    const screenshotSuggestions = parseScreenshotSuggestions(parsed, timedKeyPoints, videoId);
    if (keyPoints.length) {
      return sendJson(res, 200, {
        keyPoints,
        timedKeyPoints: timedKeyPoints.length
          ? timedKeyPoints
          : mergeTimedCoverage(
              buildHeuristicTimedKeyPoints(ytSegments, keyPoints),
              ytSegments,
              ytDurationSec,
              10
            ),
        usedYouTubeTranscript: !!(videoId && ytTranscript),
        analysisMode: 'gemini',
        screenshotSuggestions: screenshotSuggestions.length
          ? screenshotSuggestions
          : heuristicScreenshotSuggestions(timedKeyPoints, videoId)
      });
    }
  } catch (err) {
    const fallback = heuristicKeyPoints({
      source,
      title: ytTitle,
      transcript: ytTranscript
    });
    const timedFallback = mergeTimedCoverage(
      buildHeuristicTimedKeyPoints(ytSegments, fallback),
      ytSegments,
      ytDurationSec,
      10
    );
    return sendJson(res, 200, {
      keyPoints: fallback,
      timedKeyPoints: timedFallback,
      usedYouTubeTranscript: !!(videoId && ytTranscript),
      analysisMode: 'fallback',
      warning: `Gemini failed: ${err.message}`,
      screenshotSuggestions: heuristicScreenshotSuggestions(timedFallback, videoId)
    });
  }

  const fallback = heuristicKeyPoints({
    source,
    title: ytTitle,
    transcript: ytTranscript
  });
  const timedFallback = mergeTimedCoverage(
    buildHeuristicTimedKeyPoints(ytSegments, fallback),
    ytSegments,
    ytDurationSec,
    10
  );
  return sendJson(res, 200, {
    keyPoints: fallback,
    timedKeyPoints: timedFallback,
    usedYouTubeTranscript: !!(videoId && ytTranscript),
    analysisMode: 'fallback',
    warning: 'Gemini returned no parseable key points.',
    screenshotSuggestions: heuristicScreenshotSuggestions(timedFallback, videoId)
  });
}

async function handleContentExtract(req, res) {
  const body = await readJsonBody(req);
  const source = String(body.source || '').trim();
  if (!source) {
    return sendJson(res, 400, { error: 'source is required' });
  }

  const videoId = extractYouTubeVideoId(source);
  if (videoId) {
    try {
      const yt = await fetchYouTubeTranscript(videoId);
      const text = String(yt.transcript || '').trim();
      return sendJson(res, 200, {
        sourceType: 'youtube',
        title: yt.title || '',
        text: text.slice(0, 12000)
      });
    } catch (err) {
      return sendJson(res, 502, { error: `YouTube extraction failed: ${err.message}` });
    }
  }

  let url;
  try {
    url = new URL(source);
  } catch {
    return sendJson(res, 400, { error: 'source must be a valid URL' });
  }
  if (!/^https?:$/i.test(url.protocol)) {
    return sendJson(res, 400, { error: 'Only http(s) URLs are supported' });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'SmartNotes/1.0 (+http://localhost)'
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    return sendJson(res, 502, { error: `URL fetch failed (${response.status}): ${detail.slice(0, 200)}` });
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/pdf')) {
    return sendJson(res, 400, { error: 'PDF URLs are not yet directly extractable here. Please upload the PDF file.' });
  }
  const html = await response.text();
  const extracted = extractReadableTextFromHtml(html);
  if (!extracted.text) {
    return sendJson(res, 502, { error: 'No readable text found at URL' });
  }
  return sendJson(res, 200, {
    sourceType: 'url',
    title: extracted.title,
    text: extracted.text
  });
}

async function handleSummary(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 12000);
  if (!text) {
    return sendJson(res, 400, { error: 'text is required' });
  }
  const prompt =
    `Summarize the following study content into a clear paragraph plus 4 bullet points.\n\n` +
    `${text}\n\n` +
    `Output plain text only.`;
  const { payload } = await callGemini(prompt);
  return sendJson(res, 200, { summary: extractModelText(payload), provider: 'gemini' });
}

async function handleSummaryChat(req, res) {
  const body = await readJsonBody(req);
  const summary = String(body.summary || '').slice(0, 6000);
  const sourceText = String(body.sourceText || '').slice(0, 12000);
  const question = String(body.question || '').slice(0, 1200);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!summary || !question) {
    return sendJson(res, 400, { error: 'summary and question are required' });
  }

  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${String(m.text || '').slice(0, 800)}`)
    .join('\n');

  const prompt =
    `You are a study assistant answering follow-up questions about a generated summary.\n` +
    `Use the summary as primary context, and source text when needed.\n` +
    `Be concise and accurate.\n\n` +
    `Summary:\n${summary}\n\n` +
    `Source text excerpt:\n${sourceText}\n\n` +
    `Conversation so far:\n${historyText}\n\n` +
    `User question:\n${question}\n\n` +
    `Answer in plain text only.`;

  const { payload } = await callGemini(prompt);
  const answer = extractModelText(payload);
  return sendJson(res, 200, { answer: answer || '' });
}

function heuristicTextbookOutline(text, pageSamples, maxPage) {
  const fromSamples = (Array.isArray(pageSamples) ? pageSamples : [])
    .map((p, idx) => {
      const page = Math.max(1, Math.min(Number(maxPage || 0) || 9999, Number(p?.page || idx + 1)));
      const raw = String(p?.text || '').trim();
      if (!raw) return null;
      const lines = raw
        .split(/(?<=[.!?])\s+|\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      const title = lines.find((x) => /^(chapter|unit|section)\b/i.test(x)) || lines[0] || '';
      if (!title || title.length < 3) return null;
      return { title: title.slice(0, 120), page };
    })
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  for (const c of fromSamples) {
    const k = c.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }
  if (deduped.length) return deduped.slice(0, 40);

  const lines = String(text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = lines.filter((x) => /chapter|unit|section|\d+\./i.test(x)).slice(0, 16);
  return (candidates.length ? candidates : ['Chapter 1', 'Chapter 2', 'Chapter 3']).map(
    (title, idx) => ({
      title: String(title).slice(0, 120),
      page: Math.min(Number(maxPage || 9999), idx + 1)
    })
  );
}

async function handleTextbookOutline(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 70000);
  const pageSamples = Array.isArray(body.pageSamples) ? body.pageSamples.slice(0, 120) : [];
  const maxPage = Math.max(1, Number(body.maxPage || pageSamples.length || 1));

  const fallback = heuristicTextbookOutline(text, pageSamples, maxPage);
  if (!text && !pageSamples.length) {
    return sendJson(res, 400, { error: 'text or pageSamples is required' });
  }

  const compactSamples = pageSamples
    .map((p) => `[p.${Number(p.page || 0)}] ${String(p.text || '').slice(0, 320)}`)
    .join('\n')
    .slice(0, 24000);

  const prompt =
    `Extract the chapter/section outline of this textbook content.\n` +
    `Return JSON only in this exact shape: {"chapters":[{"title":"Chapter name","page":12}]}\n` +
    `Rules:\n` +
    `- Use concise chapter or major section titles.\n` +
    `- Include accurate page numbers based on the provided page samples.\n` +
    `- Keep ordering as it appears in the textbook.\n` +
    `- Return between 6 and 30 entries when possible.\n\n` +
    `Page samples:\n${compactSamples}\n\n` +
    `Text excerpt:\n${text.slice(0, 24000)}`;

  try {
    const { payload } = await callGemini(prompt);
    const modelText = extractModelText(payload);
    const parsed = extractFirstJsonObject(modelText);
    const chapters = (Array.isArray(parsed?.chapters) ? parsed.chapters : [])
      .map((c, idx) => {
        const title = String(c?.title || '').trim();
        const page = Math.max(1, Math.min(maxPage, Number(c?.page || idx + 1)));
        if (!title) return null;
        return { title: title.slice(0, 120), page };
      })
      .filter(Boolean)
      .slice(0, 40);

    if (chapters.length) {
      return sendJson(res, 200, { chapters, mode: 'gemini' });
    }
  } catch (err) {
    return sendJson(res, 200, {
      chapters: fallback,
      mode: 'fallback',
      warning: `Gemini failed: ${err.message}`
    });
  }

  return sendJson(res, 200, { chapters: fallback, mode: 'fallback' });
}

async function handleQuiz(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 12000);
  if (!text) {
    return sendJson(res, 400, { error: 'text is required' });
  }
  const prompt =
    `Create one multiple-choice study question from this content.\n` +
    `Return JSON only in this exact shape: {"quiz":{"q":"...","options":["A","B","C","D"],"answer":"..."}}.\n` +
    `The answer must exactly match one option.\n\n` +
    text;
  const { payload } = await callGemini(prompt);
  const modelText = extractModelText(payload);
  const parsed = extractFirstJsonObject(modelText);
  const quiz = parsed?.quiz || null;
  if (!quiz || !quiz.q || !Array.isArray(quiz.options) || !quiz.answer) {
    return sendJson(res, 200, { quiz: null, provider: 'gemini' });
  }
  const cleanQuiz = {
    q: String(quiz.q).trim(),
    options: quiz.options.map((x) => String(x).trim()).filter(Boolean).slice(0, 4),
    answer: String(quiz.answer).trim()
  };
  return sendJson(res, 200, { quiz: cleanQuiz, provider: 'gemini' });
}

function buildHeuristicQuizSet(text, count = 10) {
  const tokens = (String(text || '').match(/[A-Za-z]{5,}/g) || []).map((x) => x.toLowerCase());
  const unique = [...new Set(tokens)].slice(0, 120);
  if (unique.length < 8) return [];
  const stems = [
    'Which term appears as a key concept in the material?',
    'Which of the following terms is explicitly mentioned in the source?',
    'Select the term that best matches the source content.',
    'Which term would most likely appear in a summary of this source?',
    'Identify the term that is present in the material.'
  ];
  const questions = [];
  for (let i = 0; i < count; i += 1) {
    const answer = unique[(i * 3) % unique.length];
    const distractors = unique.filter((x) => x !== answer).slice(i, i + 12);
    const options = [answer, ...distractors.slice(0, 3)].sort(() => Math.random() - 0.5);
    questions.push({
      q: `${stems[i % stems.length]} (Question ${i + 1})`,
      options,
      answer
    });
  }
  return questions;
}

function normalizeQuizSet(rawQuestions, count) {
  const normalized = (Array.isArray(rawQuestions) ? rawQuestions : [])
    .map((q) => {
      const question = String(q?.q || q?.question || '').trim();
      const answer = String(q?.answer || '').trim();
      const options = Array.isArray(q?.options)
        ? q.options.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
        : [];
      if (!question || !answer || options.length < 2) return null;
      if (!options.includes(answer)) options.unshift(answer);
      return {
        q: question,
        options: [...new Set(options)].slice(0, 4),
        answer
      };
    })
    .filter((x) => x && x.options.length >= 2);
  const deduped = [];
  const seen = new Set();
  const tokenSets = [];
  const jaccard = (a, b) => {
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size || 1;
    return inter / union;
  };
  const tokenized = (s) =>
    new Set(
      String(s || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  for (const q of normalized) {
    const key = q.q.toLowerCase();
    if (seen.has(key)) continue;
    const set = tokenized(q.q);
    const tooSimilar = tokenSets.some((prev) => jaccard(prev, set) >= 0.82);
    if (tooSimilar) continue;
    seen.add(key);
    tokenSets.push(set);
    deduped.push(q);
    if (deduped.length >= count) break;
  }
  return deduped;
}

async function handleQuizSet(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 20000);
  const count = Math.max(5, Math.min(12, Number(body.count || 10)));
  if (!text) {
    return sendJson(res, 400, { error: 'text is required' });
  }

  const prompt =
    `Create ${count} multiple-choice study questions from the content below.\n` +
    `Return JSON only in this exact shape: {"questions":[{"q":"...","options":["A","B","C","D"],"answer":"..."}]}.\n` +
    `Rules:\n` +
    `- Exactly ${count} questions.\n` +
    `- Every question must be distinct and test a different idea.\n` +
    `- Do not repeat wording patterns like "Which term appears..." across questions.\n` +
    `- Vary question style (definition, concept application, comparison, cause/effect, detail recall).\n` +
    `- 4 options per question.\n` +
    `- answer must exactly match one option.\n` +
    `- Focus on key facts/concepts, avoid trivial wording.\n\n` +
    text;
  try {
    const { payload } = await callGeminiForQuiz(prompt);
    const modelText = extractModelText(payload);
    const parsed = extractFirstJsonObject(modelText);
    let questions = normalizeQuizSet(parsed?.questions, count);
    if (questions.length < count) {
      const missing = count - questions.length;
      const used = questions.map((q) => q.q).join('\n');
      const secondPrompt =
        `Generate ${missing} NEW multiple-choice study questions from this content.\n` +
        `Return JSON only: {"questions":[{"q":"...","options":["A","B","C","D"],"answer":"..."}]}.\n` +
        `Do not repeat or paraphrase any existing question below.\n` +
        `Existing questions to avoid:\n${used}\n\n` +
        `Source content:\n${text}`;
      try {
        const second = await callGeminiForQuiz(secondPrompt);
        const secondParsed = extractFirstJsonObject(extractModelText(second.payload));
        const more = normalizeQuizSet(secondParsed?.questions, missing);
        questions = normalizeQuizSet([...questions, ...more], count);
      } catch {
        // Keep existing questions and fill via heuristic below.
      }
    }
    if (questions.length < count) {
      const fill = buildHeuristicQuizSet(text, count * 2);
      const used = new Set(questions.map((q) => q.q.toLowerCase()));
      for (const q of fill) {
        const k = String(q.q || '').toLowerCase();
        if (!used.has(k)) {
          used.add(k);
          questions.push(q);
        }
        if (questions.length >= count) break;
      }
    }
    if (questions.length >= Math.min(6, count)) {
      return sendJson(res, 200, { questions: questions.slice(0, count), provider: 'gemini' });
    }
  } catch {
    // fallback below
  }

  const fallback = buildHeuristicQuizSet(text, count);
  return sendJson(res, 200, { questions: fallback, provider: 'fallback' });
}

async function handleTtsPrepare(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 20000);
  if (!text) {
    return sendJson(res, 400, { error: 'text is required' });
  }
  const prompt =
    `Rewrite the following textbook content into a speech transcript for TTS.\n` +
    `Rules:\n` +
    `- Keep meaning accurate and concise.\n` +
    `- Expand formulas into human spoken math (e.g., "F equals m a", "v sub x").\n` +
    `- Preserve symbols by speaking their meaning naturally.\n` +
    `- Output plain text only.\n\n` +
    text;
  try {
    const { payload } = await callGemini(prompt);
    const speakText = extractModelText(payload) || text;
    return sendJson(res, 200, { speakText });
  } catch (err) {
    return sendJson(res, 200, {
      speakText: text,
      warning: `Gemini preparation failed: ${err.message}`
    });
  }
}

async function handleTtsVoices(req, res) {
  const body = await readJsonBody(req);
  const apiKey = String(body.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    return sendJson(res, 400, { error: 'ElevenLabs API key is required' });
  }
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey }
  });
  if (!r.ok) {
    const detail = await r.text();
    return sendJson(res, 502, { error: `ElevenLabs voices failed: ${detail}` });
  }
  const payload = await r.json();
  return sendJson(res, 200, { voices: payload.voices || [] });
}

async function handleTtsSynthesize(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 5000);
  const voiceId = String(body.voiceId || '').trim();
  const apiKey = String(body.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  const speed = Math.max(0.5, Math.min(2, Number(body.speed || 1)));
  if (!text || !voiceId || !apiKey) {
    return sendJson(res, 400, { error: 'text, voiceId, and ElevenLabs apiKey are required' });
  }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.25,
        use_speaker_boost: true
      },
      speed
    })
  });
  if (!r.ok) {
    const detail = await r.text();
    return sendJson(res, 502, { error: `ElevenLabs synthesis failed: ${detail}` });
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return sendJson(res, 200, { audioBase64: buf.toString('base64') });
}

async function handleSaveState(req, res, docType) {
  const body = await readJsonBody(req);
  const clientId = String(body.clientId || '').slice(0, 128);
  const docId = String(body.docId || 'default').slice(0, 128);
  const state = body.state || {};
  if (!clientId) {
    return sendJson(res, 400, { error: 'clientId is required' });
  }
  await stateStore.save(clientId, docType, docId, state);
  return sendJson(res, 200, { ok: true });
}

async function handleLoadState(req, res, docType, urlObj) {
  const clientId = String(urlObj.searchParams.get('clientId') || '').slice(0, 128);
  const docId = String(urlObj.searchParams.get('docId') || 'default').slice(0, 128);
  if (!clientId) {
    return sendJson(res, 400, { error: 'clientId is required' });
  }
  const row = await stateStore.load(clientId, docType, docId);
  return sendJson(res, 200, row || { state: null, updatedAt: null });
}

function serveStatic(req, res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const abs = path.join(ROOT, path.normalize(requestPath));
  if (!abs.startsWith(ROOT)) {
    return sendText(res, 403, 'Forbidden');
  }
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return sendText(res, 404, 'Not found');
  }
  const ext = path.extname(abs).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  const type = contentTypes[ext] || 'application/octet-stream';
  return sendText(res, 200, fs.readFileSync(abs), type);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  try {
    if (req.method === 'POST' && pathname === '/api/video/analyze') {
      return await handleVideoAnalyze(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/content/extract') {
      return await handleContentExtract(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        build: SERVER_BUILD,
        geminiKeyLoaded: Boolean(GEMINI_API_KEY),
        configuredModel: normalizeModelName(GEMINI_MODEL),
        configuredFallbacks: GEMINI_FALLBACK_MODELS.map(normalizeModelName).filter(Boolean)
      });
    }
    if (req.method === 'POST' && pathname === '/api/textbook/summary') {
      return await handleSummary(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/textbook/summary/chat') {
      return await handleSummaryChat(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/textbook/outline') {
      return await handleTextbookOutline(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/textbook/quiz') {
      return await handleQuiz(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/textbook/quiz-set') {
      return await handleQuizSet(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/tts/prepare') {
      return await handleTtsPrepare(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/tts/voices') {
      return await handleTtsVoices(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/tts/synthesize') {
      return await handleTtsSynthesize(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/state/workspace') {
      return await handleSaveState(req, res, 'workspace');
    }
    if (req.method === 'POST' && pathname === '/api/state/textbook') {
      return await handleSaveState(req, res, 'textbook');
    }
    if (req.method === 'GET' && pathname === '/api/state/workspace') {
      return await handleLoadState(req, res, 'workspace', urlObj);
    }
    if (req.method === 'GET' && pathname === '/api/state/textbook') {
      return await handleLoadState(req, res, 'textbook', urlObj);
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, async () => {
  try {
    await stateStore.ready;
    const mode = stateStore.pool ? 'postgres' : 'memory';
    console.log(
      `SmartNotes server running at http://localhost:${PORT} (state store: ${mode}, geminiKeyLoaded: ${Boolean(
        GEMINI_API_KEY
      )})`
    );
  } catch (err) {
    console.error('State store init failed:', err.message);
  }
});
