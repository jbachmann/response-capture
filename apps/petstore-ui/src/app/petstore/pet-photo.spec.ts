import { TestBed } from '@angular/core/testing';
import { PetPhoto } from './pet-photo';
describe('pet photos', () => {
  it('falls back for missing, unsafe, and broken photos and renders a changed URL', () => {
    const fixture = TestBed.createComponent(PetPhoto);
    fixture.componentRef.setInput('name', 'Milo');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toContain(
      'no photo',
    );
    fixture.componentRef.setInput('url', 'javascript:alert(1)');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('url', 'https://example.com/broken.jpg');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toContain(
      'unavailable',
    );
    fixture.componentRef.setInput('url', 'https://example.com/new.jpg');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').alt).toBe('Milo');
  });
});
