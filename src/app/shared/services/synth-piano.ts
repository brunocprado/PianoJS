interface SynthVoice {
    amp: GainNode;
    sources: AudioScheduledSourceNode[];
}

/**
 * Additive piano used when samples are off.
 * Several slightly detuned strings, a short hammer noise and a bus that
 * pulls the level down as more notes sound, so chords stay clean.
 */
export class SynthPiano {
    private readonly voices = new Map<number, SynthVoice[]>();
    private readonly busTrim: GainNode;
    private noiseBuffer: AudioBuffer | null = null;
    private sineWaves: PeriodicWave[] | null = null;
    private voiceCount = 0;

    constructor(private readonly context: AudioContext) {
        this.busTrim = this.createBus();
    }

    noteOn(midi: number, velocity: number): void {
        if (this.context.state === "suspended") {
            void this.context.resume();
        }

        const voice = this.createVoice(midi, velocity);
        const stack = this.voices.get(midi) ?? [];
        stack.push(voice);
        this.voices.set(midi, stack);
        this.voiceCount++;
        this.updateBusLevel();
    }

    noteOff(midi: number): void {
        const stack = this.voices.get(midi);
        const voice = stack?.pop();
        if (!voice) return;
        if (stack && stack.length === 0) this.voices.delete(midi);

        const release = this.releaseVoice(voice, midi);
        window.setTimeout(() => {
            this.voiceCount = Math.max(0, this.voiceCount - 1);
            this.updateBusLevel();
        }, release * 1000 + 40);
    }

    private createVoice(midi: number, velocity: number): SynthVoice {
        const now = this.context.currentTime;
        const vel = Math.min(1, Math.max(0.05, velocity / 127));
        const fundamental = 440 * Math.pow(2, (midi - 69) / 12);
        const attack = 0.003 + (1 - vel) * 0.008;
        const body = Math.min(6.2, Math.max(0.9, 5.4 - (midi - 36) * 0.055));
        const peak = 0.46 * Math.pow(vel, 0.62);

        const filter = this.context.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.setValueAtTime(0.65, now);
        const open = Math.min(15000, Math.max(2800, fundamental * (7 + vel * 12)));
        const closed = Math.max(1400, fundamental * 3.2);
        filter.frequency.setValueAtTime(open, now);
        filter.frequency.exponentialRampToValueAtTime(closed, now + body * 0.55);

        const amp = this.context.createGain();
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(peak, now + attack);
        amp.gain.setTargetAtTime(Math.max(0.0001, peak * 0.18), now + attack, body / 3.2);

        const panner = this.context.createStereoPanner();
        const pan = Math.max(-0.32, Math.min(0.32, ((midi - 60) / 48) * 0.32));
        panner.pan.setValueAtTime(pan, now);

        filter.connect(amp);
        amp.connect(panner);
        panner.connect(this.busTrim);

        const sources: AudioScheduledSourceNode[] = [];
        const amps = this.partialAmplitudes(this.partialCount(midi), vel);
        const strings = this.stringRatios(midi);
        const stringScale = 1 / Math.sqrt(strings.length);
        let watched = false;

        for (const ratio of strings) {
            for (let n = 1; n <= amps.length; n++) {
                const freq = this.partialFrequency(fundamental, n, midi) * ratio;
                if (freq >= this.context.sampleRate * 0.45) continue;

                const osc = this.context.createOscillator();
                osc.setPeriodicWave(this.randomSine());
                const sharp = freq * (1 + 0.0018 * vel);
                osc.frequency.setValueAtTime(sharp, now);
                osc.frequency.exponentialRampToValueAtTime(freq, now + 0.045);

                const partialGain = this.context.createGain();
                const level = amps[n - 1] * stringScale;
                partialGain.gain.setValueAtTime(level, now);
                if (n > 1) {
                    partialGain.gain.setTargetAtTime(level * 0.045, now + 0.02, body / (n * 1.15));
                }

                osc.connect(partialGain);
                partialGain.connect(filter);
                osc.start(now);
                sources.push(osc);

                if (!watched) {
                    watched = true;
                    osc.onended = () => {
                        try { panner.disconnect(); } catch { /* already stopped */ }
                    };
                }
            }
        }

        sources.push(this.hammer(midi, vel, now, peak, panner));
        return { amp, sources };
    }

    private releaseVoice(voice: SynthVoice, midi: number): number {
        const now = this.context.currentTime;
        const release = midi > 86 ? 0.08 : 0.12 + Math.max(0, 72 - midi) * 0.0035;
        const gain = voice.amp.gain;
        gain.cancelAndHoldAtTime(now);
        if (gain.value < 0.0001) gain.setValueAtTime(0.0001, now);
        gain.exponentialRampToValueAtTime(0.0001, now + release);

        const stopAt = now + release + 0.02;
        for (const source of voice.sources) {
            try { source.stop(stopAt); } catch { /* already stopped */ }
        }
        return release;
    }

    private hammer(midi: number, vel: number, now: number, peak: number, destination: AudioNode): AudioBufferSourceNode {
        const noise = this.context.createBufferSource();
        noise.buffer = this.getNoise();

        const filter = this.context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1100 + vel * 2600 + midi * 6, now);
        filter.Q.setValueAtTime(0.8, now);

        const gain = this.context.createGain();
        const burst = Math.max(0.0001, peak * (0.1 + vel * 0.16));
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(burst, now + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03 + vel * 0.025);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        noise.start(now);
        noise.stop(now + 0.09);
        return noise;
    }

    private createBus(): GainNode {
        const trim = this.context.createGain();
        trim.gain.setValueAtTime(0.92, this.context.currentTime);

        const body = this.context.createBiquadFilter();
        body.type = "peaking";
        body.frequency.value = 220;
        body.Q.value = 0.7;
        body.gain.value = 1.6;

        const air = this.context.createBiquadFilter();
        air.type = "highshelf";
        air.frequency.value = 4200;
        air.gain.value = -1.4;

        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.22;

        const shaper = this.context.createWaveShaper();
        shaper.curve = this.softClipCurve();
        shaper.oversample = "2x";

        const makeup = this.context.createGain();
        makeup.gain.value = 0.9;

        trim.connect(body);
        body.connect(air);
        air.connect(compressor);
        compressor.connect(shaper);
        shaper.connect(makeup);
        makeup.connect(this.context.destination);
        return trim;
    }

    private updateBusLevel(): void {
        const now = this.context.currentTime;
        const voices = Math.max(1, this.voiceCount);
        const scale = 0.92 / Math.pow(voices, 0.42);
        this.busTrim.gain.cancelAndHoldAtTime(now);
        this.busTrim.gain.setTargetAtTime(scale, now, 0.035);
    }

    private partialCount(midi: number): number {
        if (midi < 48) return 6;
        if (midi < 72) return 5;
        if (midi < 90) return 4;
        return 3;
    }

    private partialAmplitudes(count: number, velocity: number): number[] {
        const slope = 0.95 + (1 - velocity) * 1.25;
        const raw = Array.from({ length: count }, (_, index) => 1 / Math.pow(index + 1, slope));
        const sum = raw.reduce((total, value) => total + value, 0);
        return raw.map(value => value / sum);
    }

    private partialFrequency(fundamental: number, harmonic: number, midi: number): number {
        const stiffness = 0.00014 * Math.pow(2, (midi - 60) / 18);
        return fundamental * harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
    }

    private stringRatios(midi: number): number[] {
        const count = midi < 40 ? 1 : midi < 76 ? 2 : 3;
        if (count === 1) return [Math.pow(2, ((Math.random() - 0.5) * 0.4) / 1200)];

        const spread = 1.4 + Math.random() * 1.4;
        return Array.from({ length: count }, (_, index) => {
            const cents = (index - (count - 1) / 2) * spread;
            return Math.pow(2, cents / 1200);
        });
    }

    private randomSine(): PeriodicWave {
        if (!this.sineWaves) {
            this.sineWaves = Array.from({ length: 12 }, (_, index) => {
                const phase = (index / 12) * Math.PI * 2;
                const real = new Float32Array([0, Math.cos(phase)]);
                const imag = new Float32Array([0, Math.sin(phase)]);
                return this.context.createPeriodicWave(real, imag, { disableNormalization: false });
            });
        }
        return this.sineWaves[Math.floor(Math.random() * this.sineWaves.length)];
    }

    private getNoise(): AudioBuffer {
        if (this.noiseBuffer) return this.noiseBuffer;
        const length = Math.floor(this.context.sampleRate * 0.2);
        const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
        return buffer;
    }

    private softClipCurve(): Float32Array<ArrayBuffer> {
        const length = 2048;
        const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
        const drive = 1.25;
        const norm = Math.tanh(drive);
        for (let i = 0; i < length; i++) {
            const x = (i / (length - 1)) * 2 - 1;
            curve[i] = Math.tanh(drive * x) / norm;
        }
        return curve;
    }
}
