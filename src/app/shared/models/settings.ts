export class Settings {
    minNote : number = 36 //C2
    maxNote : number = 96 //C7
    useSamples: boolean = true; //Use javascript oscillators to simulate sounds or audio files
    
    constructor(min : number, max : number){
      this.minNote = min
      this.maxNote = max
    }
}