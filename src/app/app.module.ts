import { BrowserModule } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { PianoService } from "./shared/services/piano-service";
import { NgModule } from "@angular/core";
import { KeyboardComponent } from "./keyboard/keyboard.component";
import { NotesDisplayComponent } from './notes-display/notes-display.component';
import { SettingsComponent } from './settings/settings.component';

@NgModule({
    declarations: [		
      AppComponent,
      KeyboardComponent,
      NotesDisplayComponent,
      SettingsComponent
   ],
    imports: [
      BrowserModule
    ],
    providers: [
      PianoService
    ],
    exports: [],
    bootstrap: [AppComponent]
  })
  export class AppModule { }