class LSTMOrchestralMusician {
    // engine: an already-loaded instance of LSTMOrchestralEngine from lstm-inference.js
    constructor(engine) {
        this.engine = engine;

        // Default 32-token seed melody per instrument, copied exactly from Musician.py
        const defaultSeed = [
            "64", "_", "67", "_", "65", "_", "65", "_",
            "65", "_", "_", "_", "62", "_", "64", "_",
            "64", "_", "67", "_", "65", "_", "65", "_",
            "48", "_", "_", "50", "62", "_", "64", "_"
        ];

        this.lastSeedNotes = {};
        this.noteBuffer = {};
        for (const instrument of ["piano", "electric_piano", "bass", "strings", "pad"]) {
            this.lastSeedNotes[instrument] = [...defaultSeed];
            this.noteBuffer[instrument] = [...defaultSeed];
        }

        // activeNotes[channel][object_id] = { note, velocity, instrument }
        this.activeNotes = {};
        for (let i = 0; i < 16; i++) this.activeNotes[i] = {};
    }

    // Mirrors LSTMOrchestralMusician._map_classes
    _mapClass(objClass) {
        const baseClass = objClass.split("_")[0];
        const instrument = LSTM_ORCHESTRAL_CLASS_MAPPING[baseClass];
        if (!instrument) return null;
        return { instrument, channel: INSTRUMENT_MIDI_CHANNELS[instrument] ?? 0 };
    }

    // sceneEvents: the array returned by KeyEventsDetector.detect()
    // async: each NOTE_ON requires an ONNX inference call, which is a Promise
    async generateMusic(sceneEvents) {
        const musicEvents = [];

        for (const e of sceneEvents) {
            const mapped = this._mapClass(e.class);
            if (!mapped) {
                console.log(`Skipping unmapped object class '${e.class}'.`);
                continue;
            }
            const { instrument, channel } = mapped;

            let eventType = null, note = null, velocity = 0;

            if (e.type === "NOTE_ON") {
                eventType = "note_on";

                // Typing events have no spatial "area", so we always fall back to intensity
                // (TypingPipeline always sends intensity = 1.0, so this is effectively constant velocity)
                const intensity = Math.max(0.0, Math.min(1.0, e.intensity ?? 1.0));
                velocity = Math.round(intensity * (127 - 31) + 31);

                // Note: temperature is intentionally unused here, matching generate_melody_RT's real-time behavior
                const newNote = await this.engine.nextNote(this.lastSeedNotes[instrument]);
                note = parseInt(newNote, 10);

                this.activeNotes[channel][e.object_id] = { note, velocity, instrument };
                this.noteBuffer[instrument].push(newNote);

            } else if (e.type === "NOTE_OFF") {
                eventType = "note_off";

                const info = this.activeNotes[channel][e.object_id];
                if (!info) {
                    console.warn(`No previous note found to turn off for object_id ${e.object_id}.`);
                    continue;
                }
                note = info.note;
                delete this.activeNotes[channel][e.object_id];

            } else {
                continue;
            }

            musicEvents.push({
                event_type: eventType,
                note, channel, velocity, instrument,
                timestamp: performance.now(),
                metadata: e,
            });

            this.lastSeedNotes[instrument] = this.noteBuffer[instrument].slice(-32);
        }

        // Note: intentionally no auto-release/stale-note cleanup here. In Detector.py,
        // _is_stale() only returns true for detector states that track "objects" per frame,
        // and KeyEventsDetector's state only has "held" — so it never goes stale there either.
        // Notes are only ever released by a real NOTE_OFF (keyup) event.

        return musicEvents;
    }
}
