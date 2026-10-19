// JINGO — Product content layer (single source of truth)
// Extracted verbatim from JINGO Product Catalogue, September 2026.
// Names, flavours, prices and pack ratios are from the catalogue (authoritative).
// `color` is a FLAVOUR-LOGICAL design starting point — tune each against the real
// pack artwork/photos when placed. `textOn` is the legible text color over `color`.
// Feeds the flavour showcase AND future arcade/game theming — one entry per product.

export interface JingoCategory {
  id: string;
  name: string;
  subBrand?: string;
  flavourCount: number;
  price: string;
  packing: string;
  blurb: string;
}

export interface JingoProduct {
  id: string;
  name: string;
  flavour: string;       // descriptor from catalogue
  categoryId: string;
  price: string;
  color: string;         // provisional, flavour-logical — tune to real pack
  textOn: 'light' | 'dark'; // 'light' = white text, 'dark' = ink text
}

export const categories: JingoCategory[] = [
  { id: 'candies',   name: 'Candies',           flavourCount: 9, price: 'Rs. 5',        packing: '50 pcs / box · 36 box / carton', blurb: 'Nine bold flavours — tangy, chilli, masala, imli and more.' },
  { id: 'toffees',   name: 'Toffees',           flavourCount: 7, price: 'Rs. 5',        packing: '50 pcs / box · 36 box / carton', blurb: 'Rich, chewy classics from chocolate to kulfa and fudge.' },
  { id: 'squizo',    name: 'Liquid Chocolates', subBrand: 'SQUIZO', flavourCount: 6, price: 'Rs. 10', packing: '30 pcs / box · 24 box / carton', blurb: 'Squeezable liquid chocolate in six indulgent flavours.' },
  { id: 'lollipops', name: 'Lollipops',         subBrand: 'TWIST',  flavourCount: 6, price: 'Rs. 10', packing: '50 pcs / box · 24 box / carton', blurb: 'Twist lollipops — mango, apple, imli, cola and more.' },
  { id: 'bubblegums',name: 'Bubblegums',        subBrand: 'BUBLO',  flavourCount: 3, price: 'Rs. 10', packing: '30 pcs / box · 24 box / carton', blurb: 'Big-bubble fun in three fruit-forward flavours.' },
  { id: 'bunties',   name: 'Bunties',           flavourCount: 1, price: 'Rs. 5 / 10',   packing: '60-30 pcs / box · 24 box / carton', blurb: 'Choco Chums — bite-size chocolate bunties.' },
  { id: 'nimkos',    name: 'Nimkos',            subBrand: 'MEHFIL', flavourCount: 3, price: 'Rs. 10 / 20 / 50', packing: 'Multi-pack · 24-12 packs / carton', blurb: 'Mehfil savoury mixes — the grown-up snack in the range.' },
];

export const products: JingoProduct[] = [
  // Candies (9) — Rs. 5
  { id: 'cola-candy',    name: 'Cola Candy',    flavour: 'Cola Flavoured',       categoryId: 'candies', price: 'Rs. 5', color: '#5A3A2E', textOn: 'light' },
  { id: 'kachi-keri',    name: 'Kachi Keri',    flavour: 'Raw Mango Flavoured',  categoryId: 'candies', price: 'Rs. 5', color: '#7CB342', textOn: 'light' },
  { id: 'tangy-candy',   name: 'Tangy Candy',   flavour: 'Orange Flavoured',     categoryId: 'candies', price: 'Rs. 5', color: '#F57C00', textOn: 'dark'  },
  { id: 'chilli-chaska', name: 'Chilli Chaska', flavour: 'Chilli Candy',         categoryId: 'candies', price: 'Rs. 5', color: '#D32F2F', textOn: 'light' },
  { id: 'chatkhari',     name: 'Chatkhari',     flavour: 'Masala Candy',         categoryId: 'candies', price: 'Rs. 5', color: '#8D4E2A', textOn: 'light' },
  { id: 'frosty',        name: 'Frosty',        flavour: 'Mint Candy',           categoryId: 'candies', price: 'Rs. 5', color: '#26C6DA', textOn: 'dark'  },
  { id: 'chulbuli',      name: 'Chulbuli',      flavour: 'Khatti Meethi Candy',  categoryId: 'candies', price: 'Rs. 5', color: '#EC407A', textOn: 'light' },
  { id: 'imli-blast',    name: 'Imli Blast',    flavour: 'Sour Imli Candy',      categoryId: 'candies', price: 'Rs. 5', color: '#6D4C41', textOn: 'light' },
  { id: 'falsa-frenzy',  name: 'Falsa Frenzy',  flavour: 'Wild Falsa Candy',     categoryId: 'candies', price: 'Rs. 5', color: '#7B1FA2', textOn: 'light' },

  // Toffees (7) — Rs. 5
  { id: 'choco-champ',   name: 'Choco Champ',   flavour: 'Chocolate Toffee',     categoryId: 'toffees', price: 'Rs. 5', color: '#4E342E', textOn: 'light' },
  { id: 'makhni-maza',   name: 'Makhni Maza',   flavour: 'Makhan Toffee',        categoryId: 'toffees', price: 'Rs. 5', color: '#F9A825', textOn: 'dark'  },
  { id: 'kulfa-khaas',   name: 'Kulfa Khaas',   flavour: 'Kulfa Toffee',         categoryId: 'toffees', price: 'Rs. 5', color: '#AED581', textOn: 'dark'  },
  { id: 'eclair-king',   name: 'Eclair King',   flavour: 'Eclair Toffee',        categoryId: 'toffees', price: 'Rs. 5', color: '#A1662F', textOn: 'light' },
  { id: 'badami-bite',   name: 'Badami Bite',   flavour: 'Badaam Toffee',        categoryId: 'toffees', price: 'Rs. 5', color: '#C8A165', textOn: 'dark'  },
  { id: 'kofiko',        name: 'Kofiko',        flavour: 'Kulfa Toffee',         categoryId: 'toffees', price: 'Rs. 5', color: '#6F4E37', textOn: 'light' },
  { id: 'fudge-fantasy', name: 'Fudge Fantasy', flavour: 'Fudge Toffee',         categoryId: 'toffees', price: 'Rs. 5', color: '#7B4A2D', textOn: 'light' },

  // Liquid Chocolates / SQUIZO (6) — Rs. 10
  { id: 'double-choco',  name: 'Double Choco',  flavour: 'Chocolate Squizo',     categoryId: 'squizo', price: 'Rs. 10', color: '#3E2723', textOn: 'light' },
  { id: 'mango-tango',   name: 'Mango Tango',   flavour: 'Mango Squizo',         categoryId: 'squizo', price: 'Rs. 10', color: '#FFB300', textOn: 'dark'  },
  { id: 'caramel-swirl', name: 'Caramel Swirl', flavour: 'Caramel Squizo',       categoryId: 'squizo', price: 'Rs. 10', color: '#B8762F', textOn: 'light' },
  { id: 'hazelnut',      name: 'Hazelnut',      flavour: 'Hazelnut Squizo',      categoryId: 'squizo', price: 'Rs. 10', color: '#8D6E63', textOn: 'light' },
  { id: 'malai-magic',   name: 'Malai Magic',   flavour: 'Malai Squizo',         categoryId: 'squizo', price: 'Rs. 10', color: '#E6C9A8', textOn: 'dark'  },
  { id: 'berry-blast',   name: 'Berry Blast',   flavour: 'Berry Squizo',         categoryId: 'squizo', price: 'Rs. 10', color: '#AD1457', textOn: 'light' },

  // Lollipops / TWIST (6) — Rs. 10
  { id: 'aam-twist',     name: 'Aam Twist',     flavour: 'Mango Lollipop',       categoryId: 'lollipops', price: 'Rs. 10', color: '#FBC02D', textOn: 'dark'  },
  { id: 'saib-twist',    name: 'Saib Twist',    flavour: 'Apple Lollipop',       categoryId: 'lollipops', price: 'Rs. 10', color: '#43A047', textOn: 'light' },
  { id: 'imli-twist',    name: 'Imli Twist',    flavour: 'Imli Lollipop',        categoryId: 'lollipops', price: 'Rs. 10', color: '#6D4C41', textOn: 'light' },
  { id: 'tangy-twist',   name: 'Tangy Twist',   flavour: 'Orange Lollipop',      categoryId: 'lollipops', price: 'Rs. 10', color: '#F57C00', textOn: 'dark'  },
  { id: 'cola-twist',    name: 'Cola Twist',    flavour: 'Cola Lollipop',        categoryId: 'lollipops', price: 'Rs. 10', color: '#5A3A2E', textOn: 'light' },
  { id: 'chilli-twist',  name: 'Chilli Twist',  flavour: 'Chilli Lollipop',      categoryId: 'lollipops', price: 'Rs. 10', color: '#E53935', textOn: 'light' },

  // Bubblegums / BUBLO (3) — Rs. 10
  { id: 'orangey-bublo', name: 'Orangey Bublo', flavour: 'Orange Bubblegum',     categoryId: 'bubblegums', price: 'Rs. 10', color: '#FB8C00', textOn: 'dark' },
  { id: 'frosty-bublo',  name: 'Frosty Bublo',  flavour: 'Mint Bubblegum',       categoryId: 'bubblegums', price: 'Rs. 10', color: '#26C6DA', textOn: 'dark' },
  { id: 'aamzing-bublo', name: 'Aamzing Bublo', flavour: 'Mango Bubblegum',      categoryId: 'bubblegums', price: 'Rs. 10', color: '#FDD835', textOn: 'dark' },

  // Bunties (1) — Rs. 5/10
  { id: 'choco-chums',   name: 'Choco Chums',   flavour: 'Chocolate Bunties',    categoryId: 'bunties', price: 'Rs. 5 / 10', color: '#4E342E', textOn: 'light' },

  // Nimkos / MEHFIL (3) — Rs. 10/20/50
  { id: 'mehfil-daal-chana', name: 'Mehfil Daal Chana', flavour: 'Daal Chana',   categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#C9922E', textOn: 'dark' },
  { id: 'mehfil-mix-nimko',  name: 'Mehfil Mix Nimko',  flavour: 'Mix Nimko',    categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#E67E22', textOn: 'dark' },
  { id: 'mehfil-daal-moth',  name: 'Mehfil Daal Moth',  flavour: 'Daal Moth',    categoryId: 'nimkos', price: 'Rs. 10 / 20 / 50', color: '#B5651D', textOn: 'light' },
];

// Mix Toffees Pouch is a packaging SKU of the toffee range (Rs. 500, 100 pcs/pouch,
// 24 pouch/carton) — surface it on the Toffees view, not as a standalone flavour.
export const specialSkus = [
  { id: 'mix-toffees-pouch', name: 'Mix Toffees Pouch', categoryId: 'toffees', price: 'Rs. 500', packing: '100 pcs / pouch · 24 pouch / carton' },
];
