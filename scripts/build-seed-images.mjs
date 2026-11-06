/**
 * Builds lib/seed/images.generated.json — a subject-matched photo pool for the
 * seeded marketplace catalog.
 *
 * Seeded listings must look like real product photography, not random stock, so
 * each catalog category maps to real photos whose subjects match the category
 * (a generator listing gets a generator photo). Photos come from Wikimedia
 * Commons, which serves stable, hotlinkable URLs from upload.wikimedia.org.
 *
 * Run once (or when the category list changes):
 *   node scripts/build-seed-images.mjs
 *
 * The generated JSON is committed, so seeding itself never needs the network.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const PER_CATEGORY = 3;

/** category slug → Wikimedia Commons search phrase */
const CATEGORIES = {
  smartphone: 'smartphone mobile phone',
  laptop: 'laptop computer notebook',
  headphones: 'headphones audio',
  phoneaccessory: 'phone charger power bank',
  camera: 'digital camera',
  television: 'television set flat screen',
  generator: 'portable electric generator',
  fan: 'electric standing fan',
  blender: 'blender kitchen appliance',
  refrigerator: 'refrigerator kitchen appliance',
  cooker: 'gas cooker stove kitchen',
  airconditioner: 'split air conditioner unit',
  solar: 'solar panel photovoltaic',
  rice: 'bag of rice grain',
  beans: 'beans legume seeds',
  palmoil: 'palm oil bottle',
  yam: 'yam tuber harvest',
  tomato: 'tomatoes basket market',
  pepper: 'chili pepper fresh',
  ankara: 'african wax print fabric textile',
  shoes: 'leather shoes pair',
  handbag: 'women handbag leather',
  watch: 'wristwatch analog',
  sunglasses: 'sunglasses eyewear',
  perfume: 'perfume bottle fragrance',
  skincare: 'face cream cosmetic jar',
  makeup: 'makeup cosmetics palette',
  wig: 'hairpiece wig',
  sofa: 'sofa couch furniture',
  rug: 'carpet rug floor',
  pots: 'cooking pots kitchenware',
  furniture: 'wooden table chairs furniture',
  baby: 'baby stroller pram',
  bicycle: 'bicycle bike',
  football: 'football soccer ball',
  books: 'books stack textbooks',
  sewing: 'sewing machine',
  tools: 'hand tools set',
  paint: 'paint bucket cans',
  tiles: 'ceramic floor tiles',
  cement: 'cement bags construction',
  cooler: 'water dispenser cooler bottle',
  gym: 'dumbbell fitness weights',
};

/**
 * Hand-curated keep list: for each category only the Commons files whose
 * subject is really a product photo (no paintings, portraits, archival shots or
 * equipment close-ups). Anything not listed here is dropped by the review step.
 */
const KEEP = {
  smartphone: ['5 different Smartphones', 'Smartphone being charged', 'Blackview A60'],
  laptop: ['IBM Thinkpad R51', 'Toshiba DynaBook J-3100SS Laptop computer (Notebook computer), Perspective'],
  headphones: ['Audio-Technica ATH-A500', 'Headphones 1'],
  phoneaccessory: ['Power bank.JPG', 'A power bank and phone charger seller hawking in Ketu, Lagos'],
  camera: ['Sony Cybershot DSC W210', 'A set of five digital cameras', 'GE A1250 Digital Camera'],
  television: ['Flat screens for sale', 'Mirai LCD TV'],
  generator: ['Mobile electric generator', 'Hand generator'],
  fan: ['Vinawind standing black fan'],
  blender: ['Pink portable blender', 'mixer-grinder'],
  refrigerator: ['LG refrigerator interior', 'Open refrigerator with food'],
  cooker: ['Built-in Gas Stove at Aeon Town', 'Gas cooker July-2011'],
  airconditioner: ['Air conditioners in Nis', 'SHARP air conditioner outdoor unit', 'Condenser unit for central air'],
  solar: ['Photovoltaic panel at the National Solar Energy Center', 'Hybrid Solar Panel Structure'],
  rice: ['Bagged rice panicles', 'Rice Grains'],
  beans: ['Cooked sorana beans', 'Legume, struttura'],
  palmoil: ['Palm Oil 0', 'Displayed palm oil in the market', 'PALM OIL BOTTLES'],
  yam: ['Harvested Yam Tubers', 'Kaachil cut'],
  tomato: ['Red and Green Tomatoes at a Farmers Market', 'The Beauty of Fresh Tomatoes in Nigeria', 'baskets full of ripe red tomatoes'],
  pepper: ['Fresh Tomatoes and pepper'],
  ankara: ['Ankara 4372', 'Waxprints in a West African Shop', 'Wax print'],
  shoes: ["Leather shoes 4 man", "Mens' ballroom shoes"],
  handbag: ['Man leather hand bag', 'womens handbag'],
  watch: ['Montinari Milano', 'Junghans Mega', 'G-shock G100'],
  sunglasses: ['2008-07-27 Sunglasses', 'Carrera UV400'],
  perfume: ['My dna fragrance exclusive perfume', 'Perfume Bottles from Kannauj'],
  makeup: ['Ben Nye makeup palette', 'Makeup Artistry'],
  wig: ['Hairpieces'],
  sofa: ['Couch-furniture-living-room-sofa', 'Living room Germany 2006'],
  rug: ['Rugs and carpets of Iran'],
  pots: ['Cooking pots stacking in Japan', 'Chamdu ( Cooking Pot)'],
  furniture: ['Wooden table and chairs on a balcony', 'Old Wooden table extract'],
  baby: ['Stroller or pram pic'],
  bicycle: ['Commuting by bicycle', 'Bicycle reflections'],
  football: ['Soccer ball on ground', 'Jakarta old football'],
  books: ['College Textbooks'],
  sewing: ['Vesta sewing machine', 'Woman sewing a face mask with a Singer machine', 'Old sewing machine in ethno park'],
  tools: ['Jewellery measuring tools', 'Some jewellery tools'],
  paint: ['Paint cans in store', 'PINTURAS TITANLUX'],
  tiles: ['Multiple pattern in floor tile at Malibu', 'Ceramic floor in Maracaibo'],
  cement: ['Portland Cement Bags', 'Stockage de ciments'],
  cooler: ['Water Cooler t4', 'Water cooler 36TD', 'Water cooler with bottle filling'],
  gym: ['Attractive man lifting dumbbell', 'Young man lifting dumbbell'],
};

/** Files that are almost never a usable product photo. */
const BAD_TITLE = /(logo|icon|diagram|map|chart|graphs?|coat[_ ]of[_ ]arms|flag|signature|screenshot|poster|postage|stamp|banknote|coin|seal|blueprint|drawing|scheme|symbol|graph|symbol|pdf|\.svg)/i;

/** Archival / military / museum shots read as fake on a modern marketplace. */
const ARCHIVAL_TITLE = /(1[6-9]\d\d|19[0-5]\d|museum|archiv|historic|vintage|antique|bygone|war|military|army|navy|air ?force|soviet|ussr|century)/i;

async function fetchCategory(slug, query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrlimit: '12',
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|size',
    iiurlwidth: '1000',
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { 'User-Agent': 'GoodSaleSeedCatalog/1.0 (contact: dev@goodsale.ng)' },
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const json = await res.json();
  const pages = Object.values(json?.query?.pages || {});

  const keep = KEEP[slug];
  const photos = [];
  for (const page of pages) {
    const title = String(page?.title || '').replace(/^File:/, '');
    if (BAD_TITLE.test(title) || ARCHIVAL_TITLE.test(title)) continue;
    if (keep && !keep.some((k) => title.includes(k))) continue;
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    const mime = String(info.mime || '');
    if (!/^image\/(jpeg|png)$/.test(mime)) continue;
    if (Number(info.width || 0) < 600) continue;
    const url = String(info.thumburl || info.url || '');
    if (!url.startsWith('https://')) continue;
    // Strip Wikimedia's tracking query so the URL stays stable.
    const clean = url.split('?')[0];
    if (photos.some((p) => p.url === clean)) continue;
    photos.push({ url: clean, title, width: Number(info.width || 0) });
    if (photos.length >= PER_CATEGORY) break;
  }

  if (!photos.length) throw new Error(`${slug}: no usable photos`);
  return photos;
}

async function main() {
  const out = {};
  const failures = [];
  for (const [slug, query] of Object.entries(CATEGORIES)) {
    try {
      out[slug] = await fetchCategory(slug, query);
      console.log(`${slug}: ${out[slug].map((p) => p.title).join(' | ')}`);
    } catch (err) {
      failures.push(`${slug}: ${err.message}`);
    }
  }

  if (failures.length) {
    console.error('\nFailed categories:\n' + failures.join('\n'));
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, '..', 'lib', 'seed', 'images.generated.json');
  await writeFile(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${Object.keys(out).length} categories to ${target}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
