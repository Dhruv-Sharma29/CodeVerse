"""Thin LLM provider wrapper around any OpenAI-compatible endpoint (NVIDIA NIM by default).

Config comes from environment variables (loaded from the nearest .env):
    NVIDIA_API_KEY     required
    LLM_BASE_URL       default https://integrate.api.nvidia.com/v1
    LLM_MODEL          default model id used by chat()
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from functools import lru_cache

from dotenv import find_dotenv, load_dotenv
from openai import OpenAI

load_dotenv(find_dotenv(usecwd=True))

DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"


@lru_cache(maxsize=1)
def get_client() -> OpenAI:
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not set. Add it to codeverse/.env")
    return OpenAI(
        base_url=os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL),
        api_key=api_key,
        max_retries=6,  # free NIM endpoints often return 429/503 "overloaded"
        timeout=180,
    )


def default_model() -> str:
    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL is not set. Add it to codeverse/.env")
    return model


def list_models(contains: str | None = None) -> list[str]:
    ids = sorted(m.id for m in get_client().models.list().data)
    return [i for i in ids if contains is None or contains.lower() in i.lower()]


def chat(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    **kwargs,
) -> str:
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    resp = get_client().chat.completions.create(
        model=model or default_model(),
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )
    return resp.choices[0].message.content or ""


def stream(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    **kwargs,
) -> Iterator[str]:
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    for chunk in get_client().chat.completions.create(
        model=model or default_model(),
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
        **kwargs,
    ):
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


def extract_code(text: str, lang: str | None = None) -> str:
    """Return the first fenced code block (optionally of a given language), else the text."""
    import re

    for m in re.finditer(r"```([\w+-]*)\n(.*?)```", text, re.S):
        if lang is None or m.group(1).lower() == lang.lower():
            return m.group(2).strip()
    return text.strip()
