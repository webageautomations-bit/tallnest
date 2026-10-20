// JINGO — Product content layer (single source of truth)
// Names, flavours, prices and pack ratios from JINGO Product Catalogue, September 2026.
// `color` / `textOn` are sampled from the ACTUAL pack artwork (catalogue renders) and stay
// vivid for chips/badges/dots. `tint` is a soft pastel of the same hue (L 0.75, S 0.37)
// used ONLY as the product card background, so no card reads neon. Pack renders live in
// src/assets/jingo/products/<id>.png (transparent). Feeds the showcase AND game theming.

export interface JingoCategory {
  id: string; name: string; subBrand?: string;
  flavourCount: number; price: string; packing: string; blurb: string;
}
export interface JingoProduct {
  id: string; name: string; flavour: string; categoryId: string;
  price: string;
  color: string;  // vivid pack colour — chips, badges, dots
  tint: string;   // soft pastel — product CARD background only
  textOn: 'light' | 'dark';
}

export const categories: JingoCategory[] = [
  { id: 'candies',   name: 'Candies',           flavourCount: 9, price: 'Rs. 5',  packing: '50 pcs / box · 36 box / carton', blurb: 'Nine bold flavours — tangy, chilli, masala, imli and more.' },
  { id: 'toffees',   name: 'Toffees',           flavourCount: 7, price: 'Rs. 5',  packing: '50 pcs / box · 36 box / carton', blurb: 'Rich, chewy classics from chocolate to kulfa and fudge.' },
  { id: 'squizo',    name: 'Liquid Chocolates', subBrand: 'SQUIZO', flavourCount: 6, price: 'Rs. 10', packing: '30 pcs / box · 24 box / carton', blurb: 'Squeezable liquid chocolate in six indulgent flavours.' },
  { id: 'lollipops', name: 'Lollipops',         subBrand: 'TWIST',  flavourCount: 6, price: 'Rs. 10', packing: '50 pcs / box · 24 box / carton', blurb: 'Twist lollipops — mango, apple, imli, cola and more.' },
  { id: 'bubblegums',name: 'Bubblegums',        subBrand: 'BUBLO',  flavourCount: 3, price: 'Rs. 10', packing: '30 pcs / box · 24 box / carton', blurb: 'Big-bubble fun in three fruit-forward flavours.' },
  { id: 'bunties',   name: 'Bunties',           flavourCount: 1, price: 'Rs. 5 / 10', packing: '60-30 pcs / box · 24 box / carton', blurb: 'Choco Chums — bite-size chocolate bunties.' },
  { id: 'nimkos',    name: 'Nimkos',            subBrand: 'MEHFIL', flavourCount: 3, price: 'Rs. 10 / 20 / 50', packing: 'Multi-pack · 24-12 packs / carton', blurb: 'Mehfil savoury mixes — the grown-up snack in the range.' },
];

export const products: JingoProduct[] = [
  // candies
  { id: 'cola-candy', name: "Cola Candy", flavour: "Cola Flavoured", categoryId: 'candies', price: 'Rs. 5', color: '#D4213D', tint: '#D7A8AF', textOn: 'light' },
  { id: 'kachi-keri', name: "Kachi Keri", flavour: "Raw Mango Flavoured", categoryId: 'candies', price: 'Rs. 5', color: '#7BAB56', tint: '#BAD6A4', textOn: 'dark' },
  { id: 'tangy-candy', name: "Tangy Candy", flavour: "Orange Flavoured", categoryId: 'candies', price: 'Rs. 5', color: '#E8551E', tint: '#D7B5A8', textOn: 'dark' },
  { id: 'chilli-chaska', name: "Chilli Chaska", flavour: "Chilli Candy", categoryId: 'candies', price: 'Rs. 5', color: '#8158AC', tint: '#BFAAD5', textOn: 'light' },
  { id: 'chatkhari', name: "Chatkhari", flavour: "Masala Candy", categoryId: 'candies', price: 'Rs. 5', color: '#BE1E33', tint: '#D7A8AE', textOn: 'light' },
  { id: 'frosty', name: "Frosty", flavour: "Mint Candy", categoryId: 'candies', price: 'Rs. 5', color: '#82B5C2', tint: '#ABD0D9', textOn: 'dark' },
  { id: 'chulbuli', name: "Chulbuli", flavour: "Khatti Meethi Candy", categoryId: 'candies', price: 'Rs. 5', color: '#E6B81E', tint: '#D7CCA8', textOn: 'dark' },
  { id: 'imli-blast', name: "Imli Blast", flavour: "Sour Imli Candy", categoryId: 'candies', price: 'Rs. 5', color: '#8E1A2E', tint: '#D7A8B0', textOn: 'light' },
  { id: 'falsa-frenzy', name: "Falsa Frenzy", flavour: "Wild Falsa Candy", categoryId: 'candies', price: 'Rs. 5', color: '#967DC3', tint: '#BCACD8', textOn: 'dark' },
  // toffees
  { id: 'choco-champ', name: "Choco Champ", flavour: "Chocolate Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#6B2E22', tint: '#D7AFA8', textOn: 'light' },
  { id: 'makhni-maza', name: "Makhni Maza", flavour: "Makhan Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#C3AD7A', tint: '#D7C7A2', textOn: 'dark' },
  { id: 'kulfa-khaas', name: "Kulfa Khaas", flavour: "Kulfa Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#5DA289', tint: '#A8D6C6', textOn: 'dark' },
  { id: 'eclair-king', name: "Eclair King", flavour: "Eclair Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#B88A2A', tint: '#D7C8A8', textOn: 'dark' },
  { id: 'badami-bite', name: "Badami Bite", flavour: "Badaam Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#DCA750', tint: '#D7C5A8', textOn: 'dark' },
  { id: 'kofiko', name: "Kofiko", flavour: "Coffee Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#8A5634', tint: '#D7BAA8', textOn: 'light' },
  { id: 'fudge-fantasy', name: "Fudge Fantasy", flavour: "Fudge Toffee", categoryId: 'toffees', price: 'Rs. 5', color: '#7E4532', tint: '#D7B3A8', textOn: 'light' },
  // squizo
  { id: 'double-choco', name: "Double Choco", flavour: "Chocolate Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#6E3C2A', tint: '#D7B4A8', textOn: 'light' },
  { id: 'mango-tango', name: "Mango Tango", flavour: "Mango Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#F2C019', tint: '#D7CCA8', textOn: 'dark' },
  { id: 'caramel-swirl', name: "Caramel Swirl", flavour: "Caramel Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#F47A1C', tint: '#D7BCA8', textOn: 'dark' },
  { id: 'hazelnut', name: "Hazelnut", flavour: "Hazelnut Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#F39C1E', tint: '#D7C4A8', textOn: 'dark' },
  { id: 'malai-magic', name: "Malai Magic", flavour: "Malai Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#E3CF9E', tint: '#D7C9A8', textOn: 'dark' },
  { id: 'berry-blast', name: "Berry Blast", flavour: "Berry Squizo", categoryId: 'squizo', price: 'Rs. 10', color: '#EC84AC', tint: '#D7A8BA', textOn: 'dark' },
  // lollipops
  { id: 'aam-twist', name: "Aam Twist", flavour: "Mango Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#F2AD2E', tint: '#D7C6A8', textOn: 'dark' },
  { id: 'saib-twist', name: "Saib Twist", flavour: "Apple Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#5FBE2C', tint: '#B8D7A8', textOn: 'dark' },
  { id: 'imli-twist', name: "Imli Twist", flavour: "Imli Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#CE2F43', tint: '#D7A8AE', textOn: 'light' },
  { id: 'tangy-twist', name: "Tangy Twist", flavour: "Orange Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#F0742E', tint: '#D7B9A8', textOn: 'dark' },
  { id: 'cola-twist', name: "Cola Twist", flavour: "Cola Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#CB1E34', tint: '#D7A8AE', textOn: 'light' },
  { id: 'chilli-twist', name: "Chilli Twist", flavour: "Chilli Lollipop", categoryId: 'lollipops', price: 'Rs. 10', color: '#6C2BB0', tint: '#BFA8D7', textOn: 'light' },
  // bubblegums
  { id: 'orangey-bublo', name: "Orangey Bublo", flavour: "Orange Bubblegum", categoryId: 'bubblegums', price: 'Rs. 10', color: '#F6962A', tint: '#D7C1A8', textOn: 'dark' },
  { id: 'frosty-bublo', name: "Frosty Bublo", flavour: "Mint Bubblegum", categoryId: 'bubblegums', price: 'Rs. 10', color: '#9FC5D4', tint: '#B0D1DD', textOn: 'dark' },
  { id: 'aamzing-bublo', name: "Aamzing Bublo", flavour: "Mango Bubblegum", categoryId: 'bubblegums', price: 'Rs. 10', color: '#E8CE22', tint: '#D7D1A8', textOn: 'dark' },
  // bunties
  { id: 'choco-chums', name: "Choco Chums", flavour: "Chocolate Bunties", categoryId: 'bunties', price: 'Rs. 5 / 10', color: '#6069B7', tint: '#9FA4D0', textOn: 'light' },
  // nimkos
  { id: 'mehfil-daal-chana', name: "Mehfil Daal Chana", flavour: "Daal Chana", categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#B07A14', tint: '#D7C7A8', textOn: 'dark' },
  { id: 'mehfil-mix-nimko', name: "Mehfil Mix Nimko", flavour: "Mix Nimko", categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#76182E', tint: '#D7A8B3', textOn: 'light' },
  { id: 'mehfil-daal-moth', name: "Mehfil Daal Moth", flavour: "Daal Moth", categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#46631C', tint: '#C4D7A8', textOn: 'light' },
];

// Mix Toffees Pouch is a packaging SKU of the toffee range (render: mix-toffees-pouch.png).
export const specialSkus = [
  { id: 'mix-toffees-pouch', name: 'Mix Toffees Pouch', categoryId: 'toffees', price: 'Rs. 500', packing: '100 pcs / pouch · 24 pouch / carton', color: '#E86C1E', tint: '#D7BAA8', textOn: 'dark' as const },
];
