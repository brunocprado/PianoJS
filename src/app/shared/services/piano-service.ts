import { Injectable, OnInit } from "@angular/core"
import { Note } from "@tonejs/midi/dist/Note";
import { BehaviorSubject, Observable, Subject } from "rxjs";

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

    minOctave : number = 2
    min : number = 36 //C2
    max : number = 96 //C7
    playing : boolean = false;

    private context!: AudioContext;
    private pianoSamples: any = {};

    private _event$ : Subject<string[]> = new BehaviorSubject<string[]>([]); 

    curTime: number = 0
    pressedKeys : string[] = []
    
    async loadSounds() {
        this.context = new AudioContext();
        for (let i=16;i<65;i++) {
            let response = await fetch(`./assets/sounds/${i}.wav`);
            this.pianoSamples[i+12] = await this.context.decodeAudioData(await response.arrayBuffer());
        }
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
        if(data[0] == NoteEvent.DOWN && this.DEBUG) console.log(this.printNote(data))
        if(data[0] == NoteEvent.DOWN) {
            this.pressedKeys.push(this.getNote(data[1]))
            let source = this.context.createBufferSource();
            source.buffer = this.pianoSamples[data[1]];
            source.connect(this.context.destination);
            source.start();
        } else {
            this.pressedKeys.splice(this.pressedKeys.indexOf(this.getNote(data[1])), 1)
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
        this.processNote([0x90, note.midi, note.duration])
        setTimeout(() => { 
            this.processNote([0x80, note.midi, note.duration])
        }, note.duration * 1000)  
    }
}
