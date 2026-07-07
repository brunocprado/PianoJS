import { Injectable, signal } from "@angular/core";
import { Midi } from "@tonejs/midi";
import { Note } from "@tonejs/midi/dist/Note";
import { Settings } from "../models/settings";

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

    private keyCounts: Record<number, number> = {};
    private sustainedNotes = new Set<number>();
    activeSounds: Record<number, AudioBufferSourceNode[]> = {};
    oscillators: Record<number, Array<{ oscillator1: OscillatorNode, oscillator2: OscillatorNode, gainNode: GainNode, filter: BiquadFilterNode }>> = {};

    private recordingStartTime = 0;
    private recordedNotes: RecordedNote[] = [];
    private activeRecordingNotes = new Map<number, { startTime: number; velocity: number }>();

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
        this.pianoSamples = {};
        const settings = this.settings();
        if (!settings.useSamples) return;

        for (let i = settings.minNote; i <= settings.maxNote; i++) {
            const response = await fetch(`/assets/sounds/med_${this.midiToNoteName(i).toLowerCase()}.wav`);
            if (!response.ok) continue;
            this.pianoSamples[i] = await this.context.decodeAudioData(await response.arrayBuffer());
        }
    }

    applySettings(settings: Settings) {
        this.settings.set(settings);
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

    private midiToFrequency(note: number): number {
        return 440 * Math.pow(2, (note - 69) / 12);
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

        if (event === NoteEvent.UP && this.sustainPedal()) {
            this.sustainedNotes.add(pitch);
            this.decKey(pitch);
            return;
        }

        if (!settings.useSamples || !this.pianoSamples[pitch]) {
            this.processNoteOscillator([event, pitch, velocity]);
            return;
        }

        if (event === NoteEvent.DOWN && this.DEBUG) console.log(this.printNote([event, pitch, velocity]));
        if (event === NoteEvent.DOWN) {
            this.incKey(pitch);
            const source = this.context.createBufferSource();
            source.loopStart = 0.05;
            source.loopEnd = 0.15;
            source.buffer = this.pianoSamples[pitch];
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
                if (!settings.useSamples || !this.pianoSamples[midi]) {
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

    private stopOscillatorSound(midi: number) {
        const stack = this.oscillators[midi];
        const voice = stack?.pop();
        if (!voice) return;

        const { oscillator1, oscillator2, gainNode } = voice;
        const releaseTime = 0.3;
        gainNode.gain.cancelScheduledValues(this.context.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + releaseTime);
        oscillator1.stop(this.context.currentTime + releaseTime);
        oscillator2.stop(this.context.currentTime + releaseTime);

        if (stack && stack.length === 0) {
            delete this.oscillators[midi];
        }
    }

    public processNoteOscillator(data: number[]): void {
        if (!this.context) {
            this.context = new AudioContext();
        }

        if (data[0] === NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data));
        if (data[0] === NoteEvent.DOWN) {
            this.incKey(data[1]);
            const frequency = this.midiToFrequency(data[1]);
            const oscillator1 = this.context.createOscillator();
            const oscillator2 = this.context.createOscillator();

            oscillator1.type = 'sine';
            oscillator2.type = 'triangle';

            oscillator1.frequency.setValueAtTime(frequency, this.context.currentTime);
            oscillator2.frequency.setValueAtTime(frequency, this.context.currentTime);

            const gainNode = this.context.createGain();
            const attackTime = 0.1;
            const decayTime = 0.2;
            const sustainLevel = 0.7;

            gainNode.gain.setValueAtTime(0, this.context.currentTime);
            gainNode.gain.linearRampToValueAtTime(1, this.context.currentTime + attackTime);
            gainNode.gain.linearRampToValueAtTime(sustainLevel, this.context.currentTime + attackTime + decayTime);

            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1500, this.context.currentTime);

            oscillator1.connect(filter);
            oscillator2.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator1.start();
            oscillator2.start();

            (this.oscillators[data[1]] ??= []).push({ oscillator1, oscillator2, gainNode, filter });
        } else {
            this.stopOscillatorSound(data[1]);
            this.sustainedNotes.delete(data[1]);
            this.decKey(data[1]);
        }
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
        this.curTime.set(0);
        this.playing.set(true);

        const settings = this.settings();
        const sorted = [...notes].sort((a, b) => a.time - b.time);
        for (let i = 0; i < sorted.length; i++) {
            const note = sorted[i];
            if (!note?.time && note?.time !== 0) continue;
            if (note.midi < settings.minNote || note.midi > settings.maxNote) continue;

            while (!this.playing()) {
                await new Promise(r => setTimeout(r, 100));
            }
            while (this.curTime() < note.time * 1000) {
                await new Promise(r => setTimeout(r, WAIT_TIME));
                this.curTime.update(t => t + WAIT_TIME);
            }
            await this.playNoteFromMidi(note);
            if (i === sorted.length - 1) this.playing.set(false);
        }
    }

    private async playNoteFromMidi(note: Note) {
        const vel = Math.max(1, Math.min(127, Math.round((note.velocity ?? 0.8) * 127)));
        this.processNote([NoteEvent.DOWN, note.midi, vel]);
        setTimeout(() => {
            this.processNote([NoteEvent.UP, note.midi, 0]);
        }, note.duration * 1000);
    }
}
