from app.config import settings
from app.modules.insights.providers.base import LLMProvider, LLMProviderConfigError
from app.modules.insights.providers.gemini import GeminiProvider
from app.modules.insights.providers.openai_compatible import OpenAICompatibleProvider

OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_llm_provider() -> LLMProvider:
    provider_name = settings.LLM_PROVIDER.strip().lower()
    if provider_name == "gemini":
        if not settings.GEMINI_API_KEY.strip():
            raise LLMProviderConfigError("AI provider not configured")
        return GeminiProvider()
    if provider_name in {"openai", "openrouter"}:
        if not settings.LLM_API_KEY.strip():
            raise LLMProviderConfigError("AI provider not configured")
        default_base_url = (
            OPENROUTER_BASE_URL if provider_name == "openrouter" else OPENAI_BASE_URL
        )
        return OpenAICompatibleProvider(
            name=provider_name,
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL or default_base_url,
            model=settings.LLM_MODEL,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            json_mode=settings.LLM_JSON_MODE,
        )
    raise LLMProviderConfigError(f"Unsupported LLM_PROVIDER: {settings.LLM_PROVIDER}")
