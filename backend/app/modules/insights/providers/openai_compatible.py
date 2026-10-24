import httpx

from app.modules.insights.providers.base import LLMProvider, LLMProviderError


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        name: str,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float,
        json_mode: bool = False,
    ) -> None:
        self.name = name
        self.model = model
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.json_mode = json_mode

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            body = response.json()
        except httpx.TimeoutException as exc:
            raise LLMProviderError("OpenAI-compatible provider request timed out") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMProviderError(
                f"OpenAI-compatible provider returned HTTP {exc.response.status_code}"
            ) from exc
        except httpx.RequestError as exc:
            raise LLMProviderError("OpenAI-compatible provider request failed") from exc
        except ValueError as exc:
            raise LLMProviderError("OpenAI-compatible provider returned invalid JSON") from exc

        try:
            choices = body["choices"]
            message = choices[0]["message"]
            content = message.get("content")
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                text = "".join(
                    item.get("text", "")
                    for item in content
                    if isinstance(item, dict) and isinstance(item.get("text"), str)
                )
            else:
                text = ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError(
                "OpenAI-compatible provider returned a malformed response"
            ) from exc
        if not text.strip():
            raise LLMProviderError("OpenAI-compatible provider returned an empty response")
        return text.strip()
