"use client";

// Harici .mp3 / .wav dosyası kullanmadan tüm 5 oyunun katmanlı seslerini Web Audio API ile sentezler
// + Mobil dokunsal geri bildirim (navigator.vibrate) desteği

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  // Mobil cihazlarda dokunsal geri bildirim (Haptic Feedback)
  public vibrate(pattern: number | number[] = 12): void {
    if (this.muted || typeof navigator === "undefined") return;
    try {
      if (typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // Desteklemeyen tarayıcılarda sessizce geç
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = 1 - i / bufferSize;
      output[i] = (Math.random() * 2 - 1) * env;
    }
    return buffer;
  }

  public playClick(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.04);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playPickup(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.06);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playBlockPlace(cellCount: number = 4): void {
    if (this.muted) return;
    this.vibrate(10);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Katman 1: Tok akrilik gövde sesi
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(Math.max(130, 195 - cellCount * 6), now);
    sub.frequency.exponentialRampToValueAtTime(74, now + 0.085);
    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.095);

    // Katman 2: Parlak jel/cam tıkırtısı
    const hi = ctx.createOscillator();
    const hiGain = ctx.createGain();
    hi.type = "sine";
    hi.frequency.setValueAtTime(580 + cellCount * 22, now);
    hi.frequency.exponentialRampToValueAtTime(920, now + 0.048);
    hiGain.gain.setValueAtTime(0.09, now);
    hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);
    hi.connect(hiGain);
    hiGain.connect(ctx.destination);
    hi.start(now);
    hi.stop(now + 0.056);
  }

  // Block Blast: Kombo arttıkça yükselen pentatonik akorlar (C5 -> D5 -> E5 -> G5 -> A5 -> C6)
  public playBlockClear(linesCleared: number, combo: number): void {
    if (this.muted) return;
    this.vibrate(linesCleared >= 2 || combo >= 2 ? [18, 28, 26] : 20);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const semitoneShift = Math.min(Math.max(combo - 1, 0) * 2, 14);
    const pitchFactor = Math.pow(2, semitoneShift / 12);
    // Pentatonik dizi: C5, D5, E5, G5, A5, C6
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const count = Math.min(3 + linesCleared, pentatonic.length);

    for (let i = 0; i < count; i++) {
      const start = now + i * 0.042;
      const freq = pentatonic[i] * pitchFactor;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = linesCleared >= 3 || combo >= 3 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.03, start + 0.24);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);

      // Üst oktav kristal parıltısı
      const shimmer = ctx.createOscillator();
      const sGain = ctx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(freq * 2, start);
      sGain.gain.setValueAtTime(0.045, start);
      sGain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      shimmer.connect(sGain);
      sGain.connect(ctx.destination);
      shimmer.start(start);
      shimmer.stop(start + 0.18);
    }
  }

  // Satranç: Gerçekçi ahşap tahta tıkırtısı (filtrelenmiş gürültü darbesi + tok gövde)
  public playChessMove(isCapture: boolean = false, isCheck: boolean = false): void {
    if (this.muted) return;
    this.vibrate(isCheck ? [20, 30, 25] : isCapture ? 18 : 10);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Katman 1: Ahşap temas darbesi (bandpass noise burst)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.createNoiseBuffer(ctx, 0.032);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(isCapture ? 1150 : 820, now);
    filter.Q.setValueAtTime(2.2, now);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(isCapture ? 0.28 : 0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    noiseSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noiseSrc.start(now);

    // Katman 2: Ahşap satranç tahtası gövde rezonansı
    const wood = ctx.createOscillator();
    const woodGain = ctx.createGain();
    wood.type = "triangle";
    wood.frequency.setValueAtTime(isCapture ? 250 : 185, now);
    wood.frequency.exponentialRampToValueAtTime(62, now + 0.075);
    woodGain.gain.setValueAtTime(isCapture ? 0.28 : 0.21, now);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    wood.connect(woodGain);
    woodGain.connect(ctx.destination);
    wood.start(now);
    wood.stop(now + 0.085);

    if (isCapture) {
      const snap = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snap.type = "sine";
      snap.frequency.setValueAtTime(920, now);
      snap.frequency.exponentialRampToValueAtTime(260, now + 0.042);
      snapGain.gain.setValueAtTime(0.12, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.046);
      snap.connect(snapGain);
      snapGain.connect(ctx.destination);
      snap.start(now);
      snap.stop(now + 0.05);
    }

    if (isCheck) {
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = "triangle";
      chime.frequency.setValueAtTime(880, now + 0.045);
      chime.frequency.setValueAtTime(1174.66, now + 0.12);
      chimeGain.gain.setValueAtTime(0.15, now + 0.045);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(now + 0.045);
      chime.stop(now + 0.34);
    }
  }

  // Bilardo: İstaka deri uç vuruşu
  public playCueStrike(powerRatio: number = 0.6): void {
    if (this.muted) return;
    const clamped = Math.min(1, Math.max(0.15, powerRatio));
    this.vibrate(Math.round(10 + clamped * 20));
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240 + clamped * 190, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.065);
    gain.gain.setValueAtTime(0.28 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    const tip = ctx.createOscillator();
    const tipGain = ctx.createGain();
    tip.type = "sine";
    tip.frequency.setValueAtTime(1250 + clamped * 600, now);
    tip.frequency.exponentialRampToValueAtTime(420, now + 0.025);
    tipGain.gain.setValueAtTime(0.14 * clamped, now);
    tipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
    tip.connect(tipGain);
    tipGain.connect(ctx.destination);
    tip.start(now);
    tip.stop(now + 0.03);
  }

  // Bilardo: Hıza duyarlı fenolik reçine / fildişi "clack" çarpışma sesi
  public playBallHit(intensity: number = 0.5): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const clamped = Math.min(1, Math.max(0, intensity));
    const vol = Math.min(0.28, clamped * 0.27);
    if (vol <= 0.018) return;
    if (clamped > 0.45) {
      this.vibrate(8);
    }

    const now = ctx.currentTime;
    // Birincil reçine rezonansı
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1680 + clamped * 520, now);
    osc1.frequency.exponentialRampToValueAtTime(680, now + 0.028);
    gain1.gain.setValueAtTime(vol, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.035);

    // İkincil parlak tık katmanı
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(2650 + clamped * 750, now);
    osc2.frequency.exponentialRampToValueAtTime(1120, now + 0.016);
    gain2.gain.setValueAtTime(vol * 0.55, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.019);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.022);
  }

  // Bilardo: Bant sekmesi
  public playCushionBounce(intensity: number = 0.4): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const vol = Math.min(0.17, Math.max(0.02, intensity * 0.16));
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.062);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.066);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Bilardo: Top deliğe düştüğünde tok hazne sesi + ödül tınısı
  public playPocketDrop(): void {
    if (this.muted) return;
    this.vibrate([16, 24, 18]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Tok cep çukuru düşüş sesi
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(142, now);
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.13);
    thudGain.gain.setValueAtTime(0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.15);

    // Ödül akoru
    const notes = [392.0, 523.25, 659.25];
    notes.forEach((f, idx) => {
      const start = now + 0.04 + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  // Solitaire: Keskin kağıt hışırtısı / kart çevirme sesi
  public playCardFlip(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = this.createNoiseBuffer(ctx, 0.052);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1650, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.048);
    filter.Q.setValueAtTime(1.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    whiteNoise.start(now);
  }

  // Solitaire: Yuva (Foundation) kart yerleşimi — stepIndex ile yükselen nota dizisi
  public playCardFoundation(stepIndex: number = 0): void {
    if (this.muted) return;
    this.vibrate(8);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const semitones = Math.min(stepIndex, 24);
    const baseFreq = 523.25 * Math.pow(2, semitones / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.11);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Sudoku: Doğru rakam girişi
  public playSudokuCorrect(): void {
    if (this.muted) return;
    this.vibrate(10);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.095);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Sudoku: Satır / Sütun / 3x3 Kutu tamamlandığında altın parıltı dalgası sesi
  public playShimmerWave(): void {
    if (this.muted) return;
    this.vibrate([12, 20, 16]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      const start = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  }

  // 2 Kişilik Düello "VS" Karşılaşma Giriş Sesi
  public playDuelClash(): void {
    if (this.muted) return;
    this.vibrate([25, 35, 40]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const impact = ctx.createOscillator();
    const iGain = ctx.createGain();
    impact.type = "sawtooth";
    impact.frequency.setValueAtTime(160, now);
    impact.frequency.exponentialRampToValueAtTime(48, now + 0.28);
    iGain.gain.setValueAtTime(0.2, now);
    iGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    impact.connect(iGain);
    iGain.connect(ctx.destination);
    impact.start(now);
    impact.stop(now + 0.32);

    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((f, idx) => {
      const start = now + 0.05 + idx * 0.035;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.13, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.37);
    });
  }

  // Hatalı hamle / yanlış PIN / yanlış Sudoku rakamı
  public playInvalid(): void {
    if (this.muted) return;
    this.vibrate([30, 30, 30]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.16);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Rekor / Galibiyet kutlama fanfarı
  public playVictory(): void {
    if (this.muted) return;
    this.vibrate([25, 40, 25, 40, 60]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const times = [0, 0.085, 0.17, 0.27, 0.4, 0.5];
    const durs = [0.09, 0.09, 0.09, 0.14, 0.09, 0.38];

    notes.forEach((f, idx) => {
      const start = now + times[idx];
      const dur = durs[idx];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  public playGameOver(): void {
    if (this.muted) return;
    this.vibrate([45, 50, 75]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((f, idx) => {
      const start = now + idx * 0.12;
      const dur = idx === 3 ? 0.38 : 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.11, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // Sıra değişim sesi (Yumuşak neon geçiş tınısı)
  public playTurnChange(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(510, now + 0.075);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 1) Chain Reaction: Atom küresi yerleştirme ve zincirleme dalga patlaması
  public playChainOrbPlace(): void {
    if (this.muted) return;
    this.vibrate(8);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.065);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playChainExplosion(waveDepth: number = 1): void {
    if (this.muted) return;
    this.vibrate(waveDepth >= 3 ? [15, 20, 18] : 14);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clampedWave = Math.min(12, Math.max(1, waveDepth));
    const pitchMult = Math.pow(2, (clampedWave - 1) / 10);

    // Katman 1: Plazma dalgası bas vuruşu
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(170 * pitchMult, now);
    sub.frequency.exponentialRampToValueAtTime(52, now + 0.14);
    subGain.gain.setValueAtTime(0.24, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.16);

    // Katman 2: Atomik kristal parıltı
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(520 * pitchMult, now);
    ping.frequency.exponentialRampToValueAtTime(980 * pitchMult, now + 0.11);
    pingGain.gain.setValueAtTime(0.13, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    ping.connect(pingGain);
    pingGain.connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.13);
  }

  // 2) Kızma Birader (Ludo): 3D Zar Tıkırtısı, Piyon Adımı ve Kırma Şovu
  public playDiceRoll(): void {
    if (this.muted) return;
    this.vibrate([10, 25, 10, 25, 14]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 5 ardışık kemik/akrilik zar çarpma tıkırtısı
    const offsets = [0, 0.055, 0.115, 0.18, 0.25];
    offsets.forEach((off, idx) => {
      const t = now + off;
      const noise = ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(ctx, 0.025);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400 + idx * 180, t);
      filter.Q.setValueAtTime(3.0, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.024);
      noise.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      noise.start(t);

      const tone = ctx.createOscillator();
      const tg = ctx.createGain();
      tone.type = "triangle";
      tone.frequency.setValueAtTime(520 + idx * 75, t);
      tone.frequency.exponentialRampToValueAtTime(240, t + 0.03);
      tg.gain.setValueAtTime(0.12, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.032);
      tone.connect(tg);
      tg.connect(ctx.destination);
      tone.start(t);
      tone.stop(t + 0.035);
    });
  }

  public playPawnStep(stepIdx: number = 0): void {
    if (this.muted) return;
    this.vibrate(6);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = 440 + (stepIdx % 6) * 45;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.055);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playLudoCapture(): void {
    if (this.muted) return;
    this.vibrate([25, 30, 35]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const smash = ctx.createOscillator();
    const sGain = ctx.createGain();
    smash.type = "sawtooth";
    smash.frequency.setValueAtTime(320, now);
    smash.frequency.exponentialRampToValueAtTime(64, now + 0.22);
    sGain.gain.setValueAtTime(0.24, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    smash.connect(sGain);
    sGain.connect(ctx.destination);
    smash.start(now);
    smash.stop(now + 0.25);

    const cheer = [587.33, 880.0];
    cheer.forEach((f, i) => {
      const st = now + 0.06 + i * 0.06;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(st);
      osc.stop(st + 0.17);
    });
  }

  // 3) Kare Kapmaca & SOS Arenası: Neon Çizgi ve Lazer SOS Sesi
  public playLaserLine(): void {
    if (this.muted) return;
    this.vibrate(8);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.065);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playLaserSos(combo: number = 1): void {
    if (this.muted) return;
    this.vibrate([16, 22, 20]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const mult = Math.pow(2, Math.min(8, Math.max(0, combo - 1)) / 12);

    // Lazer tarama ışını
    const beam = ctx.createOscillator();
    const bGain = ctx.createGain();
    beam.type = "sawtooth";
    beam.frequency.setValueAtTime(440 * mult, now);
    beam.frequency.exponentialRampToValueAtTime(1320 * mult, now + 0.16);
    bGain.gain.setValueAtTime(0.14, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    beam.connect(bGain);
    bGain.connect(ctx.destination);
    beam.start(now);
    beam.stop(now + 0.19);

    // Akor onayı
    const notes = [523.25 * mult, 659.25 * mult, 783.99 * mult];
    notes.forEach((f, idx) => {
      const st = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.13, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(st);
      osc.stop(st + 0.19);
    });
  }

  // 4) Topçu Tanklar: Top Atışı + Mermi Islığı + Krater Patlaması
  public playTankFire(): void {
    if (this.muted) return;
    this.vibrate([20, 20]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Namlu patlaması
    const boom = ctx.createOscillator();
    const bGain = ctx.createGain();
    boom.type = "sawtooth";
    boom.frequency.setValueAtTime(190, now);
    boom.frequency.exponentialRampToValueAtTime(45, now + 0.16);
    bGain.gain.setValueAtTime(0.26, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    boom.connect(bGain);
    bGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.19);

    // Kısa mermi ıslığı
    const whistle = ctx.createOscillator();
    const wGain = ctx.createGain();
    whistle.type = "sine";
    whistle.frequency.setValueAtTime(980, now + 0.04);
    whistle.frequency.exponentialRampToValueAtTime(460, now + 0.34);
    wGain.gain.setValueAtTime(0.07, now + 0.04);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    whistle.connect(wGain);
    wGain.connect(ctx.destination);
    whistle.start(now + 0.04);
    whistle.stop(now + 0.37);
  }

  public playTankExplosion(isBig: boolean = false): void {
    if (this.muted) return;
    this.vibrate(isBig ? [35, 30, 45] : [25, 25]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = isBig ? 0.42 : 0.28;

    // Gürültü krater patlaması (lowpass)
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isBig ? 620 : 480, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + dur);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(isBig ? 0.36 : 0.28, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // Alt bas sarsıntısı
    const sub = ctx.createOscillator();
    const sGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(125, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + dur);
    sGain.gain.setValueAtTime(0.32, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sub.connect(sGain);
    sGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + dur + 0.02);
  }

  // 5) Hafıza Arenası: Kart Eşleşme Sesi (Komboya göre yükselen kristal akor)
  public playMemoryMatch(combo: number = 1): void {
    if (this.muted) return;
    this.vibrate([14, 22, 16]);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const shift = Math.min(10, Math.max(0, combo - 1));
    const mult = Math.pow(2, shift / 12);
    const chord = [523.25 * mult, 659.25 * mult, 783.99 * mult, 1046.5 * mult];

    chord.forEach((f, idx) => {
      const st = now + idx * 0.038;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(st);
      osc.stop(st + 0.24);
    });
  }
}

export const sound = new ArcadeSoundEngine();
