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
  videoMsg: document.getElementById('videoMsg'),
  playbackRate: document.getElementById('playbackRate'),
  captureFrame: document.getElementById('captureFrame'),
  toggleVideoPanel: document.getElementById('toggleVideoPanel'),
  videoPanel: document.getElementById('videoPanel'),
  manualSave: document.getElementById('manualSave'),
  showVersions: document.getElementById('showVersions'),
  versionPanel: document.getElementById('versionPanel'),
  shareDoc: document.getElementById('shareDoc'),
  exportPdf: document.getElementById('exportPdf'),
  saveState: document.getElementById('saveState'),
  publicLinkDefault: document.getElementById('publicLinkDefault'),
  textbookFile: document.getElementById('textbookFile'),
  textbookName: document.getElementById('textbookName'),
  chapterList: document.getElementById('chapterList'),
  pdfFrame: document.getElementById('pdfFrame'),
  textbookText: document.getElementById('textbookText'),
  annotationOutput: document.getElementById('annotationOutput'),
  textbookStatus: document.getElementById('textbookStatus'),
  highlightSel: document.getElementById('highlightSel'),
  underlineSel: document.getElementById('underlineSel'),
  addComment: document.getElementById('addComment'),
  drawMode: document.getElementById('drawMode'),
  chapterSummary: document.getElementById('chapterSummary'),
  chapterQuiz: document.getElementById('chapterQuiz'),
  quizOutput: document.getElementById('quizOutput'),
  ttsPlay: document.getElementById('ttsPlay'),
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
  TEXTBOOK: 'smartnotes.textbook.v1'
};

let autosaveTimer;
let drawingMode = false;
let selectedVoice = null;
let utterance = null;

const shopItems = [
  { id: 'plant', label: 'Potted Plant', cost: 25 },
  { id: 'lamp', label: 'Warm Lamp', cost: 40 },
  { id: 'bench', label: 'Garden Bench', cost: 65 }
];

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
}

function simulateAI(sourceLabel) {
  els.aiStatus.textContent = `AI processing ${sourceLabel}...`;
  setTimeout(() => {
    seedKeyPoints(sourceLabel);
    els.aiStatus.textContent = 'AI ready: key points and suggestions generated.';
    awardXP(10, 'AI analysis completed');
  }, 900);
}

function saveDoc(versionLabel = 'autosave') {
  const content = els.editor.innerHTML;
  localStorage.setItem(STORAGE_KEYS.DOC, content);
  const versions = loadJSON(STORAGE_KEYS.VERSIONS, []);
  versions.unshift({ at: new Date().toISOString(), label: versionLabel, content });
  saveJSON(STORAGE_KEYS.VERSIONS, versions.slice(0, 20));
  els.saveState.textContent = `Saved ${new Date().toLocaleTimeString()}`;
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
  els.editor.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    insertHtmlAtCursor(`<p>• ${text}</p>`);
    awardXP(4, 'key point added');
    saveDoc('drag-drop');
  });
}

function initVideo() {
  els.loadVideoUrl.addEventListener('click', () => {
    const url = els.videoUrl.value.trim();
    if (!url) return;
    els.videoPlayer.src = url;
    els.videoMsg.textContent = 'URL loaded. Some providers may block direct playback.';
    simulateAI(url);
  });

  els.videoFile.addEventListener('change', () => {
    const file = els.videoFile.files?.[0];
    if (!file) return;
    els.videoPlayer.src = URL.createObjectURL(file);
    els.videoMsg.textContent = `Loaded ${file.name}`;
    simulateAI(file.name);
  });

  document.getElementById('startLiveNotes').addEventListener('click', () => {
    els.aiStatus.textContent = 'Live Notes scaffold is active. Integrate speech-to-text backend next.';
    seedKeyPoints('Live lecture stream');
    awardXP(7, 'live mode started');
  });

  els.playbackRate.addEventListener('change', () => {
    els.videoPlayer.playbackRate = Number(els.playbackRate.value);
  });

  els.captureFrame.addEventListener('click', async () => {
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
    const hidden = els.videoPlayer.style.display === 'none';
    els.videoPlayer.style.display = hidden ? 'block' : 'none';
    els.toggleVideoPanel.textContent = hidden ? 'Collapse' : 'Expand';
  });
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
  });
}

function populateChapterList(text) {
  const lines = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = lines.filter((x) => /chapter|unit|section|\d+\./i.test(x)).slice(0, 12);
  const chapters = candidates.length ? candidates : ['Chapter 1', 'Chapter 2', 'Chapter 3'];
  els.chapterList.innerHTML = chapters
    .map((c, i) => `<li><button class="chapter-jump" data-index="${i}">${c}</button></li>`)
    .join('');
}

function addAnnotation(type) {
  const text = els.textbookText.value;
  const start = els.textbookText.selectionStart;
  const end = els.textbookText.selectionEnd;
  const selected = text.slice(start, end);
  const note = type === 'comment' ? prompt('Comment text:') || '' : '';
  const row = document.createElement('div');
  row.textContent = selected
    ? `${type.toUpperCase()}: "${selected}"${note ? ` | ${note}` : ''}`
    : `${type.toUpperCase()}: marker added${note ? ` | ${note}` : ''}`;
  els.annotationOutput.prepend(row);
  awardXP(3, `${type} added`);
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
    els.pdfFrame.src = URL.createObjectURL(file);
    els.textbookName.value = file.name.replace(/\.pdf$/i, '');
    els.textbookStatus.textContent = `${file.name} loaded locally.`;
    saveJSON(STORAGE_KEYS.TEXTBOOK, { name: els.textbookName.value });
    awardXP(10, 'textbook imported');
  });

  els.textbookName.addEventListener('change', () => {
    saveJSON(STORAGE_KEYS.TEXTBOOK, { name: els.textbookName.value });
  });

  els.textbookText.addEventListener('input', () => populateChapterList(els.textbookText.value));

  els.highlightSel.addEventListener('click', () => addAnnotation('highlight'));
  els.underlineSel.addEventListener('click', () => addAnnotation('underline'));
  els.addComment.addEventListener('click', () => addAnnotation('comment'));
  els.drawMode.addEventListener('click', () => {
    drawingMode = !drawingMode;
    els.drawMode.textContent = drawingMode ? 'Draw Mode: ON' : 'Draw Mode';
    els.annotationOutput.prepend(Object.assign(document.createElement('div'), {
      textContent: drawingMode ? 'Draw mode enabled (placeholder for canvas overlay).' : 'Draw mode disabled.'
    }));
  });

  els.chapterSummary.addEventListener('click', () => {
    els.quizOutput.innerHTML = `<h4>Summary</h4><p>${makeSummary(els.textbookText.value)}</p>`;
    awardXP(6, 'summary generated');
  });

  els.chapterQuiz.addEventListener('click', () => {
    const quiz = makeQuiz(els.textbookText.value);
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
  });
}

function loadVoices() {
  const voices = speechSynthesis.getVoices();
  els.ttsVoice.innerHTML = voices.map((v, i) => `<option value="${i}">${v.name}</option>`).join('');
  selectedVoice = voices[0] || null;
}

function initTTS() {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;

  els.ttsVoice.addEventListener('change', () => {
    const voices = speechSynthesis.getVoices();
    selectedVoice = voices[Number(els.ttsVoice.value)] || voices[0] || null;
  });

  els.ttsPlay.addEventListener('click', () => {
    const text = els.textbookText.value.trim();
    if (!text) return;
    speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number(els.ttsRate.value);
    if (selectedVoice) utterance.voice = selectedVoice;
    speechSynthesis.speak(utterance);
    els.textbookStatus.textContent = 'TTS reading...';
    awardXP(3, 'tts started');
  });

  els.ttsPause.addEventListener('click', () => speechSynthesis.pause());
  els.ttsStop.addEventListener('click', () => {
    speechSynthesis.cancel();
    els.textbookStatus.textContent = 'TTS stopped.';
  });

  els.jumpBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const jump = Number(btn.dataset.jump);
      const txt = els.textbookText.value;
      const cursor = els.textbookText.selectionStart || 0;
      const next = Math.min(Math.max(cursor + jump * 8, 0), txt.length);
      els.textbookText.focus();
      els.textbookText.setSelectionRange(next, next);
    });
  });
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
}

boot();
