# Provider Setup: Whisper + Mistral + Kokoro

The realtime provider stack is:

```txt
Whisper = STT
Mistral = LLM
Kokoro = TTS
```

## Environment

Create or update `.env` locally:

```env
MISTRAL_API_KEY=your-local-secret
MISTRAL_MODEL=mistral-small-latest
WHISPER_MODEL=base
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=default
KOKORO_VOICE=af_heart
```

Do not commit real API keys. `.env.example` intentionally contains empty placeholders only.

## Install Provider Dependencies

```powershell
cd C:\Users\S Sameer\Desktop\HOD\lumina-mock-interview-platform\services\voice-agent
pip install -r requirements.txt
```

This installs:

- `pipecat-ai[websocket,whisper,kokoro]` for FastAPI websocket transport, local Whisper STT, and local Kokoro ONNX TTS.
- Pipecat's Mistral service, included in the core `pipecat-ai` package.
- `redis` and `PyJWT` for Redis-backed reconnect state and signed voice session tokens.

## Local Model Notes

- Whisper downloads the selected model on first use. `base` is a good local default.
- Kokoro downloads/caches ONNX model files on first use.
- First startup can be slow because model files may need to download.

## CPU/GPU Notes

- CPU: use `WHISPER_MODEL=base` or `tiny` and `WHISPER_COMPUTE_TYPE=int8` for lower memory usage.
- NVIDIA CUDA: use `WHISPER_DEVICE=cuda` and `WHISPER_COMPUTE_TYPE=float16`.
- Apple Silicon: Pipecat supports MLX Whisper, but this Windows setup should use Faster Whisper.
- Kokoro runs locally through ONNX Runtime; CPU is usually acceptable for local testing.

## Runtime Behavior

When all provider dependencies and `MISTRAL_API_KEY` are available, the Voice Agent runs:

```txt
pipecat:whisper-mistral-kokoro
```

There is no typed-message mock fallback. If Redis, provider dependencies, model files, or `MISTRAL_API_KEY` are missing, the realtime voice session fails fast.
