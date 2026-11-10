import io
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from openjarvis.server.app import create_app
from openjarvis.engine.multi import MultiEngine
from tests.server.test_routes import _test_config


def test_speech_health_endpoint():
    """Verify /v1/speech/health returns backend availability."""
    mock_speech = MagicMock()
    mock_speech.health.return_value = True
    mock_speech.backend_id = "faster-whisper"

    engine = MultiEngine([])
    app = create_app(engine, "test-model", speech_backend=mock_speech, config=_test_config())
    client = TestClient(app)

    response = client.get("/v1/speech/health")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["backend"] == "faster-whisper"


def test_speech_status_endpoint():
    """Verify /v1/speech/status returns unified STT and TTS status."""
    mock_speech = MagicMock()
    mock_speech.health.return_value = True
    mock_speech.backend_id = "faster-whisper"
    mock_speech._model_size = "base"

    engine = MultiEngine([])
    app = create_app(engine, "test-model", speech_backend=mock_speech, config=_test_config())
    client = TestClient(app)

    response = client.get("/v1/speech/status")
    assert response.status_code == 200
    data = response.json()
    assert "stt" in data
    assert "tts" in data
    assert data["stt"]["available"] is True
    assert data["stt"]["backend"] == "faster-whisper"
    assert "en" in data["stt"]["supported_languages"]
    assert "ur" in data["stt"]["supported_languages"]


def test_speech_transcribe_endpoint():
    """Verify /v1/speech/transcribe parses audio file and calls backend."""
    mock_result = MagicMock()
    mock_result.text = "Hello Jarvis"
    mock_result.language = "en"
    mock_result.confidence = 0.98
    mock_result.duration_seconds = 1.5

    mock_speech = MagicMock()
    mock_speech.transcribe.return_value = mock_result

    engine = MultiEngine([])
    app = create_app(engine, "test-model", speech_backend=mock_speech, config=_test_config())
    client = TestClient(app)

    fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....")
    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("test.wav", fake_audio, "audio/wav")},
        data={"language": "en"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "Hello Jarvis"
    assert data["language"] == "en"
    assert data["duration_seconds"] == 1.5


def test_speech_transcribe_empty_file():
    """Verify empty audio file returns 400."""
    mock_speech = MagicMock()
    engine = MultiEngine([])
    app = create_app(engine, "test-model", speech_backend=mock_speech, config=_test_config())
    client = TestClient(app)

    empty_audio = io.BytesIO(b"")
    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("empty.wav", empty_audio, "audio/wav")},
    )
    assert response.status_code == 400

