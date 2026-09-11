from __future__ import annotations

from typing import Any, Optional

from . import _config
from ._http import HttpClient, get_file_hash

class RakhaSession:
    def __init__(self, client: HttpClient, data: dict[str, Any]):
        self._client = client
        self._data = data

    def __bool__(self) -> bool:
        return True

    @property
    def username(self) -> str:
        return self._client.username or ""

    def has_subscription(self, _level: str = "") -> bool:
        user = self._data.get("user") if isinstance(self._data.get("user"), dict) else {}
        if user.get("subscriptionExpire") in (None, "", 0):
            return True
        return bool(self._data.get("success"))

    def heartbeat(self) -> bool:
        r = self._client.heartbeat()
        return bool(r.get("alive") or r.get("success"))

    def list_files(self) -> list[dict[str, Any]]:
        return self._client.list_files()

    def download_file(self, name_or_id: str) -> Optional[bytes]:
        return self._client.download_file(name_or_id)

    def get_file_link(self, name_or_id: str) -> Optional[dict[str, Any]]:
        return self._client.get_file_link(name_or_id)

    @property
    def last_error(self) -> str:
        return self._client.message or ""

    def __repr__(self) -> str:
        return f"RakhaSession(username={self.username!r})"

class RakhaAuth:
    def __init__(self, version: str, mode: str = "socket"):
        _ = mode
        self._client = HttpClient(
            name=_config.APP_NAME,
            app_id=_config.APP_ID,
            secret=_config.APP_SECRET,
            base_url=_config.BASE_URL,
            version=version or _config.DEFAULT_VERSION,
            file_hash=get_file_hash(),
        )
        self._session: Optional[RakhaSession] = None
        init = self._client.init()
        if not init.get("success"):
            raise RuntimeError(self._client.message or "RakhaAuth init failed")

    def license(self, key: str, hwid: str = "") -> Optional[RakhaSession]:
        data = self._client.license(key, hwid)
        if not data.get("success"):
            return None
        self._session = RakhaSession(self._client, data)
        return self._session

    def login(self, username: str, password: str, hwid: str = "") -> Optional[RakhaSession]:
        data = self._client.login(username, password, hwid)
        if not data.get("success"):
            return None
        self._session = RakhaSession(self._client, data)
        return self._session

    @property
    def authenticated(self) -> bool:
        return bool(self._session)

    @property
    def session(self) -> Optional[RakhaSession]:
        return self._session

    def list_files(self) -> list[dict[str, Any]]:
        return self._client.list_files()

    def download_file(self, name_or_id: str) -> Optional[bytes]:
        return self._client.download_file(name_or_id)

    def get_file_link(self, name_or_id: str) -> Optional[dict[str, Any]]:
        return self._client.get_file_link(name_or_id)

    @property
    def last_error(self) -> str:
        return self._client.message or ""

    def close(self) -> None:
        self._session = None
        self._client.session_token = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def __repr__(self) -> str:
        return f"RakhaAuth(authenticated={self.authenticated})"
