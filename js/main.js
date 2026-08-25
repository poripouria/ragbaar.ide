let engine, detector, musician;
let frameCounter = 0;

async function initTypingDemo() {
    engine = new LSTMOrchestralEngine();
    await engine.load();

    detector = new KeyEventsDetector();
    musician = new LSTMOrchestralMusician(engine);

    console.log('Typing demo ready — engine, detector and musician initialized.');
}

// Called by index.html's sendEvent() for every keydown/keyup (including the
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
