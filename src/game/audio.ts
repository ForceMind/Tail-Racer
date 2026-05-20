import type { GameEvent, GameEventType, GameState } from './types';

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private nextMusicTime = 0;
  private musicStep = 0;
  private unlocked = false;

  unlock() {
    if (this.unlocked) {
      void this.context?.resume();
      return;
    }

    const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioCtor) {
      return;
    }

    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(this.master);

    this.startEngineLoop();
    this.nextMusicTime = this.context.currentTime + 0.08;
    this.unlocked = true;
    void this.context.resume();
  }

  update(state: GameState) {
    if (!this.context || !this.unlocked) {
      return;
    }

    this.updateEngine(state);
    this.scheduleMusic();
  }

  handleEvents(events: GameEvent[]) {
    if (!this.unlocked) {
      return;
    }

    for (const event of events) {
      this.playEventTone(event.type);
    }
  }

  private startEngineLoop() {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }

    this.engineOsc = context.createOscillator();
    this.engineGain = context.createGain();
    this.engineFilter = context.createBiquadFilter();

    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;
    this.engineFilter.Q.value = 3.5;
    this.engineGain.gain.value = 0.025;

    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(master);
    this.engineOsc.start();
  }

  private updateEngine(state: GameState) {
    const context = this.context;
    if (!context || !this.engineOsc || !this.engineGain || !this.engineFilter) {
      return;
    }

    const speedRatio = Math.max(0, Math.min(1.25, state.speed / 300));
    const revPulse =
      state.racePhase === 'grid' && state.mode === 'running' ? 0.24 + Math.sin(state.sceneTime * 9) * 0.08 : 0;
    const boost = state.nitroActive ? 0.28 : 0;
    const targetFreq = 54 + speedRatio * 122 + revPulse * 80 + boost * 110;
    const targetGain = state.mode === 'running' ? 0.035 + speedRatio * 0.085 + revPulse * 0.045 + boost * 0.04 : 0.012;

    this.engineOsc.frequency.setTargetAtTime(targetFreq, context.currentTime, 0.035);
    this.engineFilter.frequency.setTargetAtTime(360 + speedRatio * 1050 + boost * 900, context.currentTime, 0.045);
    this.engineGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.05);
  }

  private scheduleMusic() {
    const context = this.context;
    const gain = this.musicGain;
    if (!context || !gain) {
      return;
    }

    const notes = [196, 246.94, 293.66, 246.94, 220, 261.63, 329.63, 261.63];
    const bass = [98, 98, 123.47, 123.47, 110, 110, 130.81, 130.81];
    const stepDuration = 0.24;

    while (this.nextMusicTime < context.currentTime + 0.4) {
      const index = this.musicStep % notes.length;
      this.pluck(notes[index], this.nextMusicTime, 0.105, 'square', gain);

      if (this.musicStep % 2 === 0) {
        this.pluck(bass[index], this.nextMusicTime, 0.16, 'sawtooth', gain, 0.65);
      }

      this.nextMusicTime += stepDuration;
      this.musicStep += 1;
    }
  }

  private playEventTone(type: GameEventType) {
    switch (type) {
      case 'countdown-beep':
        this.tone(520, 0.08, 'square', 0.07);
        break;
      case 'race-start':
        this.tone(880, 0.11, 'square', 0.08);
        this.tone(1320, 0.18, 'square', 0.07, 0.09);
        this.sweep(120, 360, 0.32, 0.055, 'sawtooth');
        break;
      case 'nitro-start':
        this.sweep(180, 860, 0.26, 0.08);
        break;
      case 'nitro-ready':
      case 'draft-nitro':
        this.tone(740, 0.08, 'triangle', 0.05);
        this.tone(1040, 0.12, 'triangle', 0.048, 0.09);
        break;
      case 'close-overtake':
      case 'extreme-overtake':
        this.tone(960, 0.07, 'triangle', 0.045);
        this.tone(1280, 0.08, 'triangle', 0.042, 0.06);
        break;
      case 'crash':
        this.sweep(120, 46, 0.22, 0.12, 'sawtooth');
        break;
      case 'finish':
        this.tone(520, 0.08, 'triangle', 0.05);
        this.tone(680, 0.08, 'triangle', 0.05, 0.08);
        this.tone(860, 0.16, 'triangle', 0.05, 0.16);
        break;
      default:
        break;
    }
  }

  private pluck(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    destination: AudioNode,
    volume = 1,
  ) {
    const context = this.context;
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035 * volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'triangle',
  ) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }

    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }
}
