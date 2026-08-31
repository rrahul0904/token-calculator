from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Mapping, Optional


@dataclass
class TokenIntelligenceError(Exception):
    message: str
    status: int
    code: Optional[str] = None
    body: Any = None

    def __str__(self) -> str:
        return self.message


class TokenIntelligenceClient:
    def __init__(self, api_key: str, base_url: str = "https://token-intelligence-eight.vercel.app", timeout: float = 30.0) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _request(self, path: str, method: str = "GET", body: Any = None) -> Any:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(f"{self.base_url}{path}", data=payload, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw
            code = parsed.get("error") if isinstance(parsed, dict) and isinstance(parsed.get("error"), str) else None
            raise TokenIntelligenceError(code or f"Token Intelligence request failed ({exc.code})", exc.code, code, parsed) from exc

    def models(self) -> Any:
        return self._request("/api/v1/models")

    def estimate(self, **payload: Any) -> Any:
        return self._request("/api/v1/estimate", "POST", payload)

    def compare(self, payload: Mapping[str, Any]) -> Any:
        return self._request("/api/v1/compare", "POST", dict(payload))

    def recommend(self, payload: Mapping[str, Any]) -> Any:
        return self._request("/api/v1/recommend", "POST", dict(payload))

    def usage(self) -> Any:
        return self._request("/api/v1/usage")

    def list_runs(self) -> Any:
        return self._request("/api/v1/runs")

    def get_run(self, run_id: str) -> Any:
        from urllib.parse import quote
        return self._request(f"/api/v1/runs/{quote(run_id, safe='')}")

    def create_run(self, payload: Mapping[str, Any]) -> Any:
        return self._request("/api/v1/runs", "POST", dict(payload))

    def ingest_event(self, payload: Mapping[str, Any]) -> Any:
        return self._request("/api/v1/events", "POST", dict(payload))

    def ingest_events(self, events: list[Mapping[str, Any]]) -> Any:
        return self._request("/api/v1/events/batch", "POST", {"events": [dict(event) for event in events]})

    def check_budget(self, payload: Mapping[str, Any]) -> Any:
        return self._request("/api/v1/budgets/check", "POST", dict(payload))

    def gateway(self, provider: str, payload: Mapping[str, Any]) -> Any:
        if provider not in {"openai", "anthropic", "gemini"}:
            raise ValueError("provider must be openai, anthropic, or gemini")
        return self._request(f"/api/gateway/{provider}", "POST", dict(payload))
