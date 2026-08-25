/**
 * RagbaarNet Typing Demo — core.js (trimmed)
 * ============================================
 * Only the globals and helper functions that audio-engine.js actually
 * depends on. Everything driving-specific (speed/RPM-to-tempo mapping,
 * the musician selection modal, processor URL detection, etc.) has been
 * removed — this demo has no backend and no vehicle telemetry.
 */

// Tempo is fixed for this demo — there is no speed input to derive it from
let currentTempo = 120;

// Fallback instrument, used only if an event ever arrives without one
// (should not normally happen in this demo, since every event carries an instrument)
let currentInstrument = 'piano';

// --- Volume ---
const VOLUME_MIN = 0;
const VOLUME_MAX = 100;
const DEFAULT_VOLUME = 40;
let currentVolume = DEFAULT_VOLUME;

function clampVolumeValue(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return currentVolume;
    return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, parsed));
}

// Kept only because audio-engine.js's status display calls it — tempo is fixed in this demo
function clampTempoValue(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return currentTempo;
    return parsed;
}

function updateVolumeControls(volume) {
    currentVolume = clampVolumeValue(volume);
    if (typeof masterGain !== 'undefined' && masterGain) {
        masterGain.gain.value = currentVolume / 100;
    }
    const label = document.getElementById('volumeLabel');
    if (label) label.textContent = `${currentVolume}%`;
}

function handleVolumeSliderInput(e) {
    updateVolumeControls(e.target.value);
}

// --- Status text ---
function updateStatus(message) {
    const statusEl = document.getElementById('statusText');
    if (statusEl) statusEl.textContent = message;
}
