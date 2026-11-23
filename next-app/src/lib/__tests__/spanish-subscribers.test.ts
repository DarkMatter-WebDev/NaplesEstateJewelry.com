import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND,
  classifyInbound,
  confirmationText,
  dealText,
  DEFAULT_SOLD_REPLY,
  DEFAULT_SOLD_REPLY_ES,
  forwardText,
  helpText,
  isSpanishKeyword,
  optInReplyText,
  soldNoticeText,
  soldReplyFor,
  spanishOptOutText,
  STOP_LINE,
  STOP_LINE_ES,
  textLanguage,
  winnerText,
  withStopLine,
} from '@/lib/text-alerts/messages';
import {
  DEAL_METALS,
  DEAL_METALS_ES,
  DEFAULT_DEAL_MESSAGE,
  DEFAULT_DEAL_MESSAGE_ES,
  dealLineEs,
  dealMessageEs,
  dealMetalLabelEs,
  dealSizeLabelEs,
  dealSpanishColumns,
  dealTitleEs,
  normalizeDealSpanish,
  spanishTranslationPlan,
} from '@/lib/text-alerts/deal-input';
import { dealMediaPathsEs, dealPhotoUpdate } from '@/lib/text-alerts/deal-photos';
import { inquiryConfirmationEmail, inquiryLanguage } from '@/lib/inquiry-confirmation';
import { translateDealWordsToSpanish, translateEmailToSpanish, EMAIL_TRANSLATE_MAX_HTML } from '@/lib/ai-translate';

/**
 * Spanish for the email list and text deals (2026-11-22, owner: "Can we give
 * them an option to sign up in Spanish and send them everything translated?";
 * mockup 1 → "1B, 2A, 3A, 4A, build it").
 */
const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('the texts in Spanish — and English unchanged', () => {
  it('English stays word for word (the wording on file with Twilio)', () => {
    expect(confirmationText()).toBe(`${BRAND}: Reply YES to get text deals (unlisted pieces, photo + details + price, often at scrap or just above). Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.`);
    expect(confirmationText('en')).toBe(confirmationText());
    expect(optInReplyText('en')).toBe(`${BRAND}: You're in. Text deals (photos of unlisted pieces with details and price) will come from this number a few times a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`);
    expect(soldNoticeText(null)).toBe(`${DEFAULT_SOLD_REPLY} ${STOP_LINE}`);
    expect(withStopLine('Hi')).toBe(`Hi ${STOP_LINE}`);
  });

  it('every Spanish text keeps STOP / HELP as the words to type (Twilio acts on them), once', () => {
    for (const text of [confirmationText('es'), optInReplyText('es'), helpText('es'), winnerText({ title: 'Anillo', price: '$100' }, 'es'), soldNoticeText(null, 'es')]) {
      expect(text.startsWith(`${BRAND}`)).toBe(true);
      expect(text.match(/STOP/g)?.length).toBe(1);
      expect(text).not.toMatch(/ship|envío|enviamos/i);
    }
    expect(confirmationText('es')).toContain('Responda SÍ');
    expect(optInReplyText('es')).toContain('Ya está inscrito');
    expect(soldNoticeText(null, 'es')).toBe(`${DEFAULT_SOLD_REPLY_ES} ${STOP_LINE_ES}`);
    expect(winnerText({ title: 'Cadena tipo cuerda · Oro amarillo 14K', price: '$1,460' }, 'es'))
      .toBe(`${BRAND}: ¡Es suya! - Cadena tipo cuerda · Oro amarillo 14K - $1,460. Le escribiremos en breve para coordinar la recogida en nuestra tienda de Naples. ¡Gracias! ${STOP_LINE_ES}`);
    // An owner line that already says STOP (either language) is not given a second one.
    expect(withStopLine('Ya se vendió. Responda STOP para cancelar.', 'es')).toBe('Ya se vendió. Responda STOP para cancelar.');
    expect(spanishOptOutText()).toContain('responda SÍ');
  });

  it('"Sí" confirms; ALTO / PARAR / CANCELAR stop; AYUDA asks for help; a sentence is still a reply', () => {
    for (const word of ['Sí', 'si', 'SI!', 'yes']) expect(classifyInbound(word)).toBe('confirm');
    for (const word of ['ALTO', 'Parar', 'cancelar.', 'detener', '¡Alto!', 'darme de baja']) {
      expect(classifyInbound(word)).toBe('stop');
      expect(isSpanishKeyword(word)).toBe(true);
    }
    expect(classifyInbound('AYUDA')).toBe('help');
    expect(isSpanishKeyword('ayuda')).toBe(true);
    // Twilio answers the English words itself — the site stays quiet on those.
    for (const word of ['STOP', 'cancel', 'help']) expect(isSpanishKeyword(word)).toBe(false);
    expect(classifyInbound('La quiero')).toBe('reply');
    expect(classifyInbound('alto precio?')).toBe('reply');
  });

  it('the owner\'s forward is tagged (ES) for a Spanish subscriber, and only then', () => {
    const base = { fromPhone: '+12395550172', name: 'Luis H.', dealTitle: 'Rope chain', body: 'La quiero', isFirst: true };
    expect(forwardText({ ...base, spanish: true })).toBe('Luis H. (239) 555-0172 (ES) on "Rope chain" [1st]: La quiero');
    expect(forwardText(base)).toBe('Luis H. (239) 555-0172 on "Rope chain" [1st]: La quiero');
  });

  it('the "spoken for" line: the owner\'s words in each language, or the default', () => {
    expect(soldReplyFor('en', null, 'X')).toBe(DEFAULT_SOLD_REPLY);
    expect(soldReplyFor('es', 'Gone', null)).toBe(DEFAULT_SOLD_REPLY_ES);
    expect(soldReplyFor('es', 'Gone', '  Ya se fue  ')).toBe('Ya se fue');
    expect(textLanguage('es')).toBe('es');
    expect(textLanguage('EN')).toBe('en');
    expect(textLanguage(null)).toBe('en');
  });
});

describe('a deal in Spanish (layout B, Spanish labels)', () => {
  const copy = {
    item: 'Cadena tipo cuerda · 18.4 g',
    metal: 'Oro amarillo 14K',
    size: '22 pulg.',
    comparable: '$2,400',
    price: '$1,460',
    description: 'Cuerda sólida y pesada.',
    message: DEFAULT_DEAL_MESSAGE_ES,
  };

  it('reads as drawn on the mockup', () => {
    expect(dealText(copy, 'es')).toBe([
      `${BRAND} - Oferta por texto`,
      '',
      'Artículo: Cadena tipo cuerda · 18.4 g',
      'Metal: Oro amarillo 14K',
      'Medida: 22 pulg.',
      'Precio comparable al detalle: $2,400',
      'Nuestro precio: $1,460',
      '',
      'Cuerda sólida y pesada.',
      '',
      DEFAULT_DEAL_MESSAGE_ES,
      STOP_LINE_ES,
    ].join('\n'));
    expect(DEFAULT_DEAL_MESSAGE_ES).not.toMatch(/env[ií]/i);
  });

  it('the English deal text is unchanged', () => {
    expect(dealText({ item: 'Ring', price: '$100', message: 'Hi' })).toBe(`${BRAND} - Text Deal\n\nItem: Ring\nOur price: $100\n\nHi\n${STOP_LINE}`);
  });

  it('metal in Spanish order; every metal has a Spanish name; empty Spanish boxes fall back to English', () => {
    for (const metal of DEAL_METALS) expect(DEAL_METALS_ES[metal]).toBeTruthy();
    expect(dealMetalLabelEs({ title: '', price_text: '', metal: 'Yellow Gold', purity: '14K' })).toBe('Oro amarillo 14K');
    expect(dealMetalLabelEs({ title: '', price_text: '', metal: 'Sterling Silver', purity: '925' })).toBe('Plata de ley 925');
    expect(dealMetalLabelEs({ title: '', price_text: '', metal: 'none', purity: '18K' })).toBe('18K');
    expect(dealMetalLabelEs({ title: '', price_text: '', metal: 'none', purity: 'none' })).toBe('');
    const deal = { title: 'Rope chain · 18.4 g', price_text: '$1,460', metal: 'Yellow Gold', purity: '14K', size_text: '22 in' };
    expect(dealTitleEs(deal)).toBe('Rope chain · 18.4 g');
    expect(dealSizeLabelEs(deal)).toBe('22 in');
    expect(dealLineEs({ ...deal, title_es: 'Cadena tipo cuerda · 18.4 g', size_text_es: '22 pulg.' })).toBe('Cadena tipo cuerda · 18.4 g · Oro amarillo 14K · 22 pulg.');
    // The closing: the Spanish box, else the built-in Spanish one for the standard closing, else the English words.
    expect(dealMessageEs({ message: DEFAULT_DEAL_MESSAGE, message_es: '' })).toBe(DEFAULT_DEAL_MESSAGE_ES);
    expect(dealMessageEs({ message: 'Two left!', message_es: null })).toBe('Two left!');
    expect(dealMessageEs({ message: 'Two left!', message_es: '¡Quedan dos!' })).toBe('¡Quedan dos!');
  });

  it('the Spanish boxes: same limits; only written once the SQL has run', () => {
    expect(normalizeDealSpanish({ title: 'x' })).toEqual({ value: null });
    const ok = normalizeDealSpanish({ title_es: '  Anillo  ', size_text_es: '', description_es: 'a\r\n\r\n\r\nb', message_es: 'Hola' });
    expect(ok).toEqual({ value: { title_es: 'Anillo', size_text_es: '', description_es: 'a\n\nb', message_es: 'Hola' } });
    expect(normalizeDealSpanish({ title_es: 'x'.repeat(81) })).toHaveProperty('error');
    expect(normalizeDealSpanish({ message_es: 'x'.repeat(301) })).toHaveProperty('error');
    const value = 'value' in ok ? ok.value : null;
    expect(dealSpanishColumns(value, { title: 'x' })).toEqual({});
    expect(dealSpanishColumns(value, { title_es: '' })).toEqual(value);
    expect(dealSpanishColumns(null, { title_es: '' })).toEqual({});
  });

  it('translates when empty or forced; keeps the owner\'s corrections; flags them when the English changed (owner "2A")', () => {
    const base = { hasSpanish: true, sourceHash: 'A', storedSourceHash: 'A', spanishHash: 'S', machineHash: 'S', force: false };
    expect(spanishTranslationPlan({ ...base, hasSpanish: false })).toBe('translate');
    expect(spanishTranslationPlan({ ...base, force: true })).toBe('translate');
    expect(spanishTranslationPlan(base)).toBe('keep');
    // English changed, Spanish still the machine's → translate again.
    expect(spanishTranslationPlan({ ...base, sourceHash: 'B' })).toBe('translate');
    // English changed, the owner corrected the Spanish → kept, flagged.
    expect(spanishTranslationPlan({ ...base, sourceHash: 'B', spanishHash: 'edited' })).toBe('stale');
    // Typed by hand with no machine translation on record → never overwritten.
    expect(spanishTranslationPlan({ ...base, storedSourceHash: null, machineHash: null })).toBe('stale');
  });
});

describe('the Spanish pictures (owner "1B")', () => {
  it('a photo change clears them with the English ones; they are sent only when complete', () => {
    expect(dealPhotoUpdate(['a', 'b'], true, true)).toEqual({ photo_path: 'a', card_path: null, detail_photo_paths: ['b'], detail_media_paths: [], card_path_es: null, detail_media_paths_es: [] });
    expect(dealPhotoUpdate(['a'], false)).toEqual({ photo_path: 'a', card_path: null });
    const deal = { photo_path: 'a', detail_photo_paths: ['b', 'c'], card_path: 'card.jpg', detail_media_paths: ['d1', 'd2'] };
    expect(dealMediaPathsEs({ ...deal, card_path_es: 'card-es.jpg', detail_media_paths_es: ['e1', 'e2'] })).toEqual(['card-es.jpg', 'e1', 'e2']);
    expect(dealMediaPathsEs({ ...deal, card_path_es: 'card-es.jpg', detail_media_paths_es: ['e1'] })).toBeNull();
    expect(dealMediaPathsEs(deal)).toBeNull();
  });

  it('the sender falls back to the English pictures, and the storage clean-up knows the Spanish ones', () => {
    const deals = read('lib/text-alerts/deals.ts');
    expect(deals).toMatch(/export function dealMediaUrlsFor[\s\S]*?if \(language === 'es'\) \{[\s\S]*?return dealMediaUrls\(service, deal\);/);
    expect(deals).toContain("const picturesEs = dealHasSpanishColumns(deal) ? await renderSet('es') : null;");
    expect(deals).toContain('row.card_path_es,');
    const gc = read('app/api/admin/storage-gc/route.ts');
    expect(gc).toContain('referencedPaths.add(row.card_path_es)');
    expect(gc).toContain('asStringArray(row.detail_media_paths_es)');
  });
});

describe('sending: each person in their own language', () => {
  it('a deal send picks the version per subscriber; a failed translation never stops it', () => {
    const deals = read('lib/text-alerts/deals.ts');
    expect(deals).toContain(".select('id, phone_e164, locale')");
    expect(deals).toContain('const { body, mediaUrls } = versions[language];');
    expect(deals).toMatch(/export async function ensureDealSpanishWords[\s\S]*?catch \(err\) \{[\s\S]*?return \{ deal, translated: false, stale: false, error: message \};/);
    expect(deals).toContain('if (anySpanish) deal = (await ensureDealSpanishWords(service, deal)).deal;');
  });

  it('the confirmation, the YES reply, the sold line and the Spanish stop answer use the subscriber\'s language', () => {
    const inbound = read('lib/text-alerts/inbound.ts');
    expect(inbound).toContain(".select('id, full_name, sms_status, sms_last_deal_id, locale')");
    expect(inbound).toContain('twiml(spanishOptOutText())');
    expect(inbound).toContain("twiml(helpText('es'))");
    expect(inbound).toContain("spanish: language === 'es'");
    const confirmations = read('lib/text-alerts/confirmations.ts');
    expect(confirmations).toContain("'id, phone_e164, sms_status, sms_confirmation_attempts, locale'");
  });

  it('the Join window sends the language it shows; Admin add / edit send the switch', () => {
    const route = read('app/api/admin/subscribers/route.ts');
    expect(route).toContain('subscriber_locale: input.language,');
    expect(route).toContain('locale: language,');
    expect(route).toContain('if (language) update.locale = language;');
    const manager = read('components/admin/SubscribersManager.tsx');
    expect(manager).toContain("...(changes.languageChanged ? { language: editForm.language } : {}),");
    expect(manager).toContain('language: addForm.language,');
  });

  it('the email send stores and sends the Spanish version; empty = English for everyone (owner "3A")', () => {
    const send = read('app/api/admin/marketing/send/route.ts');
    expect(send).toContain('const spanish = subjectEs && htmlEs ? { subject: subjectEs, html: htmlEs } : null;');
    expect(send).toContain('spanish,\n    });');
    const marketing = read('lib/marketing.ts');
    expect(marketing).toContain('const version = campaignVersionFor(recipient, { subject, html }, spanish);');
    expect(marketing).toContain('withMarketingFooter(version.html, unsubscribeUrl, settings.mailingAddress, version.language)');
  });

  it('the SQL adds every column the app writes, and keeps the tables service-role only', () => {
    const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'spanish-subscribers-2026-11.sql'), 'utf8');
    for (const column of ['title_es', 'size_text_es', 'description_es', 'message_es', 'sold_reply_text_es', 'card_path_es', 'detail_media_paths_es', 'es_source_hash', 'es_machine_hash', 'subject_es', 'html_es']) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}\\s`));
    }
    expect(sql).toContain("check (locale in ('en', 'es'))");
    expect(sql).not.toMatch(/grant .* to (anon|authenticated)/i);
  });
});

describe('the translations (Anthropic, mocked)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  function stubAnthropic(json: unknown) {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_TRANSLATE_MODEL = 'test-model';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('a deal: only the boxes the owner filled come back, cut to the box limits', async () => {
    const fetchMock = stubAnthropic({ title_es: 'Cadena', size_text_es: 'NO', description_es: 'x'.repeat(2000), message_es: 'Hola' });
    const out = await translateDealWordsToSpanish({ title: 'Chain', size_text: '', description: 'Heavy', message: 'Hi' });
    expect(out).toEqual({ title_es: 'Cadena', size_text_es: '', description_es: 'x'.repeat(1000), message_es: 'Hola' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.system[0].text).toContain('usted');
    expect(body.system[0].text).toContain('Never add information (no shipping');
  });

  it('an email: subject + HTML; refuses one too long to translate; says why when not set up', async () => {
    stubAnthropic({ subject_es: 'Hola', html_es: '<p>Hola</p>' });
    await expect(translateEmailToSpanish({ subject: 'Hi', html: '<p>Hi</p>' })).resolves.toEqual({ subject_es: 'Hola', html_es: '<p>Hola</p>' });
    await expect(translateEmailToSpanish({ subject: 'Hi', html: 'x'.repeat(EMAIL_TRANSLATE_MAX_HTML + 1) })).rejects.toThrow(/too long/);
    process.env.AI_PROVIDER = 'openai';
    await expect(translateEmailToSpanish({ subject: 'Hi', html: '<p>Hi</p>' })).rejects.toThrow(/Anthropic/);
  });
});

describe('the inquiry confirmation email (2026-11-22 (3))', () => {
  it('English is byte-identical to before; only an exact "es" is Spanish', () => {
    expect(inquiryLanguage('es')).toBe('es');
    expect(inquiryLanguage(' ES ')).toBe('es');
    expect(inquiryLanguage(undefined)).toBe('en');
    expect(inquiryLanguage(null)).toBe('en');
    expect(inquiryLanguage('fr')).toBe('en');
    const en = inquiryConfirmationEmail('Free Evaluation Request', 'Ana <b>', 'en');
    expect(en.subject).toBe('We received your inquiry about: Free Evaluation Request');
    expect(en.html).toBe(`<p>Hi Ana &lt;b&gt;,</p>
               <p>Thank you for your interest in <strong>Free Evaluation Request</strong>. We will be in touch with you shortly.</p>
               <p>For urgent questions, call us at <a href="tel:2394048505">(239) 404-8505</a>.</p>
               <p>— Naples Estate Jewelry</p>`);
  });

  it('Spanish: the lead forms get a Spanish title; a shop item keeps its own name', () => {
    const lead = inquiryConfirmationEmail('Free Evaluation Request', 'Ana', 'es');
    expect(lead.subject).toBe('Recibimos su consulta sobre: Solicitud de evaluación gratuita');
    expect(lead.html).toContain('<p>Hola Ana,</p>');
    expect(lead.html).toContain('(239) 404-8505');
    expect(inquiryConfirmationEmail('Sell by Mail Request', 'Ana', 'es').subject).toContain('Solicitud de venta por correo');
    expect(inquiryConfirmationEmail('Cadena de oro 14K', 'Ana', 'es').subject).toBe('Recibimos su consulta sobre: Cadena de oro 14K');
  });

  it('both forms send their language and both route paths read it', () => {
    expect(read('components/free-evaluation/EvalForm.tsx')).toContain("fd.append('locale', isEs ? 'es' : 'en')");
    expect(read('components/contact/InquiryForm.tsx')).toContain("locale: isEs ? 'es' : 'en'");
    const route = read('app/api/inquire/route.ts');
    expect(route).toContain('inquiryLanguage(raw.locale)');
    expect(route).toContain("inquiryLanguage(form.get('locale'))");
    expect(route).not.toContain('We received your inquiry');
  });
});
