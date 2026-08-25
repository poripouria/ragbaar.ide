import torch
import json
from modules.Models.Music.LSTM_OnEssen.train import LSTM_OnEssen
from modules import config

with open(config.LSTM_MAPPING_PATH) as f:
    mapping = json.load(f)
vocab_size = len(mapping)

checkpoint = torch.load(config.LSTM_MODEL_PATH, map_location='cpu', weights_only=True)
model = LSTM_OnEssen(
    input_size=vocab_size,
    hidden_sizes=checkpoint['hidden_sizes'],
    dropout=checkpoint.get('dropout', 0.1)
)
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

dummy_input = torch.zeros(1, 64, vocab_size, dtype=torch.float32)

torch.onnx.export(
    model,
    dummy_input,
    "ragbaar_lstm.onnx",
    input_names=['input'],
    output_names=['logits'],
    opset_version=17
)
