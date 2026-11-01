// Curated customer testimonials — the single source for every surface that
// shows reviews (homepage section, product-page band). These are REAL Google
// reviews, quoted verbatim with the reviewer's public first/last name exactly
// as shown on Google; the Spanish strings are our translations of the same
// reviews. Never invent, embellish, or paraphrase a quote: add new entries
// only by pasting a real review's text.
//
// ⚠️ ONE ENTRY INVERTS THAT PAIRING. Mayelin Pérez wrote in Spanish, so her
// `quoteEs` is the verbatim original and her `quote` is the translation. The
// rule is "the reviewer's own language is the verbatim side", not "English is".
// Google's card shows a machine translation by default with a "See original"
// control beneath it; always publish what that control reveals.
//
// ⛔ EVERY ENTRY MUST STILL EXIST ON THE LIVE PROFILE. Each card renders a
// "Read on Google" link to GOOGLE_REVIEWS_URL, so a quote that is no longer
// there sends the reader to look for something they will not find. Two entries
// (Nolan Olivier, Onur) were removed on 2026-08-19 for exactly this: they were
// real reviews on the owner's ORIGINAL Business Profile, which he accidentally
// deleted and rebuilt, and they did not survive it. Genuine, and unverifiable —
// which on a page that invites verification is the same problem as invented.
//
// This list is therefore reconciled AGAINST the profile, not just appended to.
// When re-reading it, drop entries that have vanished and refresh ones whose
// text has changed (Yisel Perez re-reviewed on the new profile; her entry
// carries the new words).
//
// To add a review: append an object below — every surface updates together.

/**
 * Public Google Business Profile — the destination for every review card.
 * One constant because both surfaces that render reviews link to it; a second
 * copy would eventually point somewhere else.
 *
 * This is Google's `share.google` short form, supplied by the owner. It is an
 * opaque redirect, so nothing here can validate it — if the cards ever land
 * somewhere wrong, this line is the only thing to change.
 */
export const GOOGLE_REVIEWS_URL = 'https://share.google/KAE0mjQwhKx9EqEZ1';

export interface Testimonial {
  /** Reviewer's public name as displayed on Google. */
  name: string;
  quote: string;
  quoteEs: string;
  /** Attribution context, e.g. "Google review". */
  meta: string;
  metaEs: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    // ⚠️ Her review was RE-READ from the live profile on 2026-08-19 and replaced.
    // The previous quote here ("Working with this company was an excellent
    // experience…") came from the owner's ORIGINAL Google Business Profile,
    // which he accidentally deleted and rebuilt from scratch. That text no
    // longer exists anywhere; Yisel reviewed the business again on the new
    // profile, and this is what she wrote. Keeping the old words under her name
    // would have sent anyone who clicked "Read on Google" to a review that says
    // something else — indistinguishable, from the outside, from a fabricated
    // quote.
    //
    // "facebook" is lower-cased as she posted it.
    name: 'Yisel Perez',
    quote:
      'I had a couple of jewelry pieces I wanted to sell, I reached out to many different people and companies but their offer was too low. I found Chris with Naples Estate Jewelry one day casually on facebook and his offer was the highest one! Thank you so much for walking me through the whole process, great experience for sure. Highly recommend this business.',
    quoteEs:
      'Tenía un par de piezas de joyería que quería vender, contacté a muchas personas y empresas diferentes pero su oferta era demasiado baja. ¡Encontré a Chris de Naples Estate Jewelry un día casualmente en facebook y su oferta fue la más alta! Muchas gracias por guiarme durante todo el proceso, sin duda una gran experiencia. Recomiendo mucho este negocio.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Cristian Reatiga',
    // Quoted exactly as posted, trailing emoji included — the rule above is
    // verbatim, and stripping them would be editing a customer's words.
    quote:
      'Beautiful chain for an awesome price! The shipping was also super fast, will be keeping this chain for a long time🔥👍',
    quoteEs:
      '¡Hermosa cadena a un precio increíble! El envío también fue súper rápido, voy a conservar esta cadena por mucho tiempo🔥👍',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },

  // --- Added 2026-08-18, read from the live Google Business Profile ----------
  // Taken from the profile's own review list (16 reviews, 5.0 average) with the
  // "More" expander opened on every card, so these are full text and not
  // Google's collapsed preview.
  //
  // ⚠️ Quoted verbatim INCLUDING the spelling and grammar as posted: Max's
  // "Jewelery", Vasanth's "he have lots of collection", and the double space in
  // Scott's "pricing.  After". Those are not typos to fix — the rule at the top
  // of this file is verbatim, and a corrected quote is an invented one.
  {
    name: 'Mine Cervantes',
    quote:
      'Thank you Naples Estate Jewelry for making this such an easy experience for me. I’m 80 and honestly I was scared of getting scammed. Chris was so patient, explained everything to me, and made me feel comfortable from the start. I’m very grateful for his honesty and kindness. It’s nice to know there are still good people you can trust. Thank you, Chris!',
    quoteEs:
      'Gracias a Naples Estate Jewelry por hacer de esto una experiencia tan sencilla para mí. Tengo 80 años y, sinceramente, tenía miedo de que me estafaran. Chris fue muy paciente, me explicó todo y me hizo sentir cómoda desde el principio. Estoy muy agradecida por su honestidad y su amabilidad. Es bueno saber que todavía hay buenas personas en quienes se puede confiar. ¡Gracias, Chris!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Max Kolegue',
    quote:
      'Naples Estate Jewelery is a high touch establishment! I was interested in a new piece they had just brought in I saw on their Instagram. The entire buying process from initial outreach to purchase was seamless. I left wondering why more businesses don’t treat you like NEJ does. Would highly recommend!',
    quoteEs:
      '¡Naples Estate Jewelry es un establecimiento de primer nivel! Me interesó una pieza nueva que acababan de recibir y que vi en su Instagram. Todo el proceso de compra, desde el primer contacto hasta la adquisición, fue impecable. Me fui preguntándome por qué más negocios no tratan a uno como lo hace NEJ. ¡Muy recomendable!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Scott Tallent',
    quote:
      'Chris was very professional and upfront with his pricing.  After trying 3 other buyers, Chris gave us the best deal by far!',
    quoteEs:
      'Chris fue muy profesional y transparente con sus precios. Después de probar con otros tres compradores, ¡Chris nos dio la mejor oferta con diferencia!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Gerald Nestico',
    quote:
      'Highly recommend! I appreciate the time Chris took with me when selling my jewelry and felt very comfortable when dealing with him. Thank you so much! Will look to you again in the future if I am looking to purchase!',
    quoteEs:
      '¡Muy recomendable! Agradezco el tiempo que Chris me dedicó cuando vendí mi joyería y me sentí muy cómodo tratando con él. ¡Muchas gracias! Volveré a buscarlos en el futuro si quiero comprar algo.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Nathan Pablik',
    quote:
      'Chris is exceptionally knowledgeable in all areas of jewelry! He helped me get situated with pricing, delivery, and knowledge in gold. Highly recommend!',
    quoteEs:
      '¡Chris tiene un conocimiento excepcional en todas las áreas de la joyería! Me ayudó con los precios, la entrega y a entender mejor el oro. ¡Muy recomendable!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Judith Lam',
    quote:
      'Chris is amazing! He is very knowledgeable and understanding. I feel he is honest and trustworthy.',
    quoteEs:
      '¡Chris es increíble! Sabe muchísimo y es muy comprensivo. Siento que es honesto y de confianza.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Vasanth Gunasekaran',
    quote: 'The owner Chris was very nice and friendly, he have lots of collection',
    quoteEs: 'El dueño, Chris, fue muy amable y agradable, y tiene una gran colección',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Douglas Mitchell',
    // Google's UI shows a trailing "…" after the emoji on this card. That is
    // its own collapse marker, not Douglas's text — confirmed by the card
    // having no "More" expander to open. Do not paste the ellipsis in.
    quote: 'Dude knows his stuff knowledgeable and professional 👍',
    quoteEs: 'Este hombre sabe lo que hace, con mucho conocimiento y profesionalismo 👍',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Linda Cusumano',
    // ⚠️ THE ONE ENTRY ON THIS PAGE THAT IS NOT VERBATIM, and the exception is
    // deliberate. Her review on Google ends with a stray line — "Hi baby" — on
    // its own, after "Local. Honest. Professional." It is genuinely inside the
    // review body, not a UI artifact: verified 2026-08-18 in the owner's own
    // Reviews panel with the full text expanded.
    //
    // The standing rule is verbatim-or-not-at-all (DECISIONS, "A review is
    // published verbatim or not at all"), and the plan of record was to ask her
    // to remove the line herself. The OWNER decided on 2026-08-19 to publish it
    // without that line instead, after being shown the exact text and told
    // plainly that this attributes edited words to a named real person.
    //
    // Nothing else is altered — wording, punctuation and the clipped
    // "cannot say enough Chris Surette" are all exactly as posted.
    //
    // ⛔ Do NOT treat this comment as licence to trim other reviews. It is one
    // owner-authorised exception, not a new policy. If Linda edits her review
    // on Google, replace this quote with the real text and delete this note.
    quote:
      'My husband and I cannot say enough Chris Surette with Naples Estate Jewelry. Chris went through two boxes of silver flatware. We were offered a check, or told to take it if we wanted to shop around more. The cash paid for our good sterling was more than fair. We would highly recommend Chris and Naples Estate Jewelry. Local. Honest. Professional.',
    quoteEs:
      'Mi esposo y yo no podemos decir suficiente sobre Chris Surette de Naples Estate Jewelry. Chris revisó dos cajas de cubertería de plata. Nos ofrecieron un cheque, o nos dijeron que podíamos llevárnosla si queríamos seguir buscando. El efectivo que pagó por nuestra buena plata esterlina fue más que justo. Recomendamos mucho a Chris y a Naples Estate Jewelry. Local. Honesto. Profesional.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },

  // --- Added 2026-08-19, read from the live Google Business Profile ----------
  // The profile's full list was loaded (16 reviews, 5.0) by scrolling the
  // Reviews pane until the count stopped growing, and every "More" expander was
  // opened, so these are full text rather than Google's collapsed preview.
  //
  // ⚠️ Verbatim INCLUDING what looks like a mistake: Ryan's "weary" (for
  // "wary") and Edna's missing space in "pressured.I really". Those are not
  // typos to fix — a corrected quote is an invented one. The Spanish
  // translations render the intended meaning, which is what a translation is.
  {
    name: 'Ruthe Lloyd',
    quote: 'Chris is honest and completely trustworthy, he is a pleasure to do business with!',
    quoteEs: '¡Chris es honesto y completamente confiable, es un placer hacer negocios con él!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Ariel Babastro',
    quote:
      'What a pleasure it was working with Chris! I was looking for a trustworthy company to sell some of my jewelry because I needed the money for a down payment. I had received a few offers from other places, but they were much lower than I expected.\n\nI found Naples Estate Jewelry, and I’m so glad I did! Chris was incredibly patient, kind, and easy to work with, especially since English is not my first language. He took the time to explain everything and made me feel very comfortable throughout the whole process.\n\nHis offer was the best one I received, and he actually paid me more than I was expecting! I couldn’t be happier with my experience. Thank you so much, Chris! I will definitely be coming back to do more business with you guys. Highly recommend Naples Estate Jewelry!',
    quoteEs:
      '¡Qué placer fue trabajar con Chris! Buscaba una empresa de confianza para vender algunas de mis joyas porque necesitaba el dinero para un pago inicial. Había recibido algunas ofertas de otros lugares, pero eran mucho más bajas de lo que esperaba.\n\n¡Encontré Naples Estate Jewelry y me alegro muchísimo de haberlo hecho! Chris fue increíblemente paciente, amable y fácil de tratar, sobre todo porque el inglés no es mi primer idioma. Se tomó el tiempo de explicarme todo y me hizo sentir muy cómoda durante todo el proceso.\n\n¡Su oferta fue la mejor que recibí, y de hecho me pagó más de lo que esperaba! No podría estar más feliz con mi experiencia. ¡Muchísimas gracias, Chris! Sin duda volveré para hacer más negocios con ustedes. ¡Recomiendo mucho Naples Estate Jewelry!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Ryan Smith',
    quote:
      'I worked with Chris and had an amazing experience. I was kinda weary buying gold but I wanted something special for my son. He’s now the proud owner of a beautiful gold chain with the perfect Italian horn charm. I’m psyched for him but also happy that I know it’s real gold and will carry its value in the future.',
    quoteEs:
      'Trabajé con Chris y tuve una experiencia increíble. Estaba un poco receloso de comprar oro, pero quería algo especial para mi hijo. Ahora él es el orgulloso dueño de una hermosa cadena de oro con el dije de cuerno italiano perfecto. Estoy entusiasmado por él y también contento de saber que es oro de verdad y que mantendrá su valor en el futuro.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Edna Cavazos',
    quote:
      'Chris met up with me and I had a great experience. He took the time to carefully examine my silver-plated items and explained what they were, their condition, and what they might be worth. Even though we didn’t end up making a deal, he was honest, professional, and never made me feel pressured.I really appreciated how knowledgeable, patient, and accommodating he was. I left feeling much more informed than when I arrived, and I truly appreciated his generosity with his time and expertise.',
    quoteEs:
      'Chris se reunió conmigo y tuve una gran experiencia. Se tomó el tiempo de examinar cuidadosamente mis artículos plateados y me explicó qué eran, en qué estado estaban y cuánto podrían valer. Aunque al final no cerramos un trato, fue honesto, profesional y nunca me hizo sentir presionada. Realmente aprecié lo bien informado, paciente y atento que fue. Me fui sintiéndome mucho más informada que cuando llegué, y de verdad aprecié su generosidad con su tiempo y su experiencia.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    // ⚠️ THE ONE REVIEW WRITTEN IN SPANISH. The direction of the pair is
    // therefore INVERTED here: `quoteEs` is her ORIGINAL text, verbatim, and
    // `quote` is our English translation. Google's own card shows a machine
    // translation with "See original (Spanish)" beneath it; the original was
    // read from that control, not from the translation.
    //
    // ⚠️ "Naples estate jewelry" is lower-cased in her original. Left exactly
    // as posted — the Spanish side is the verbatim one on this entry.
    name: 'Mayelin Pérez',
    quote:
      'I had these gold pieces that I practically didn’t wear anymore, and I had also lost one of the rings, so I started looking for people who might want to buy them. Chris offered me a good price that I couldn’t turn down, because I had contacted two other people before and they were offering me much less than half of what Chris with Naples Estate Jewelry offered me. Thank you so much for everything, and I’ll be in touch soon because my mom also wants to sell some of her things.',
    quoteEs:
      'Tenía estas piezas de oro que prácticamente ya no las usaba, también había perdido una de las argollas y empecé a buscar personas que las quisieran comprar. Chris me ofreció un buen precio que no pude rechazar porque había contactado dos personas antes y me ofrecían mucho menos de la mitad que me ofreció Chris con Naples estate jewelry. Muchas gracias por todo y pronto les contactaré porque mi mamá también quiere vender algunas de sus cosas.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  // ── Added 2026-08-28. Read verbatim from the live profile (22 reviews at the
  // time); the site was 6 behind. Typos and spacing are the reviewers' own —
  // the verbatim rule at the top of this file forbids tidying them.
  {
    name: 'Joseph Roth',
    // ⚠️ 'knowledge.and', 'I have know', and 'cme' are exactly as posted.
    quote:
      'Chris has the utmost integrity, superior knowledge.and a pleasure to work with. I have know for years as an auction house manager and felt completely at ease with the experience, working with him as a client for 8 years. I still cme to Naples to visit.',
    quoteEs:
      'Chris tiene la máxima integridad, un conocimiento superior y es un placer trabajar con él. Lo conozco desde hace años como gerente de una casa de subastas y me sentí completamente cómodo con la experiencia, trabajando con él como cliente durante 8 años. Todavía vengo a Naples de visita.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Bill Boleyn',
    quote:
      'Chris helped us every step of the way with the acquisition of a portion of our estate silver. He is most knowledgeable of every aspect of this subject matter. He offered us a much better deal than others in his profession in Naples were willing to consider. We will certainly use him again for other assets we wish to sell. We highly recommend his services.',
    quoteEs:
      'Chris nos ayudó en cada paso con la adquisición de una parte de nuestra plata patrimonial. Conoce a fondo todos los aspectos de este tema. Nos ofreció un trato mucho mejor del que otros de su profesión en Naples estaban dispuestos a considerar. Sin duda volveremos a recurrir a él para otros bienes que deseemos vender. Recomendamos mucho sus servicios.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Otis Leknug',
    quote:
      'Chris is very helpful in explaining different aspects of silver to you. Very fair in his pricing and accommodative in meeting to look at your items.',
    quoteEs:
      'Chris es muy servicial al explicarle los diferentes aspectos de la plata. Muy justo en sus precios y flexible para reunirse a ver sus artículos.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Danna Simmons',
    quote:
      'Awesome guy. Explained everything he was doing as we went along. Very satisfied. Will come back.',
    quoteEs:
      'Un tipo excelente. Explicó todo lo que hacía a medida que avanzábamos. Muy satisfecha. Volveré.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Stephen Nguyen',
    quote:
      'Very honest seller. 100% recommend for all your jewelry needs',
    quoteEs:
      'Vendedor muy honesto. Lo recomiendo al 100% para todas sus necesidades de joyería',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Krish Pr',
    quote:
      'Phenomenal service and unbeatable prices. Just visit in the area',
    quoteEs:
      'Servicio fenomenal y precios inmejorables. Solo visite la zona',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },

  // ── 2026-11-01: the 29 reviews that were on the live profile but not here
  // (owner: "bring in more of our reviews from the GBP"). Copied from Google
  // Maps that day — every one 5 stars, none machine-translated, all English.
  // Verbatim, typos included ("Chis", "Ypu", "Differently would recommend",
  // "upmost"); multi-paragraph reviews are joined with single spaces (line
  // breaks only — no word changed). Spanish = our translation.
  {
    name: 'Lan Kremkau',
    quote:
      'Chris is absolutely amazing. Took my call on a Sunday really spent time with me to help me understand what I had and by far had the best offer of anyone. Will use him exclusively for all my items moving forward',
    quoteEs:
      'Chris es absolutamente increíble. Atendió mi llamada un domingo, realmente dedicó tiempo a ayudarme a entender lo que tenía y, por mucho, me hizo la mejor oferta de todos. De ahora en adelante lo usaré exclusivamente para todas mis piezas',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Marlene Finberg',
    quote:
      'Great experience. Sold a bunch of sterling silver jewelry here. Shopped around and got by far the highest price from Naples Estate Jewelry. Chris was a pleasure to deal with and helped explain everything along the way.',
    quoteEs:
      'Gran experiencia. Vendí un montón de joyería de plata esterlina aquí. Comparé precios y, por mucho, Naples Estate Jewelry me dio el precio más alto. Fue un placer tratar con Chris y me explicó todo en cada paso.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Carleigh Pace',
    quote:
      'Chris is so sweet and runs an amazing business! I highly recommend! I went to many places to sell my rings and Chris was the kindest and friendliest person I dealt with. I also love that he supports other locals and businesses! You will not be disappointed doing business here.',
    quoteEs:
      '¡Chris es muy amable y tiene un negocio increíble! ¡Lo recomiendo mucho! Fui a muchos lugares para vender mis anillos y Chris fue la persona más amable y cordial con la que traté. ¡También me encanta que apoye a otros negocios y personas de la zona! No se decepcionará haciendo negocios aquí.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Olsi Arqimandriti',
    quote:
      'Very happy doing business with Chris, very knowledgeable and very fair gold prices. I would definitely come back and continue doing business here.',
    quoteEs:
      'Muy contento de hacer negocios con Chris, muy conocedor y con precios del oro muy justos. Sin duda volvería y seguiría haciendo negocios aquí.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'John P',
    quote:
      'A true 5-Star experience! Chris at Naples Estate Jewelry is the best! We experienced a great transaction and would highly recommend this gentleman. Knowledgeable, courteous, and trustworthy - many traits we unfortunately don’t bump into very often these days. We would not hesitate to do business here again. John P Fort Myers',
    quoteEs:
      '¡Una verdadera experiencia de 5 estrellas! ¡Chris, de Naples Estate Jewelry, es el mejor! Tuvimos una gran transacción y recomendamos mucho a este caballero. Conocedor, cortés y confiable: cualidades que, por desgracia, no se encuentran muy a menudo hoy en día. No dudaríamos en volver a hacer negocios aquí. John P, Fort Myers',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Karen Corriveau',
    quote:
      'Brought some items for Chris to look at, he was extremely knowledgeable and kind. I highly recommend checking with him before you go anywhere else!',
    quoteEs:
      'Le traje algunas piezas a Chris para que las viera; fue sumamente conocedor y amable. ¡Recomiendo mucho consultarlo a él antes de ir a cualquier otro lugar!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Denise Holman',
    quote:
      'Best place in Naples!! Chris is very knowledgeable and honest. Great place to do business. Thanks so much for your help.',
    quoteEs:
      '¡¡El mejor lugar de Naples!! Chris es muy conocedor y honesto. Un gran lugar para hacer negocios. Muchas gracias por su ayuda.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Evie Glick',
    quote:
      'I had the pleasure of meeting Chris at Naples estate jewelry on Shirley Street. Very professional, very helpful and I would suggest anyone looking to sell jewelry or gold visit this fine establishment.',
    quoteEs:
      'Tuve el placer de conocer a Chris en Naples Estate Jewelry, en Shirley Street. Muy profesional, muy servicial, y le sugeriría a cualquiera que quiera vender joyería u oro que visite este excelente establecimiento.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Jo',
    quote: 'Very nice experience and great knowledge Differently would recommend',
    quoteEs: 'Una experiencia muy agradable y un gran conocimiento. Sin duda lo recomendaría',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Jakin Wilson',
    quote: 'Quick and fair appraisal of my silver. A pleasure to work with.',
    quoteEs: 'Una tasación rápida y justa de mi plata. Un placer trabajar con él.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Eliana Serra',
    quote: 'Excellent service and very professional.',
    quoteEs: 'Excelente servicio y muy profesional.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Jeremy Adams',
    quote: 'Best in the business, honestly',
    quoteEs: 'El mejor del negocio, de verdad',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Zilmuchi',
    quote:
      '⭐⭐⭐⭐⭐ Chris is absolutely wonderful! He is incredibly kind, friendly, and patient. He takes the time to listen, answer questions, and make everyone feel comfortable and valued. His professionalism and genuine care truly make a difference. Such a pleasure to work with. Highly recommend!',
    quoteEs:
      '⭐⭐⭐⭐⭐ ¡Chris es absolutamente maravilloso! Es increíblemente amable, cordial y paciente. Se toma el tiempo de escuchar, responder preguntas y hacer que todos se sientan cómodos y valorados. Su profesionalismo y su interés genuino de verdad marcan la diferencia. Un verdadero placer trabajar con él. ¡Muy recomendado!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Roxy',
    quote: 'Very Professional Business',
    quoteEs: 'Un negocio muy profesional',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Robert Stumbo',
    quote:
      'I recently visited this estate jewelry and antique shop and was thoroughly impressed. The selection of vintage and estate pieces is carefully curated—beautiful rings, necklaces, brooches, and unique antique finds that you simply don’t see in regular jewelry stores. Everything felt authentic and well-preserved. Chris was knowledgeable, friendly, and never pushy. They took the time to share the history behind several pieces and helped me find something truly special. Pricing was fair for the quality, and the overall atmosphere of the shop made browsing a real pleasure. Highly recommend if you’re looking for one-of-a-kind estate jewelry or antique treasures. I’ll definitely be back!',
    quoteEs:
      'Hace poco visité esta tienda de joyería de patrimonio y antigüedades y quedé muy impresionado. La selección de piezas vintage y de patrimonio está cuidadosamente elegida: anillos, collares y broches preciosos, y hallazgos antiguos únicos que simplemente no se ven en las joyerías comunes. Todo se sentía auténtico y bien conservado. Chris fue conocedor, amable y nunca insistente. Se tomaron el tiempo de contarme la historia de varias piezas y me ayudaron a encontrar algo realmente especial. Los precios eran justos para la calidad, y el ambiente de la tienda hizo que recorrerla fuera un verdadero placer. Muy recomendado si busca joyería de patrimonio única o tesoros antiguos. ¡Sin duda volveré!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Cristina Roa',
    quote:
      'Had the best experience today at Naples Estate Jewelry! Chris is so knowledgeable and has great items that are so unique and incredibly priced. I’m going to be a regular to see what new things have arrived!',
    quoteEs:
      '¡Hoy tuve la mejor experiencia en Naples Estate Jewelry! Chris es muy conocedor y tiene piezas estupendas, muy únicas y a precios increíbles. ¡Voy a ser clienta habitual para ver qué cosas nuevas han llegado!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'devon amory',
    quote:
      'Chris was an absolute delight!!! He is exactly who you want when it comes to this!! Chris has a passion for not only the items but the history behind it. When I say I was waiting years to find someone like him I truly mean it, he’s honest and takes his time. Thank you for caring and seeing the true value in my collection and helping me part with it in the best way possible, Im truly grateful!!!',
    quoteEs:
      '¡¡¡Chris fue un verdadero encanto!!! ¡¡Es exactamente la persona que uno quiere para esto!! Chris siente pasión no solo por las piezas, sino también por la historia detrás de ellas. Cuando digo que llevaba años esperando encontrar a alguien como él, lo digo en serio: es honesto y se toma su tiempo. Gracias por preocuparse, por ver el verdadero valor de mi colección y por ayudarme a desprenderme de ella de la mejor manera posible. ¡¡¡Estoy muy agradecido!!!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Joseph Mason',
    quote: 'Treated me very well',
    quoteEs: 'Me trató muy bien',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Barbara Arnold',
    quote:
      'I brought in a lot of family jewelry pieces - some valuable, some not. Chis is very knowledgable and experienced. There was no pressure and he gave me good advice about the pieces I decided not to sell. The visit was well worth my time.',
    quoteEs:
      'Traje muchas joyas de la familia, algunas valiosas y otras no. Chris tiene mucho conocimiento y experiencia. No hubo ninguna presión y me dio buenos consejos sobre las piezas que decidí no vender. La visita valió mucho la pena.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Sara Buboltz',
    quote: 'Chris was super kind and knowledgeable.',
    quoteEs: 'Chris fue súper amable y muy conocedor.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Tina L',
    quote:
      'Great experience with Naples Estate Jewelry. Chris was very kind, professional & informative. I appreciate the time taken to look over the jewelry pieces that I brought in, answering any questions I had and full transparency. I’ll absolutely be back in the near future!',
    quoteEs:
      'Gran experiencia con Naples Estate Jewelry. Chris fue muy amable, profesional e informativo. Agradezco el tiempo que dedicó a revisar las joyas que traje, a responder todas mis preguntas y su total transparencia. ¡Sin duda volveré pronto!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'J. W.',
    quote:
      'Chris is the best in the business. Honest, fair and a wealth of knowledge. Highly recommend. Really happy to have found him here in Naples!',
    quoteEs:
      'Chris es el mejor del negocio. Honesto, justo y con un enorme conocimiento. Muy recomendado. ¡Muy contento de haberlo encontrado aquí en Naples!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Leah Mueller',
    quote: 'Great place! Very helpful and willing to help.I will definitely be back',
    quoteEs: '¡Un gran lugar! Muy serviciales y dispuestos a ayudar. Sin duda volveré',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Lyn Dukes',
    quote: 'Wonderful place. Great people. Beautiful items. Ypu have to come see!!',
    quoteEs: 'Un lugar maravilloso. Gente estupenda. Piezas preciosas. ¡¡Tiene que venir a verlo!!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Amy Aditatar',
    quote:
      'I brought my Grandma’s silver here today and was met with the upmost respect, great customer service, and a fair price. I would recommend coming here and doing your business here over the other local businesses.',
    quoteEs:
      'Hoy traje aquí la plata de mi abuela y me recibieron con el mayor respeto, un excelente servicio al cliente y un precio justo. Recomendaría venir y hacer sus negocios aquí antes que en otros negocios de la zona.',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Lorena & Scott Schultz',
    quote:
      'Chris is the man and helped my husband and I. He knows basically everything there is to know about jewelry. He is extremely responsive, knowledgeable, and always looks out for his clients best interests. I highly recommend this company as this industry can be a little shady from my experience, but Chris was as transparent as anyone I’ve ever met!',
    quoteEs:
      'Chris es lo máximo y nos ayudó a mi esposo y a mí. Sabe prácticamente todo lo que hay que saber sobre joyería. Responde muy rápido, tiene mucho conocimiento y siempre vela por los mejores intereses de sus clientes. Recomiendo mucho esta empresa porque, según mi experiencia, este sector puede ser un poco turbio, ¡pero Chris fue tan transparente como nadie que haya conocido!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Adrian Sanchez',
    quote: 'Thank you!!!',
    quoteEs: '¡¡¡Gracias!!!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Scott Schultz',
    quote: 'Chris Surette was awesome! Best service and great prices. Highly recommended!',
    quoteEs: '¡Chris Surette fue increíble! El mejor servicio y excelentes precios. ¡Muy recomendado!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
  {
    name: 'Tom Hardesty',
    quote:
      'Chris is the BEST!!! He has many fine pieces that are of very high quality, and very reasonable to work with! Go see him!!!',
    quoteEs:
      '¡¡¡Chris es el MEJOR!!! Tiene muchas piezas finas de muy alta calidad, ¡y es muy razonable para trabajar con él! ¡¡¡Vaya a verlo!!!',
    meta: 'Google review',
    metaEs: 'Reseña de Google',
  },
];

/**
 * The reviews that ride the scrolling band (homepage + product pages) — the
 * substantive ones (owner, 2026-11-01: all 51 on /reviews, a hand-picked set on
 * the band). The rule is the quote's length, not a hand-kept flag, so a newly
 * pasted review sorts itself: one-liners like "Thank you!!!" stay on /reviews.
 * 160 characters = 24 of the 51 on 2026-11-01 (the band showed all 22 before).
 */
export const BAND_MIN_QUOTE_CHARS = 160;
export const BAND_TESTIMONIALS: Testimonial[] = TESTIMONIALS.filter((t) => t.quote.length >= BAND_MIN_QUOTE_CHARS);
