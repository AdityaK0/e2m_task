from typing import Any

from pydantic import BaseModel, StrictInt


class PreferenceUpdateRequest(BaseModel):
    value: StrictInt


class PreferenceResponse(BaseModel):
    key: str
    value: Any
    default: Any
    min: int | None
    max: int | None
    description: str
