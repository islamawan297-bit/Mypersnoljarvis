import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from openjarvis.server.app import create_app
from openjarvis.engine.multi import MultiEngine
from tests.server.test_routes import _test_config


def test_agent_status_endpoint():
    """Verify /v1/agent/status returns reachability and available models."""
    engine = MultiEngine([])
    app = create_app(engine, "test-model", config=_test_config())
    client = TestClient(app)

    response = client.get("/v1/agent/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "host" in data
    assert "models" in data
    assert isinstance(data["models"], list)


def test_agent_configure_endpoint():
    """Verify /v1/agent/configure updates OLLAMA_HOST."""
    engine = MultiEngine([])
    app = create_app(engine, "test-model", config=_test_config())
    client = TestClient(app)

    response = client.post("/v1/agent/configure", json={"host": "http://127.0.0.1:11434"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["host"] == "http://127.0.0.1:11434"


def test_insufficient_balance_402_graceful_fallback():
    """Verify that a 402 / Insufficient Balance error from a cloud model falls back to local."""
    engine = MultiEngine([])
    app = create_app(engine, "qwen2.5:1.5b", config=_test_config())
    client = TestClient(app)

    async def mock_local_stream(model, messages, temp, max_tokens):
        yield "Hello from local fallback!"

    with patch("openjarvis.server.cloud_router.stream_cloud", side_effect=ValueError("Error code: 402 - Insufficient Balance")):
        with patch("openjarvis.server.cloud_router.list_local_models", return_value=["qwen2.5:1.5b"]):
            with patch("openjarvis.server.cloud_router.stream_local", side_effect=mock_local_stream):
                resp = client.post(
                    "/v1/chat/completions",
                    json={
                        "model": "deepseek-v4-flash",
                        "messages": [{"role": "user", "content": "hi"}],
                        "stream": True,
                    },
                )
                assert resp.status_code == 200
                assert "Notice: Cloud model 'deepseek-v4-flash' has insufficient balance" in resp.text
                assert "Hello from local fallback!" in resp.text

