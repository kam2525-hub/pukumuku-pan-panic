/**
 * Web Audio API によるシンセサイザー効果音＆レトロポップBGMエンジン
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.pumpOsc = null;
    this.pumpGain = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopPump();
      this.stopBGM();
    } else {
      this.startBGM();
    }
    return this.muted;
  }

  startPump() {
    if (this.muted) return;
    this.init();
    if (this.pumpOsc) return;

    this.pumpOsc = this.ctx.createOscillator();
    this.pumpGain = this.ctx.createGain();
    this.pumpOsc.type = 'triangle';
    this.pumpOsc.frequency.setValueAtTime(140, this.ctx.currentTime);
    this.pumpGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.pumpOsc.connect(this.pumpGain);
    this.pumpGain.connect(this.ctx.destination);
    this.pumpOsc.start();
  }

  updatePump(fillPercent) {
    if (this.muted || !this.pumpOsc || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Pitch rises as the bread swells ("ぷく〜っ！")
    const baseFreq = 130 + Math.pow(fillPercent / 100, 1.5) * 420;
    const wobble = fillPercent >= 90 ? Math.sin(now * 55) * 28 : Math.sin(now * 16) * 8;
    this.pumpOsc.frequency.setTargetAtTime(baseFreq + wobble, now, 0.02);
    const vol = fillPercent >= 95 ? 0.14 : 0.09;
    this.pumpGain.gain.setTargetAtTime(vol, now, 0.03);
  }

  stopPump() {
    if (this.pumpOsc) {
      try {
        this.pumpOsc.stop();
        this.pumpOsc.disconnect();
      } catch (_) {}
      this.pumpOsc = null;
      this.pumpGain = null;
    }
  }

  playResult(grade, isDog = false) {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;

    if (grade === 'MIRACLE') {
      // Magnificent Miracle Fanfare! (Rapid ascending arpeggios + chiming chord)
      const miracleNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
      miracleNotes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.22, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.62);
      });
      if (isDog) {
        setTimeout(() => this.playBark(), 280);
      }
    } else if (grade === 'PUKUMUKU') {
      // Sparkling fanfare!
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.16, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.36);
      });
      if (isDog) {
        setTimeout(() => this.playBark(), 260);
      }
    } else if (grade === 'GOOD') {
      const notes = [440, 587.33];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.12, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.24);
      });
    } else if (grade === 'UNDER') {
      // Deflated "puh..."
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.28);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.31);
    } else if (grade === 'BURST') {
      // Big comical splat explosion!
      const bufferSize = this.ctx.sampleRate * 0.45;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.14));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.linearRampToValueAtTime(180, now + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.44);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);

      // Comical downward slide
      const osc = this.ctx.createOscillator();
      const oGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.42);
      oGain.gain.setValueAtTime(0.18, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.43);
      osc.connect(oGain);
      oGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.44);
    }
  }

  playBark() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    [0, 0.14].forEach((offset) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now + offset);
      osc.frequency.exponentialRampToValueAtTime(680, now + offset + 0.05);
      osc.frequency.exponentialRampToValueAtTime(280, now + offset + 0.11);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.13);
    });
  }

  playOpeningBell() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const bellNotes = [783.99, 659.25, 523.25, 1046.5];
    bellNotes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.16);
      gain.gain.setValueAtTime(0.2, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.62);
    });
  }

  startBGM() {
    if (this.muted || this.bgmTimer) return;
    this.init();
    // Cheerful retro bakery march ("プクムク・モーニングマーチ")
    const melody = [
      261.63, 329.63, 392.00, 329.63,
      293.66, 349.23, 440.00, 349.23,
      329.63, 392.00, 523.25, 392.00,
      293.66, 392.00, 261.63, 0
    ];
    this.bgmStep = 0;
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const freq = melody[this.bgmStep % melody.length];
      this.bgmStep++;
      if (freq > 0) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    }, 220);
  }

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundManager();
