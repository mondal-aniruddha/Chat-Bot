import React, { useEffect, useRef } from 'react';

/**
 * 3D Neural Voice Orb that dynamically morphs and radiates based on assistant state.
 */
export default function OrbVisualizer({ state = 'idle', audioLevel = 0.05, onOrbClick }) {
  const canvasRef = useRef(null);

  // Dynamic canvas wave ring animation reacting to audio level
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 60 + audioLevel * 45;

      // Color mapping
      let strokeColor = 'rgba(0, 242, 254, 0.4)';
      if (state === 'listening') strokeColor = 'rgba(16, 185, 129, 0.6)';
      else if (state === 'thinking') strokeColor = 'rgba(139, 92, 246, 0.6)';
      else if (state === 'speaking') strokeColor = 'rgba(245, 158, 11, 0.7)';
      else if (state === 'error') strokeColor = 'rgba(239, 68, 68, 0.6)';

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;

      // Draw undulating organic wave ring
      const points = 36;
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const wave = Math.sin(theta * 6 + angle) * (8 + audioLevel * 18);
        const r = baseRadius + wave;
        const x = centerX + Math.cos(theta) * r;
        const y = centerY + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      angle += 0.04 + (state === 'speaking' || state === 'thinking' ? 0.06 : 0.01);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, audioLevel]);

  const stateLabels = {
    idle: 'Standby / Idle',
    wake_word_detected: 'Wake Word Detected',
    listening: 'Listening to Voice...',
    thinking: 'Synthesizing Response...',
    speaking: 'Vocalizing Output...',
    error: 'System Exception',
  };

  return (
    <div className="orb-container">
      <div 
        className="orb-canvas-wrapper" 
        onClick={onOrbClick} 
        title="Click to toggle Listening state"
        id="voice-orb-button"
      >
        <div className={`orb-sphere ${state}`}></div>
        <div className="orb-ring ring-outer"></div>
        <div className="orb-ring ring-inner"></div>
        <canvas 
          ref={canvasRef} 
          width={240} 
          height={240} 
          style={{ position: 'absolute', top: '-30px', left: '-30px', pointerEvents: 'none' }}
        />
      </div>

      <div className="orb-status-text" id="orb-status-display">
        {stateLabels[state] || state}
      </div>
      <div className="orb-subtext">
        {state === 'idle' ? 'Click orb or speak wake word to activate' : 'Tap orb to interrupt / reset'}
      </div>
    </div>
  );
}
