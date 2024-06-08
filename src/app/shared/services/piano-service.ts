import { Injectable, OnInit } from "@angular/core"
import { Note } from "@tonejs/midi/dist/Note";
import { BehaviorSubject, Observable, Subject } from "rxjs";
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

    public settings : Settings = new Settings(36, 96); //C2, C7
 
    minOctave : number = 2
    min : number = 36 //C2
    max : number = 96 //C7
    playing : boolean = false;

    private context!: AudioContext;
    private pianoSamples: any = {};

    private _event$ : Subject<string[]> = new BehaviorSubject<string[]>([]); 

    curTime: number = 0
    pressedKeys : string[] = []
    activeSounds: any[] = []
    oscillators: any = {}

    useSamples: boolean = true;

    midiToNoteName(midiNote :number) {
        const notes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
        const octave = Math.floor(midiNote / 12) - 1;
        const note = notes[midiNote % 12];
        return `${note}${octave}`;
    };

    async loadSounds() {
        this.context = new AudioContext();
        if(this.useSamples) {
            for (let i=this.min;i<=this.max;i++) { //https://freesound.org/people/jobro/
                let response = await fetch(`/assets/sounds/med_${this.midiToNoteName(i).toLowerCase()}.wav`); 
                // let response = await fetch(`/assets/sounds/148432__neatonk__piano_loud_c4.wav`); 

                this.pianoSamples[i] = await this.context.decodeAudioData(await response.arrayBuffer());
            }
        }
    }
    
    private midiToFrequency( note : number) : number{
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    public getEvent$(): Observable<string[]> {
        return this._event$.asObservable();
    }

    /*
        Transforma o int do pitch para uma nota só pra facilitar no debug
    */
    public getNote(n:number) : string {
        let noteNumber = n - this.min;
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
        if(!this.useSamples || !this.pianoSamples[data[1]]) {
            this.processNoteOscillator(data);
            return;
        }
        if(data[0] == NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data))
        if(data[0] == NoteEvent.DOWN) {
            this.pressedKeys.push(this.getNote(data[1]))
            let source = this.context.createBufferSource();
            source.loopStart = 0.05; // Definir o início do loop (ajuste conforme necessário)
            source.loopEnd = 0.15//this.pianoSamples[data[1]].duration - ; // Definir o final do loop (ajuste conforme necessário)
            source.buffer = this.pianoSamples[data[1]];
            // source.loop = true;
            source.connect(this.context.destination);
            source.start();
            this.activeSounds[data[1]] = source;
        } else {
            this.pressedKeys.splice(this.pressedKeys.indexOf(this.getNote(data[1])), 1)
            this.activeSounds[data[1]].stop();
            delete this.activeSounds[data[1]]
        }
        this._event$.next(this.pressedKeys)
    }

    public processNoteOscillator(data: number[]) : void {
        if(data[0] == NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data))
        if(data[0] == NoteEvent.DOWN) {
            this.pressedKeys.push(this.getNote(data[1]))
            // Criar osciladores
            let frequency = this.midiToFrequency(data[1])
            const oscillator1 = this.context.createOscillator();
            const oscillator2 = this.context.createOscillator();
            
            oscillator1.type = 'sine'; // Primeira onda (sine)
            oscillator2.type = 'triangle'; // Segunda onda (triangle)
            
            oscillator1.frequency.setValueAtTime(frequency, this.context.currentTime);
            oscillator2.frequency.setValueAtTime(frequency, this.context.currentTime);
            
            // Criar ganho
            const gainNode = this.context.createGain();
            
            // Aplicar ADSR envelope
            const attackTime = 0.1;
            const decayTime = 0.2;
            const sustainLevel = 0.7;
            
            gainNode.gain.setValueAtTime(0, this.context.currentTime);
            gainNode.gain.linearRampToValueAtTime(1, this.context.currentTime + attackTime); // Attack
            gainNode.gain.linearRampToValueAtTime(sustainLevel, this.context.currentTime + attackTime + decayTime); // Decay
            
            // Criar filtro
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1500, this.context.currentTime);
            
            // Conectar nodes
            oscillator1.connect(filter);
            oscillator2.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.context.destination);
            
            // Iniciar osciladores
            oscillator1.start();
            oscillator2.start();
            
            // Guardar osciladores e nodes para parar depois
            this.oscillators[data[1]] = { oscillator1, oscillator2, gainNode, filter };
        } else {
            this.pressedKeys.splice(this.pressedKeys.indexOf(this.getNote(data[1])), 1)
            
            const { oscillator1, oscillator2, gainNode } = this.oscillators[data[1]];
        
            const releaseTime = 0.3;
            gainNode.gain.cancelScheduledValues(this.context.currentTime);
            gainNode.gain.setValueAtTime(gainNode.gain.value, this.context.currentTime);
            gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + releaseTime); // Release
            
            oscillator1.stop(this.context.currentTime + releaseTime);
            oscillator2.stop(this.context.currentTime + releaseTime);

            delete this.oscillators[data[1]]; // Remover do objeto de osciladores ativos
        }
        this._event$.next(this.pressedKeys)
    }

    private printNote(data: number[]) : string[] {
        return [NoteEvent[data[0]], this.getNote(data[1]), data[0] == NoteEvent.DOWN ? this.getVelocity(data[2]) : ""]
    }

    public generateKeys() : any[] {
        var tmp = []
        var curNote = 0;
        var curOctave = 2;
        for(var i = 0; i<=(this.max - this.min); i++){
            if(curNote > noteMap.length - 1) {
                curNote = 0
                curOctave +=1
            }
            tmp.push({id:this.min + i, note: noteMap[curNote], octave: curOctave, type: (noteMap[curNote].includes("#")) ? 'black' : 'white'})
            curNote++
        }    
        return tmp
    }

    public async playMidi(notes : Note[]) {
        this.curTime = 0;
        this.playing = true;

        for(var i = 0; i<= notes.length; i++){
            if(!notes[i] || !notes[i].time) continue;
            if(notes[i].midi < 36) continue;
            while(!this.playing) {
                await new Promise(r => setTimeout(r, 100));
            }
            while(this.curTime < notes[i].time * 1000){
                await new Promise(r => setTimeout(r, WAIT_TIME));
                this.curTime += WAIT_TIME
            }   
            await this.playNoteFromMidi(notes[i])
            if(i == notes.length - 1) this.playing = false;
        }
    }

    private async playNoteFromMidi(note: Note) {
        this.processNote([NoteEvent.DOWN, note.midi, note.duration])
        setTimeout(() => {
            this.processNote([NoteEvent.UP, note.midi, 0])
        }, note.duration * 1000)  
    }
}
