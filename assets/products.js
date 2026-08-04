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
    lot: "009",
    name: "Hendrix JNS — Dark Wash Bootcut",
    era: "Vintage denim",
    cat: "denim",
    price: 2000,
    size: "34",
    sold: false,
    image: "img/products/hendrix-jns-01.jpg",
    images: ["img/products/hendrix-jns-01.jpg", "img/products/hendrix-jns-02.jpg", "img/products/hendrix-jns-03.jpg"],
    condition: "8.5/10 — naturally faded dark wash with heavy whiskering throughout. No major stains or tears; light signs of wear consistent with vintage/pre-owned denim. Frayed hems at the leg openings add to the worn-in look. Pockets, stitching, zipper, and button all intact and functional. Relaxed bootcut / straight-flare silhouette in washed black / charcoal blue.",
    measure: "Waist 34in · Additional measurements coming soon"
  }
];
