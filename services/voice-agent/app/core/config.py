from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    app_name: str = "lumina-voice-agent-service"
    voice_agent_port: int = 8020
    career_engine_base_url: str = "http://localhost:4010"
    hmac_shared_secret: str = "local-dev-secret-change-me"
    jwt_secret: str = "replace-with-32-byte-secret"
    voice_session_ttl_seconds: int = 3600
    voice_redis_url: str = "redis://localhost:6384/1"
    voice_state_ttl_seconds: int = 7200
    voice_transcript_max_segments: int = 400
    callback_retry_attempts: int = 3
    callback_retry_base_delay_seconds: float = 0.4
    mistral_api_key: str | None = None
    mistral_model: str = "mistral-small-latest"
    whisper_model: str = "base"
    whisper_device: str = "auto"
    whisper_compute_type: str = "default"
    kokoro_voice: str = "af_heart"
    log_level: str = "info"


settings = Settings()
