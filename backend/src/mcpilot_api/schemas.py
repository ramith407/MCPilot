from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HealthResponse(BaseModel):
    status: str


class TestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=500)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message must not be blank.")
        return value


class TestResponse(BaseModel):
    message: str
    response: str


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class LiteralValue(StrictModel):
    kind: Literal["literal"]
    value: str = Field(max_length=4096)

    @field_validator("value")
    @classmethod
    def value_has_no_nul(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Values cannot contain NUL characters.")
        return value


class EnvironmentSecret(StrictModel):
    kind: Literal["secretRef"]
    provider: Literal["environment"]
    key: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")


EnvironmentValue = Annotated[
    LiteralValue | EnvironmentSecret,
    Field(discriminator="kind"),
]


class StdioTransport(StrictModel):
    type: Literal["stdio"]
    command: str = Field(min_length=1, max_length=512)
    args: list[str] = Field(default_factory=list, max_length=128)
    working_directory: str = Field(default=".", alias="workingDirectory", max_length=512)
    env: dict[str, EnvironmentValue] = Field(default_factory=dict, max_length=64)

    @field_validator("command")
    @classmethod
    def command_must_be_executable_token(cls, value: str) -> str:
        if not value.strip() or "\x00" in value or any(c in value for c in "\r\n"):
            raise ValueError("Command must be a non-empty executable name or path.")
        if any(c in value for c in ("|", ">", "<", "&", ";")):
            raise ValueError("Shell operators are not allowed in command.")
        if any(c.isspace() for c in value):
            from pathlib import PurePosixPath, PureWindowsPath

            if not PurePosixPath(value).is_absolute() and not PureWindowsPath(value).is_absolute():
                raise ValueError("Command must identify one executable; put command-line arguments in args.")
        return value

    @field_validator("args")
    @classmethod
    def args_are_plain_strings(cls, values: list[str]) -> list[str]:
        if any("\x00" in value for value in values):
            raise ValueError("Arguments cannot contain NUL characters.")
        return values

    @field_validator("working_directory")
    @classmethod
    def working_directory_is_relative(cls, value: str) -> str:
        from pathlib import PurePosixPath, PureWindowsPath

        if not value or "\x00" in value or "\\" in value:
            raise ValueError("Working directory must be a workspace-relative path using '/'.")
        posix = PurePosixPath(value)
        windows = PureWindowsPath(value)
        if posix.is_absolute() or windows.is_absolute() or windows.drive or ".." in posix.parts:
            raise ValueError("Working directory must remain within the approved workspace.")
        return value

    @field_validator("env")
    @classmethod
    def environment_names_are_portable(cls, value: dict[str, EnvironmentValue]) -> dict[str, EnvironmentValue]:
        import re

        if any(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", name) is None for name in value):
            raise ValueError("Environment variable names must use portable identifier syntax.")
        return value


class NoAuthentication(StrictModel):
    type: Literal["none"] = "none"


class BearerAuthentication(StrictModel):
    type: Literal["bearer"]
    token: EnvironmentSecret


HttpAuthentication = Annotated[
    NoAuthentication | BearerAuthentication,
    Field(discriminator="type"),
]


class StreamableHttpTransport(StrictModel):
    type: Literal["streamable-http"]
    url: str = Field(min_length=1, max_length=2048)
    headers: dict[str, EnvironmentValue] = Field(default_factory=dict, max_length=64)
    authentication: HttpAuthentication = Field(default_factory=NoAuthentication)

    @field_validator("url")
    @classmethod
    def url_is_http_endpoint(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("URL must be an HTTP(S) endpoint without user info or a fragment.")
        return value


Transport = Annotated[
    StdioTransport | StreamableHttpTransport,
    Field(discriminator="type"),
]


class IntegrationMetadata(StrictModel):
    publisher: str | None = Field(default=None, max_length=120)
    release: str | None = Field(default=None, max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=32)


class IntegrationDefinition(StrictModel):
    spec_version: Literal["1.0"] = Field(alias="specVersion")
    id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,62}$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    metadata: IntegrationMetadata | None = None
    transport: Transport
    extensions: dict[str, object] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def name_is_trimmed(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("Name must be non-empty and trimmed.")
        return value


class RegisteredIntegrationResponse(StrictModel):
    id: str
    name: str
    transport: Literal["stdio", "streamable-http"]
    environment_keys: list[str]


class ApprovalRequest(StrictModel):
    integration_id: str


class ApprovalResponse(StrictModel):
    approval_token: str
    expires_in_seconds: int
    command: str
    args: list[str]
    working_directory: str
    environment_keys: list[str]


class ConnectRequest(StrictModel):
    approval_token: str


class ToolSummary(StrictModel):
    name: str
    description: str | None = None
    input_schema: dict[str, object]


class SessionResponse(StrictModel):
    id: str
    integration_id: str
    status: Literal["ready", "closed", "failed"]
    server_name: str | None = None
    server_version: str | None = None
    protocol_version: str | None = None
    tools: list[ToolSummary] = Field(default_factory=list)


class ToolApprovalRequest(StrictModel):
    arguments: dict[str, object]


class ToolApprovalResponse(StrictModel):
    approval_token: str
    expires_in_seconds: int
    tool_name: str
    arguments: dict[str, object]


class ToolCallRequest(StrictModel):
    arguments: dict[str, object]
    approval_token: str


class ToolResultResponse(StrictModel):
    tool_name: str
    is_error: bool
    structured_content: dict[str, object] | list[object] | str | int | float | bool | None = None
    content: list[dict[str, object]]
