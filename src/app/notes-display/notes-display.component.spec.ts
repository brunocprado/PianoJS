import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotesDisplayComponent } from './notes-display.component';

describe('NotesDisplayComponent', () => {
  let fixture: ComponentFixture<NotesDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotesDisplayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NotesDisplayComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
