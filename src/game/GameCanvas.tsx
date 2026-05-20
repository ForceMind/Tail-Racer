import { useEffect, useRef, useState } from 'react';
import { AudioDirector } from './audio';
import { GameEngine } from './engine';
import { InputController } from './input';
import { GameRenderer } from './renderer';
import type { ControlKey, GameMode, GameStats } from './types';

interface OverlayState {
  mode: GameMode;
  stats: GameStats | null;
}

function controlHandlers(input: InputController, control: ControlKey) {
  return {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      input.setVirtual(control, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      input.setVirtual(control, false);
    },
    onPointerCancel: () => input.setVirtual(control, false),
    onPointerLeave: () => input.setVirtual(control, false),
  };
}

export function GameCanvas() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(new GameEngine());
  const rendererRef = useRef(new GameRenderer());
  const inputRef = useRef(new InputController());
  const audioRef = useRef(new AudioDirector());
  const frameRef = useRef<number | null>(null);
  const overlayRef = useRef<OverlayState>({ mode: 'ready', stats: null });
  const [overlay, setOverlay] = useState<OverlayState>({ mode: 'ready', stats: null });

  useEffect(() => {
    const input = inputRef.current;
    input.bind();

    return () => {
      input.dispose();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let width = 0;
    let height = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, rect.width);
      height = Math.max(568, rect.height);

      const nextWidth = Math.floor(width * dpr);
      const nextHeight = Math.floor(height * dpr);

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    resize();

    const loop = (time: number) => {
      const dt = Math.max(0, Math.min(0.05, (time - lastTime) / 1000));
      lastTime = time;

      const engine = engineRef.current;
      engine.update(dt, inputRef.current.snapshot());
      const state = engine.getState();
      audioRef.current.update(state);
      audioRef.current.handleEvents(engine.consumeEvents());
      rendererRef.current.render(ctx, state, width, height);

      if (state.mode !== overlayRef.current.mode || state.stats !== overlayRef.current.stats) {
        const nextOverlay = { mode: state.mode, stats: state.stats };
        overlayRef.current = nextOverlay;
        setOverlay(nextOverlay);
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const startGame = () => {
    inputRef.current.clearVirtual();
    audioRef.current.unlock();
    engineRef.current.start();
    const state = engineRef.current.getState();
    const nextOverlay = { mode: state.mode, stats: state.stats };
    overlayRef.current = nextOverlay;
    setOverlay(nextOverlay);
  };

  return (
    <section className="game-shell" ref={shellRef}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Tail Racer canvas" />

      {overlay.mode === 'ready' && (
        <div className="menu-overlay">
          <div className="menu-panel">
            <p className="kicker">Tail Racer</p>
            <h1>Tail Racer</h1>
            <p className="subtitle">2D Rear-View Arcade Racing</p>
            <button className="primary-button" type="button" onClick={startGame}>
              Start
            </button>
            <div className="brief-list" aria-label="Game goals">
              <span>Dodge traffic</span>
              <span>Draft behind rivals</span>
              <span>Chain close overtakes</span>
              <span>Boost with nitro</span>
            </div>
          </div>
        </div>
      )}

      {overlay.mode === 'ended' && overlay.stats && (
        <div className="menu-overlay">
          <div className="menu-panel result-panel">
            <p className="kicker">Final Rank</p>
            <h1>{overlay.stats.rating}</h1>
            <div className="result-grid">
              <span>Score</span>
              <strong>{overlay.stats.score}</strong>
              <span>Distance</span>
              <strong>{overlay.stats.distance} m</strong>
              <span>Max Speed</span>
              <strong>{overlay.stats.maxSpeed} km/h</strong>
              <span>Overtakes</span>
              <strong>{overlay.stats.overtakes}</strong>
              <span>Max Combo</span>
              <strong>x{overlay.stats.maxCombo}</strong>
            </div>
            <button className="primary-button" type="button" onClick={startGame}>
              Restart
            </button>
          </div>
        </div>
      )}

      {overlay.mode === 'running' && (
        <div className="mobile-controls" aria-label="Touch controls">
          <div className="steer-pad">
            <button className="control-button icon-button" aria-label="Move left" {...controlHandlers(inputRef.current, 'left')}>
              <span className="arrow arrow-left" />
            </button>
            <button className="control-button icon-button" aria-label="Move right" {...controlHandlers(inputRef.current, 'right')}>
              <span className="arrow arrow-right" />
            </button>
          </div>
          <div className="pedal-pad">
            <button className="control-button brake-button" aria-label="Brake" {...controlHandlers(inputRef.current, 'brake')}>
              BRK
            </button>
            <button className="control-button throttle-button" aria-label="Accelerate" {...controlHandlers(inputRef.current, 'accelerate')}>
              <span className="arrow arrow-up" />
            </button>
          </div>
          <button className="control-button nitro-button" aria-label="Nitro" {...controlHandlers(inputRef.current, 'nitro')}>
            N2
          </button>
        </div>
      )}
    </section>
  );
}
