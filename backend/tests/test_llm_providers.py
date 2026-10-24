import httpx
import pytest

from app.config import settings
from app.modules.insights.providers.base import LLMProviderConfigError, LLMProviderError
from app.modules.insights.providers.factory import (
    OPENAI_BASE_URL,
    OPENROUTER_BASE_URL,
    get_llm_provider,
)
from app.modules.insights.providers.gemini import GeminiProvider
from app.modules.insights.providers.openai_compatible import OpenAICompatibleProvider


def _response(payload: dict, status_code: int = 200) -> httpx.Response:
    request = httpx.Request("POST", "https://provider.test")
    return httpx.Response(status_code, json=payload, request=request)


def _openai_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        name="openai",
        api_key="test-key",
        base_url="https://provider.test/v1",
        model="test-model",
        timeout=4,
    )


def test_openai_compatible_success(monkeypatch):
    captured = {}

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return _response({"choices": [{"message": {"content": '{"ok": true}'}}]})

    monkeypatch.setattr("app.modules.insights.providers.openai_compatible.httpx.post", post)
    text = _openai_provider().generate("system", "user")

    assert text == '{"ok": true}'
    assert captured["url"] == "https://provider.test/v1/chat/completions"
    assert captured["json"]["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "user"},
    ]
    assert captured["json"]["temperature"] == 0.2
    assert "response_format" not in captured["json"]
    assert captured["timeout"] == 4


def test_openai_compatible_json_mode_is_opt_in(monkeypatch):
    captured = {}

    def post(url, **kwargs):
        captured.update(kwargs)
        return _response({"choices": [{"message": {"content": "{}"}}]})

    monkeypatch.setattr("app.modules.insights.providers.openai_compatible.httpx.post", post)
    provider = _openai_provider()
    provider.json_mode = True

    provider.generate("system", "user")

    assert captured["json"]["response_format"] == {"type": "json_object"}


def test_openai_compatible_http_error(monkeypatch):
    monkeypatch.setattr(
        "app.modules.insights.providers.openai_compatible.httpx.post",
        lambda *args, **kwargs: _response({"error": "bad key"}, 401),
    )
    with pytest.raises(LLMProviderError, match="HTTP 401"):
        _openai_provider().generate("system", "user")


def test_openai_compatible_timeout(monkeypatch):
    def timeout(*args, **kwargs):
        raise httpx.TimeoutException("request timed out")

    monkeypatch.setattr(
        "app.modules.insights.providers.openai_compatible.httpx.post", timeout
    )
    with pytest.raises(LLMProviderError, match="timed out"):
        _openai_provider().generate("system", "user")


def test_openai_compatible_empty_response(monkeypatch):
    monkeypatch.setattr(
        "app.modules.insights.providers.openai_compatible.httpx.post",
        lambda *args, **kwargs: _response(
            {"choices": [{"message": {"content": ""}}]}
        ),
    )
    with pytest.raises(LLMProviderError, match="empty response"):
        _openai_provider().generate("system", "user")


def _gemini_provider() -> GeminiProvider:
    return GeminiProvider(api_key="test-key", model="gemini-test", timeout=5)


def test_gemini_success(monkeypatch):
    captured = {}

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return _response(
            {"candidates": [{"content": {"parts": [{"text": '{"ok":'}, {"text": " true}"}]}}]}
        )

    monkeypatch.setattr("app.modules.insights.providers.gemini.httpx.post", post)
    text = _gemini_provider().generate("system prompt", "user prompt")

    assert text == '{"ok": true}'
    assert captured["url"] == (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-test:generateContent"
    )
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert captured["json"]["systemInstruction"] == {
        "parts": [{"text": "system prompt"}]
    }
    assert captured["json"]["contents"] == [{"parts": [{"text": "user prompt"}]}]
    assert captured["json"]["generationConfig"]["responseMimeType"] == "application/json"
    assert captured["timeout"] == 5


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"candidates": []}, "no candidates"),
        (
            {"promptFeedback": {"blockReason": "SAFETY"}, "candidates": []},
            "blocked the prompt",
        ),
        (
            {
                "candidates": [
                    {"finishReason": "SAFETY", "content": {"parts": []}}
                ]
            },
            "blocked the response",
        ),
        (
            {"candidates": [{"content": {"parts": []}}]},
            "empty response",
        ),
    ],
)
def test_gemini_empty_or_blocked_response(monkeypatch, payload, message):
    monkeypatch.setattr(
        "app.modules.insights.providers.gemini.httpx.post",
        lambda *args, **kwargs: _response(payload),
    )
    with pytest.raises(LLMProviderError, match=message):
        _gemini_provider().generate("system", "user")


def test_gemini_http_error(monkeypatch):
    monkeypatch.setattr(
        "app.modules.insights.providers.gemini.httpx.post",
        lambda *args, **kwargs: _response({"error": "bad key"}, 403),
    )
    with pytest.raises(LLMProviderError, match="HTTP 403"):
        _gemini_provider().generate("system", "user")


def test_gemini_timeout(monkeypatch):
    def timeout(*args, **kwargs):
        raise httpx.TimeoutException("request timed out")

    monkeypatch.setattr("app.modules.insights.providers.gemini.httpx.post", timeout)
    with pytest.raises(LLMProviderError, match="timed out"):
        _gemini_provider().generate("system", "user")


@pytest.mark.parametrize(
    ("provider_name", "expected_type", "expected_model"),
    [
        ("openai", OpenAICompatibleProvider, "compat-model"),
        ("openrouter", OpenAICompatibleProvider, "compat-model"),
        ("gemini", GeminiProvider, "gemini-model"),
    ],
)
def test_factory_provider_selection(
    monkeypatch, provider_name, expected_type, expected_model
):
    monkeypatch.setattr(settings, "LLM_PROVIDER", provider_name)
    monkeypatch.setattr(settings, "LLM_API_KEY", "compat-key")
    monkeypatch.setattr(settings, "LLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_MODEL", "compat-model")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "gemini-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-model")

    provider = get_llm_provider()

    assert isinstance(provider, expected_type)
    assert provider.model == expected_model
    if provider_name == "openai":
        assert provider.base_url == OPENAI_BASE_URL
    elif provider_name == "openrouter":
        assert provider.base_url == OPENROUTER_BASE_URL
    else:
        assert provider.name == "gemini"


def test_factory_uses_custom_openai_compatible_base_url(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "LLM_API_KEY", "compat-key")
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://custom.test/v1/")
    provider = get_llm_provider()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.base_url == "https://custom.test/v1"


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "unknown")
    with pytest.raises(LLMProviderConfigError, match="Unsupported LLM_PROVIDER"):
        get_llm_provider()


@pytest.mark.parametrize(
    ("provider_name", "api_key_name"),
    [("openai", "LLM_API_KEY"), ("openrouter", "LLM_API_KEY"), ("gemini", "GEMINI_API_KEY")],
)
def test_factory_requires_selected_provider_key(monkeypatch, provider_name, api_key_name):
    monkeypatch.setattr(settings, "LLM_PROVIDER", provider_name)
    monkeypatch.setattr(settings, api_key_name, "")
    with pytest.raises(LLMProviderConfigError, match="not configured"):
        get_llm_provider()
