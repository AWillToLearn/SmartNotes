const els = {
  navBtns: [...document.querySelectorAll('.nav-btn')],
  views: [...document.querySelectorAll('.view')],
  goBtns: [...document.querySelectorAll('[data-go]')],
  editor: document.getElementById('workspaceEditor'),
  keyPointList: document.getElementById('keyPointList'),
  aiStatus: document.getElementById('aiStatus'),
  videoUrl: document.getElementById('videoUrl'),
  videoFile: document.getElementById('videoFile'),
  loadVideoUrl: document.getElementById('loadVideoUrl'),
  videoPlayer: document.getElementById('videoPlayer'),
  youtubePlayer: document.getElementById('youtubePlayer'),
  videoMsg: document.getElementById('videoMsg'),
  playbackRate: document.getElementById('playbackRate'),
  jumpBack10: document.getElementById('jumpBack10'),
  jumpBack5: document.getElementById('jumpBack5'),
  jumpFwd5: document.getElementById('jumpFwd5'),
  jumpFwd10: document.getElementById('jumpFwd10'),
  playPauseVideo: document.getElementById('playPauseVideo'),
  toggleCaptions: document.getElementById('toggleCaptions'),
  captureFrame: document.getElementById('captureFrame'),
  toggleVideoPanel: document.getElementById('toggleVideoPanel'),
  videoPanel: document.getElementById('videoPanel'),
  currentKeyPoint: document.getElementById('currentKeyPoint'),
  manualSave: document.getElementById('manualSave'),
  showVersions: document.getElementById('showVersions'),
  versionPanel: document.getElementById('versionPanel'),
  shareDoc: document.getElementById('shareDoc'),
  exportPdf: document.getElementById('exportPdf'),
  pageCount: document.getElementById('pageCount'),
  saveState: document.getElementById('saveState'),
  publicLinkDefault: document.getElementById('publicLinkDefault'),
  textbookFile: document.getElementById('textbookFile'),
  textbookName: document.getElementById('textbookName'),
  chapterList: document.getElementById('chapterList'),
  pdfFrame: document.getElementById('pdfFrame'),
  textbookText: document.getElementById('textbookText'),
  annotationOverlay: document.getElementById('annotationOverlay'),
  textbookStatus: document.getElementById('textbookStatus'),
  highlightSel: document.getElementById('highlightSel'),
  underlineSel: document.getElementById('underlineSel'),
  addComment: document.getElementById('addComment'),
  drawMode: document.getElementById('drawMode'),
  chapterSummary: document.getElementById('chapterSummary'),
  chapterQuiz: document.getElementById('chapterQuiz'),
  quizOutput: document.getElementById('quizOutput'),
  ttsPlay: document.getElementById('ttsPlay'),
  ttsLoadVoices: document.getElementById('ttsLoadVoices'),
  ttsPause: document.getElementById('ttsPause'),
  ttsStop: document.getElementById('ttsStop'),
  ttsRate: document.getElementById('ttsRate'),
  ttsVoice: document.getElementById('ttsVoice'),
  jumpBtns: [...document.querySelectorAll('[data-jump]')],
  xpCount: document.getElementById('xpCount'),
  coinCount: document.getElementById('coinCount'),
  gardenShop: document.getElementById('gardenShop'),
  gardenOwned: document.getElementById('gardenOwned')
};

const STORAGE_KEYS = {
  DOC: 'smartnotes.doc.v1',
  VERSIONS: 'smartnotes.versions.v1',
  SETTINGS: 'smartnotes.settings.v1',
  GARDEN: 'smartnotes.garden.v1',
  TEXTBOOK: 'smartnotes.textbook.v1',
  CLIENT_ID: 'smartnotes.client_id.v1'
};

let autosaveTimer;
let drawingMode = false;
let selectedVoice = null;
let ttsAudio = null;
let ttsPreparedText = '';
let textbookPages = [];
let textbookChapters = [];
let textbookPdfObjectUrl = '';
let textbookPdfBuffer = null;
let textbookOcrPages = [];
let textbookBookmarkChapters = [];
let ocrActive = false;
let ttsChunks = [];
let ttsChunkIndex = 0;
let ttsSessionId = 0;
let ttsCurrentLabel = 'document';
const API_BASE = '/api';
let timedKeyPoints = [];
let captionsEnabled = false;
let ytPlayer = null;
let ytApiReadyPromise = null;
let currentYouTubeId = null;
let analysisRequestId = 0;
let usingDirectYouTubeEmbed = false;

const shopItems = [
  { id: 'plant', label: 'Potted Plant', cost: 25 },
  { id: 'lamp', label: 'Warm Lamp', cost: 40 },
  { id: 'bench', label: 'Garden Bench', cost: 65 }
];

const DOC_PAGE_HEIGHT = 1120;

function getClientId() {
  let id = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
  }
  return id;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setView(id) {
  els.navBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  els.views.forEach((v) => v.classList.toggle('active', v.id === id));
}

function updateEditorPageSizing() {
  hydrateNoteBlocks();
  const neededPages = Math.max(1, Math.ceil(els.editor.scrollHeight / DOC_PAGE_HEIGHT));
  els.editor.style.height = `${neededPages * DOC_PAGE_HEIGHT}px`;
  if (els.pageCount) {
    els.pageCount.textContent = neededPages === 1 ? 'Page 1' : `${neededPages} pages`;
  }
}

function extractYouTubeVideoId(input) {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '').trim() || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiReadyPromise) return ytApiReadyPromise;
  ytApiReadyPromise = new Promise((resolve) => {
    const existing = document.getElementById('youtube-iframe-api');
    if (!existing) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };
  });
  return ytApiReadyPromise;
}

function renderTimedKeyPoints(points) {
  timedKeyPoints = Array.isArray(points) ? points : [];
  if (!timedKeyPoints.length) return;
  els.keyPointList.innerHTML = '';
  timedKeyPoints.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'drag-item';
    li.draggable = true;
    li.dataset.timeSec = String(Number(p.timeSec || 0));
    li.textContent = `[${p.label || '00:00'}] ${p.text}`;
    li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', li.textContent));
    li.addEventListener('click', () => seekVideoTo(Number(p.timeSec || 0)));
    els.keyPointList.appendChild(li);
  });
  updateCurrentKeyPointIndicator();
}

function formatTimeLabel(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function appendScreenshotSuggestions(items) {
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'drag-item';
    li.draggable = true;
    li.dataset.timeSec = String(item.timeSec || 0);
    li.dataset.imageUrl = item.imageUrl;
    li.dataset.caption = `[${item.label}] ${item.caption || 'Screenshot suggestion'}`;
    li.innerHTML = `<div><strong>[${item.label}] Screenshot suggestion</strong></div><img src="${item.imageUrl}" alt="suggested frame" style="width:100%;border-radius:8px;margin-top:6px;" /><div style="margin-top:6px;font-size:0.88rem;color:#4f4f4f;">${item.caption || ''}</div>`;
    li.addEventListener('dragstart', (e) => {
      const payload = {
        type: 'screenshot',
        imageUrl: item.imageUrl,
        caption: li.dataset.caption
      };
      e.dataTransfer.setData('application/x-smartnotes-item', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', li.dataset.caption);
    });
    li.addEventListener('click', () => seekVideoTo(Number(item.timeSec || 0)));
    els.keyPointList.appendChild(li);
  });
}

async function captureFrameAt(timeSec) {
  return new Promise((resolve) => {
    if (!els.videoPlayer.videoWidth) return resolve(null);
    const done = () => {
      const c = document.createElement('canvas');
      c.width = els.videoPlayer.videoWidth;
      c.height = els.videoPlayer.videoHeight;
      c.getContext('2d').drawImage(els.videoPlayer, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    const onSeeked = () => {
      els.videoPlayer.removeEventListener('seeked', onSeeked);
      done();
    };
    els.videoPlayer.addEventListener('seeked', onSeeked, { once: true });
    els.videoPlayer.currentTime = Math.max(0, Number(timeSec || 0));
    setTimeout(() => {
      els.videoPlayer.removeEventListener('seeked', onSeeked);
      done();
    }, 700);
  });
}

async function attachScreenshotSuggestionsFromVideo(points) {
  if (!Array.isArray(points) || !points.length) return;
  if (els.youtubePlayer.style.display !== 'none' && currentYouTubeId) {
    const thumbs = ['1.jpg', '2.jpg', '3.jpg'];
    const items = points.slice(0, 3).map((p, idx) => ({
      timeSec: Number(p.timeSec || 0),
      label: p.label || formatTimeLabel(p.timeSec),
      caption: p.text,
      imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(currentYouTubeId)}/${thumbs[idx % thumbs.length]}`
    }));
    appendScreenshotSuggestions(items);
    return;
  }
  if (!els.videoPlayer.videoWidth) return;
  const wasPaused = els.videoPlayer.paused;
  const originalTime = Number(els.videoPlayer.currentTime || 0);
  const items = [];
  for (const p of points.slice(0, 3)) {
    const imageUrl = await captureFrameAt(p.timeSec);
    if (imageUrl) {
      items.push({
        timeSec: Number(p.timeSec || 0),
        label: p.label || formatTimeLabel(p.timeSec),
        caption: p.text,
        imageUrl
      });
    }
  }
  els.videoPlayer.currentTime = originalTime;
  if (!wasPaused) {
    try {
      await els.videoPlayer.play();
    } catch {}
  }
  appendScreenshotSuggestions(items);
}

function attachScreenshotSuggestionsFromApi(items) {
  if (!Array.isArray(items) || !items.length) return;
  const mapped = items
    .map((s, idx) => {
      const t = Number(s.timeSec || 0);
      const label = s.label || formatTimeLabel(t);
      const caption = String(s.caption || '').trim();
      let imageUrl = String(s.imageUrl || '').trim();
      if (!imageUrl && currentYouTubeId) {
        const thumbs = ['1.jpg', '2.jpg', '3.jpg'];
        imageUrl = `https://i.ytimg.com/vi/${encodeURIComponent(currentYouTubeId)}/${thumbs[idx % thumbs.length]}`;
      }
      return imageUrl ? { timeSec: t, label, caption, imageUrl } : null;
    })
    .filter(Boolean);
  appendScreenshotSuggestions(mapped);
}

function getCurrentVideoDuration() {
  if (els.youtubePlayer.style.display !== 'none' && ytPlayer?.getDuration) {
    try {
      return Number(ytPlayer.getDuration() || 0);
    } catch {
      return 0;
    }
  }
  return Number(els.videoPlayer.duration || 0);
}

function rebalanceTimedPointsToDuration() {
  if (!timedKeyPoints.length) return;
  const duration = getCurrentVideoDuration();
  if (!duration || !Number.isFinite(duration)) return;
  const maxT = timedKeyPoints.reduce((m, p) => Math.max(m, Number(p.timeSec || 0)), 0);
  if (!maxT || maxT >= duration * 0.8) return;

  const scale = duration / maxT;
  timedKeyPoints = timedKeyPoints
    .map((p) => {
      const t = Math.min(duration - 1, Math.max(0, Math.round(Number(p.timeSec || 0) * scale)));
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(t % 60).padStart(2, '0');
      return { ...p, timeSec: t, label: `${mm}:${ss}` };
    })
    .sort((a, b) => a.timeSec - b.timeSec);

  renderTimedKeyPoints(timedKeyPoints);
}

function getCurrentVideoTime() {
  if (usingDirectYouTubeEmbed) return 0;
  if (els.youtubePlayer.style.display !== 'none' && ytPlayer?.getCurrentTime) {
    try {
      return Number(ytPlayer.getCurrentTime() || 0);
    } catch {
      return 0;
    }
  }
  return Number(els.videoPlayer.currentTime || 0);
}

function seekVideoTo(sec) {
  const target = Math.max(0, Number(sec) || 0);
  if (usingDirectYouTubeEmbed) return;
  if (els.youtubePlayer.style.display !== 'none' && ytPlayer?.seekTo) {
    try {
      ytPlayer.seekTo(target, true);
    } catch {}
    return;
  }
  els.videoPlayer.currentTime = target;
}

function setVideoPlaybackRate(rate) {
  const r = Number(rate);
  if (usingDirectYouTubeEmbed) return;
  if (els.youtubePlayer.style.display !== 'none' && ytPlayer?.setPlaybackRate) {
    try {
      ytPlayer.setPlaybackRate(r);
    } catch {}
  } else {
    els.videoPlayer.playbackRate = r;
  }
}

function toggleVideoPlayback() {
  if (usingDirectYouTubeEmbed) return;
  if (els.youtubePlayer.style.display !== 'none' && ytPlayer) {
    try {
      const state = ytPlayer.getPlayerState?.();
      if (state === 1) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    } catch {}
    return;
  }
  if (els.videoPlayer.paused) els.videoPlayer.play();
  else els.videoPlayer.pause();
}

function updateCurrentKeyPointIndicator() {
  if (!timedKeyPoints.length) {
    els.currentKeyPoint.textContent = 'Current key point: none';
    return;
  }
  const current = getCurrentVideoTime();
  let activeIdx = -1;
  for (let i = 0; i < timedKeyPoints.length; i += 1) {
    const start = Number(timedKeyPoints[i].timeSec || 0);
    const next = i + 1 < timedKeyPoints.length ? Number(timedKeyPoints[i + 1].timeSec || Infinity) : Infinity;
    if (current >= start && current < next) {
      activeIdx = i;
      break;
    }
  }
  [...els.keyPointList.querySelectorAll('.drag-item')].forEach((li, idx) => {
    li.classList.toggle('active', idx === activeIdx);
  });
  if (activeIdx >= 0) {
    const p = timedKeyPoints[activeIdx];
    els.currentKeyPoint.textContent = `Current key point (${p.label || '00:00'}): ${p.text}`;
  } else {
    els.currentKeyPoint.textContent = 'Current key point: none';
  }
}

function awardXP(amount, reason) {
  const state = loadJSON(STORAGE_KEYS.GARDEN, { xp: 0, coins: 0, owned: [] });
  state.xp += amount;
  state.coins += Math.floor(amount / 2);
  saveJSON(STORAGE_KEYS.GARDEN, state);
  renderGarden();
  if (reason) {
    els.saveState.textContent = `+${amount} XP: ${reason}`;
    setTimeout(() => (els.saveState.textContent = 'Ready'), 1500);
  }
}

function seedKeyPoints(input) {
  timedKeyPoints = [];
  const lines = [
    'Definition + key idea from lecture segment.',
    'Step-by-step method with an example.',
    'Formula and units to remember.',
    'Potential quiz question from this topic.',
    'Summary: what this section proves.'
  ];
  if (input && input.length > 20) {
    lines[0] = `Context from source: ${input.slice(0, 70)}...`;
  }
  els.keyPointList.innerHTML = '';
  lines.forEach((line) => {
    const li = document.createElement('li');
    li.className = 'drag-item';
    li.draggable = true;
    li.textContent = line;
    li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', line));
    els.keyPointList.appendChild(li);
  });
  updateCurrentKeyPointIndicator();
}

async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function extractOutlineChapters(pdf) {
  const outline = await pdf.getOutline();
  if (!Array.isArray(outline) || !outline.length) return [];
  const items = [];
  const walk = (nodes, level) => {
    nodes.forEach((n) => {
      items.push({ item: n, level });
      if (Array.isArray(n.items) && n.items.length) {
        walk(n.items, level + 1);
      }
    });
  };
  walk(outline, 1);

  const out = [];
  for (const entry of items) {
    const rawTitle = String(entry.item?.title || '').replace(/\s+/g, ' ').trim();
    if (!rawTitle) continue;
    let dest = entry.item?.dest || null;
    if (typeof dest === 'string') {
      try {
        dest = await pdf.getDestination(dest);
      } catch {
        dest = null;
      }
    }
    let page = 0;
    if (Array.isArray(dest) && dest[0]) {
      try {
        const pageIdx = await pdf.getPageIndex(dest[0]);
        page = Number(pageIdx) + 1;
      } catch {
        page = 0;
      }
    }
    out.push({ title: rawTitle, page, level: entry.level });
  }
  const seen = new Set();
  return out
    .filter((x) => {
      const key = `${x.title.toLowerCase()}::${x.page || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

async function extractPdfData(file) {
  if (!window.pdfjsLib) return { fullText: '', pages: [] };
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js';
  }
  const buffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const outlineChapters = await extractOutlineChapters(pdf);
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const line = textContent.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: i, text: line });
  }
  const fullText = pages.map((p) => p.text).join('\n').replace(/\s+\n/g, '\n').trim();
  return { fullText, pages, outlineChapters };
}

async function ensureTesseractLoaded() {
  if (window.Tesseract?.recognize) return;
  await new Promise((resolve, reject) => {
    const existing = document.getElementById('tesseract-lib');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load OCR library.')), {
        once: true
      });
      return;
    }
    const s = document.createElement('script');
    s.id = 'tesseract-lib';
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load OCR library.'));
    document.head.appendChild(s);
  });
}

async function buildPdfDocFromBuffer() {
  if (!window.pdfjsLib || !textbookPdfBuffer) return null;
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js';
  }
  const loadingTask = window.pdfjsLib.getDocument({ data: textbookPdfBuffer.slice(0) });
  return loadingTask.promise;
}

async function ocrPdfPage(pageNumber, scale = 2.1) {
  const existing = textbookOcrPages.find((p) => p.page === pageNumber && p.text);
  if (existing) return existing.text;
  const pdf = await buildPdfDocFromBuffer();
  if (!pdf) return '';
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  await ensureTesseractLoaded();
  const result = await window.Tesseract.recognize(canvas, 'eng', {
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1'
  });
  const text = String(result?.data?.text || '').replace(/\s+\n/g, '\n').trim();
  const row = { page: pageNumber, text };
  textbookOcrPages = [...textbookOcrPages.filter((p) => p.page !== pageNumber), row].sort(
    (a, b) => a.page - b.page
  );
  return text;
}

async function ocrPdfRange(startPage, endPage, reasonLabel) {
  if (!textbookPdfBuffer) return [];
  if (ocrActive) return textbookOcrPages;
  ocrActive = true;
  try {
    const out = [];
    const first = Math.max(1, Number(startPage || 1));
    const last = Math.max(first, Number(endPage || first));
    for (let p = first; p <= last; p += 1) {
      els.textbookStatus.textContent = `OCR reading page ${p}/${last} for ${reasonLabel}...`;
      const text = await ocrPdfPage(p);
      out.push({ page: p, text });
    }
    return out;
  } finally {
    ocrActive = false;
  }
}

async function ocrUntilMinChars(startPage, maxPage, minChars, reasonLabel) {
  const first = Math.max(1, Number(startPage || 1));
  const last = Math.max(first, Number(maxPage || first));
  for (let p = first; p <= last; p += 1) {
    await ocrPdfRange(p, p, reasonLabel);
    const combined = textbookOcrPages
      .filter((row) => row.page >= first && row.page <= p)
      .map((row) => row.text)
      .join('\n')
      .trim();
    if (combined.length >= minChars) {
      return combined;
    }
  }
  return textbookOcrPages
    .filter((row) => row.page >= first && row.page <= last)
    .map((row) => row.text)
    .join('\n')
    .trim();
}

async function checkBackendHealth() {
  try {
    const h = await apiGet('/health');
    if (!h?.ok) return;
    if (!h.geminiKeyLoaded) {
      els.aiStatus.textContent = `Backend build ${h.build}: Gemini key not loaded.`;
    }
  } catch {
    // ignore health probe failures
  }
}

async function analyzeVideoSource(sourceLabel) {
  const reqId = ++analysisRequestId;
  els.aiStatus.textContent = `AI processing ${sourceLabel}...`;
  apiPost('/video/analyze', { source: sourceLabel, stage: 'quick' })
    .then((draft) => {
      if (reqId !== analysisRequestId) return;
      const timedDraft = draft.timedKeyPoints || [];
      if (timedDraft.length) {
        renderTimedKeyPoints(timedDraft);
      } else {
        seedKeyPoints(sourceLabel);
      }
      els.aiStatus.textContent = 'AI draft suggestions ready. Refining with full analysis...';
    })
    .catch(() => {});

  try {
    const data = await apiPost('/video/analyze', { source: sourceLabel, stage: 'full' });
    if (reqId !== analysisRequestId) return;
    const points = data.keyPoints || [];
    const timed = data.timedKeyPoints || [];
    const screenshotSuggestions = data.screenshotSuggestions || [];
    if (points.length) {
      if (timed.length) {
        renderTimedKeyPoints(timed);
        if (screenshotSuggestions.length) attachScreenshotSuggestionsFromApi(screenshotSuggestions);
        else await attachScreenshotSuggestionsFromVideo(timed);
      } else {
        els.keyPointList.innerHTML = '';
        points.forEach((line) => {
          const li = document.createElement('li');
          li.className = 'drag-item';
          li.draggable = true;
          li.textContent = line;
          li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', line));
          els.keyPointList.appendChild(li);
        });
        timedKeyPoints = [];
      }
    } else {
      seedKeyPoints(sourceLabel);
      timedKeyPoints = [];
    }
    if (data.analysisMode === 'fallback') {
      const reason = data.warning ? ` Reason: ${String(data.warning).slice(0, 140)}` : '';
      els.aiStatus.textContent = `AI partial fallback: key points generated, but Gemini call failed.${reason}`;
    } else if (data.usedYouTubeTranscript) {
      els.aiStatus.textContent = 'AI ready: key points generated from YouTube transcript.';
    } else {
      els.aiStatus.textContent = 'AI ready: key points and suggestions generated.';
    }
    awardXP(10, 'AI analysis completed');
  } catch {
    if (reqId !== analysisRequestId) return;
    seedKeyPoints(sourceLabel);
    timedKeyPoints = [];
    els.aiStatus.textContent = 'AI backend unavailable. Using local fallback suggestions.';
  }
}

function saveDoc(versionLabel = 'autosave') {
  const content = els.editor.innerHTML;
  localStorage.setItem(STORAGE_KEYS.DOC, content);
  const versions = loadJSON(STORAGE_KEYS.VERSIONS, []);
  versions.unshift({ at: new Date().toISOString(), label: versionLabel, content });
  saveJSON(STORAGE_KEYS.VERSIONS, versions.slice(0, 20));
  els.saveState.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  updateEditorPageSizing();
  syncWorkspaceState();
}

function syncWorkspaceState() {
  const payload = {
    clientId: getClientId(),
    docId: 'default',
    state: {
      content: els.editor.innerHTML,
      versions: loadJSON(STORAGE_KEYS.VERSIONS, []),
      settings: loadJSON(STORAGE_KEYS.SETTINGS, { publicByDefault: false })
    }
  };
  apiPost('/state/workspace', payload).catch(() => {
    // Keep local behavior if remote storage is unavailable.
  });
}

function syncTextbookState() {
  const payload = {
    clientId: getClientId(),
    docId: 'default',
    state: {
      name: els.textbookName.value,
      text: els.textbookText.value
    }
  };
  apiPost('/state/textbook', payload).catch(() => {
    // Keep local behavior if remote storage is unavailable.
  });
}

async function hydrateRemoteState() {
  const clientId = encodeURIComponent(getClientId());
  try {
    const workspace = await apiGet(`/state/workspace?clientId=${clientId}&docId=default`);
    if (workspace?.state) {
      if (workspace.state.content) {
        els.editor.innerHTML = workspace.state.content;
        updateEditorPageSizing();
      }
      if (workspace.state.versions) {
        saveJSON(STORAGE_KEYS.VERSIONS, workspace.state.versions);
      }
      if (workspace.state.settings) {
        saveJSON(STORAGE_KEYS.SETTINGS, workspace.state.settings);
        els.publicLinkDefault.checked = !!workspace.state.settings.publicByDefault;
      }
    }
  } catch {
    // Local state remains source of truth when remote load fails.
  }

  try {
    const textbook = await apiGet(`/state/textbook?clientId=${clientId}&docId=default`);
    if (textbook?.state) {
      if (textbook.state.name) {
        els.textbookName.value = textbook.state.name;
        saveJSON(STORAGE_KEYS.TEXTBOOK, { name: textbook.state.name });
      }
      if (textbook.state.text) {
        els.textbookText.value = textbook.state.text;
        populateChapterList(textbook.state.text);
      }
    }
  } catch {
    // Local fallback.
  }
  updateEditorPageSizing();
}

function renderVersions() {
  const versions = loadJSON(STORAGE_KEYS.VERSIONS, []);
  if (!versions.length) {
    els.versionPanel.innerHTML = '<p>No versions yet.</p>';
    return;
  }
  els.versionPanel.innerHTML = versions
    .map(
      (v, idx) =>
        `<button class="version-load" data-idx="${idx}">${new Date(v.at).toLocaleString()} - ${v.label}</button>`
    )
    .join('');
  [...els.versionPanel.querySelectorAll('.version-load')].forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = versions[Number(btn.dataset.idx)];
      if (!v) return;
      els.editor.innerHTML = v.content;
      saveDoc('restored-version');
      awardXP(3, 'version restored');
    });
  });
}

function insertHtmlAtCursor(html) {
  els.editor.focus();
  document.execCommand('insertHTML', false, html);
}

function createNoteBlock({ html, text }) {
  const block = document.createElement('div');
  block.className = 'note-block';
  block.draggable = false;

  const content = document.createElement('div');
  content.className = 'note-content';
  content.contentEditable = 'false';
  if (html) content.innerHTML = html;
  else content.textContent = text || '';

  const handle = document.createElement('button');
  handle.className = 'note-handle';
  handle.type = 'button';
  handle.title = 'Hold and drag to reorder';
  handle.textContent = '↕';

  handle.addEventListener('mousedown', () => {
    block.draggable = true;
  });
  handle.addEventListener('mouseup', () => {
    setTimeout(() => {
      block.draggable = false;
    }, 0);
  });

  block.addEventListener('dragstart', (e) => {
    block.classList.add('dragging');
    e.dataTransfer.setData('application/x-smartnotes-reorder', 'note-block');
    e.dataTransfer.effectAllowed = 'move';
  });
  block.addEventListener('dragend', () => {
    block.classList.remove('dragging');
    block.draggable = false;
    saveDoc('reorder-note');
  });

  content.addEventListener('dblclick', () => {
    content.contentEditable = 'true';
    content.focus();
  });
  content.addEventListener('blur', () => {
    content.contentEditable = 'false';
    saveDoc('edit-note');
  });

  block.appendChild(content);
  block.appendChild(handle);
  block.dataset.hydrated = '1';
  return block;
}

function hydrateNoteBlocks() {
  [...els.editor.querySelectorAll('.note-block')].forEach((block) => {
    if (block.dataset.hydrated === '1') return;
    const content = block.querySelector('.note-content');
    let handle = block.querySelector('.note-handle');
    if (!content) return;
    if (!handle) {
      handle = document.createElement('button');
      handle.className = 'note-handle';
      handle.type = 'button';
      handle.title = 'Hold and drag to reorder';
      handle.textContent = '↕';
      block.appendChild(handle);
    }
    handle.addEventListener('mousedown', () => {
      block.draggable = true;
    });
    handle.addEventListener('mouseup', () => {
      setTimeout(() => {
        block.draggable = false;
      }, 0);
    });
    block.addEventListener('dragstart', (e) => {
      block.classList.add('dragging');
      e.dataTransfer.setData('application/x-smartnotes-reorder', 'note-block');
      e.dataTransfer.effectAllowed = 'move';
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      block.draggable = false;
      saveDoc('reorder-note');
    });
    content.addEventListener('dblclick', () => {
      content.contentEditable = 'true';
      content.focus();
    });
    content.addEventListener('blur', () => {
      content.contentEditable = 'false';
      saveDoc('edit-note');
    });
    block.dataset.hydrated = '1';
  });
}

function initToolbar() {
  [...document.querySelectorAll('[data-cmd]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      awardXP(1);
    });
  });
  document.getElementById('fontSize').addEventListener('change', (e) => {
    document.execCommand('fontSize', false, e.target.value);
  });
  document.getElementById('insertTable').addEventListener('click', () => {
    insertHtmlAtCursor('<table border="1" style="border-collapse:collapse;width:100%"><tr><td>Cell</td><td>Cell</td></tr></table><p></p>');
    awardXP(2, 'table inserted');
  });
}

function initWorkspaceDnD() {
  els.editor.addEventListener('dragover', (e) => e.preventDefault());
  els.editor.addEventListener('dragover', (e) => {
    const dragging = els.editor.querySelector('.note-block.dragging');
    if (!dragging) return;
    const target = e.target.closest('.note-block');
    if (!target || target === dragging) return;
    const rect = target.getBoundingClientRect();
    const placeAfter = e.clientY > rect.top + rect.height / 2;
    if (placeAfter) target.after(dragging);
    else target.before(dragging);
  });
  els.editor.addEventListener('drop', (e) => {
    e.preventDefault();
    const reorder = e.dataTransfer.getData('application/x-smartnotes-reorder');
    if (reorder) {
      updateEditorPageSizing();
      return;
    }
    const rich = e.dataTransfer.getData('application/x-smartnotes-item');
    if (rich) {
      try {
        const payload = JSON.parse(rich);
        if (payload.type === 'screenshot' && payload.imageUrl) {
          const safeCaption = String(payload.caption || 'Screenshot');
          const block = createNoteBlock({
            html: `<figure><img src="${payload.imageUrl}" alt="${safeCaption.replace(/"/g, '&quot;')}" /><figcaption>${safeCaption}</figcaption></figure>`
          });
          els.editor.appendChild(block);
          updateEditorPageSizing();
          awardXP(5, 'screenshot added');
          saveDoc('drag-drop-screenshot');
          return;
        }
      } catch {}
    }
    const text = e.dataTransfer.getData('text/plain');
    const block = createNoteBlock({ text: `• ${text}` });
    els.editor.appendChild(block);
    updateEditorPageSizing();
    awardXP(4, 'key point added');
    saveDoc('drag-drop');
  });
}

function initVideo() {
  els.loadVideoUrl.addEventListener('click', () => {
    const url = els.videoUrl.value.trim();
    if (!url) return;
    const ytId = extractYouTubeVideoId(url);
    if (ytId) {
      currentYouTubeId = ytId;
      usingDirectYouTubeEmbed = false;
      els.videoPlayer.pause();
      els.videoPlayer.removeAttribute('src');
      els.videoPlayer.load();
      els.videoPlayer.style.display = 'none';
      ensureYouTubeApi()
        .then(() => {
          const fallbackTimer = setTimeout(() => {
            if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') {
              usingDirectYouTubeEmbed = true;
              els.youtubePlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?rel=0&modestbranding=1`;
              els.youtubePlayer.style.display = 'block';
              els.videoMsg.textContent = 'YouTube loaded in direct embed mode.';
            }
          }, 3500);
          if (!ytPlayer) {
            ytPlayer = new YT.Player('youtubePlayer', {
              videoId: ytId,
              playerVars: {
                autoplay: 0,
                controls: 1,
                rel: 0,
                modestbranding: 1
              },
              events: {
                onReady: () => {
                  clearTimeout(fallbackTimer);
                  els.videoMsg.textContent = 'YouTube player ready.';
                  try {
                    ytPlayer.playVideo();
                  } catch {}
                  setTimeout(rebalanceTimedPointsToDuration, 700);
                },
                onError: (e) => {
                  clearTimeout(fallbackTimer);
                  const code = Number(e?.data || 0);
                  if (code === 101 || code === 150) {
                    els.videoMsg.textContent =
                      'This YouTube video cannot be embedded on external sites.';
                  } else {
                    els.videoMsg.textContent = `YouTube playback error code: ${code}`;
                  }
                }
              }
            });
          } else if (ytPlayer.loadVideoById) {
            clearTimeout(fallbackTimer);
            ytPlayer.loadVideoById(ytId);
            try {
              ytPlayer.playVideo();
            } catch {}
            setTimeout(rebalanceTimedPointsToDuration, 700);
          }
          els.youtubePlayer.style.display = 'block';
          els.videoMsg.textContent = 'YouTube video loaded.';
        })
        .catch(() => {
          usingDirectYouTubeEmbed = true;
          els.youtubePlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?rel=0&modestbranding=1`;
          els.youtubePlayer.style.display = 'block';
          els.videoMsg.textContent = 'YouTube API failed; switched to direct embed.';
        });
    } else {
      currentYouTubeId = null;
      usingDirectYouTubeEmbed = false;
      if (ytPlayer?.stopVideo) {
        try {
          ytPlayer.stopVideo();
        } catch {}
      }
      els.youtubePlayer.style.display = 'none';
      els.videoPlayer.style.display = 'block';
      els.videoPlayer.src = url;
      els.videoMsg.textContent = 'URL loaded. Some providers may block direct playback.';
    }
    analyzeVideoSource(url);
  });

  els.videoFile.addEventListener('change', () => {
    const file = els.videoFile.files?.[0];
    if (!file) return;
    if (ytPlayer?.stopVideo) {
      try {
        ytPlayer.stopVideo();
      } catch {}
    }
    els.youtubePlayer.style.display = 'none';
    currentYouTubeId = null;
    usingDirectYouTubeEmbed = false;
    els.videoPlayer.style.display = 'block';
    els.videoPlayer.src = URL.createObjectURL(file);
    els.videoMsg.textContent = `Loaded ${file.name}`;
    els.videoPlayer.onloadedmetadata = () => rebalanceTimedPointsToDuration();
    analyzeVideoSource(`local-file:${file.name}`);
  });

  document.getElementById('startLiveNotes').addEventListener('click', () => {
    els.aiStatus.textContent = 'Live Notes mode: key points now track current playback time.';
    awardXP(7, 'live mode started');
  });

  els.playbackRate.addEventListener('change', () => {
    setVideoPlaybackRate(els.playbackRate.value);
  });

  els.jumpBack10.addEventListener('click', () => seekVideoTo(getCurrentVideoTime() - 10));
  els.jumpBack5.addEventListener('click', () => seekVideoTo(getCurrentVideoTime() - 5));
  els.jumpFwd5.addEventListener('click', () => seekVideoTo(getCurrentVideoTime() + 5));
  els.jumpFwd10.addEventListener('click', () => seekVideoTo(getCurrentVideoTime() + 10));
  els.playPauseVideo.addEventListener('click', () => toggleVideoPlayback());

  els.toggleCaptions.addEventListener('click', () => {
    captionsEnabled = !captionsEnabled;
    if (els.youtubePlayer.style.display !== 'none') {
      els.videoMsg.textContent = 'Caption toggle for YouTube depends on player settings.';
      return;
    }
    const tracks = els.videoPlayer.textTracks || [];
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = captionsEnabled ? 'showing' : 'disabled';
    }
  });

  els.captureFrame.addEventListener('click', async () => {
    if (els.youtubePlayer.style.display !== 'none') {
      els.videoMsg.textContent = 'Screenshot from YouTube embed is blocked by browser security.';
      return;
    }
    if (!els.videoPlayer.videoWidth) {
      els.videoMsg.textContent = 'Play a video first.';
      return;
    }
    const c = document.createElement('canvas');
    c.width = els.videoPlayer.videoWidth;
    c.height = els.videoPlayer.videoHeight;
    c.getContext('2d').drawImage(els.videoPlayer, 0, 0);
    c.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        els.videoMsg.textContent = 'Screenshot copied to clipboard.';
        awardXP(5, 'screenshot captured');
      } catch {
        els.videoMsg.textContent = 'Clipboard image copy not supported; use right-click save.';
      }
    });
  });

  els.toggleVideoPanel.addEventListener('click', () => {
    const usingYoutube = els.youtubePlayer.style.display !== 'none';
    const target = usingYoutube ? els.youtubePlayer : els.videoPlayer;
    const hidden = target.style.display === 'none';
    target.style.display = hidden ? 'block' : 'none';
    els.toggleVideoPanel.textContent = hidden ? 'Collapse' : 'Expand';
  });

  setInterval(updateCurrentKeyPointIndicator, 500);
}

function initSharingAndExport() {
  els.manualSave.addEventListener('click', () => {
    saveDoc('manual-save');
    awardXP(2, 'manual save');
  });

  els.showVersions.addEventListener('click', () => {
    els.versionPanel.classList.toggle('hidden');
    renderVersions();
  });

  els.shareDoc.addEventListener('click', async () => {
    const publicDefault = loadJSON(STORAGE_KEYS.SETTINGS, { publicByDefault: false }).publicByDefault;
    const linkType = publicDefault ? 'public' : 'private';
    const token = crypto.randomUUID().slice(0, 8);
    const fakeUrl = `${location.origin}${location.pathname}?doc=${token}&access=${linkType}`;
    try {
      await navigator.clipboard.writeText(fakeUrl);
      alert(`Share link copied (${linkType}): ${fakeUrl}`);
    } catch {
      alert(`Share link: ${fakeUrl}`);
    }
    awardXP(2, 'share link generated');
  });

  els.exportPdf.addEventListener('click', () => {
    window.print();
    awardXP(2, 'export started');
  });

  els.publicLinkDefault.addEventListener('change', () => {
    saveJSON(STORAGE_KEYS.SETTINGS, { publicByDefault: els.publicLinkDefault.checked });
    syncWorkspaceState();
  });
}

function normalizeChapterEntries(entries, maxPage) {
  return (Array.isArray(entries) ? entries : [])
    .map((c, idx) => {
      const title = String(c?.title || c || '').trim();
      const pageRaw = Number(c?.page || c?.pageNumber || 0);
      if (!title) return null;
      const page = maxPage ? Math.min(maxPage, Math.max(1, pageRaw || idx + 1)) : idx + 1;
      return { title, page };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function buildHeuristicChaptersFromPages(pages, text) {
  const byPage = (Array.isArray(pages) ? pages : [])
    .map((p, idx) => {
      const lines = String(p.text || '')
        .split(/(?<=[.!?])\s+|\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      const heading = lines.find((ln) => /^(chapter|unit|section)\b/i.test(ln)) || lines[0] || '';
      if (!heading || heading.length < 3) return null;
      return {
        title: heading.slice(0, 100),
        page: Number(p.page || idx + 1)
      };
    })
    .filter(Boolean);

  if (byPage.length) {
    const seen = new Set();
    return byPage.filter((c) => {
      const k = c.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const lines = String(text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = lines.filter((x) => /chapter|unit|section|\d+\./i.test(x)).slice(0, 12);
  return (candidates.length ? candidates : ['Chapter 1', 'Chapter 2', 'Chapter 3']).map((title, i) => ({
    title,
    page: i + 1
  }));
}

async function fetchChapterOutlineFromAi(fullText, pages) {
  const pageSamples = (Array.isArray(pages) ? pages : []).slice(0, 80).map((p) => ({
    page: Number(p.page || 0),
    text: String(p.text || '').slice(0, 420)
  }));
  return apiPost('/textbook/outline', {
    text: String(fullText || '').slice(0, 60000),
    pageSamples,
    maxPage: pages.length || 0
  });
}

function renderChapterList(entries) {
  const chapters = normalizeChapterEntries(entries, textbookPages.length);
  textbookChapters = chapters;
  if (!chapters.length) {
    els.chapterList.innerHTML = '<li class="drag-item">No chapters detected yet.</li>';
    return;
  }
  els.chapterList.innerHTML = chapters
    .map(
      (c, i) =>
        `<li class="chapter-row">
          <button class="chapter-jump" data-index="${i}" title="Jump to ${c.title}">${c.title}</button>
          <button class="chapter-tts" data-index="${i}" title="Read from this chapter">+</button>
        </li>`
    )
    .join('');
}

async function populateChapterList(text, pages = [], seeded = []) {
  const seededChapters = normalizeChapterEntries(seeded, pages.length);
  const fallback = seededChapters.length ? seededChapters : buildHeuristicChaptersFromPages(pages, text);
  renderChapterList(fallback);
  if (seededChapters.length) {
    els.textbookStatus.textContent = `Outline ready (${seededChapters.length} chapters from PDF bookmarks).`;
  }
  if (!pages.length) {
    if (fallback.length) {
      els.textbookStatus.textContent = `Outline ready (${fallback.length} chapters).`;
    }
    return;
  }
  if (seededChapters.length) return;
  try {
    els.textbookStatus.textContent = 'AI is checking for chapters/chapter titles...';
    const data = await fetchChapterOutlineFromAi(text, pages);
    const aiChapters = normalizeChapterEntries(data?.chapters, pages.length);
    if (aiChapters.length) {
      renderChapterList(aiChapters);
      els.textbookStatus.textContent = `Outline ready (${aiChapters.length} chapters).`;
      return;
    }
  } catch {
    // Keep heuristic chapters if AI outline fails.
  }
  els.textbookStatus.textContent = `Outline ready (${fallback.length} chapters).`;
}

function jumpToChapter(index) {
  const chapter = textbookChapters[index];
  if (!chapter || !textbookPdfObjectUrl) return;
  const page = Math.max(1, resolveChapterStartPage(chapter));
  els.pdfFrame.src = `${textbookPdfObjectUrl}#page=${page}&zoom=page-fit`;
}

function getChapterTextSlice(index) {
  const chapter = textbookChapters[index];
  if (!chapter) return '';
  const startPage = Math.max(1, resolveChapterStartPage(chapter));
  let endPage = textbookPages.length;
  const next = textbookChapters[index + 1];
  if (next) {
    endPage = Math.max(startPage, resolveChapterStartPage(next) - 1);
  }
  const selectedPages = textbookPages.filter((p) => p.page >= startPage && p.page <= endPage);
  const text = selectedPages.map((p) => p.text).join('\n').trim();
  if (!text) return '';
  return text.slice(0, 18000);
}

function chapterLabel(index) {
  const chapter = textbookChapters[index];
  if (!chapter) return 'chapter';
  return `${chapter.title} (p.${chapter.page})`;
}

function resolveChapterStartPage(chapter) {
  if (!chapter) return 1;
  const directPage = Number(chapter.page || 0);
  if (directPage >= 1) return directPage;
  const title = String(chapter.title || '').trim().toLowerCase();
  if (!title) return 1;
  const searchPool = textbookPages.length ? textbookPages : textbookOcrPages;
  if (!searchPool.length) return 1;
  const found = searchPool.find((p) => String(p.text || '').toLowerCase().includes(title));
  return Number(found?.page || 1);
}

function getDocumentTtsText() {
  if (textbookPages.length) {
    const fromPdf = textbookPages.map((p) => p.text).join('\n').trim();
    if (fromPdf) return fromPdf.slice(0, 18000);
  }
  if (textbookOcrPages.length) {
    const fromOcr = textbookOcrPages.map((p) => p.text).join('\n').trim();
    if (fromOcr) return fromOcr.slice(0, 18000);
  }
  return String(els.textbookText.value || '').trim();
}

async function getDocumentTtsTextWithOcrFallback() {
  const text = getDocumentTtsText();
  if (text) return text;
  if (!textbookPdfBuffer) return '';
  const pdf = await buildPdfDocFromBuffer();
  if (!pdf) return '';
  const scanEnd = Math.min(Number(pdf.numPages || 1), 40);
  const ocrText = await ocrUntilMinChars(1, scanEnd, 2200, 'TTS');
  return String(ocrText || '').slice(0, 18000);
}

async function playTtsText(text, label) {
  startTtsChunkedPlayback(text, label);
}

function splitTextIntoTtsChunks(text, maxChunkChars = 1200) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const paragraphs = raw
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];

  const chunks = [];
  let i = 0;
  while (i < paragraphs.length) {
    const first = paragraphs[i];
    const second = paragraphs[i + 1] || '';
    const pair = second ? `${first}\n\n${second}` : first;
    if (pair.length <= maxChunkChars) {
      chunks.push(pair);
      i += second ? 2 : 1;
      continue;
    }
    if (first.length <= maxChunkChars) {
      chunks.push(first);
      i += 1;
      continue;
    }
    const sentences = first.split(/(?<=[.!?])\s+/).filter(Boolean);
    let current = '';
    for (const s of sentences) {
      const candidate = current ? `${current} ${s}` : s;
      if (candidate.length <= maxChunkChars) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = s.slice(0, maxChunkChars);
      }
    }
    if (current) chunks.push(current);
    i += 1;
  }
  return chunks.filter(Boolean);
}

async function playNextTtsChunk(sessionId, label) {
  if (sessionId !== ttsSessionId) return;
  if (!ttsChunks.length || ttsChunkIndex >= ttsChunks.length) {
    els.textbookStatus.textContent = `TTS finished ${label}.`;
    return;
  }
  const voiceId = els.ttsVoice.value;
  if (!voiceId) {
    els.textbookStatus.textContent = 'Select an ElevenLabs voice.';
    return;
  }

  const currentChunk = ttsChunks[ttsChunkIndex];
  try {
    els.textbookStatus.textContent = `Preparing ${label} (${ttsChunkIndex + 1}/${ttsChunks.length})...`;
    const prep = await apiPost('/tts/prepare', { text: currentChunk });
    ttsPreparedText = String(prep.speakText || currentChunk).slice(0, 5000);
    els.textbookStatus.textContent = `Generating audio (${ttsChunkIndex + 1}/${ttsChunks.length})...`;
    const synth = await apiPost('/tts/synthesize', {
      text: ttsPreparedText,
      voiceId,
      speed: Number(els.ttsRate.value || 1)
    });
    if (!synth?.audioBase64) {
      throw new Error('No audio returned from TTS service.');
    }
    ttsAudio.src = `data:audio/mpeg;base64,${synth.audioBase64}`;
    ttsAudio.playbackRate = Number(els.ttsRate.value || 1);
    await ttsAudio.play();
    els.textbookStatus.textContent = `TTS reading ${label} (${ttsChunkIndex + 1}/${ttsChunks.length})...`;
  } catch (err) {
    els.textbookStatus.textContent = `TTS failed: ${String(err.message || err).slice(0, 160)}`;
  }
}

function startTtsChunkedPlayback(text, label) {
  const chunks = splitTextIntoTtsChunks(text, 1200);
  if (!chunks.length) {
    els.textbookStatus.textContent = 'No readable text found for TTS.';
    return;
  }
  ttsSessionId += 1;
  ttsChunks = chunks;
  ttsChunkIndex = 0;
  ttsCurrentLabel = label || 'document';
  awardXP(3, 'tts started');
  playNextTtsChunk(ttsSessionId, ttsCurrentLabel);
}

async function startTtsFromChapter(index) {
  jumpToChapter(index);
  let text = getChapterTextSlice(index);
  if (!text && textbookPdfBuffer) {
    const start = resolveChapterStartPage(textbookChapters[index]);
    const next = textbookChapters[index + 1];
    const naturalEnd = next ? Math.max(start, resolveChapterStartPage(next) - 1) : start + 10;
    const chapterOcr = await ocrUntilMinChars(
      start,
      Math.min(naturalEnd, start + 14),
      1600,
      chapterLabel(index)
    );
    text = String(chapterOcr || '').slice(0, 18000);
  }
  if (!text) {
    const documentFallback = await getDocumentTtsTextWithOcrFallback();
    text = String(documentFallback || '').slice(0, 18000);
  }
  if (!text) {
    els.textbookStatus.textContent =
      'Could not read text from this PDF yet. Try again after OCR, or upload a clearer PDF scan.';
    return;
  }
  await playTtsText(text, chapterLabel(index));
}

function populateChapterListLegacy(text) {
  const lines = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = lines.filter((x) => /chapter|unit|section|\d+\./i.test(x)).slice(0, 12);
  const chapters = candidates.length ? candidates : ['Chapter 1', 'Chapter 2', 'Chapter 3'];
  renderChapterList(chapters.map((c, i) => ({ title: c, page: i + 1 })));
}

function addAnnotation(type) {
  const text = els.textbookText.value;
  const start = els.textbookText.selectionStart;
  const end = els.textbookText.selectionEnd;
  const selected = text.slice(start, end);
  const note = type === 'comment' ? prompt('Comment text:') || '' : '';
  const message = selected
    ? `${type.toUpperCase()}: "${selected}"${note ? ` | ${note}` : ''}`
    : `${type.toUpperCase()}: marker added${note ? ` | ${note}` : ''}`;
  showAnnotationToast(message);
  syncTextbookState();
  awardXP(3, `${type} added`);
}

function showAnnotationToast(message) {
  if (!els.annotationOverlay) return;
  const toast = document.createElement('div');
  toast.className = 'annotation-toast';
  toast.textContent = message;
  els.annotationOverlay.prepend(toast);
  setTimeout(() => {
    toast.remove();
  }, 3300);
}

function makeSummary(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 4).join(' ') || 'No content available for summary.';
}

function makeQuiz(text) {
  const tokens = text.match(/[A-Za-z]{5,}/g) || [];
  const unique = [...new Set(tokens.map((x) => x.toLowerCase()))].slice(0, 30);
  if (unique.length < 4) return 'Not enough text to generate quiz.';
  const answer = unique[Math.floor(Math.random() * unique.length)];
  const options = [answer, ...unique.filter((x) => x !== answer).slice(0, 3)].sort(() => Math.random() - 0.5);
  return {
    q: `Which term appears as a key concept in this chapter?`,
    options,
    answer
  };
}

function initTextbook() {
  els.textbookFile.addEventListener('change', () => {
    const file = els.textbookFile.files?.[0];
    if (!file) return;
    if (textbookPdfObjectUrl) {
      URL.revokeObjectURL(textbookPdfObjectUrl);
    }
    textbookPdfObjectUrl = URL.createObjectURL(file);
    els.pdfFrame.src = textbookPdfObjectUrl;
    textbookOcrPages = [];
    textbookPages = [];
    textbookChapters = [];
    textbookBookmarkChapters = [];
    els.textbookName.value = file.name.replace(/\.pdf$/i, '');
    els.textbookStatus.textContent = `${file.name} loaded locally.`;
    els.chapterList.innerHTML = '<li class="drag-item">AI is checking for chapters/chapter titles...</li>';
    file
      .arrayBuffer()
      .then(async (buf) => {
        textbookPdfBuffer = buf;
        const pdfData = await extractPdfData(file);
        textbookBookmarkChapters = Array.isArray(pdfData?.outlineChapters)
          ? pdfData.outlineChapters
          : [];
        if (pdfData?.fullText) {
          textbookPages = Array.isArray(pdfData.pages) ? pdfData.pages : [];
          els.textbookText.value = pdfData.fullText;
          await populateChapterList(pdfData.fullText, textbookPages, textbookBookmarkChapters);
        } else {
          renderChapterList([{ title: 'Chapter 1', page: 1 }]);
          els.textbookStatus.textContent = 'No embedded text found. Running OCR to read this PDF...';
          const pdf = await buildPdfDocFromBuffer();
          const scanEnd = Math.min(Number(pdf?.numPages || 1), 12);
          await ocrPdfRange(1, scanEnd, 'chapter detection');
          const ocrText = textbookOcrPages.map((p) => p.text).join('\n').trim();
          els.textbookText.value = ocrText;
          await populateChapterList(ocrText, textbookOcrPages, textbookBookmarkChapters);
        }
        syncTextbookState();
      })
      .catch((err) => {
        // Keep manual paste as fallback if PDF extraction fails.
        textbookPages = [];
        textbookPdfBuffer = null;
        renderChapterList([{ title: 'Chapter 1', page: 1 }]);
        els.textbookStatus.textContent = `PDF extraction failed: ${String(err?.message || err).slice(0, 120)}`;
      });
    saveJSON(STORAGE_KEYS.TEXTBOOK, { name: els.textbookName.value });
    syncTextbookState();
    awardXP(10, 'textbook imported');
  });

  els.textbookName.addEventListener('change', () => {
    saveJSON(STORAGE_KEYS.TEXTBOOK, { name: els.textbookName.value });
    syncTextbookState();
  });

  els.textbookText.addEventListener('input', () => {
    if (textbookPages.length) {
      populateChapterList(els.textbookText.value, textbookPages);
    } else {
      populateChapterListLegacy(els.textbookText.value);
    }
    syncTextbookState();
  });

  els.chapterList.addEventListener('click', (ev) => {
    const jumpBtn = ev.target.closest('.chapter-jump');
    if (jumpBtn) {
      const idx = Number(jumpBtn.dataset.index || 0);
      jumpToChapter(idx);
      return;
    }
    const ttsBtn = ev.target.closest('.chapter-tts');
    if (ttsBtn) {
      const idx = Number(ttsBtn.dataset.index || 0);
      startTtsFromChapter(idx);
    }
  });

  els.highlightSel.addEventListener('click', () => addAnnotation('highlight'));
  els.underlineSel.addEventListener('click', () => addAnnotation('underline'));
  els.addComment.addEventListener('click', () => addAnnotation('comment'));
  els.drawMode.addEventListener('click', () => {
    drawingMode = !drawingMode;
    els.drawMode.textContent = drawingMode ? 'Draw Mode: ON' : 'Draw Mode';
    showAnnotationToast(drawingMode ? 'Draw mode enabled.' : 'Draw mode disabled.');
    syncTextbookState();
  });

  els.chapterSummary.addEventListener('click', () => {
    const text = els.textbookText.value.trim();
    if (!text) return;
    apiPost('/textbook/summary', { text })
      .then((data) => {
        const summary = data.summary || makeSummary(text);
        els.quizOutput.innerHTML = `<h4>Summary</h4><p>${summary}</p>`;
        awardXP(6, 'summary generated');
      })
      .catch(() => {
        els.quizOutput.innerHTML = `<h4>Summary</h4><p>${makeSummary(text)}</p>`;
      });
  });

  els.chapterQuiz.addEventListener('click', () => {
    const text = els.textbookText.value.trim();
    if (!text) return;
    const renderQuiz = (quiz) => {
      if (typeof quiz === 'string') {
        els.quizOutput.textContent = quiz;
        return;
      }
      els.quizOutput.innerHTML = `<h4>Quiz</h4><p>${quiz.q}</p>${quiz.options
        .map((o) => `<button class="quiz-opt" data-correct="${o === quiz.answer}">${o}</button>`)
        .join('')}`;
      [...els.quizOutput.querySelectorAll('.quiz-opt')].forEach((btn) => {
        btn.addEventListener('click', () => {
          const ok = btn.dataset.correct === 'true';
          btn.style.background = ok ? '#d8f2da' : '#ffd8d8';
          if (ok) awardXP(5, 'quiz correct');
        });
      });
    };
    apiPost('/textbook/quiz', { text })
      .then((data) => {
        const quiz = data.quiz || makeQuiz(text);
        renderQuiz(quiz);
      })
      .catch(() => renderQuiz(makeQuiz(text)));
  });
}

async function loadVoices() {
  els.ttsVoice.innerHTML = '<option value="">Select voice</option>';
  selectedVoice = null;
  try {
    const data = await apiPost('/tts/voices', {});
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = v.name;
      els.ttsVoice.appendChild(opt);
    });
    if (voices.length) {
      els.ttsVoice.value = voices[0].voice_id;
      selectedVoice = voices[0].voice_id;
    }
    els.textbookStatus.textContent = voices.length ? 'Voices loaded.' : 'No voices found for key.';
  } catch (err) {
    els.textbookStatus.textContent = `Voice load failed: ${String(err.message || err).slice(0, 120)}`;
  }
}

function initTTS() {
  ttsAudio = new Audio();
  ttsAudio.preload = 'auto';
  ttsAudio.addEventListener('ended', () => {
    if (!ttsChunks.length) return;
    ttsChunkIndex += 1;
    playNextTtsChunk(ttsSessionId, ttsCurrentLabel);
  });

  els.ttsLoadVoices.addEventListener('click', () => {
    loadVoices();
  });

  els.ttsVoice.addEventListener('change', () => {
    selectedVoice = els.ttsVoice.value || null;
  });

  els.ttsPlay.addEventListener('click', async () => {
    const text = await getDocumentTtsTextWithOcrFallback();
    if (!text) return;
    await playTtsText(text, 'document');
  });

  els.ttsPause.addEventListener('click', () => {
    if (!ttsAudio) return;
    if (ttsAudio.paused) ttsAudio.play().catch(() => {});
    else ttsAudio.pause();
  });

  els.ttsStop.addEventListener('click', () => {
    if (!ttsAudio) return;
    ttsSessionId += 1;
    ttsChunks = [];
    ttsChunkIndex = 0;
    ttsAudio.pause();
    ttsAudio.currentTime = 0;
    els.textbookStatus.textContent = 'TTS stopped.';
  });

  els.ttsRate.addEventListener('input', () => {
    if (!ttsAudio) return;
    ttsAudio.playbackRate = Number(els.ttsRate.value || 1);
  });

  els.jumpBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!ttsAudio) return;
      const jump = Number(btn.dataset.jump || 0);
      ttsAudio.currentTime = Math.max(0, (ttsAudio.currentTime || 0) + jump);
    });
  });

  loadVoices();
}

function renderGarden() {
  const state = loadJSON(STORAGE_KEYS.GARDEN, { xp: 0, coins: 0, owned: [] });
  els.xpCount.textContent = String(state.xp);
  els.coinCount.textContent = String(state.coins);

  els.gardenShop.innerHTML = '';
  shopItems.forEach((item) => {
    const owned = state.owned.includes(item.id);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<h3>${item.label}</h3><p>Cost: ${item.cost} coins</p>`;
    const btn = document.createElement('button');
    btn.textContent = owned ? 'Owned' : 'Buy';
    btn.disabled = owned;
    btn.addEventListener('click', () => {
      const s = loadJSON(STORAGE_KEYS.GARDEN, { xp: 0, coins: 0, owned: [] });
      if (s.coins < item.cost) return alert('Not enough coins.');
      s.coins -= item.cost;
      s.owned.push(item.id);
      saveJSON(STORAGE_KEYS.GARDEN, s);
      renderGarden();
    });
    card.appendChild(btn);
    els.gardenShop.appendChild(card);
  });

  const ownedItems = shopItems.filter((i) => state.owned.includes(i.id)).map((i) => i.label);
  els.gardenOwned.textContent = ownedItems.length
    ? `Owned decorations: ${ownedItems.join(', ')}`
    : 'No decorations owned yet.';
}

function boot() {
  const savedDoc = localStorage.getItem(STORAGE_KEYS.DOC);
  els.editor.innerHTML = savedDoc || '<h2>Untitled Workspace</h2><p>Drag key points here.</p>';
  const settings = loadJSON(STORAGE_KEYS.SETTINGS, { publicByDefault: false });
  els.publicLinkDefault.checked = settings.publicByDefault;
  const textbook = loadJSON(STORAGE_KEYS.TEXTBOOK, { name: 'Textbook 1' });
  els.textbookName.value = textbook.name || 'Textbook 1';

  els.navBtns.forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  els.goBtns.forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.go)));

  els.editor.addEventListener('input', () => {
    clearTimeout(autosaveTimer);
    updateEditorPageSizing();
    autosaveTimer = setTimeout(() => saveDoc('autosave'), 1600);
  });

  initToolbar();
  initWorkspaceDnD();
  initVideo();
  initSharingAndExport();
  initTextbook();
  initTTS();
  renderGarden();
  seedKeyPoints('sample lecture');
  updateEditorPageSizing();
  checkBackendHealth();
  hydrateRemoteState();
}

boot();
