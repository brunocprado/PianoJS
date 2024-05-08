import { Injectable } from "@angular/core"

enum NoteEvent { DOWN = 144, UP = 128 }
const noteMap: string[] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
]

/*
    ## Note On = 0x90 - off = 0x80 
    [status, pitch, velocity]
    https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
*/

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

    public printNote(data: number[]) : string[] {
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
            tmp.push({note: noteMap[curNote], octave: curOctave, type: (noteMap[curNote].includes("#")) ? 'black' : 'white'})
            curNote++
        }    

        console.log(tmp)

        return tmp
    }
}
