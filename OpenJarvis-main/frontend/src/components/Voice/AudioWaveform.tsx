import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  analyser: AnalyserNode | null;
  state: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';
  width?: number;
  height?: number;
}

export function AudioWaveform({
  analyser,
  state,
  width = 600,
  height = 140,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerY = height / 2;

      if (state === 'listening' && analyser) {
        // Live microphone frequency visualizer
        analyser.getByteFrequencyData(dataArray);

        const barCount = 36;
        const barWidth = Math.max(3, (width / barCount) - 4);
        const step = Math.floor(dataArray.length / barCount);

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i * step] || 0;
          const percent = value / 255;
          const barHeight = Math.max(6, percent * (height * 0.85));
          const x = i * (barWidth + 4) + (width - (barCount * (barWidth + 4))) / 2;
          const y = centerY - barHeight / 2;

          // Futuristic cyan gradient with glow
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, '#00f2fe');
          grad.addColorStop(0.5, '#4facfe');
          grad.addColorStop(1, '#00c6ff');

          ctx.fillStyle = grad;
          ctx.shadowColor = 'rgba(0, 242, 254, 0.6)';
          ctx.shadowBlur = 12;

          // Rounded bar
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 4);
          ctx.fill();
        }
      } else if (state === 'speaking') {
        // Glowing audio speech synthesis wave
        phase += 0.08;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(52, 211, 153, 0.7)';
        ctx.shadowBlur = 14;

        // Draw multiple smooth overlapping sine waves
        const waves = [
          { freq: 0.02, amp: 35, speed: 1.2, color: 'rgba(52, 211, 153, 0.85)' },
          { freq: 0.03, amp: 22, speed: -1.0, color: 'rgba(16, 185, 129, 0.5)' },
          { freq: 0.015, amp: 16, speed: 0.8, color: 'rgba(110, 231, 183, 0.35)' },
        ];

        for (const w of waves) {
          ctx.beginPath();
          ctx.strokeStyle = w.color;
          for (let x = 0; x < width; x++) {
            const envelope = Math.sin((x / width) * Math.PI); // damp at ends
            const y = centerY + Math.sin(x * w.freq + phase * w.speed) * w.amp * envelope;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (state === 'thinking' || state === 'transcribing') {
        // Futuristic pulsing thinking wave
        phase += 0.06;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
        ctx.shadowBlur = 16;

        ctx.beginPath();
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, '#a855f7');
        grad.addColorStop(0.5, '#ec4899');
        grad.addColorStop(1, '#6366f1');
        ctx.strokeStyle = grad;

        for (let x = 0; x < width; x++) {
          const envelope = Math.sin((x / width) * Math.PI);
          const y = centerY + Math.sin(x * 0.03 + phase) * Math.cos(x * 0.015 - phase * 0.5) * 26 * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (state === 'error') {
        // Red subtle warning line
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 8;
        ctx.moveTo(width * 0.2, centerY);
        ctx.lineTo(width * 0.8, centerY);
        ctx.stroke();
      } else {
        // Idle gentle breathing baseline
        phase += 0.02;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
        ctx.shadowBlur = 0;

        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const envelope = Math.sin((x / width) * Math.PI);
          const y = centerY + Math.sin(x * 0.015 + phase) * 6 * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, state, width, height]);

  return (
    <div className="flex items-center justify-center w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full max-w-[600px] h-[140px] block"
      />
    </div>
  );
}

