import { describe, expect, it } from 'vitest';
import { getSocialUnqueuedSyncState, getSocialWorkflowStage } from '../social-workflow';

describe('getSocialUnqueuedSyncState', () => {
  it('returns a prepared post to review and an unprepared post to pending', () => {
    expect(getSocialUnqueuedSyncState('Reviewed caption.', ['social/card.jpg'])).toBe('review');
    expect(getSocialUnqueuedSyncState('Reviewed caption.', [])).toBe('pending');
    expect(getSocialUnqueuedSyncState(null, ['social/card.jpg'])).toBe('pending');
  });
});

describe('getSocialWorkflowStage', () => {
  it.each([
    [{ isPublished: false, lineupDirty: true, hasPreparedUpload: true, captionOpeningDirty: false }, 'curate'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: true, captionOpeningDirty: false, isEditingSetup: true }, 'curate'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: false, captionOpeningDirty: false }, 'prepare'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: false, captionOpeningDirty: true }, 'curate'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: true, captionOpeningDirty: true }, 'update'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: true, captionOpeningDirty: false, isEditingCaption: true }, 'update'],
    [{ isPublished: false, lineupDirty: false, hasPreparedUpload: true, captionOpeningDirty: false }, 'review'],
    [{ isPublished: true, lineupDirty: true, hasPreparedUpload: true, captionOpeningDirty: true }, 'published'],
  ] as const)('returns %s for the matching post state', (input, expected) => {
    expect(getSocialWorkflowStage(input)).toBe(expected);
  });
});
