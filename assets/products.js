/* ============================================================
   LASTGAZE — STOCK FILE
   This is the ONLY file you edit each week.
   1. Drop photos into  /img/   (name them anything)
   2. Add or edit an object below
   3. Save, push. Done.

   image: ""        -> renders an empty archive frame (no stock photo)
   image: "/img/x.jpg" -> renders your photo (must start with a slash)
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
    image: "/img/products/hendrix-jns-01.jpg",
    images: ["/img/products/hendrix-jns-01.jpg", "/img/products/hendrix-jns-02.jpg"],
    condition: "8.5/10 — naturally faded dark wash with heavy whiskering throughout. No major stains or tears; light signs of wear consistent with vintage/pre-owned denim. Frayed hems at the leg openings add to the worn-in look. Pockets, stitching, zipper, and button all intact and functional. Relaxed bootcut / straight-flare silhouette in washed black / charcoal blue.",
    measure: "Waist: 34\"<br>Outseam (Length): 42\"<br>Inseam: 32\"<br>Rise: 10.5\"<br>Leg Opening: 10\""
  },
  {
    lot: "010",
    name: "Urbanage Design Essentials — Grey Puffer Jacket",
    era: "Winter outerwear",
    cat: "outerwear",
    price: 20000,
    size: "L",
    sold: false,
    image: "/img/products/puffer-grey-01.jpg",
    images: ["/img/products/puffer-grey-01.jpg", "/img/products/puffer-grey-02.jpg"],
    condition: "9/10 — like-new condition with no visible stains, tears, or fading. Zipper, snap-button collar closure, and both hand pockets fully functional. Minimal signs of wear consistent with light or no prior use. Relaxed boxy silhouette in solid grey nylon with front zip closure and branded chest/back graphics.",
    measure: "Chest: 24\"<br>Length: 27\"<br>Shoulder: 20\"<br>Sleeve: 25\""
  },
  {
    lot: "011",
    name: "STAY — Striped Long Sleeve Tee",
    era: "Long sleeve tee",
    cat: "tees",
    price: 1500,
    size: "L",
    sold: false,
    image: "/img/products/stay-striped-tee-01.jpg",
    images: ["/img/products/stay-striped-tee-01.jpg"],
    condition: "9.5/10 — like-new condition with no visible stains, tears, or fading. Crew neckline and cuffs fully intact. Minimal signs of wear consistent with light or no prior use. Relaxed silhouette in black and cream stripe with woven STAY neck label.",
    measure: "Chest: 22\"<br>Length: 28\"<br>Shoulder: 19\"<br>Sleeve: 25\""
  }
];
