import React, { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
}

export const AudioVisualizer: React.FC<Props> = ({ stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioCtxRef = useRef<AudioContext>();

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    // 1. Set up Web Audio API
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // Determines the number of bars (higher = more bars)
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d')!;

    // 2. The Animation Loop
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear the canvas for the next frame
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      // 3. Draw the bars
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2; // Scale down slightly

        // Tailwind orange-500 equivalent
        canvasCtx.fillStyle = `rgb(249, 115, 22)`; 
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    // Cleanup when recording stops
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
    };
  }, [stream]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={60} 
      className="w-full max-w-[200px] h-[60px] rounded"
    />
  );
};
