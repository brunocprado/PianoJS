import { Injectable, signal } from "@angular/core"
import { Note } from "@tonejs/midi/dist/Note";
import { Settings } from "../models/settings";

enum NoteEvent { DOWN = 144, UP = 128 }
const noteMap: string[] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
]

const WAIT_TIME = 1000/60;

/*
    ## Note On = 0x90 - off = 0x80 
    [status, pitch, velocity]
    https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
*/

@Injectable({providedIn: 'root'})
export class PianoService {

    DEBUG : boolean = false;

    readonly settings = signal(new Settings(36, 96));
 
    minOctave : number = 2
    readonly playing = signal(false);
    readonly curTime = signal(0);
    readonly pressedKeys = signal<string[]>([]);

    private context!: AudioContext;
    private pianoSamples: any = {};

    private keyCounts: Record<number, number> = {}
    activeSounds: Record<number, AudioBufferSourceNode[]> = {}
    oscillators: Record<number, Array<{ oscillator1: OscillatorNode, oscillator2: OscillatorNode, gainNode: GainNode, filter: BiquadFilterNode }>> = {}

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

    midiToNoteName(midiNote :number) {
        const notes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
        const octave = Math.floor(midiNote / 12) - 1;
        const note = notes[midiNote % 12];
        return `${note}${octave}`;
    };

    async loadSounds() {
        this.context = new AudioContext();
        const settings = this.settings();
        if(settings.useSamples) {
            for (let i = settings.minNote; i <= settings.maxNote; i++) {
                let response = await fetch(`/assets/sounds/med_${this.midiToNoteName(i).toLowerCase()}.wav`); 
                this.pianoSamples[i] = await this.context.decodeAudioData(await response.arrayBuffer());
            }
        }
    }
    
    private midiToFrequency( note : number) : number{
        return 440 * Math.pow(2, (note - 69) / 12);
    }
    
    /*
        Transforma o int do pitch para uma nota só pra facilitar no debug
    */
    public getNote(n:number) : string {
        const settings = this.settings();
        let noteNumber = n - settings.minNote;
        let octave = Math.floor(noteNumber/12) + this.minOctave;

        return noteMap[noteNumber % 12] + octave;
    }

    public getVelocity(n:any) : string {
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
        }
        for(var i in vel) {
            if(n<=i) return vel[i];
        }
        return "?"
    }

    public processNote(data: number[]) : void {
        const settings = this.settings();
        if(!settings.useSamples || !this.pianoSamples[data[1]]) {
            this.processNoteOscillator(data);
            return;
        }
        if(data[0] == NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data))
        if(data[0] == NoteEvent.DOWN) {
            this.incKey(data[1])
            let source = this.context.createBufferSource();
            source.loopStart = 0.05;
            source.loopEnd = 0.15
            source.buffer = this.pianoSamples[data[1]];
            source.connect(this.context.destination);
            source.start();
            (this.activeSounds[data[1]] ??= []).push(source);
        } else {
            const stack = this.activeSounds[data[1]];
            const source = stack?.pop();
            if (source) {
                try { source.stop(); } catch {}
            }
            if (stack && stack.length === 0) {
                delete this.activeSounds[data[1]];
            }
            this.decKey(data[1])
        }
    }

    public processNoteOscillator(data: number[]) : void {
        if(data[0] == NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data))
        if(data[0] == NoteEvent.DOWN) {
            this.incKey(data[1])
            let frequency = this.midiToFrequency(data[1])
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
            const stack = this.oscillators[data[1]];
            const voice = stack?.pop();
            if (!voice) {
                this.decKey(data[1])
                return;
            }
            const { oscillator1, oscillator2, gainNode } = voice;
        
            const releaseTime = 0.3;
            gainNode.gain.cancelScheduledValues(this.context.currentTime);
            gainNode.gain.setValueAtTime(gainNode.gain.value, this.context.currentTime);
            gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + releaseTime);
            
            oscillator1.stop(this.context.currentTime + releaseTime);
            oscillator2.stop(this.context.currentTime + releaseTime);

            if (stack && stack.length === 0) {
                delete this.oscillators[data[1]];
            }
            this.decKey(data[1])
        }
    }

    private printNote(data: number[]) : string[] {
        return [NoteEvent[data[0]], this.getNote(data[1]), data[0] == NoteEvent.DOWN ? this.getVelocity(data[2]) : ""]
    }

    public generateKeys() : any[] {
        const settings = this.settings();
        var tmp = []
        var curNote = 0;
        var curOctave = 2;
        for(var i = 0; i <= (settings.maxNote - settings.minNote); i++){
            if(curNote > noteMap.length - 1) {
                curNote = 0
                curOctave +=1
            }
            tmp.push({id: settings.minNote + i, note: noteMap[curNote], octave: curOctave, type: (noteMap[curNote].includes("#")) ? 'black' : 'white'})
            curNote++
        }    
        return tmp
    }

    public async playMidi(notes : Note[]) {
        this.curTime.set(0);
        this.playing.set(true);

        for(var i = 0; i<= notes.length; i++){
            if(!notes[i] || !notes[i].time) continue;
            if(notes[i].midi < 36) continue;
            while(!this.playing()) {
                await new Promise(r => setTimeout(r, 100));
            }
            while(this.curTime() < notes[i].time * 1000){
                await new Promise(r => setTimeout(r, WAIT_TIME));
                this.curTime.update(t => t + WAIT_TIME);
            }   
            await this.playNoteFromMidi(notes[i])
            if(i == notes.length - 1) this.playing.set(false);
        }
    }

    private async playNoteFromMidi(note: Note) {
        const vel = Math.max(1, Math.min(127, Math.round((note.velocity ?? 0.8) * 127)));
        this.processNote([NoteEvent.DOWN, note.midi, vel])
        setTimeout(() => {
            this.processNote([NoteEvent.UP, note.midi, 0])
        }, note.duration * 1000)  
    }
}
