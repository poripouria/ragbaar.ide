// Maps each MIDI-related instrument to a fixed synth channel (mirrors config.py's INSTRUMENT_MIDI_CHANNELS)
const INSTRUMENT_MIDI_CHANNELS = {
    piano: 0,
    electric_piano: 1,
    acoustic_guitar: 2,
    electric_guitar: 3,
    strings: 4,
    pad: 5,
    bass: 6,
    synth: 7,
    drums: 9,
};

// Maps an object class (after stripping any "_suffix") to an instrument (mirrors config.py's LSTM_ORCHESTRAL_CLASS_MAPPING)
const LSTM_ORCHESTRAL_CLASS_MAPPING = {
    typing: "piano",
    scroll: "strings",
    mousemove: "pad",
};

// Maps a raw key name to a class name (mirrors config.py's TYPING_KEY_CLASS_MAP)
const TYPING_KEY_CLASS_MAP = {};
for (let c = 97; c <= 122; c++) {           // 'a' .. 'z'
    TYPING_KEY_CLASS_MAP[String.fromCharCode(c)] = "typing_letter";
}
for (let d = 0; d <= 9; d++) {
    TYPING_KEY_CLASS_MAP[String(d)] = "typing_digit";
}
Object.assign(TYPING_KEY_CLASS_MAP, {
    backspace: "typing_delete",
    enter: "typing_newline",
    tab: "typing_indent",
    space: "typing_space",
    scroll: "scroll",
    mousemove: "mousemove",
});
