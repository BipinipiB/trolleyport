// Lifestyle product photos from Pexels (https://www.pexels.com/license/ — free to use, attribution not required but
// given here anyway). Files live in public/products/<productId>.jpg, downloaded at 800px wide.
// Chosen to show the food in context, with no visible brands, labels or identifiable people.

export interface ProductPhoto {
  /** Short description used as the image's alt text. */
  alt: string
  photographer: string
  /** Pexels photo id; the photo page is https://www.pexels.com/photo/<id>/ */
  pexelsId: number
}

export const PRODUCT_PHOTOS: Record<string, ProductPhoto> = {
  'prod-001': { alt: 'Bananas on a wooden table', photographer: 'Mr. Pugo', pexelsId: 33203199 },
  'prod-002': { alt: 'Red apples on a rustic wooden table', photographer: 'Suzy Hazelwood', pexelsId: 1510392 },
  'prod-003': { alt: 'Bunch of fresh carrots on a wooden board', photographer: 'mali maeder', pexelsId: 65174 },
  'prod-004': { alt: 'Fresh broccoli florets', photographer: 'Christina & Peter', pexelsId: 36895573 },
  'prod-005': { alt: 'Fresh spinach leaves in a strainer', photographer: 'Mateusz Feliksik', pexelsId: 13376463 },
  'prod-006': { alt: 'Ripe tomatoes on the vine on a wooden board', photographer: 'The Design Lady', pexelsId: 30964381 },
  'prod-007': { alt: 'Halved avocado', photographer: 'Lisa Fotios', pexelsId: 1759055 },
  'prod-008': { alt: 'Glass and jug of milk on a wooden board', photographer: 'Cats Coming', pexelsId: 5545921 },
  'prod-009': { alt: 'Bowl of yoghurt with berries and granola', photographer: 'Life Of Pix', pexelsId: 128865 },
  'prod-010': { alt: 'Cheddar cheese cubes on a chopping board', photographer: 'RDNE Stock project', pexelsId: 6004715 },
  'prod-011': { alt: 'Blocks of butter being sliced', photographer: 'Felicity Tai', pexelsId: 7965940 },
  'prod-012': { alt: 'Brown eggs in an egg tray', photographer: 'Monserrat Soldú', pexelsId: 600615 },
  'prod-013': { alt: 'Sliced wholemeal bread on a board', photographer: 'Mateusz Feliksik', pexelsId: 8023989 },
  'prod-014': { alt: 'Sourdough loaf on a wooden board', photographer: 'Travel with Lenses', pexelsId: 30890566 },
  'prod-015': { alt: 'Golden croissants on a tray', photographer: 'Jana Ohajdova', pexelsId: 11675765 },
  'prod-016': { alt: 'Bagels on a plate', photographer: 'Brenna Bieniek', pexelsId: 7771657 },
  'prod-017': { alt: 'Raw chicken breasts with rosemary and garlic', photographer: 'Leeloo The First', pexelsId: 5769376 },
  'prod-018': { alt: 'Fresh beef mince in a glass bowl', photographer: 'Angele J', pexelsId: 128401 },
  'prod-019': { alt: 'Raw salmon fillets with lemon', photographer: 'Anastasia Yudin', pexelsId: 5014596 },
  'prod-020': { alt: 'Rashers of bacon on a wooden board', photographer: 'Nicolas Postiglioni', pexelsId: 1927377 },
  'prod-021': { alt: 'Cubed tofu on a chopping board', photographer: 'Laura oliveira', pexelsId: 34705707 },
  'prod-022': { alt: 'Ridged potato chips in a bowl', photographer: 'Markus Winkler', pexelsId: 32457159 },
  'prod-023': { alt: 'Pieces of dark chocolate', photographer: 'Vie Studio', pexelsId: 6167333 },
  'prod-024': { alt: 'Mixed nuts in a bowl', photographer: 'Ilona Jurtschenko-Roelofs', pexelsId: 38727565 },
  'prod-025': { alt: 'Homemade muesli bars', photographer: 'Ella Olsson', pexelsId: 3026806 },
  'prod-026': { alt: 'Uncooked rice in a bowl', photographer: 'Waskyria Miranda', pexelsId: 31555433 },
  'prod-027': { alt: 'Uncooked spaghetti', photographer: 'Polina Tankilevitch', pexelsId: 4518801 },
  'prod-028': { alt: 'Bowl of tomato sauce', photographer: 'Gwladys Nicimbikije', pexelsId: 35428719 },
  'prod-029': { alt: 'Rolled oats in a wooden bowl with a milk jug', photographer: 'Victoria Bowers', pexelsId: 36285315 },
  'prod-030': { alt: 'Jar of peanut butter on a wooden board', photographer: 'ROMAN ODINTSOV', pexelsId: 5149345 },
}

export const photoUrl = (productId: string) => `/products/${productId}.jpg`
