class KeyEventsDetector {
    constructor() {
        // key -> { since: frameId, class_name }
        this.held = {};
    }

    // observation: { kind: "onset"|"release", key, class_name, intensity }
    // Returns an array of scene events, matching Detector.py's KeyEventsDetector output shape
    detect(observation) {
        const events = [];
        if (!observation) return events;

        const key = observation.key;
        const className = observation.class_name ?? "unknown";
        const intensity = observation.intensity ?? 1.0;

        if (observation.kind === "onset") {
            // Ignore key-repeat (browser fires repeated keydown while a key stays held)
            if (key !== undefined && key in this.held) {
                return events;
            }
            if (key !== undefined) {
                this.held[key] = { class_name: className };
            }
            events.push({ type: "NOTE_ON", object_id: key, class: className, intensity });

        } else if (observation.kind === "release") {
            if (key !== undefined) {
                delete this.held[key];
            }
            events.push({ type: "NOTE_OFF", object_id: key, class: className, intensity });
        }

        return events;
    }
}
