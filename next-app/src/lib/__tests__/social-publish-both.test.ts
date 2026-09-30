import { describe, expect, it } from 'vitest';
import {
  canQueueBothSocialChannels,
  otherSocialPublishChannel,
  selectCrossChannelCaptionOpening,
  socialCaptionOpeningsMatch,
  replaceSocialCaptionHashtags,
  adaptSocialCaptionForTarget,
} from '@/lib/social-publish-both';

describe('canQueueBothSocialChannels', () => {
  it('requires two current reviewed drafts with matching openers', () => {
    expect(canQueueBothSocialChannels({ instagram: 'ready', facebook: 'ready' }, true)).toBe(true);
    expect(canQueueBothSocialChannels({ instagram: 'ready', facebook: 'ready' }, false)).toBe(false);
    expect(canQueueBothSocialChannels({ instagram: 'ready', facebook: 'needs-prepare' }, true)).toBe(false);
    expect(canQueueBothSocialChannels({ instagram: 'queued', facebook: 'ready' }, true)).toBe(false);
  });
});

describe('selectCrossChannelCaptionOpening', () => {
  it('copies the reviewed opener from the ready channel', () => {
    expect(selectCrossChannelCaptionOpening({
      targetOpening: 'Available now: Bracelet.',
      sourceOpening: 'There’s something unmistakable about this bracelet, available now.',
      sourceIsReady: true,
    })).toBe('There’s something unmistakable about this bracelet, available now.');
  });

  it('keeps the target opener when the other channel is not ready', () => {
    expect(selectCrossChannelCaptionOpening({
      targetOpening: 'Available now: Bracelet.',
      sourceOpening: 'An unsaved alternate opener.',
      sourceIsReady: false,
    })).toBe('Available now: Bracelet.');
  });

  it('maps each channel to its counterpart', () => {
    expect(otherSocialPublishChannel('facebook')).toBe('instagram');
    expect(otherSocialPublishChannel('instagram')).toBe('facebook');
  });

  it('recognizes matching reviewed openers while ignoring outer whitespace', () => {
    expect(socialCaptionOpeningsMatch('A shared opener.', '  A shared opener.  ')).toBe(true);
    expect(socialCaptionOpeningsMatch('Facebook wording.', 'Instagram wording.')).toBe(false);
    expect(socialCaptionOpeningsMatch('', 'Instagram wording.')).toBe(false);
  });

  it('copies the full reviewed caption while replacing only the hashtag footer', () => {
    const facebook = [
      'A conversational opener.',
      '',
      'Shared facts.',
      '',
      'Shop: https://naplesestatejewelry.com/p/21',
      '',
      'Message us here.',
      '',
      '#bracelet #estatejewelry #naplesflorida',
    ].join('\n');
    const instagram = [
      'A different opener.',
      '',
      'Different footer wording.',
      '',
      '#bracelet #estatejewelry #naplesflorida #finejewelry #vintagejewelry #goldjewelry',
    ].join('\n');

    expect(replaceSocialCaptionHashtags(facebook, instagram)).toBe([
      'A conversational opener.',
      '',
      'Shared facts.',
      '',
      'Shop: https://naplesestatejewelry.com/p/21',
      '',
      'Message us here.',
      '',
      '#bracelet #estatejewelry #naplesflorida #finejewelry #vintagejewelry #goldjewelry',
    ].join('\n'));
  });

  it('applies Instagram’s two-line item block during a Facebook-to-Instagram copy', () => {
    const facebook = [
      'A conversational opener.', '', 'Shared facts.', '',
      'Shop: https://naplesestatejewelry.com/p/21', '',
      'Message us here.', '', '#bracelet #estatejewelry #naplesflorida',
    ].join('\n');
    const instagram = [
      'Target placeholder.', '', 'Shared facts.', '',
      'Store link in bio', 'Item: NaplesEstateJewelry.com/p/21', '',
      'Target CTA.', '', '#bracelet #estatejewelry #naplesflorida #finejewelry',
    ].join('\n');

    const adapted = adaptSocialCaptionForTarget(facebook, instagram);
    expect(adapted).toContain('\n\nStore link in bio\nItem: NaplesEstateJewelry.com/p/21\n\nMessage us here.');
    expect(adapted).not.toContain('Shop:');
    expect(adapted).toMatch(/#finejewelry$/);
  });

  it('restores Facebook’s single Shop line during an Instagram-to-Facebook copy', () => {
    const instagram = [
      'A conversational opener.', '', 'Shared facts.', '',
      'Store link in bio', 'Item: NaplesEstateJewelry.com/p/21', '',
      'Message us here.', '', '#bracelet #estatejewelry #naplesflorida #finejewelry',
    ].join('\n');
    const facebook = [
      'Target placeholder.', '', 'Shared facts.', '',
      'Shop: https://naplesestatejewelry.com/p/21', '',
      'Target CTA.', '', '#bracelet #estatejewelry #naplesflorida',
    ].join('\n');

    const adapted = adaptSocialCaptionForTarget(instagram, facebook);
    expect(adapted).toContain('\n\nShop: https://naplesestatejewelry.com/p/21\n\nMessage us here.');
    expect(adapted).not.toContain('Store link in bio');
    expect(adapted).not.toContain('Item:');
    expect(adapted).toMatch(/#naplesflorida$/);
  });
});
