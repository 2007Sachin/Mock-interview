import json
import logging
from typing import Any

import redis.asyncio as redis
from redis.exceptions import ConnectionError, TimeoutError

from app.core.config import settings

logger = logging.getLogger("state_store")


class RedisStateStore:
    def __init__(self) -> None:
        self._redis = redis.from_url(settings.voice_redis_url, decode_responses=True)
        self._ttl = settings.voice_state_ttl_seconds
        self._use_fallback = False
        self._memory_store = {}  # key -> json string or list of json strings

    async def _check_fallback(self) -> bool:
        if self._use_fallback:
            return True
        try:
            # Try a quick ping to see if Redis is alive
            await self._redis.ping()
            return False
        except (ConnectionError, TimeoutError, Exception) as e:
            logger.warning(
                f"Failed to connect to Redis at {settings.voice_redis_url}: {e}. "
                "Falling back to self-healing In-Memory storage."
            )
            self._use_fallback = True
            return True

    async def ping(self) -> bool:
        if await self._check_fallback():
            return True
        try:
            return bool(await self._redis.ping())
        except Exception:
            return True

    async def set_json(self, key: str, value: Any) -> None:
        if await self._check_fallback():
            self._memory_store[key] = json.dumps(value)
            return
        try:
            await self._redis.set(key, json.dumps(value), ex=self._ttl)
        except Exception as e:
            logger.warning(f"Redis write error, switching to In-Memory: {e}")
            self._use_fallback = True
            self._memory_store[key] = json.dumps(value)

    async def get_json(self, key: str) -> Any | None:
        if await self._check_fallback():
            raw = self._memory_store.get(key)
            return json.loads(raw) if raw else None
        try:
            raw = await self._redis.get(key)
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.warning(f"Redis read error, switching to In-Memory: {e}")
            self._use_fallback = True
            raw = self._memory_store.get(key)
            return json.loads(raw) if raw else None

    async def append_json(self, key: str, value: Any) -> None:
        if await self._check_fallback():
            if key not in self._memory_store or not isinstance(self._memory_store[key], list):
                self._memory_store[key] = []
            self._memory_store[key].append(json.dumps(value))
            if key.startswith("transcript:"):
                self._memory_store[key] = self._memory_store[key][-settings.voice_transcript_max_segments:]
            return
        try:
            await self._redis.rpush(key, json.dumps(value))
            if key.startswith("transcript:"):
                await self._redis.ltrim(key, -settings.voice_transcript_max_segments, -1)
            await self._redis.expire(key, self._ttl)
        except Exception as e:
            logger.warning(f"Redis append error, switching to In-Memory: {e}")
            self._use_fallback = True
            if key not in self._memory_store or not isinstance(self._memory_store[key], list):
                self._memory_store[key] = []
            self._memory_store[key].append(json.dumps(value))
            if key.startswith("transcript:"):
                self._memory_store[key] = self._memory_store[key][-settings.voice_transcript_max_segments:]

    async def list_json(self, key: str) -> list[Any]:
        if await self._check_fallback():
            values = self._memory_store.get(key, [])
            if not isinstance(values, list):
                return []
            return [json.loads(value) for value in values]
        try:
            values = await self._redis.lrange(key, 0, -1)
            return [json.loads(value) for value in values]
        except Exception as e:
            logger.warning(f"Redis list error, switching to In-Memory: {e}")
            self._use_fallback = True
            values = self._memory_store.get(key, [])
            if not isinstance(values, list):
                return []
            return [json.loads(value) for value in values]

    async def delete_session(self, session_id: str) -> None:
        if await self._check_fallback():
            self._memory_store.pop(f"session:{session_id}", None)
            self._memory_store.pop(f"transcript:{session_id}", None)
            self._memory_store.pop(f"workspace:{session_id}", None)
            self._memory_store.pop(f"stage:{session_id}", None)
            return
        try:
            await self._redis.delete(
                f"session:{session_id}",
                f"transcript:{session_id}",
                f"workspace:{session_id}",
                f"stage:{session_id}",
            )
        except Exception as e:
            logger.warning(f"Redis delete error, switching to In-Memory: {e}")
            self._use_fallback = True
            self._memory_store.pop(f"session:{session_id}", None)
            self._memory_store.pop(f"transcript:{session_id}", None)
            self._memory_store.pop(f"workspace:{session_id}", None)
            self._memory_store.pop(f"stage:{session_id}", None)


state_store = RedisStateStore()
