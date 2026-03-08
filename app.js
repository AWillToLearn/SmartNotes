const els = {
  navBtns: [...document.querySelectorAll('.nav-btn')],
  views: [...document.querySelectorAll('.view')],
  goBtns: [...document.querySelectorAll('[data-go]')],
  summarySourceUrl: document.getElementById('summarySourceUrl'),
  summarySourceFile: document.getElementById('summarySourceFile'),
  summaryGenerate: document.getElementById('summaryGenerate'),
  summaryStatus: document.getElementById('summaryStatus'),
  summaryOutput: document.getElementById('summaryOutput'),
  summaryChatPanel: document.getElementById('summaryChatPanel'),
  summaryChatThread: document.getElementById('summaryChatThread'),
  summaryChatInput: document.getElementById('summaryChatInput'),
  summaryChatSend: document.getElementById('summaryChatSend'),
  quizSourceUrl: document.getElementById('quizSourceUrl'),
  quizSourceFile: document.getElementById('quizSourceFile'),
  quizGenerate: document.getElementById('quizGenerate'),
  quizStatus: document.getElementById('quizStatus'),
  quizToolOutput: document.getElementById('quizToolOutput'),
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
  themeToggle: document.getElementById('themeToggle'),
  darkModeToggle: document.getElementById('darkModeToggle'),
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
let textbookPageCount = 0;
let ocrActive = false;
let ttsChunks = [];
let ttsChunkIndex = 0;
let ttsSessionId = 0;
let ttsCurrentLabel = 'document';
let ttsAnchorPage = 1;
let ttsScopeRadius = 2;
let ttsCurrentRange = { start: 1, end: 1 };
const API_BASE = '/api';
let timedKeyPoints = [];
let captionsEnabled = false;
let ytPlayer = null;
let ytApiReadyPromise = null;
let currentYouTubeId = null;
let analysisRequestId = 0;
let usingDirectYouTubeEmbed = false;
let aiCachedText = '';
let summarySourceText = '';
let summaryLatest = '';
let summaryChatHistory = [];
let aiQuizQuestions = [];

const shopItems = [
  { id: 'plant', label: 'Potted Plant', cost: 25 },
  { id: 'lamp', label: 'Warm Lamp', cost: 40 },
  { id: 'bench', label: 'Garden Bench', cost: 65 }
];

const DOC_PAGE_HEIGHT = 1120;
const DEFAULT_SETTINGS = {
  publicByDefault: false,
  theme: 'light'
};

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

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...loadJSON(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  };
}

function saveSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  saveJSON(STORAGE_KEYS.SETTINGS, next);
  return next;
}

function applyTheme(themeName) {
  const theme = themeName === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = theme;
  if (els.darkModeToggle) {
    els.darkModeToggle.checked = theme === 'dark';
  }
  if (els.themeToggle) {
    els.themeToggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
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

async function ensureTextbookPageCount() {
  if (textbookPageCount > 0) return textbookPageCount;
  if (textbookPages.length) {
    textbookPageCount = textbookPages.length;
    return textbookPageCount;
  }
  if (!textbookPdfBuffer) return 0;
  const pdf = await buildPdfDocFromBuffer();
  textbookPageCount = Number(pdf?.numPages || 0);
  return textbookPageCount;
}

async function ocrCanvas(canvas, psm = '6') {
  await ensureTesseractLoaded();
  const result = await window.Tesseract.recognize(canvas, 'eng', {
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1'
  });
  return String(result?.data?.text || '').replace(/\s+\n/g, '\n').trim();
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
  let text = await ocrCanvas(canvas, '6');
  // Fallback pass for difficult layouts/scans.
  if (text.length < 30) {
    const viewport2 = page.getViewport({ scale: 2.6 });
    const canvas2 = document.createElement('canvas');
    const ctx2 = canvas2.getContext('2d');
    canvas2.width = Math.ceil(viewport2.width);
    canvas2.height = Math.ceil(viewport2.height);
    await page.render({ canvasContext: ctx2, viewport: viewport2 }).promise;
    const pass2 = await ocrCanvas(canvas2, '3');
    if (pass2.length > text.length) {
      text = pass2;
    }
  }
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

async function ocrFindAnyReadableText(minChars = 600, reasonLabel = 'TTS') {
  if (!textbookPdfBuffer) return '';
  const pdf = await buildPdfDocFromBuffer();
  if (!pdf) return '';
  const total = Number(pdf.numPages || 1);
  const pagesToTry = [];
  for (let p = 1; p <= total; p += 1) pagesToTry.push(p);
  for (let i = 0; i < pagesToTry.length; i += 1) {
    const p = pagesToTry[i];
    await ocrPdfRange(p, p, `${reasonLabel} fallback`);
    const txt = String(textbookOcrPages.find((x) => x.page === p)?.text || '').trim();
    if (txt.length >= minChars) {
      return txt;
    }
  }
  return textbookOcrPages.map((p) => p.text).join('\n').trim();
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
      settings: getSettings()
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
        const merged = saveSettings(workspace.state.settings);
        els.publicLinkDefault.checked = !!merged.publicByDefault;
        applyTheme(merged.theme);
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
    const publicDefault = getSettings().publicByDefault;
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
    saveSettings({ publicByDefault: els.publicLinkDefault.checked });
    syncWorkspaceState();
  });

  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const current = getSettings();
      const nextTheme = current.theme === 'dark' ? 'light' : 'dark';
      saveSettings({ theme: nextTheme });
      applyTheme(nextTheme);
      syncWorkspaceState();
    });
  }

  if (els.darkModeToggle) {
    els.darkModeToggle.addEventListener('change', () => {
      const nextTheme = els.darkModeToggle.checked ? 'dark' : 'light';
      saveSettings({ theme: nextTheme });
      applyTheme(nextTheme);
      syncWorkspaceState();
    });
  }
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
  ttsAnchorPage = page;
  ttsCurrentRange = { start: page, end: page };
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

function collectTextFromRange(startPage, endPage) {
  const start = Math.max(1, Number(startPage || 1));
  const end = Math.max(start, Number(endPage || start));
  const basePool = textbookPages.length ? textbookPages : textbookOcrPages;
  const ordered = basePool
    .filter((p) => p.page >= start && p.page <= end)
    .sort((a, b) => a.page - b.page);
  return ordered.map((p) => String(p.text || '').trim()).filter(Boolean).join('\n').trim();
}

async function getDocumentTtsTextWithOcrFallback() {
  const totalPages = await ensureTextbookPageCount();
  if (!totalPages) {
    return getDocumentTtsText();
  }

  const anchor = Math.max(1, Math.min(totalPages, Number(ttsAnchorPage || 1)));
  let radius = Math.max(1, Number(ttsScopeRadius || 2));
  let start = Math.max(1, anchor - radius);
  let end = Math.min(totalPages, anchor + radius);
  let text = collectTextFromRange(start, end);

  while (text.length < 1200 && (start > 1 || end < totalPages)) {
    if (textbookPdfBuffer) {
      await ocrUntilMinChars(start, end, 900, `TTS near p.${anchor}`);
      text = collectTextFromRange(start, end);
      if (text.length >= 1200) break;
    }
    radius = Math.min(radius + 2, Math.ceil(totalPages / 2));
    start = Math.max(1, anchor - radius);
    end = Math.min(totalPages, anchor + radius);
    text = collectTextFromRange(start, end);
    if (radius >= totalPages && text.length) break;
  }

  if (!text.trim() && textbookPdfBuffer) {
    text = await ocrFindAnyReadableText(400, 'TTS');
  }
  if (!text.trim()) {
    text = getDocumentTtsText();
  }

  ttsCurrentRange = { start, end };
  ttsScopeRadius = Math.min(Math.max(radius, ttsScopeRadius) + 1, Math.max(3, totalPages));
  return String(text || '').slice(0, 18000);
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
    if (String(label || '').toLowerCase() === 'document') {
      const nextAnchor = Math.max(1, Number(ttsCurrentRange.end || ttsAnchorPage || 1));
      ttsAnchorPage = nextAnchor;
    }
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
  const startPageHint = resolveChapterStartPage(textbookChapters[index]);
  ttsAnchorPage = startPageHint;
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
    ttsCurrentRange = { start, end: Math.min(naturalEnd, start + 14) };
    ttsAnchorPage = ttsCurrentRange.start;
  }
  if (!text) {
    const localAny = await ocrFindAnyReadableText(350, chapterLabel(index));
    text = String(localAny || '').slice(0, 18000);
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

function isSupportedHomeTextFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.includes('text/') || type.includes('json') || type.includes('rtf') || type.includes('csv')) {
    return true;
  }
  return /\.(txt|md|json|rtf|csv)$/i.test(file.name || '');
}

async function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

async function getAiSourceText({ fileInput, urlInput, statusEl }) {
  const file = fileInput?.files?.[0] || null;
  const url = String(urlInput?.value || '').trim();

  if (!file && !url) {
    throw new Error('Upload a file or enter a URL.');
  }

  if (file) {
    if (statusEl) statusEl.textContent = `Reading file: ${file.name}...`;
    if (/\.pdf$/i.test(file.name) || String(file.type).includes('pdf')) {
      const pdfData = await extractPdfData(file);
      const text = String(pdfData?.fullText || '').trim();
      if (!text) throw new Error('No readable text found in PDF.');
      aiCachedText = text.slice(0, 12000);
      return aiCachedText;
    }
    if (isSupportedHomeTextFile(file)) {
      const raw = await readFileText(file);
      const text = String(raw || '').trim();
      if (!text) throw new Error('Uploaded file is empty.');
      aiCachedText = text.slice(0, 12000);
      return aiCachedText;
    }
    throw new Error('Unsupported file type. Use PDF, TXT, MD, CSV, JSON, or RTF.');
  }

  const ytId = extractYouTubeVideoId(url);
  if (ytId) {
    if (statusEl) statusEl.textContent = 'Analyzing video URL with Gemini...';
    try {
      const data = await apiPost('/video/analyze', { source: url, stage: 'full' });
      const points = Array.isArray(data?.keyPoints) ? data.keyPoints : [];
      const timed = Array.isArray(data?.timedKeyPoints) ? data.timedKeyPoints : [];
      const stitched = [
        ...points.map((p) => String(p).trim()),
        ...timed.map((t) => `[${t.label || formatTimeLabel(t.timeSec || 0)}] ${String(t.text || '').trim()}`)
      ]
        .filter(Boolean)
        .join('\n');
      const text = stitched.trim();
      if (text) {
        aiCachedText = text.slice(0, 12000);
        return aiCachedText;
      }
    } catch {
      // fallback below
    }
  }

  if (statusEl) statusEl.textContent = 'Fetching URL content...';
  let text = '';
  try {
    const data = await apiPost('/content/extract', { source: url });
    text = String(data?.text || '').trim();
  } catch (err) {
    const msg = String(err?.message || err);
    if (/not found/i.test(msg)) {
      try {
        const local = await fetch(url);
        if (local.ok) {
          const raw = await local.text();
          text = String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      } catch {
        // ignored
      }
      if (!text) {
        throw new Error('URL extraction endpoint missing. Restart server to load /api/content/extract.');
      }
    } else {
      throw err;
    }
  }
  if (!text) {
    throw new Error('Could not extract readable text from URL.');
  }
  aiCachedText = text.slice(0, 12000);
  return aiCachedText;
}

function renderAiQuiz(quiz, outputEl) {
  if (!outputEl) return;
  if (!quiz || typeof quiz === 'string') {
    outputEl.textContent = quiz || 'Quiz could not be generated.';
    return;
  }
  outputEl.innerHTML = `<h4>Quiz</h4><p>${quiz.q}</p>${quiz.options
    .map((o) => `<button class="quiz-opt" data-correct="${o === quiz.answer}">${o}</button>`)
    .join('')}`;
  [...outputEl.querySelectorAll('.quiz-opt')].forEach((btn) => {
    btn.addEventListener('click', () => {
      const ok = btn.dataset.correct === 'true';
      btn.style.background = ok ? '#d8f2da' : '#ffd8d8';
    });
  });
}

function renderAiQuizSet(questions, outputEl) {
  if (!outputEl) return;
  aiQuizQuestions = Array.isArray(questions) ? questions : [];
  if (!aiQuizQuestions.length) {
    outputEl.textContent = 'Quiz could not be generated.';
    return;
  }
  outputEl.innerHTML = aiQuizQuestions
    .map(
      (q, idx) => `
        <div class="quiz-question" data-q-index="${idx}" style="margin-bottom:12px;">
          <p><strong>Q${idx + 1}.</strong> ${escapeHtml(q.q || '')}</p>
          ${q.options
            .map(
              (opt, optIdx) => `
                <label class="quiz-option-label" data-q-index="${idx}" data-opt-index="${optIdx}" style="display:block;margin:4px 0;">
                  <input type="radio" name="quiz-q-${idx}" value="${optIdx}" data-opt-index="${optIdx}" />
                  ${escapeHtml(opt)}
                </label>
              `
            )
            .join('')}
        </div>
      `
    )
    .join('');
  const submitWrap = document.createElement('div');
  submitWrap.className = 'actions';
  submitWrap.innerHTML = '<button id="quizScoreSubmit">Submit Answers</button><div id="quizScoreResult" class="status"></div>';
  outputEl.appendChild(submitWrap);
  const submitBtn = outputEl.querySelector('#quizScoreSubmit');
  const resultEl = outputEl.querySelector('#quizScoreResult');
  if (submitBtn && resultEl) {
    submitBtn.addEventListener('click', () => {
      const selected = aiQuizQuestions.map((q, idx) => {
        const checked = outputEl.querySelector(`input[name="quiz-q-${idx}"]:checked`);
        if (!checked) return { optIdx: -1, value: '' };
        const optIdx = Number(checked.value);
        const value = q.options[optIdx] || '';
        return { optIdx, value };
      });
      const unanswered = selected.filter((x) => x.optIdx < 0).length;
      if (unanswered) {
        resultEl.textContent = `Please answer all questions (${unanswered} remaining).`;
        return;
      }

      [...outputEl.querySelectorAll('.quiz-option-label')].forEach((el) => {
        el.classList.remove('correct', 'wrong');
      });

      let correct = 0;
      aiQuizQuestions.forEach((q, idx) => {
        const picked = selected[idx];
        const answerIdx = q.options.findIndex((o) => o === q.answer);
        const pickedLabel = outputEl.querySelector(
          `.quiz-option-label[data-q-index="${idx}"][data-opt-index="${picked.optIdx}"]`
        );
        const answerLabel = outputEl.querySelector(
          `.quiz-option-label[data-q-index="${idx}"][data-opt-index="${answerIdx}"]`
        );

        if (answerLabel) answerLabel.classList.add('correct');
        if (picked.optIdx !== answerIdx && pickedLabel) pickedLabel.classList.add('wrong');
        if (picked.value === q.answer) correct += 1;
      });
      const pct = Math.round((correct / aiQuizQuestions.length) * 100);
      resultEl.textContent = `Score: ${correct}/${aiQuizQuestions.length} (${pct}%)`;
      awardXP(Math.max(5, correct), 'quiz completed');
    });
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function requestSummaryFollowup(question) {
  try {
    const data = await apiPost('/textbook/summary/chat', {
      summary: summaryLatest,
      sourceText: summarySourceText,
      question,
      history: summaryChatHistory.slice(-8)
    });
    const answer = String(data?.answer || '').trim();
    if (answer) return answer;
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/not found/i.test(msg)) {
      throw err;
    }
  }

  // Fallback for older server builds that do not have /textbook/summary/chat.
  const fallbackPrompt =
    `Answer the follow-up question using the summary and source context.\n` +
    `Summary:\n${summaryLatest}\n\n` +
    `Source text excerpt:\n${String(summarySourceText || '').slice(0, 6000)}\n\n` +
    `Recent chat:\n${summaryChatHistory
      .slice(-6)
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.text}`)
      .join('\n')}\n\n` +
    `Question: ${question}\n\n` +
    `Give a concise plain-text answer.`;
  const data = await apiPost('/textbook/summary', { text: fallbackPrompt });
  return String(data?.summary || '').trim();
}

function renderSummaryChatThread() {
  if (!els.summaryChatThread) return;
  if (!summaryChatHistory.length) {
    els.summaryChatThread.innerHTML = '<p class="sub">Ask a question about the generated summary.</p>';
    return;
  }
  els.summaryChatThread.innerHTML = summaryChatHistory
    .map(
      (m) =>
        `<div class="chat-row ${m.role === 'user' ? 'user' : 'assistant'}">
          <div class="chat-bubble">${escapeHtml(m.text || '')}</div>
        </div>`
    )
    .join('');
  els.summaryChatThread.scrollTop = els.summaryChatThread.scrollHeight;
}

function initAiTools() {
  if (els.summaryGenerate) {
    els.summaryGenerate.addEventListener('click', async () => {
      try {
        const text = await getAiSourceText({
          fileInput: els.summarySourceFile,
          urlInput: els.summarySourceUrl,
          statusEl: els.summaryStatus
        });
        els.summaryStatus.textContent = 'Generating summary...';
        const data = await apiPost('/textbook/summary', { text });
        const summary = String(data?.summary || '').trim() || makeSummary(text);
        els.summaryOutput.innerHTML = `<h4>Summary</h4><p>${summary}</p>`;
        els.summaryStatus.textContent = 'Summary ready.';
        summarySourceText = text;
        summaryLatest = summary;
        summaryChatHistory = [];
        if (els.summaryChatPanel) {
          els.summaryChatPanel.classList.remove('hidden');
        }
        renderSummaryChatThread();
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 160);
        els.summaryStatus.textContent = `Summary failed: ${msg}`;
      }
    });
  }

  if (els.summaryChatSend) {
    els.summaryChatSend.addEventListener('click', async () => {
      const question = String(els.summaryChatInput?.value || '').trim();
      if (!question) return;
      if (!summaryLatest) {
        els.summaryStatus.textContent = 'Generate a summary first.';
        return;
      }
      summaryChatHistory.push({ role: 'user', text: question });
      renderSummaryChatThread();
      els.summaryChatInput.value = '';
      try {
        els.summaryStatus.textContent = 'Generating follow-up response...';
        const answer = await requestSummaryFollowup(question);
        if (answer) {
          summaryChatHistory.push({ role: 'assistant', text: answer });
        } else {
          summaryChatHistory.push({ role: 'assistant', text: 'I could not generate an answer.' });
        }
        renderSummaryChatThread();
        els.summaryStatus.textContent = 'Follow-up answer ready.';
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 160);
        els.summaryStatus.textContent = `Follow-up failed: ${msg}`;
      }
    });
  }
  if (els.summaryChatInput && els.summaryChatSend) {
    els.summaryChatInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        els.summaryChatSend.click();
      }
    });
  }

  if (els.quizGenerate) {
    els.quizGenerate.addEventListener('click', async () => {
      try {
        const text = await getAiSourceText({
          fileInput: els.quizSourceFile,
          urlInput: els.quizSourceUrl,
          statusEl: els.quizStatus
        });
        els.quizStatus.textContent = 'Generating 10-question quiz...';
        try {
          const data = await apiPost('/textbook/quiz-set', { text, count: 10 });
          renderAiQuizSet(data?.questions || [], els.quizToolOutput);
          els.quizStatus.textContent = 'Quiz ready. Answer all questions, then submit.';
        } catch (err) {
          const msg = String(err?.message || err);
          if (/not found/i.test(msg)) {
            const fallback = [];
            for (let i = 0; i < 10; i += 1) {
              const q = makeQuiz(text);
              if (q && typeof q !== 'string') fallback.push(q);
            }
            renderAiQuizSet(fallback, els.quizToolOutput);
            els.quizStatus.textContent = 'Quiz ready (fallback). Restart server to enable Gemini quiz-set endpoint.';
          } else {
            throw err;
          }
        }
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 160);
        els.quizStatus.textContent = `Quiz failed: ${msg}`;
      }
    });
  }
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
    textbookPageCount = 0;
    ttsAnchorPage = 1;
    ttsScopeRadius = 2;
    ttsCurrentRange = { start: 1, end: 1 };
    els.textbookName.value = file.name.replace(/\.pdf$/i, '');
    els.textbookStatus.textContent = `${file.name} loaded locally.`;
    els.chapterList.innerHTML = '<li class="drag-item">AI is checking for chapters/chapter titles...</li>';
    file
      .arrayBuffer()
      .then(async (buf) => {
        textbookPdfBuffer = buf;
        const pdfData = await extractPdfData(file);
        textbookPageCount = Array.isArray(pdfData?.pages) ? pdfData.pages.length : 0;
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
          textbookPageCount = Number(pdf?.numPages || textbookPageCount || 0);
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

  if (els.chapterQuiz) {
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
  const settings = getSettings();
  els.publicLinkDefault.checked = settings.publicByDefault;
  applyTheme(settings.theme);
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
  initAiTools();
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
