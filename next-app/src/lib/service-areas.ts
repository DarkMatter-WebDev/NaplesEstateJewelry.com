// Service-area (city) data powering the buy-side local landing pages at
// /sell and /sell/[city]. These pages target "sell gold / jewelry / sterling
// silver <city>" and "<thing> buyers <city>" searches across Southwest Florida.
//
// Each city carries a unique intro + nearby-area list so the pages are locally
// differentiated rather than boilerplate. The shared "what we buy" and FAQ copy
// is templated with the city name in the page component.
//
// ⚠️ STORE-FIRST since 2026-08-17 (showroom opened; see DECISIONS, "The
// showroom is store-first"). Every string below used to lead with travel — "we
// come to you", "we meet you at home". They were REFRAMED, not deleted: these
// six pages rank largely on travel-to-you intent, and cutting that framing
// would gut them for no gain. The shape is now "come to the Naples showroom,
// and we still visit on request" — the showroom leads, the visit remains.
// Do not let a future edit swing it back to travel-first or strip travel out.

export interface ServiceArea {
  /** URL slug, e.g. 'fort-myers' → /sell/fort-myers */
  slug: string;
  /** Display city name, e.g. 'Fort Myers' */
  city: string;
  region: string; // 'FL'
  /** Neighborhoods / communities within or adjacent to the city. */
  nearby: string[];
  /** Unique 1–2 sentence intro (English). Weaves in local context. */
  introEn: string;
  /** Unique intro (Spanish). */
  introEs: string;
  /**
   * How this city reaches us (English): the showroom first, then the home
   * visit as the standing alternative. Named `travel*` for historical reasons —
   * it no longer means "we travel by default".
   */
  travelEn: string;
  travelEs: string;
  /**
   * Optional per-city metadata/H1 overrides. Set ONLY where a city must target
   * a different query family than the shared template. Naples carries them
   * because its templated title ("Sell Gold, Jewelry & Silver in Naples, FL")
   * was two words away from the homepage's, and Google split the same queries
   * across both pages (homepage pos 18.3 / this page 49.6, GSC Aug 2026).
   * Naples now owns the buyer-noun family ("jewelry buyers naples") while the
   * homepage keeps the sell-verb phrasing. Absent → template strings apply.
   */
  metaTitleEn?: string;
  metaTitleEs?: string;
  metaDescEn?: string;
  metaDescEs?: string;
  h1En?: string;
  h1Es?: string;
  /**
   * The one city that physically hosts the showroom renders a walk-in band
   * (address, live hours, what-to-bring). Address/hours come from
   * their single sources — never hardcoded here.
   */
  hasShowroom?: boolean;
}

export const SERVICE_AREAS: ServiceArea[] = [
  {
    slug: 'naples',
    city: 'Naples',
    region: 'FL',
    nearby: ['Old Naples', 'Park Shore', 'Pelican Bay', 'Aqualane Shores', 'North Naples', 'Golden Gate'],
    introEn:
      'Naples is our home base — the owner was born and raised here with 15+ years buying gold, estate jewelry, and sterling silver from local families. Because we resell from our own showroom, your jewelry is priced two ways — as metal and as jewelry — and you are paid the higher of the two. Bring your pieces to our North Naples showroom, or if you are downsizing in Old Naples, settling an estate in Pelican Bay, or clearing a jewelry box in Golden Gate, ask us to come to you. Either way you get an honest, private, top-dollar offer. The showroom sits in the Naples Art District in North Naples, and walk-ins are welcome during open hours — one ring or the whole tray.',
    introEs:
      'Naples es nuestra base — el dueño nació y creció aquí con más de 15 años comprando oro, joyería de patrimonio y plata esterlina a familias locales. Como revendemos desde nuestro propio salón, su joyería se valora de dos maneras — como metal y como joya — y se le paga la mayor. Traiga sus piezas a nuestro salón en North Naples o, si está reduciendo su hogar en Old Naples, liquidando un patrimonio en Pelican Bay o vaciando un joyero en Golden Gate, pídanos que vayamos a usted. En ambos casos recibe una oferta honesta, privada y al mejor precio. El salón está en el Naples Art District, en North Naples, y puede entrar sin cita durante el horario de atención — con un solo anillo o la bandeja completa.',
    travelEn: 'Our showroom is right here in Naples, and we still offer same-day in-home appointments across the city on request.',
    travelEs: 'Nuestro salón está aquí mismo en Naples, y seguimos ofreciendo citas a domicilio el mismo día en toda la ciudad a pedido.',
    metaTitleEn: 'Jewelry Buyers in Naples, FL',
    metaTitleEs: 'Compradores de Joyas en Naples, FL',
    metaDescEn:
      'Local jewelry buyers in Naples, FL. We buy gold, silver, diamonds, watches & estate jewelry at our Shirley St showroom — free evaluation, paid on the spot. Call (239) 404-8505.',
    metaDescEs:
      'Compradores locales de joyas en Naples, FL. Compramos oro, plata, diamantes, relojes y joyería de patrimonio en nuestro salón de Shirley St — evaluación gratuita y pago inmediato. (239) 404-8505.',
    h1En: 'Jewelry, Gold & Silver Buyers in Naples, FL',
    h1Es: 'Compradores de Joyas, Oro y Plata en Naples, FL',
    hasShowroom: true,
  },
  {
    slug: 'marco-island',
    city: 'Marco Island',
    region: 'FL',
    nearby: ['Marco Island', 'Isles of Capri', 'Goodland', 'Hideaway Beach'],
    introEn:
      'Marco Island sellers get a fair price without settling for the nearest melt counter, where a signed bracelet is worth exactly what it weighs; we resell, so it can be priced as jewelry. It is a short drive up to our Naples showroom, and for larger collections we still come to you across Marco, the Isles of Capri, and Goodland to buy gold, jewelry, and sterling silver privately and pay on the spot. Much of the island is seasonal and condo-based, so selling here usually happens around a move — a full jewelry box and the safe-deposit envelope rather than a single piece — exactly the kind of lot worth going through in one unhurried sitting. The showroom is about 40 minutes up Collier Boulevard.',
    introEs:
      'Los vendedores de Marco Island obtienen un precio justo sin conformarse con el mostrador de fundición más cercano, donde una pulsera firmada vale exactamente lo que pesa; nosotros revendemos, así que puede valorarse como joya. Es un trayecto corto hasta nuestro salón en Naples y, para colecciones más grandes, seguimos yendo a usted en Marco, Isles of Capri y Goodland para comprar oro, joyería y plata esterlina de forma privada y pagar en el acto. Gran parte de la isla es de temporada y de condominios, así que aquí se suele vender en torno a una mudanza — el joyero completo y el sobre de la caja de seguridad, no una sola pieza — exactamente el tipo de lote que conviene revisar con calma en una sola sesión. El salón queda a unos 40 minutos por Collier Boulevard.',
    travelEn: 'Visit our Naples showroom, or ask for a private, by-appointment visit on Marco Island.',
    travelEs: 'Visite nuestro salón en Naples o solicite una visita privada con cita en Marco Island.',
  },
  {
    slug: 'bonita-springs',
    city: 'Bonita Springs',
    region: 'FL',
    nearby: ['Bonita Springs', 'Bonita Beach', 'Barefoot Beach', 'Spring Creek', 'Pelican Landing'],
    introEn:
      'Bonita Springs residents get the same expert evaluation and top-dollar offers we are known for in Naples — and unlike the melt-only counters, we price each piece as jewelry as well as metal and pay whichever is higher. Bring your gold, jewelry, and silver down to our Naples showroom, or ask us to meet you at home in Bonita Springs, Bonita Beach, or the Barefoot Beach communities. Bonita sits in the middle in more ways than one — original beach cottages near Bonita Beach on one side, the towers and golf communities of Bonita Bay and Pelican Landing on the other — and either way the showroom is a straight run down US-41, about 25 minutes.',
    introEs:
      'Los residentes de Bonita Springs reciben la misma evaluación experta y ofertas al mejor precio por las que somos conocidos en Naples — y, a diferencia de los mostradores que solo funden, valoramos cada pieza como joya además de como metal y pagamos la mayor. Traiga su oro, joyería y plata a nuestro salón en Naples o pídanos reunirnos con usted en casa en Bonita Springs, Bonita Beach o Barefoot Beach. Bonita está en el punto medio en más de un sentido — casitas de playa originales cerca de Bonita Beach por un lado, y las torres y comunidades de golf de Bonita Bay y Pelican Landing por el otro — y en ambos casos el salón queda en línea recta por la US-41, a unos 25 minutos.',
    travelEn: 'Visit our Naples showroom, or ask for a private, by-appointment visit in Bonita Springs.',
    travelEs: 'Visite nuestro salón en Naples o solicite una visita privada con cita en Bonita Springs.',
  },
  {
    slug: 'estero',
    city: 'Estero',
    region: 'FL',
    nearby: ['Estero', 'Miromar Lakes', 'Grandezza', 'Coconut Point', 'The Brooks'],
    introEn:
      'Between Naples and Fort Myers, Estero sellers often settle for whatever the nearest gold-buying counter offers, which is a slice of melt value and nothing more. We give you a better option: an unhurried appraisal at our Naples showroom, or a private, no-pressure appointment at home in Estero, Miromar Lakes, or Grandezza — with a genuine top-dollar offer for your gold, jewelry, and sterling. Most of Estero is newer, master-planned country-club living, where the selling moment tends to be an inheritance or a second-home consolidation — the kind of sale that suits a discreet, scheduled appointment. From Coconut Point, the showroom is roughly 25 minutes down US-41 or I-75.',
    introEs:
      'Entre Naples y Fort Myers, los vendedores de Estero a menudo aceptan lo que ofrece el mostrador de compra de oro más cercano, que es una fracción del valor de fundición y nada más. Le damos una mejor opción: una evaluación sin prisas en nuestro salón de Naples o una cita privada y sin presión en casa en Estero, Miromar Lakes o Grandezza — con una oferta genuina al mejor precio por su oro, joyería y plata. La mayor parte de Estero es de comunidades planificadas y clubes de campo más nuevos, donde el momento de vender suele ser una herencia o la consolidación de una segunda vivienda — el tipo de venta que se presta a una cita discreta y programada. Desde Coconut Point, el salón queda a unos 25 minutos por la US-41 o la I-75.',
    travelEn: 'Visit our Naples showroom, or ask for a private, by-appointment visit in Estero.',
    travelEs: 'Visite nuestro salón en Naples o solicite una visita privada con cita en Estero.',
  },
  {
    slug: 'fort-myers',
    city: 'Fort Myers',
    region: 'FL',
    nearby: ['Fort Myers', 'Fort Myers Beach', 'McGregor', 'Gateway', 'Iona', 'San Carlos Park'],
    introEn:
      'Fort Myers has plenty of gold-buying storefronts — but a private appraisal from a 15-year specialist almost always beats a walk-up counter offer. Most of those storefronts melt everything they buy; we resell, so a piece worth more as jewelry is paid as jewelry. Bring your pieces to our Naples showroom for an unhurried look, or ask us to come to you across Fort Myers, McGregor, Gateway, and Fort Myers Beach for fair, transparent numbers on gold, estate jewelry, and sterling silver. Fort Myers is one of the oldest cities on this coast, and the houses off McGregor Boulevard and the River District have been holding onto things for generations — older gold, full sterling flatware services, pieces from estates assembled well before the boom years. The showroom is about 40 minutes down I-75, and we come north for larger collections.',
    introEs:
      'Fort Myers tiene muchas tiendas de compra de oro — pero una evaluación privada de un especialista con 15 años de experiencia casi siempre supera una oferta de mostrador. La mayoría de esas tiendas funden todo lo que compran; nosotros revendemos, así que una pieza que vale más como joya se paga como joya. Traiga sus piezas a nuestro salón en Naples para verlas con calma o pídanos ir a usted en Fort Myers, McGregor, Gateway y Fort Myers Beach, con números justos y transparentes por oro, joyería de patrimonio y plata esterlina. Fort Myers es una de las ciudades más antiguas de esta costa, y las casas cerca de McGregor Boulevard y el River District llevan generaciones guardando cosas — oro antiguo, juegos completos de cubertería esterlina, piezas de patrimonios formados mucho antes de los años del auge. El salón queda a unos 40 minutos por la I-75, y para colecciones grandes vamos nosotros al norte.',
    travelEn: 'Visit our Naples showroom, or ask for a private, by-appointment visit in Fort Myers.',
    travelEs: 'Visite nuestro salón en Naples o solicite una visita privada con cita en Fort Myers.',
  },
  {
    slug: 'cape-coral',
    city: 'Cape Coral',
    region: 'FL',
    nearby: ['Cape Coral', 'Pine Island', 'Matlacha', 'North Fort Myers', 'Burnt Store'],
    introEn:
      'Cape Coral sellers get a discreet, top-dollar buyer rather than a melt counter — we price every piece both as metal and as jewelry, and pay the higher number. Bring your gold, jewelry, and sterling silver to our Naples showroom, or — especially for a full estate — ask us to cross the bridge and meet you at home in Cape Coral, Pine Island, or North Fort Myers. The Cape grew canal by canal over fifty years, and many of its sellers are original owners simplifying decades of accumulation — a drawer of gold, grandmother’s sterling, a coin collection from the garage safe. No need to haul all of it over the bridge on a guess; send photos first and we will tell you honestly what is worth the trip.',
    introEs:
      'Los vendedores de Cape Coral obtienen un comprador discreto y al mejor precio en lugar de un mostrador de fundición — valoramos cada pieza como metal y como joya, y pagamos el número mayor. Traiga su oro, joyería y plata esterlina a nuestro salón en Naples o — sobre todo para un patrimonio completo — pídanos cruzar el puente y reunirnos con usted en casa en Cape Coral, Pine Island o North Fort Myers. Cape Coral creció canal a canal durante cincuenta años, y muchos de sus vendedores son propietarios originales simplificando décadas de acumulación — un cajón de oro, la plata esterlina de la abuela, una colección de monedas de la caja fuerte del garaje. No hace falta cruzar el puente con todo a ciegas; envíe fotos primero y le diremos con honestidad qué vale el viaje.',
    travelEn: 'Visit our Naples showroom, or ask for a private, by-appointment visit in Cape Coral.',
    travelEs: 'Visite nuestro salón en Naples o solicite una visita privada con cita en Cape Coral.',
  },
];

export function getServiceArea(slug: string): ServiceArea | undefined {
  return SERVICE_AREAS.find((a) => a.slug === slug);
}
