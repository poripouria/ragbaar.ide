class LSTMOrchestralEngine {
    constructor() {
        this.session = null;        // loaded ONNX inference session
        this.mapping = null;        // note symbol -> index
        this.reverseMapping = null; // index -> note symbol
        this.vocabSize = 0;
        this.SEQ_LEN = 64;
        this.validIndices = [];     // indices that correspond to real note symbols (digits only)
        this.ready = false;
    }

    // Must be called once when the page starts
    async load() {
        console.log("Loading LSTM model...");

        // Load the symbol <-> index mapping
        const response = await fetch('models/mapping.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch mapping.json: HTTP ${response.status}`);
        }
        this.mapping = await response.json();

        this.reverseMapping = {};
        for (const [symbol, index] of Object.entries(this.mapping)) {
            this.reverseMapping[index] = symbol;
        }
        this.vocabSize = Object.keys(this.mapping).length;

        // Collect indices that map to actual note digits (skip "/" and "r")
        for (const [index, symbol] of Object.entries(this.reverseMapping)) {
            if (/^\d+$/.test(symbol)) {
                this.validIndices.push(parseInt(index));
            }
        }

        // Load the ONNX model itself
        this.session = await ort.InferenceSession.create('models/ragbaar_lstm_final.onnx', {
            executionProviders: ['wasm']
        });

        this.ready = true;
        console.log(`Model loaded. vocab size: ${this.vocabSize}, valid note indices: ${this.validIndices.length}`);
    }

    // Converts seedTokens into a one-hot tensor, matching generator.py's logic
    _prepareInput(seedTokens) {
        const startSymbols = new Array(this.SEQ_LEN).fill('/');
        const fullSeq = [...startSymbols, ...seedTokens];

        // Keep only the last SEQ_LEN tokens
        const last64 = fullSeq.slice(-this.SEQ_LEN);

        const indices = last64.map(symbol => this.mapping[symbol] ?? 0);

        // Build a one-hot array with shape (1, SEQ_LEN, vocabSize)
        const data = new Float32Array(this.SEQ_LEN * this.vocabSize);
        indices.forEach((idx, t) => {
            data[t * this.vocabSize + idx] = 1.0;
        });

        return new ort.Tensor('float32', data, [1, this.SEQ_LEN, this.vocabSize]);
    }

    _softmax(logits) {
        const max = Math.max(...logits);
        const exps = logits.map(v => Math.exp(v - max));
        const sum = exps.reduce((a, b) => a + b, 0);
        return exps.map(v => v / sum);
    }

    // Generates one new note given a list of recent seed notes
    async nextNote(seedTokens) {
        if (!this.ready) {
            throw new Error("Model is not loaded yet — call load() first and wait for it to finish.");
        }

        const inputTensor = this._prepareInput(seedTokens);

        const feeds = {};
        feeds[this.session.inputNames[0]] = inputTensor;   // use the model's actual input name, not a hardcoded guess

        const results = await this.session.run(feeds);
        const outputName = this.session.outputNames[0];
        const logits = Array.from(results[outputName].data);

        const probs = this._softmax(logits);

        // Keep only probabilities for real note digits, matching generator.py
        const digitProbs = this.validIndices.map(i => probs[i]);
        const sum = digitProbs.reduce((a, b) => a + b, 0);
        const normalized = digitProbs.map(p => p / sum);

        // Weighted random sampling, equivalent to np.random.choice
        let r = Math.random();
        let acc = 0;
        let chosenIndex = this.validIndices[0];
        for (let i = 0; i < normalized.length; i++) {
            acc += normalized[i];
            if (r <= acc) {
                chosenIndex = this.validIndices[i];
                break;
            }
        }

        return this.reverseMapping[chosenIndex];   // e.g. "67"
    }
}
