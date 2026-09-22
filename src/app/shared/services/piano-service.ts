import { Injectable, signal } from "@angular/core";
import { Midi } from "@tonejs/midi";
import { Note } from "@tonejs/midi/dist/Note";
import { Settings } from "../models/settings";
import { SynthPiano } from "./synth-piano";
import {
    playbackRateForPitch,
    resolveNearestSampleMidi,
    sampleNameCandidates,
} from "./sample-resolve";

enum NoteEvent { DOWN = 144, UP = 128 }
const SUSTAIN_CONTROLLER = 64;
const noteMap: string[] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

const WAIT_TIME = 1000 / 60;

interface RecordedNote {
    midi: number;
    time: number;
    duration: number;
    velocity: number;
}

/*
    ## Note On = 0x90 - off = 0x80 
    [status, pitch, velocity]
    https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
*/


@Injectable({ providedIn: 'root' })
export class PianoService {

    DEBUG = false;

    readonly settings = signal(new Settings(36, 96));
    readonly playing = signal(false);
    readonly recording = signal(false);
    readonly sustainPedal = signal(false);
    readonly curTime = signal(0);
    readonly pressedKeys = signal<string[]>([]);

    private context!: AudioContext;
    private pianoSamples: Record<number, AudioBuffer> = {};
    private synth: SynthPiano | null = null;

    private keyCounts: Record<number, number> = {};
    private sustainedNotes = new Set<number>();
    activeSounds: Record<number, AudioBufferSourceNode[]> = {};

    private recordingStartTime = 0;
    private recordedNotes: RecordedNote[] = [];
    private activeRecordingNotes = new Map<number, { startTime: number; velocity: number }>();
    private playbackGeneration = 0;
    private suppressScore = false;
    private readonly noteOnListeners = new Set<(midi: number, timeMs: number) => void>();

    private get minOctave(): number {
        return this.settings().minOctave;
    }

    private incKey(midi: number) {
        const next = (this.keyCounts[midi] ?? 0) + 1;
        this.keyCounts[midi] = next;
        if (next === 1) {
            this.pressedKeys.update(keys => [...keys, this.getNote(midi)]);
        }
    }

    private decKey(midi: number) {
        const cur = this.keyCounts[midi] ?? 0;
        if (cur <= 1) {
            delete this.keyCounts[midi];
            const name = this.getNote(midi);
            this.pressedKeys.update(keys => {
                const idx = keys.indexOf(name);
                if (idx < 0) return keys;
                return [...keys.slice(0, idx), ...keys.slice(idx + 1)];
            });
        } else {
            this.keyCounts[midi] = cur - 1;
        }
    }

    midiToNoteName(midiNote: number) {
        const notes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
        const octave = Math.floor(midiNote / 12) - 1;
        const note = notes[midiNote % 12];
        return `${note}${octave}`;
    }

    async loadSounds() {
        if (!this.context) {
            this.context = new AudioContext();
        }
        if (this.context.state === "suspended") void this.context.resume();
        this.pianoSamples = {};
        const settings = this.settings();
        if (!settings.useSamples) return;

        for (let i = settings.minNote; i <= settings.maxNote; i++) {
            for (const name of sampleNameCandidates(i)) {
                try {
                    const response = await fetch(`/assets/sounds/med_${name}.wav`);
                    if (!response.ok) continue;
                    this.pianoSamples[i] = await this.context.decodeAudioData(await response.arrayBuffer());
                    break;
                } catch {
                    /* missing/corrupt sample — try alias or leave unloaded */
                }
            }
        }
    }

    /**
     * Exact sample, or nearest loaded buffer pitch-shifted (±2 octaves).
     * Sample packs often start at C2; without this, notes below C2 stay silent
     * when samples are on and the exact file is missing.
     */
    private resolveSample(pitch: number): { buffer: AudioBuffer; playbackRate: number } | null {
        const exact = this.pianoSamples[pitch];
        if (exact) return { buffer: exact, playbackRate: 1 };

        const nearest = resolveNearestSampleMidi(
            pitch,
            Object.keys(this.pianoSamples).map(Number),
        );
        if (nearest === null) return null;
        return {
            buffer: this.pianoSamples[nearest],
            playbackRate: playbackRateForPitch(pitch, nearest),
        };
    }

    applySettings(settings: Settings) {
        this.settings.set(settings);
    }

    onNoteOn(listener: (midi: number, timeMs: number) => void): () => void {
        this.noteOnListeners.add(listener);
        return () => this.noteOnListeners.delete(listener);
    }

    stopPlayback(): void {
        this.playbackGeneration++;
        this.playing.set(false);
    }

    /** Advances the song clock without sounding the chart. Resolves false when cancelled. */
    async runClock(endMs: number, leadInMs: number): Promise<boolean> {
        const generation = ++this.playbackGeneration;
        this.curTime.set(-leadInMs);
        this.playing.set(true);

        while (generation === this.playbackGeneration && this.curTime() < endMs) {
            if (!this.playing()) {
                await this.wait(100);
                continue;
            }
            await this.wait(WAIT_TIME);
            if (generation !== this.playbackGeneration || !this.playing()) continue;
            this.curTime.update(time => time + WAIT_TIME);
        }

        if (generation !== this.playbackGeneration) return false;
        this.playing.set(false);
        return true;
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private emitNoteOn(midi: number): void {
        if (this.suppressScore) return;
        const timeMs = this.curTime();
        for (const listener of this.noteOnListeners) listener(midi, timeMs);
    }

    startRecording() {
        this.recording.set(true);
        this.recordingStartTime = performance.now();
        this.recordedNotes = [];
        this.activeRecordingNotes.clear();
    }

    stopRecording(): Uint8Array | null {
        if (!this.recording()) return null;
        this.recording.set(false);

        const now = (performance.now() - this.recordingStartTime) / 1000;
        for (const [midi, active] of this.activeRecordingNotes) {
            this.recordedNotes.push({
                midi,
                time: active.startTime,
                duration: Math.max(0.05, now - active.startTime),
                velocity: active.velocity
            });
        }
        this.activeRecordingNotes.clear();

        if (this.recordedNotes.length === 0) return null;

        const midi = new Midi();
        midi.header.setTempo(120);
        const track = midi.addTrack();
        track.name = "PianoJS Recording";

        for (const note of this.recordedNotes) {
            track.addNote({
                midi: note.midi,
                time: note.time,
                duration: note.duration,
                velocity: note.velocity / 127
            });
        }

        return midi.toArray();
    }

    public getNote(n: number): string {
        const settings = this.settings();
        const noteNumber = n - settings.minNote;
        const octave = Math.floor(noteNumber / 12) + this.minOctave;
        return noteMap[noteNumber % 12] + octave;
    }

    public getVelocity(n: number): string {
        const vel: { [v: number]: string } = {
            8: "pppp",
            20: "ppp",
            31: 'pp',
            42: 'p',
            53: 'mp',
            64: 'mf',
            80: 'f',
            96: 'ff',
            112: 'fff',
            127: 'ffff'
        };
        for (const i in vel) {
            if (n <= Number(i)) return vel[Number(i)];
        }
        return "?";
    }

    public processNote(data: number[]): void {
        const status = data[0] & 0xF0;
        if (status === 0xB0) {
            this.processControlChange(data[1], data[2]);
            return;
        }

        if (status !== NoteEvent.DOWN && status !== NoteEvent.UP) return;

        let event = status;
        let pitch = data[1];
        let velocity = data[2];

        if (event === NoteEvent.DOWN && velocity === 0) {
            event = NoteEvent.UP;
            velocity = 0;
        }

        const settings = this.settings();
        if (pitch < settings.minNote || pitch > settings.maxNote) return;

        this.recordMidiEvent(event, pitch, velocity);
        if (event === NoteEvent.DOWN) this.emitNoteOn(pitch);

        if (event === NoteEvent.UP && this.sustainPedal()) {
            this.sustainedNotes.add(pitch);
            this.decKey(pitch);
            return;
        }

        const sample = settings.useSamples ? this.resolveSample(pitch) : null;
        if (!sample) {
            this.playSynthNote(event, pitch, velocity);
            return;
        }

        if (event === NoteEvent.DOWN && this.DEBUG) console.log(this.printNote([event, pitch, velocity]));
        if (event === NoteEvent.DOWN) {
            this.incKey(pitch);
            if (this.context.state === "suspended") void this.context.resume();
            const source = this.context.createBufferSource();
            source.buffer = sample.buffer;
            source.playbackRate.value = sample.playbackRate;
            source.connect(this.context.destination);
            source.start();
            (this.activeSounds[pitch] ??= []).push(source);
        } else {
            this.stopSampleSound(pitch);
            this.sustainedNotes.delete(pitch);
            this.decKey(pitch);
        }
    }

    private processControlChange(controller: number, value: number) {
        if (controller !== SUSTAIN_CONTROLLER) return;

        const wasOn = this.sustainPedal();
        this.sustainPedal.set(value >= 64);

        if (wasOn && !this.sustainPedal()) {
            this.releaseSustainedNotes();
        }
    }

    private releaseSustainedNotes() {
        const settings = this.settings();
        for (const midi of this.sustainedNotes) {
            if ((this.keyCounts[midi] ?? 0) === 0) {
                if (!settings.useSamples || !this.resolveSample(midi)) {
                    this.stopOscillatorSound(midi);
                } else {
                    this.stopSampleSound(midi);
                }
            }
        }
        this.sustainedNotes.clear();
    }

    private stopSampleSound(midi: number) {
        const stack = this.activeSounds[midi];
        const source = stack?.pop();
        if (source) {
            try { source.stop(); } catch { /* already stopped */ }
        }
        if (stack && stack.length === 0) {
            delete this.activeSounds[midi];
        }
    }

    private ensureSynth(): SynthPiano {
        if (!this.context) this.context = new AudioContext();
        if (this.context.state === "suspended") void this.context.resume();
        return this.synth ??= new SynthPiano(this.context);
    }

    private playSynthNote(event: number, pitch: number, velocity: number): void {
        if (event === NoteEvent.DOWN && this.DEBUG) console.log(this.printNote([event, pitch, velocity]));
        if (event === NoteEvent.DOWN) {
            this.incKey(pitch);
            this.ensureSynth().noteOn(pitch, velocity);
            return;
        }

        this.synth?.noteOff(pitch);
        this.sustainedNotes.delete(pitch);
        this.decKey(pitch);
    }

    private stopOscillatorSound(midi: number) {
        this.synth?.noteOff(midi);
    }

    private recordMidiEvent(event: number, pitch: number, velocity: number) {
        if (!this.recording()) return;

        const elapsed = (performance.now() - this.recordingStartTime) / 1000;
        if (event === NoteEvent.DOWN) {
            this.activeRecordingNotes.set(pitch, { startTime: elapsed, velocity });
            return;
        }

        const active = this.activeRecordingNotes.get(pitch);
        if (!active) return;

        this.recordedNotes.push({
            midi: pitch,
            time: active.startTime,
            duration: Math.max(0.05, elapsed - active.startTime),
            velocity: active.velocity
        });
        this.activeRecordingNotes.delete(pitch);
    }

    private printNote(data: number[]): string[] {
        return [NoteEvent[data[0]], this.getNote(data[1]), data[0] === NoteEvent.DOWN ? this.getVelocity(data[2]) : ""];
    }

    public generateKeys(): { id: number; note: string; octave: number; type: string }[] {
        const settings = this.settings();
        const tmp = [];
        let curNote = 0;
        let curOctave = this.minOctave;
        for (let i = 0; i <= (settings.maxNote - settings.minNote); i++) {
            if (curNote > noteMap.length - 1) {
                curNote = 0;
                curOctave += 1;
            }
            tmp.push({
                id: settings.minNote + i,
                note: noteMap[curNote],
                octave: curOctave,
                type: noteMap[curNote].includes("#") ? 'black' : 'white'
            });
            curNote++;
        }
        return tmp;
    }

    public async playMidi(notes: Note[]) {
        const generation = ++this.playbackGeneration;
        this.curTime.set(0);
        this.playing.set(true);

        const sorted = [...notes].sort((a, b) => a.time - b.time);
        for (let i = 0; i < sorted.length; i++) {
            if (generation !== this.playbackGeneration) return;
            const note = sorted[i];
            if (!note?.time && note?.time !== 0) continue;

            // Read settings live so expanding to C1 mid-song (or before reload) takes effect.
            const { minNote, maxNote } = this.settings();
            if (note.midi < minNote || note.midi > maxNote) continue;

            while (generation === this.playbackGeneration && !this.playing()) {
                await this.wait(100);
            }
            if (generation !== this.playbackGeneration) return;

            while (this.curTime() < note.time * 1000) {
                if (generation !== this.playbackGeneration) return;
                await this.wait(WAIT_TIME);
                if (generation !== this.playbackGeneration) return;
                this.curTime.update(t => t + WAIT_TIME);
            }
            await this.playNoteFromMidi(note);
            if (generation === this.playbackGeneration && i === sorted.length - 1) {
                this.playing.set(false);
            }
        }
    }

    private async playNoteFromMidi(note: Note) {
        const vel = Math.max(1, Math.min(127, Math.round((note.velocity ?? 0.8) * 127)));
        this.suppressScore = true;
        try {
            this.processNote([NoteEvent.DOWN, note.midi, vel]);
        } finally {
            this.suppressScore = false;
        }
        setTimeout(() => {
            this.suppressScore = true;
            try {
                this.processNote([NoteEvent.UP, note.midi, 0]);
            } finally {
                this.suppressScore = false;
            }
        }, note.duration * 1000);
    }
}
