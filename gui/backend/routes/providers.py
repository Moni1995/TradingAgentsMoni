"""GET /api/providers and GET /api/config/defaults."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS


router = APIRouter(prefix="/api", tags=["meta"])


_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic (Claude)",
    "google": "Google (Gemini)",
    "xai": "xAI (Grok)",
    "deepseek": "DeepSeek",
    "qwen": "Qwen — International",
    "qwen-cn": "Qwen — China",
    "glm": "GLM (Z.AI International)",
    "glm-cn": "GLM (BigModel China)",
    "minimax": "MiniMax — Global",
    "minimax-cn": "MiniMax — China",
    "openrouter": "OpenRouter",
    "ollama": "Ollama (local)",
    "azure": "Azure OpenAI",
}


def _models_payload(opts: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"label": label, "value": value} for label, value in opts]


@router.get("/providers")
def list_providers() -> list[dict[str, Any]]:
    out = []
    for key, modes in MODEL_OPTIONS.items():
        env_var = PROVIDER_API_KEY_ENV.get(key)
        out.append({
            "key": key,
            "label": _PROVIDER_LABELS.get(key, key),
            "env_var": env_var,
            "key_present": (env_var is None) or bool(os.environ.get(env_var)),
            "quick_models": _models_payload(modes.get("quick", [])),
            "deep_models": _models_payload(modes.get("deep", [])),
        })
    return out


@router.get("/config/defaults")
def config_defaults() -> dict[str, Any]:
    """Subset of DEFAULT_CONFIG that the GUI form prefills.

    We deliberately don't expose internal paths or vendor maps — those are
    not user-set from the UI in v1.
    """
    keys = (
        "llm_provider", "deep_think_llm", "quick_think_llm",
        "max_debate_rounds", "max_risk_discuss_rounds",
        "checkpoint_enabled", "output_language",
        "google_thinking_level", "openai_reasoning_effort", "anthropic_effort",
    )
    return {k: DEFAULT_CONFIG.get(k) for k in keys}
