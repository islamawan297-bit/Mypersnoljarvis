"""Faster-Whisper speech-to-text backend (local, CTranslate2-based)."""

from __future__ import annotations

import logging
import os
import tempfile
from typing import List, Optional

from openjarvis.core.registry import SpeechRegistry
from openjarvis.speech._stubs import Segment, SpeechBackend, TranscriptionResult

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None  # type: ignore[assignment, misc]

try:
    import ctranslate2
except ImportError:
    ctranslate2 = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


def _convert_to_pcm16k_wav(audio_bytes: bytes, format_hint: str = "wav") -> bytes:
    """Decode audio bytes (WebM, OGG, MP3, WAV, etc.) to 16kHz mono signed 16-bit WAV.

    Faster-Whisper natively accepts 16kHz mono WAV without needing container
    demuxers or external ffmpeg processes, completely avoiding container
    framing / truncation errors like [Errno 1094995529] Invalid data.
    """
    import io
    import wave
    import av

    # If already a valid 16kHz mono 16-bit WAV, use directly
    if (
        audio_bytes.startswith(b"RIFF")
        and len(audio_bytes) > 44
        and audio_bytes[8:12] == b"WAVE"
    ):
        try:
            with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                if wf.getnchannels() == 1 and wf.getframerate() == 16000 and wf.getsampwidth() == 2:
                    return audio_bytes
        except Exception:
            pass

    try:
        input_io = io.BytesIO(audio_bytes)
        with av.open(input_io, mode="r") as container:
            if not container.streams.audio:
                raise ValueError("No audio streams found in file")
            stream = container.streams.audio[0]
            resampler = av.audio.resampler.AudioResampler(
                format="s16", layout="mono", rate=16000
            )
            pcm_chunks = []
            for frame in container.decode(stream):
                for r in resampler.resample(frame):
                    pcm_chunks.append(r.to_ndarray().tobytes())
            for r in resampler.resample(None):
                pcm_chunks.append(r.to_ndarray().tobytes())

            pcm_data = b"".join(pcm_chunks)
            if not pcm_data:
                raise ValueError("Audio stream contains no decodeable audio frames")

            wav_io = io.BytesIO()
            with wave.open(wav_io, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(pcm_data)
            return wav_io.getvalue()
    except (av.error.InvalidDataError, av.error.FFmpegError) as av_err:
        raise ValueError(
            "Audio recording is incomplete or corrupted. Please try speaking again."
        ) from av_err


@SpeechRegistry.register("faster-whisper")
class FasterWhisperBackend(SpeechBackend):
    """Local speech-to-text using Faster-Whisper (CTranslate2)."""

    backend_id = "faster-whisper"

    def __init__(
        self,
        model_size: str = "base",
        device: str = "auto",
        compute_type: str = "float16",
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model: Optional[WhisperModel] = None
        self._last_error: Optional[str] = None

    def _resolve_compute_type(self) -> str:
        """Pick a CTranslate2 compute type supported by the configured device."""
        if ctranslate2 is None:
            return self._compute_type

        try:
            supported = set(ctranslate2.get_supported_compute_types(self._device))
        except Exception as exc:
            logger.debug(
                "Could not inspect CTranslate2 compute types for %s: %s",
                self._device,
                exc,
            )
            return self._compute_type

        if self._compute_type in supported:
            return self._compute_type

        preferences = (
            ("int8", "float32", "int8_float32", "int16")
            if self._compute_type == "float16"
            else ("float32", "int8", "int8_float32", "int16")
        )
        fallback = next((value for value in preferences if value in supported), None)
        if fallback is None:
            return self._compute_type

        logger.warning(
            "CTranslate2 compute_type=%r is not supported on device=%r; "
            "using %r instead",
            self._compute_type,
            self._device,
            fallback,
        )
        return fallback

    def _ensure_model(self) -> WhisperModel:
        """Lazy-load the Whisper model on first use."""
        if self._model is None:
            if WhisperModel is None:
                self._last_error = (
                    "faster-whisper is not installed. "
                    "Install with: uv sync --extra desktop"
                )
                raise ImportError(self._last_error)
            compute_type = self._resolve_compute_type()
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=compute_type,
            )
        self._last_error = None
        return self._model

    def transcribe(
        self,
        audio: bytes,
        *,
        format: str = "wav",
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio bytes using Faster-Whisper."""
        if not audio or len(audio) < 100:
            raise ValueError("Audio recording is empty or too short.")

        try:
            model = self._ensure_model()

            # Normalize incoming audio to standard 16kHz mono WAV.
            # This eliminates container framing bugs, truncated WebM chunks,
            # and format discrepancies between browser MediaRecorder and PyAV.
            wav_bytes = _convert_to_pcm16k_wav(audio, format_hint=format)

            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            try:
                with tmp:
                    tmp.write(wav_bytes)

                kwargs = {}
                if language:
                    kwargs["language"] = language

                segments_iter, info = model.transcribe(tmp.name, **kwargs)
                segments_list = list(segments_iter)
            finally:
                try:
                    os.unlink(tmp.name)
                except OSError as unlink_exc:
                    logger.debug(
                        "Could not remove temp audio file %s: %s",
                        tmp.name,
                        unlink_exc,
                    )
        except Exception as exc:
            self._last_error = str(exc)
            raise

        # Build result
        text = "".join(seg.text for seg in segments_list).strip()
        segments = [
            Segment(
                text=seg.text.strip(),
                start=seg.start,
                end=seg.end,
                confidence=None,
            )
            for seg in segments_list
        ]

        self._last_error = None
        return TranscriptionResult(
            text=text,
            language=getattr(info, "language", None),
            confidence=getattr(info, "language_probability", None),
            duration_seconds=getattr(info, "duration", 0.0),
            segments=segments,
        )

    def health(self) -> bool:
        """Check if model is loaded or loadable."""
        try:
            self._ensure_model()
            return True
        except Exception as exc:
            self._last_error = str(exc)
            logger.debug("Faster-Whisper health check failed: %s", exc)
            return False

    def last_error(self) -> Optional[str]:
        """Return the last model load or transcription error, if any."""
        return self._last_error

    def supported_formats(self) -> List[str]:
        """Supported audio formats (same as ffmpeg/Whisper)."""
        return ["wav", "mp3", "m4a", "ogg", "flac", "webm"]
