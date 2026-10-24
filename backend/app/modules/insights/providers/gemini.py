import httpx

from app.config import settings
from app.modules.insights.providers.base import LLMProvider, LLMProviderError

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model = model if model is not None else settings.GEMINI_MODEL
        self.timeout = timeout if timeout is not None else settings.LLM_TIMEOUT_SECONDS

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        try:
            response = httpx.post(
                f"{GEMINI_API_URL}/{self.model}:generateContent",
                headers={"x-goog-api-key": self.api_key},
                json={
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"parts": [{"text": user_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "responseMimeType": "application/json",
                    },
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            body = response.json()
        except httpx.TimeoutException as exc:
            raise LLMProviderError("Gemini request timed out") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMProviderError(f"Gemini returned HTTP {exc.response.status_code}") from exc
        except httpx.RequestError as exc:
            raise LLMProviderError("Gemini request failed") from exc
        except ValueError as exc:
            raise LLMProviderError("Gemini returned invalid JSON") from exc

        if not isinstance(body, dict):
            raise LLMProviderError("Gemini returned a malformed response")
        prompt_feedback = body.get("promptFeedback", {})
        if isinstance(prompt_feedback, dict) and prompt_feedback.get("blockReason"):
            reason = prompt_feedback["blockReason"]
            raise LLMProviderError(f"Gemini blocked the prompt: {reason}")

        candidates = body.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise LLMProviderError("Gemini returned no candidates")
        candidate = candidates[0]
        if not isinstance(candidate, dict):
            raise LLMProviderError("Gemini returned a malformed candidate")
        finish_reason = candidate.get("finishReason")
        if finish_reason is not None and not isinstance(finish_reason, str):
            raise LLMProviderError("Gemini returned a malformed finish reason")
        if finish_reason in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
            raise LLMProviderError(f"Gemini blocked the response: {finish_reason}")
        content = candidate.get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            raise LLMProviderError("Gemini response did not contain text parts")
        text = "".join(
            part["text"]
            for part in parts
            if (
                isinstance(part, dict)
                and part.get("thought") is not True
                and isinstance(part.get("text"), str)
            )
        )
        if not text.strip():
            raise LLMProviderError("Gemini returned an empty response")
        return text.strip()
