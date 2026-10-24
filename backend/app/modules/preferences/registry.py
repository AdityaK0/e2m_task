from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class PreferenceDefinition(Generic[T]):
    key: str
    value_type: type[T]
    default: T
    minimum: int | None
    maximum: int | None
    description: str


PREFERENCE_REGISTRY: dict[str, PreferenceDefinition[object]] = {
    "health_score_window": PreferenceDefinition(
        key="health_score_window",
        value_type=int,
        default=5,
        minimum=1,
        maximum=10,
        description=(
            "How many of the most recent AI insights are used to calculate a "
            "customer's health score"
        ),
    )
}


def preference_default(key: str) -> object:
    return PREFERENCE_REGISTRY[key].default
