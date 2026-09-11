

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
from typing import Any, Optional

try:
    import requests
except ImportError as exc:  
    raise SystemExit("Install requests: pip install requests") from exc

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
except ImportError as exc:
    raise SystemExit("Install cryptography: pip install cryptography") from exc

def get_file_hash(path: Optional[str] = None) -> str:
    target = path or (sys.argv[0] if sys.argv else __file__)
    try:
        with open(target, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return ""

def get_hwid() -> str:
    raw = "|".join(
        [
            os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "",
            os.environ.get("USERNAME") or os.environ.get("USER") or "",
            os.path.expanduser("~"),
            sys.platform,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()

def _aes_key(secret: str, version: int = 2) -> bytes:
    if version == 2:
        salt = hashlib.sha256(
            b"rakha-sdk-hkdf-salt-v2|" + secret.encode("utf-8")
        ).digest()
        return HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            info=b"rakha-sdk-aes-v2",
        ).derive(secret.encode("utf-8"))
    return hashlib.sha256(("rakha-sdk-aes-v1|" + secret).encode("utf-8")).digest()

def _encrypt_json(secret: str, obj: dict[str, Any]) -> dict[str, Any]:
    pt = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    iv = secrets.token_bytes(12)
    ct = AESGCM(_aes_key(secret, 1)).encrypt(iv, pt, None)
    tag, data = ct[-16:], ct[:-16]
    return {
        "enc": 1,
        "iv": base64.b64encode(iv).decode("ascii"),
        "tag": base64.b64encode(tag).decode("ascii"),
        "data": base64.b64encode(data).decode("ascii"),
    }

def _decrypt_json(secret: str, envelope: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(envelope, dict) or envelope.get("enc") not in (1, 2):
        return envelope
    ver = 2 if envelope.get("enc") == 2 else 1
    iv = base64.b64decode(envelope["iv"])
    tag = base64.b64decode(envelope["tag"])
    data = base64.b64decode(envelope["data"])
    pt = AESGCM(_aes_key(secret, ver)).decrypt(iv, data + tag, None)
    return json.loads(pt.decode("utf-8"))

_MAX_SKEW = 30

def _die() -> None:
    os._exit(0)

def _hmac_hex(secret: str, data: str) -> str:
    return hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()

def _ct_eq(a: str, b: str) -> bool:
    x = (a or "").encode("utf-8")
    y = (b or "").encode("utf-8")
    if len(x) != len(y):
        return False
    d = 0
    for i, j in zip(x, y):
        d |= i ^ j
    return d == 0

def _accept(secret: str, res: Any, raw: str) -> None:
    if getattr(res, "status_code", 0) in (0, None) and not raw:
        return
    t = str(res.headers.get("x-rakha-time") or "")
    proof = str(res.headers.get("x-rakha-proof") or "").lower()
    if not t or not proof:
        _die()
    try:
        st = int(t)
    except ValueError:
        _die()
    if abs(int(time.time()) - st) > _MAX_SKEW:
        _die()
    expect = _hmac_hex(secret, f"rakha-resp-v1|{t}|{raw}")
    if not _ct_eq(expect, proof):
        _die()

class HttpClient:
    def __init__(
        self,
        *,
        name: str,
        app_id: str,
        secret: str,
        base_url: str,
        version: str,
        file_hash: str = "",
    ):
        self.name = name
        self.app_id = app_id
        self.secret = secret
        self.base = base_url.rstrip("/")
        self.version = version
        self.file_hash = file_hash or get_file_hash()
        self.hwid = get_hwid()
        self.pc_name = (os.environ.get("USERNAME") or os.environ.get("USER") or "")[:64]
        self.session_token: Optional[str] = None
        self.username: Optional[str] = None
        self.response: dict[str, Any] = {}
        self.message: str = ""
        self._http = requests.Session()
        self._http.headers.update({"User-Agent": "RakhaAuth/1.0"})
        self._handshake: str = ""
        self._sess_key: str = ""

    def _sign_headers(
        self,
        method: str,
        path: str,
        body: str,
        ts: Optional[str] = None,
        nonce: Optional[str] = None,
    ) -> dict[str, str]:
        ts = ts or str(int(time.time()))
        nonce = nonce or secrets.token_hex(16)
        sig = hmac.new(
            self.secret.encode("utf-8"),
            f"{ts}\n{nonce}\n{method.upper()}\n{path.split('?', 1)[0]}\n{body}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "appid": self.app_id,
            "x-rakha-auth": "hmac",
            "x-rakha-timestamp": ts,
            "x-rakha-nonce": nonce,
            "x-rakha-signature": sig,
            "x-rakha-version": self.version,
            "x-rakha-enc": "1",
            "User-Agent": "RakhaAuth/1.0",
        }
        if self._handshake:
            headers["x-rakha-session"] = self._handshake
        return headers

    def _parse(self, res: Any) -> dict[str, Any]:
        try:
            raw = res.content.decode("utf-8")
        except Exception:
            return {"success": False, "message": f"HTTP {getattr(res, 'status_code', '?')}"}
        _accept(self._sess_key or self.secret, res, raw)
        try:
            data = json.loads(raw)
        except Exception:
            return {"success": False, "message": f"HTTP {getattr(res, 'status_code', '?')}"}
        if not isinstance(data, dict):
            return {"success": False, "message": "Bad response"}
        try:
            out = _decrypt_json(self.secret, data)
        except Exception:
            return {"success": False, "message": data.get("message") or "Decrypt failed"}
        self.message = str(out.get("message") or "")
        return out

    def _handshake_now(self) -> bool:
        if self._handshake:
            return True
        ts = str(int(time.time()))
        nonce = secrets.token_hex(16)
        data = self._post(
            "handshake",
            {"hello": True, "ts": int(ts), "nonce": nonce},
            ts,
            nonce,
        )
        if not data.get("success") or not data.get("welcome"):
            return False
        try:
            st = int(data.get("serverTime") or 0)
        except (TypeError, ValueError):
            _die()
        if st <= 0 or abs(int(time.time()) - st) > _MAX_SKEW:
            _die()
        session = str(data.get("session") or "")
        challenge = str(data.get("challenge") or "")
        salt = str(data.get("salt") or "")
        sid = session.split(".", 1)[0] if session else ""
        if not sid or len(challenge) != 64 or len(salt) != 32:
            return False
        expect = _hmac_hex(self.secret, f"rakha-s2c-v1|{sid}|{salt}|{challenge}|{st}")
        if not _ct_eq(expect, str(data.get("serverProof") or "").lower()):
            _die()
        self._sess_key = _hmac_hex(self.secret, f"rakha-sess-v1|{sid}|{salt}")
        mac = _hmac_hex(self.secret, f"rakha-verify-v1|{sid}|{salt}|{challenge}")
        vdata = self._post("verify", {"session": session, "hmac": mac})
        if not vdata.get("success"):
            self._sess_key = ""
            return False
        ticket = str(vdata.get("handshake") or "")
        if not ticket:
            self._sess_key = ""
            return False
        self._handshake = ticket
        return True

    def _post(
        self,
        path: str,
        payload: dict[str, Any],
        ts: Optional[str] = None,
        nonce: Optional[str] = None,
    ) -> dict[str, Any]:
        envelope = _encrypt_json(self.secret, payload)
        body = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
        route = f"/api/sdk/{path}"
        headers = self._sign_headers("POST", route, body, ts, nonce)
        res = self._http.post(
            f"{self.base}{route}",
            data=body.encode("utf-8"),
            headers=headers,
            timeout=20,
        )
        self.response = self._parse(res)
        return self.response

    def init(self) -> dict[str, Any]:
        if not self._handshake_now():
            self.response = {"success": False, "message": "Authentication failed"}
            self.message = "Authentication failed"
            return self.response
        body = ""
        headers = self._sign_headers("GET", "/api/sdk/app-info", body)
        res = self._http.get(f"{self.base}/api/sdk/app-info", headers=headers, timeout=20)
        self.response = self._parse(res)
        return self.response

    def license(self, key: str, hwid: str = "") -> dict[str, Any]:
        key_u = str(key).upper().strip()
        return self.login(key_u, key_u, hwid)

    def login(self, username: str, password: str, hwid: str = "") -> dict[str, Any]:
        if not self._handshake_now():
            self.response = {"success": False, "message": "Authentication failed"}
            self.message = "Authentication failed"
            return self.response
        ticket = self._handshake
        data = self._post(
            "login",
            {
                "username": username,
                "password": password,
                "hwid": hwid or self.hwid,
                "pcName": self.pc_name,
                "fileHash": self.file_hash,
                "handshake": ticket,
            },
        )
        if data.get("success"):
            if data.get("sessionToken"):
                self.session_token = data["sessionToken"]
            user = data.get("user") if isinstance(data.get("user"), dict) else {}
            self.username = (user.get("username") if user else None) or username
        return data

    def heartbeat(self, hwid: str = "") -> dict[str, Any]:
        if not self.username or not self.session_token:
            return {"alive": False, "success": False, "message": "Not logged in"}
        return self._post(
            "heartbeat",
            {
                "username": self.username,
                "sessionToken": self.session_token,
                "hwid": hwid or self.hwid,
                "pcName": self.pc_name,
                "fileHash": self.file_hash,
            },
        )

    def list_files(self, hwid: str = "") -> list[dict[str, Any]]:
        if not self.username or not self.session_token:
            return []
        data = self._post(
            "files",
            {
                "username": self.username,
                "sessionToken": self.session_token,
                "hwid": hwid or self.hwid,
                "fileHash": self.file_hash,
            },
        )
        files = data.get("files")
        return files if isinstance(files, list) else []

    def get_file_link(self, name_or_id: str, hwid: str = "") -> Optional[dict[str, Any]]:
        """Ask the server to release a download. Returns url, password, sha256, size."""
        if not self.username or not self.session_token:
            return None

        payload: dict[str, Any] = {
            "username": self.username,
            "sessionToken": self.session_token,
            "hwid": hwid or self.hwid,
            "fileHash": self.file_hash,
        }
        if len(name_or_id) == 24 and all(c in "0123456789abcdefABCDEF" for c in name_or_id):
            payload["fileId"] = name_or_id
        else:
            payload["name"] = name_or_id

        data = self._post("files/ticket", payload)
        if not data.get("success") or not data.get("url"):
            return None
        return {
            "url": str(data.get("url") or ""),
            "password": str(data.get("password") or ""),
            "filename": str(data.get("filename") or ""),
            "sha256": str(data.get("sha256") or ""),
            "size": int(data.get("size") or 0),
            "remote": str(data.get("source") or "") == "remote",
        }

    def download_file(self, name_or_id: str, hwid: str = "") -> Optional[bytes]:
        """Fetch a protected file into memory, verified against the published hash."""
        grant = self.get_file_link(name_or_id, hwid)
        if not grant:
            return None

        res = requests.get(grant["url"], timeout=300)
        if res.status_code != 200:
            self.message = f"HTTP {res.status_code}"
            return None

        blob = res.content
        if grant["size"] and len(blob) != grant["size"]:
            self.message = "Downloaded file has an unexpected size"
            return None
        if grant["sha256"] and hashlib.sha256(blob).hexdigest() != grant["sha256"]:
            self.message = "Downloaded file failed integrity check"
            return None
        return blob
