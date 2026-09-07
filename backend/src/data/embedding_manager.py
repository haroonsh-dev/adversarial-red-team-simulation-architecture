"""Embedding utilities for semantic detection and RAG.

WS-2.2 (open-source): the production default is now a local, open-source ONNX
model via FastEmbed (BAAI/bge-small-en-v1.5) — no API key, no vendor lock-in,
runs offline after the one-time model download. OpenAI text-embedding models
remain available as an explicit opt-in only; ``auto`` never picks them.
"""

from __future__ import annotations

import hashlib
import logging
import math
from collections.abc import Iterable

import httpx

from src.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingUnavailable(RuntimeError):
    """Real embedding backend failed. Do not silently substitute hash-1024."""


AVAILABLE_EMBEDDING_MODELS = {
    "hash-1024": {
        "dimensions": 1024,
        "description": "Deterministic hash-based embedding for offline/test runs",
    },
    "local-bge-small": {
        "dimensions": 384,
        "description": "Open-source BAAI/bge-small-en-v1.5 via FastEmbed (ONNX, offline)",
    },
    "local-bge-multilingual": {
        "dimensions": 384,
        "description": "Open-source sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 "
        "via FastEmbed (ONNX, offline, 50+ languages) — used by the eval gates so "
        "multilingual injection classes are measured honestly",
    },
    "local-minilm": {
        "dimensions": 384,
        "description": "Open-source sentence-transformers/all-MiniLM-L6-v2 via FastEmbed (ONNX, offline)",
    },
    "text-embedding-3-large": {
        "dimensions": 3072,
        "description": "OpenAI text-embedding-3-large (explicit opt-in only)",
    },
    "text-embedding-3-small": {
        "dimensions": 1536,
        "description": "OpenAI text-embedding-3-small (explicit opt-in only)",
    },
}

# Internal alias -> real FastEmbed model name. FastEmbed rejects our aliases
# (they are config labels, not HF model ids); without this mapping every local
# embed silently fell back to hash-1024 and the "semantic" layer was never
# actually measured by the eval gates.
FASTEMBED_MODEL_NAMES = {
    "local-bge-small": "BAAI/bge-small-en-v1.5",
    "local-bge-multilingual": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "local-minilm": "sentence-transformers/all-MiniLM-L6-v2",
}


def fastembed_available() -> bool:
    """True when the optional FastEmbed dependency (open-source ONNX embeddings)
    is installed. Imported lazily so the rest of the platform works without it."""
    try:
        import fastembed  # noqa: F401

        return True
    except ImportError:
        return False


def _pad_or_truncate(vector: list[float], dimensions: int) -> list[float]:
    if len(vector) >= dimensions:
        return vector[:dimensions]
    return vector + [0.0] * (dimensions - len(vector))


class HighAccuracy1024EmbeddingFunction:
    """Embedding function. hash-1024 is explicit/test-only — never a silent fallback."""

    TARGET_DIMENSIONS = 1024
    # Bounded embed cache so repeated arguments (common in agent loops) do not
    # re-hit the embedding API — keeps real-time scoring inside the latency SLO.
    _CACHE_MAX = 512

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or settings.resolve_embedding_model()
        meta = AVAILABLE_EMBEDDING_MODELS.get(self.model_name, {})
        self.dimensions = int(meta.get("dimensions", self.TARGET_DIMENSIONS))
        self._api_dimensions = self.dimensions
        self._openai_base = (settings.OPENAI_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        self._cache: dict[str, list[float]] = {}
        # Lazy FastEmbed model handle (one-time ONNX load / download).
        self._local_model = None

    def embed(self, text: str) -> list[float]:
        if self.model_name == "hash-1024":
            return self._hash_embed(text)
        cached = self._cache.get(text)
        if cached is not None:
            return cached
        try:
            if self.model_name.startswith("text-embedding"):
                vector = self._openai_embed(text)
            elif self.model_name.startswith("local-"):
                vector = self._local_embed(text)
            else:
                raise EmbeddingUnavailable(f"Unknown embedding model {self.model_name}")
        except EmbeddingUnavailable:
            raise
        except Exception as exc:
            logger.error(
                "Embedding failed for %s (%s) — refusing hash-1024 fallback",
                self.model_name,
                exc,
            )
            raise EmbeddingUnavailable(f"{self.model_name}: {exc}") from exc
        if len(self._cache) >= self._CACHE_MAX:
            self._cache.pop(next(iter(self._cache)))
        self._cache[text] = vector
        return vector

    def _local_embed(self, text: str) -> list[float]:
        """Open-source ONNX embeddings via FastEmbed (offline after download)."""
        if self._local_model is None:
            from fastembed import TextEmbedding  # optional dependency

            model_name = FASTEMBED_MODEL_NAMES.get(self.model_name, self.model_name)
            self._local_model = TextEmbedding(model_name=model_name)
        vector = next(self._local_model.embed([text]))
        values = [float(v) for v in vector]
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]

    def embed_batch(self, texts: Iterable[str]) -> list[list[float]]:
        return [self.embed(text) for text in texts]

    def _openai_embed(self, text: str) -> list[float]:
        api_key = settings.OPENAI_API_KEY
        if not api_key or not settings.is_key_configured("OPENAI_API_KEY"):
            raise RuntimeError("OpenAI API key not configured")

        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self._openai_base}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model_name, "input": text},
            )
            response.raise_for_status()
            data = response.json()

        vector = data["data"][0]["embedding"]
        normalized = _pad_or_truncate(list(vector), self.TARGET_DIMENSIONS)
        norm = math.sqrt(sum(v * v for v in normalized)) or 1.0
        return [v / norm for v in normalized]

    def _hash_embed(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.lower().encode("utf-8")).digest()
        values: list[float] = []
        while len(values) < self.dimensions:
            for byte in digest:
                values.append((byte / 255.0) * 2 - 1)
                if len(values) >= self.dimensions:
                    break
            digest = hashlib.sha256(digest).digest()
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    length = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(length))
    norm_a = math.sqrt(sum(x * x for x in a[:length])) or 1.0
    norm_b = math.sqrt(sum(y * y for y in b[:length])) or 1.0
    return dot / (norm_a * norm_b)
