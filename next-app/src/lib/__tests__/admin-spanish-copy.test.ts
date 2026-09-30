import { describe, expect, it } from 'vitest';
import {
  buildMissingSpanishCopyRequest,
  mergeMissingSpanishCopy,
  translatedSpanishTargets,
} from '@/lib/admin-spanish-copy';

describe('missing Spanish product copy', () => {
  it('requests only blank Spanish fields that have an English source', () => {
    const request = buildMissingSpanishCopyRequest({
      title: 'Sterling silver spoon',
      title_es: 'Cuchara de plata esterlina',
      description: 'Repousse floral pattern.',
      description_es: '   ',
      public_notes: '',
      public_notes_es: null,
    });

    expect(request).toEqual({
      body: {
        title: '',
        description: 'Repousse floral pattern.',
        notes: '',
      },
      targets: ['description_es'],
    });
  });

  it('fills requested blanks without overwriting copy changed while translating', () => {
    const merged = mergeMissingSpanishCopy(
      {
        title: 'Title changed again',
        title_es: 'Titulo escrito mientras se generaba',
        description: 'Updated description',
        description_es: '',
        public_notes: 'Maker mark',
        public_notes_es: 'Nota conservada',
      },
      {
        body: { title: 'Updated title', description: 'Updated description', notes: '' },
        targets: ['title_es', 'description_es'],
      },
      {
        title_es: 'Titulo generado',
        description_es: 'Descripcion generada',
        notes_es: 'Nota generada',
      },
    );

    expect(merged.title_es).toBe('Titulo escrito mientras se generaba');
    expect(merged.description_es).toBe('Descripcion generada');
    expect(merged.public_notes_es).toBe('Nota conservada');
  });

  it('does not apply a translation after its English source changes', () => {
    const merged = mergeMissingSpanishCopy(
      {
        title: 'Newer English title',
        title_es: '',
      },
      {
        body: { title: 'Earlier English title', description: '', notes: '' },
        targets: ['title_es'],
      },
      { title_es: 'Titulo basado en la version anterior' },
    );

    expect(merged.title_es).toBe('');
  });

  it('identifies partial translation responses', () => {
    expect(translatedSpanishTargets(
      ['title_es', 'description_es', 'public_notes_es'],
      { title_es: 'Titulo', description_es: null, notes_es: 'Notas' },
    )).toEqual(['title_es', 'public_notes_es']);
  });
});
