// --- Site metadata (title/description), driven by site.yml so it stays in one place ---
function parseSimpleYaml(text) {
    const result = {};
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) continue;
        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

async function applySiteMetadata() {
    try {
        const response = await fetch('site.yml');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const site = parseSimpleYaml(await response.text());

        if (site.title) document.title = site.title;
        if (site.description) {
            let descTag = document.querySelector('meta[name="description"]');
            if (!descTag) {
                descTag = document.createElement('meta');
                descTag.name = 'description';
                document.head.appendChild(descTag);
            }
            descTag.content = site.description;
        }
    } catch (err) {
        console.warn('Could not load site.yml, keeping default title/description:', err);
    }
}

window.addEventListener('DOMContentLoaded', applySiteMetadata);

let engine, detector, musician;
let frameCounter = 0;

async function initTypingDemo() {
    engine = new LSTMOrchestralEngine();
    await engine.load();

    detector = new KeyEventsDetector();
    musician = new LSTMOrchestralMusician(engine);

    console.log('Typing demo ready — engine, detector and musician initialized.');
}

// Called by sendEvent() below for every keydown/keyup (including the
// synthetic "scroll"/"mousemove" keys from makeGestureTrigger)
async function handleTypingObservation(observation) {
    if (!musician) {
        console.warn('Musician not ready yet — ignoring event.');
        return;
    }

    const sceneEvents = detector.detect(observation);
    if (sceneEvents.length === 0) return;

    const musicEvents = await musician.generateMusic(sceneEvents);
    if (musicEvents.length === 0) return;

    frameCounter++;
    handleMusicEvents({
        events: musicEvents,
        frame_counter: frameCounter,
    });
}

window.addEventListener('DOMContentLoaded', initTypingDemo);

// --- Syntax highlighting (Prism.js), driven entirely by the filename's extension
Prism.plugins.autoloader.languages_path = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/';

const LANGUAGE_BY_EXT = {
    py: 'python',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp',
    c: 'c',
    html: 'markup', htm: 'markup', xml: 'markup',
    js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
    json: 'json', css: 'css', md: 'markdown', java: 'java', cs: 'csharp',
};

function detectLanguage(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return LANGUAGE_BY_EXT[ext] || 'javascript';
}

const highlightCode = document.getElementById('highlightCode');
const highlightPre = document.getElementById('highlightPre');
const filenameInput = document.getElementById('filenameInput');

function updateHighlight() {
    highlightCode.className = `language-${detectLanguage(filenameInput.value)}`;
    // Trailing newline keeps the <pre>'s height honest when the last line is empty.
    highlightCode.textContent = editor.value + '\n';
    Prism.highlightElement(highlightCode);
}

// No backend in this demo — the LSTM model, detector and musician all run locally in the browser.
const statusTextEl = document.getElementById('statusText');
let noteCount = 0;
const noteCountEl = document.getElementById('noteCount');

// --- Start-engine gesture (Web Audio requires a real user interaction) -----
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');

startBtn.addEventListener('click', async () => {
    try {
        await Tone.start();
        initializeAudioSystem();          // builds the mastering chain + instrument factories
        isMusicGenerationActive = true;   // audio-engine.js checks this before playing tonal notes
        Tone.Transport.bpm.value = currentTempo;
        Tone.Transport.start();
        startOverlay.style.display = 'none';
        editor.focus();
        console.log('🎵 Audio engine started');
    } catch (err) {
        console.error('❌ Failed to start audio engine:', err);
        statusTextEl.textContent = 'Failed to start audio — see console';
    }
});

document.getElementById('stopBtn').addEventListener('click', () => {
    if (typeof hardStopAllAudio === 'function') {
        hardStopAllAudio();
    }
});

// --- Save (downloads the buffer under whatever name is in the title bar) ---
function saveFile() {
    const filename = filenameInput.value.trim() || 'session.txt';
    const blob = new Blob([editor.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

document.getElementById('saveBtn').addEventListener('click', saveFile);

// Filename drives syntax highlighting (see detectLanguage above) and
// auto-sizes to its own content so it doesn't look like a fixed-width box.
function resizeFilenameInput() {
    filenameInput.size = Math.max(6, filenameInput.value.length);
}
filenameInput.addEventListener('input', () => {
    resizeFilenameInput();
    updateHighlight();
});
resizeFilenameInput();

// --- Keystroke capture -----------------------------------------------------
const editor = document.getElementById('editor');
const lastKeyEl = document.getElementById('lastKey');
const heldKeysEl = document.getElementById('heldKeys');
const heldKeys = new Set();

function sendEvent(type, key) {
    // Routes directly into the local pipeline (detector -> musician -> audio-engine),
    // no backend involved. See handleTypingObservation() above.
    const kind = type === 'keydown' ? 'onset' : 'release';
    const classInfo = TYPING_KEY_CLASS_MAP[key] || 'typing_other';
    handleTypingObservation({ kind, key, class_name: classInfo, intensity: 1.0 });
}

function renderHeldKeys() {
    heldKeysEl.innerHTML = Array.from(heldKeys)
        .map(k => `<span class="held-key">${k === ' ' ? 'space' : k}</span>`)
        .join('');
}

editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.slice(0, start) + '\t' + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + 1;
        scheduleRender();
    }

    // Ctrl/Cmd+S saves instead of triggering the browser's "Save Page" dialog.
    // The keystroke still counts musically (see below) - it's a real keypress.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
    }

    // Ignore OS key-repeat: we only want one NOTE_ON per physical press.
    if (e.repeat) return;

    const key = e.key.toLowerCase();
    heldKeys.add(key);
    renderHeldKeys();
    lastKeyEl.textContent = e.key === ' ' ? 'space' : e.key;

    sendEvent('keydown', key);
});

editor.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    heldKeys.delete(key);
    renderHeldKeys();

    sendEvent('keyup', key);
});

// If the editor loses focus mid-keypress (alt-tab, etc.),
// release everything so Musician doesn't hold a note forever.
editor.addEventListener('blur', () => {
    heldKeys.forEach(key => sendEvent('keyup', key));
    heldKeys.clear();
    renderHeldKeys();
    releaseScrollSoon.cancel();
    releaseMouseSoon.cancel();
});

// --- Scroll -> string, mouse movement -> pad --------------------------------
function makeGestureTrigger(key, holdMs) {
    let isHeld = false;
    let releaseTimer = null;

    function trigger() {
        if (!isHeld) {
            isHeld = true;
            sendEvent('keydown', key);
        }
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => {
            isHeld = false;
            sendEvent('keyup', key);
        }, holdMs);
    }

    trigger.cancel = () => {
        clearTimeout(releaseTimer);
        if (isHeld) sendEvent('keyup', key);
        isHeld = false;
    };

    return trigger;
}

const releaseScrollSoon = makeGestureTrigger('scroll', 250);
const releaseMouseSoon = makeGestureTrigger('mousemove', 350);

editor.addEventListener('wheel', () => {
    releaseScrollSoon();
}, { passive: true });

// Throttle mousemove sampling
let lastMouseSample = 0;
editor.addEventListener('mousemove', () => {
    const now = Date.now();
    if (now - lastMouseSample < 80) return;
    lastMouseSample = now;
    releaseMouseSoon();
});

// --- Fake line-number gutter, synced to content + scroll -------------------
const gutter = document.getElementById('gutter');
let lastGutterLineCount = -1;

function updateGutter() {
    const lineCount = editor.value.split('\n').length;
    // Skip the rebuild (and its reflow) when the line count hasn't actually changed
    if (lineCount === lastGutterLineCount) return;
    lastGutterLineCount = lineCount;
    let html = '';
    for (let i = 1; i <= lineCount; i++) html += `<div>${i}</div>`;
    gutter.innerHTML = html;
}

let renderScheduled = false;
function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
        renderScheduled = false;
        updateGutter();
        updateHighlight();
    });
}

editor.addEventListener('input', scheduleRender);
editor.addEventListener('scroll', () => {
    gutter.scrollTop = editor.scrollTop;
    highlightPre.scrollTop = editor.scrollTop;
    highlightPre.scrollLeft = editor.scrollLeft;
});

updateGutter();
updateHighlight();
