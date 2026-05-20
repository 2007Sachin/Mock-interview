from __future__ import annotations

from functools import cached_property
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    app_name: str = "lumina-voice-agent-service"
    port: int = Field(default=7860, alias="PORT")
    node_api_base_url: str = Field(default="http://localhost:4174", alias="NODE_API_BASE_URL")
    pipecat_connect_secret: str = Field(default="dev-pipecat-secret", alias="PIPECAT_CONNECT_SECRET")
    voice_transport: Literal["websocket", "daily"] = Field(default="websocket", alias="VOICE_TRANSPORT")
    pipecat_room_provider: Literal["daily"] = Field(default="daily", alias="PIPECAT_ROOM_PROVIDER")
    pipecat_daily_api_key: str = Field(default="", alias="PIPECAT_DAILY_API_KEY")
    pipecat_daily_domain: str = Field(default="", alias="PIPECAT_DAILY_DOMAIN")
    stt_provider: Literal["whisper", "openai_realtime"] = Field(default="whisper", alias="STT_PROVIDER")
    whisper_model: str = Field(default="base", alias="WHISPER_MODEL")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_stt_model: str = Field(default="gpt-4o-transcribe", alias="OPENAI_STT_MODEL")
    llm_provider: Literal["mistral"] = Field(default="mistral", alias="LLM_PROVIDER")
    mistral_api_key: str = Field(default="", alias="MISTRAL_API_KEY")
    mistral_llm_model: str = Field(default="mistral-small-latest", alias="MISTRAL_LLM_MODEL")
    mistral_temperature: float = Field(default=0.4, alias="MISTRAL_TEMPERATURE")
    mistral_max_tokens: int = Field(default=700, alias="MISTRAL_MAX_TOKENS")
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

    @field_validator("mistral_temperature")
    @classmethod
    def _validate_temperature(cls, value: float) -> float:
        if not 0 <= value <= 1:
            raise ValueError("MISTRAL_TEMPERATURE must be between 0 and 1")
        return value

    @field_validator("mistral_max_tokens")
    @classmethod
    def _validate_max_tokens(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("MISTRAL_MAX_TOKENS must be positive")
        return value

    @cached_property
    def stt_model(self) -> str:
        if self.stt_provider == "openai_realtime":
            return self.openai_stt_model
        return self.whisper_model

    @property
    def provider_metadata(self) -> dict[str, str]:
        return {
            "sttProvider": self.stt_provider,
            "sttModel": self.stt_model,
            "llmProvider": self.llm_provider,
            "llmModel": self.mistral_llm_model,
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
