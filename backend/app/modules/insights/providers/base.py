from abc import ABC, abstractmethod


class LLMProviderError(Exception):
    """Provider transport or response-shape failure."""


class LLMProviderConfigError(LLMProviderError):
    """Provider configuration is missing or unsupported."""


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Return raw generated text."""
