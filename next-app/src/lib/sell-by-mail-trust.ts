import { TESTIMONIALS, type Testimonial } from '@/lib/testimonials';

// /sellbymail's trust reviews (owner, 2026-11-01: "list some of the testimonials
// that ... highlight the trust factor"). Picked by reviewer name only.

/**
 * The trust reviews, by reviewer name — the text always comes from
 * `TESTIMONIALS`, so it stays verbatim. `highlight` is a run of each quote
 * ([English, Spanish]) set in bold gold; emphasis only, never a word changed.
 * A test checks every name and highlight still matches the list.
 */
export interface TrustPick {
  name: string;
  highlight?: [string, string];
}

export const TRUST_FEATURED: TrustPick = {
  name: 'Mine Cervantes',
  highlight: [
    'It’s nice to know there are still good people you can trust.',
    'Es bueno saber que todavía hay buenas personas en quienes se puede confiar.',
  ],
};

export const TRUST_BAND: TrustPick[] = [
  {
    name: 'Lorena & Scott Schultz',
    highlight: ['Chris was as transparent as anyone I’ve ever met!', 'Chris fue tan transparente como nadie que haya conocido!'],
  },
  { name: 'Joseph Roth', highlight: ['Chris has the utmost integrity', 'Chris tiene la máxima integridad'] },
  {
    name: 'Edna Cavazos',
    highlight: [
      'Even though we didn’t end up making a deal, he was honest, professional, and never made me feel pressured.',
      'Aunque al final no cerramos un trato, fue honesto, profesional y nunca me hizo sentir presionada.',
    ],
  },
  { name: 'Scott Tallent', highlight: ['upfront with his pricing.', 'transparente con sus precios.'] },
  {
    name: 'Barbara Arnold',
    highlight: [
      'There was no pressure and he gave me good advice about the pieces I decided not to sell.',
      'No hubo ninguna presión y me dio buenos consejos sobre las piezas que decidí no vender.',
    ],
  },
  { name: 'John P', highlight: ['Knowledgeable, courteous, and trustworthy', 'Conocedor, cortés y confiable'] },
];

export const TRUST_PULL: TrustPick = { name: 'Ruthe Lloyd' };

export function trustReview(pick: TrustPick): Testimonial | undefined {
  return TESTIMONIALS.find((review) => review.name === pick.name);
}
