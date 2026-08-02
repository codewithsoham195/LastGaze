/* ============================================================
   LASTGAZE — STOCK FILE
   This is the ONLY file you edit each week.
   1. Drop photos into  /img/   (name them anything)
   2. Add or edit an object below
   3. Save, push. Done.

   image: ""        -> renders an empty archive frame (no stock photo)
   image: "img/x.jpg" -> renders your photo
   sold: true       -> greys the card, strikes the price
   comingSoon: true -> displays a preview without enabling checkout
   ============================================================ */

window.LASTGAZE_DROP = {
  number: 4,                     // Drop 004
  opensAt: "2026-08-08T20:00:00+05:30",  // next Saturday 8PM IST
  password: "lastgaze"           // change this every drop
};

window.LASTGAZE_PRODUCTS = [
  {
    lot: "001",
    name: "Flared Denim — Light Wash",
    era: "Archive preview",
    cat: "denim",
    price: null,
    size: "",
    sold: false,
    comingSoon: true,
    image: "img/products/flared-denim-01.jpg",
    images: ["img/products/flared-denim-01.jpg"],
    condition: "Light-wash denim with a relaxed flare. Full details and measurements are being added.",
    measure: "Measurements coming soon."
  },
  {
    lot: "002",
    name: "Bootcut Denim — Dark Wash",
    era: "Archive preview",
    cat: "denim",
    price: null,
    size: "",
    sold: false,
    comingSoon: true,
    image: "img/products/flared-denim-02.jpg",
    images: ["img/products/flared-denim-02.jpg"],
    condition: "Dark-wash denim with a clean bootcut line. Full details and measurements are being added.",
    measure: "Measurements coming soon."
  },
  {
    lot: "003",
    name: "Relaxed Denim — Faded Blue",
    era: "Archive preview",
    cat: "denim",
    price: null,
    size: "",
    sold: false,
    comingSoon: true,
    image: "img/products/flared-denim-03.jpg",
    images: ["img/products/flared-denim-03.jpg"],
    condition: "Mid-wash denim with visible fading and a relaxed fit. Full details and measurements are being added.",
    measure: "Measurements coming soon."
  },
  {
    lot: "004",
    name: "Flared Denim — Indigo",
    era: "Archive preview",
    cat: "denim",
    price: null,
    size: "",
    sold: false,
    comingSoon: true,
    image: "img/products/flared-denim-04.jpg",
    images: ["img/products/flared-denim-04.jpg"],
    condition: "Indigo flared denim with contrast stitching and a pronounced leg shape. Full details and measurements are being added.",
    measure: "Measurements coming soon."
  },
  {
    lot: "005",
    name: "Trench — Stone",
    era: "1970s / UK",
    cat: "outerwear",
    price: 6400,
    size: "M",
    sold: false,
    image: "",
    images: ["", "", "", ""],
    condition: "Lining replaced once, cleanly. Belt present. Storm flap intact.",
    measure: "Chest 55cm · Length 104cm · Shoulder 47cm · Sleeve 63cm"
  },
  {
    lot: "006",
    name: "Sun-Faded Tee — Charcoal",
    era: "1990s / USA",
    cat: "tops",
    price: 1400,
    size: "M",
    sold: false,
    image: "",
    images: ["", "", "", ""],
    condition: "Single stitch. Fade is uneven and that is the point.",
    measure: "Chest 52cm · Length 70cm · Shoulder 44cm"
  },
  {
    lot: "007",
    name: "Cargo Trouser — Olive Drab",
    era: "1980s / Germany",
    cat: "trousers",
    price: 3100,
    size: "34",
    sold: false,
    image: "",
    images: ["", "", "", ""],
    condition: "Field-issue. Repaired at the right knee by a previous owner.",
    measure: "Waist 34in · Inseam 31in · Rise 30cm · Leg opening 20cm"
  },
  {
    lot: "008",
    name: "Suede Bomber — Tobacco",
    era: "1970s / Spain",
    cat: "outerwear",
    price: 7200,
    size: "L",
    sold: true,
    image: "",
    images: ["", "", "", ""],
    condition: "Deep patina across the shoulders. Zip runs clean.",
    measure: "Chest 57cm · Length 62cm · Shoulder 49cm · Sleeve 64cm"
  }
];
