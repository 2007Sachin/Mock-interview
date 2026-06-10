from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    app_name: str = "pathwisse-voice-agent"
    port: int = Field(default=7860, alias="PORT")
    node_api_base_url: str = Field(default="http://localhost:4174", alias="NODE_API_BASE_URL")
    pipecat_connect_secret: str = Field(default="dev-pipecat-secret", alias="PIPECAT_CONNECT_SECRET")
    voice_transport: Literal["websocket", "daily"] = Field(default="websocket", alias="VOICE_TRANSPORT")
    pipecat_room_provider: Literal["daily"] = Field(default="daily", alias="PIPECAT_ROOM_PROVIDER")
    pipecat_daily_api_key: str = Field(default="", alias="PIPECAT_DAILY_API_KEY")
    pipecat_daily_domain: str = Field(default="", alias="PIPECAT_DAILY_DOMAIN")

    # LLM — Groq (OpenAI-compatible, pay-as-you-go, no fixed fee)
    llm_provider: Literal["groq"] = Field(default="groq", alias="LLM_PROVIDER")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.1-8b-instant", alias="GROQ_MODEL")
    groq_temperature: float = Field(default=0.4, alias="GROQ_TEMPERATURE")
    groq_max_tokens: int = Field(default=700, alias="GROQ_MAX_TOKENS")

    # TTS — browser-side Kokoro only; Python emits assistant_text events
    tts_provider: Literal["kokoro_browser"] = Field(default="kokoro_browser", alias="TTS_PROVIDER")

    request_timeout_seconds: float = 15.0
    persistence_retry_attempts: int = 3
    persistence_retry_backoff_seconds: float = 0.5
    log_level: str = "info"

    @field_validator("node_api_base_url")
    @classmethod
    def _normalize_base_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        if not normalized:
            raise ValueError("NODE_API_BASE_URL is required")
        return normalized

    @field_validator("pipecat_connect_secret")
    @classmethod
    def _validate_secret(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("PIPECAT_CONNECT_SECRET is required")
        return normalized

    @field_validator("pipecat_daily_domain")
    @classmethod
    def _normalize_daily_domain(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @field_validator("groq_temperature")
    @classmethod
    def _validate_temperature(cls, value: float) -> float:
        if not 0 <= value <= 1:
            raise ValueError("GROQ_TEMPERATURE must be between 0 and 1")
        return value

    @field_validator("groq_max_tokens")
    @classmethod
    def _validate_max_tokens(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("GROQ_MAX_TOKENS must be positive")
        return value

    @property
    def provider_metadata(self) -> dict[str, str]:
        return {
            "sttProvider": "browser",
            "llmProvider": self.llm_provider,
            "llmModel": self.groq_model,
            "ttsProvider": self.tts_provider,
        }

    @property
    def missing_daily_config(self) -> list[str]:
        missing: list[str] = []
        if self.voice_transport != "daily":
            return missing
        if self.pipecat_room_provider != "daily":
            missing.append("PIPECAT_ROOM_PROVIDER")
        if not self.pipecat_daily_api_key:
            missing.append("PIPECAT_DAILY_API_KEY")
        if not self.pipecat_daily_domain:
            missing.append("PIPECAT_DAILY_DOMAIN")
        return missing


settings = Settings()
