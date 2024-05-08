import { Injectable } from "@angular/core"

enum EventoNota { Down = 144, Up = 128 }
enum NoteSpeed { }

const noteMap = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
]

@Injectable({providedIn: 'root'})
export class PianoService {
    minOctave : number = 2
    min : number = 36 //C2
    max : number = 96 //C7

    /*
        Transforma o int do pitch para uma nota só pra facilitar no debug
    */
    public getNote(n:number) : string {
        let noteNumber = n - this.min;
        let octave = Math.floor(noteNumber/12) + this.minOctave;

        return noteMap[noteNumber % 12] + octave;
    }

    public printNote(data: number[]) : string[] {
        return [EventoNota[data[0]], this.getNote(data[1])]
    }
}
