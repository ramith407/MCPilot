from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str


class TestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=500)


class TestResponse(BaseModel):
    message: str
    response: str
