// Editorial scenery selected for each river, independent of access-point ordering.
// Scene identities and selection rationale: docs/river-photo-selections-2026-11.md.
// Source/rights history: docs/river-photo-coverage.md.
export const RIVER_PHOTOS: Record<string, string> = {
  "big-piney": "https://live.staticflickr.com/65535/50113156763_bc580a0428_b.jpg",
  "black": "https://commons.wikimedia.org/wiki/Special:FilePath/Johnsons_Shutins_autumn_panorama-panini_20130126.jpg?width=1200",
  "bourbeuse": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Mill%20Rock%20Access_0.JPG?itok=s0Cfs7Bh",
  "buffalo": "https://commons.wikimedia.org/wiki/Special:FilePath/Overlooking_The_Buffalo_River.jpg?width=1200",
  "caddo-river": "https://commons.wikimedia.org/wiki/Special:FilePath/Norman%2C_AR_002.jpg?width=1280",
  "courtois": "https://bassresort.com/wp-content/uploads/2026/04/HF7A3480-1-1500x966.jpg",
  "crooked-creek": "https://commons.wikimedia.org/wiki/Special:FilePath/Yellville%2C_AR_022.jpg?width=1200",
  "current": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
  "eleven-point": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1772684350701-Screenshot_2026-03-04_at_10.17.28_PM-xdckf4y6I39XCGOXwmiC66x1jvEA4s.png",
  "gasconade": "https://gasconadehills.com/wp-content/uploads/2024/01/Stephanie-McInturff.jpg",
  "huzzah": "https://commons.wikimedia.org/wiki/Special:FilePath/Dillard_Mill_SHS_20090726_02.jpg?width=1200",
  "jacks-fork": "https://www.nps.gov/common/uploads/structured_data/FC81858D-AFE8-773D-E2CA4BC835CC91C3.jpg",
  "kings-river": "https://commons.wikimedia.org/wiki/Special:FilePath/Kings_River_Falls_002.jpg?width=1200",
  "meramec": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773858582004-Screenshot_2026-03-18_at_1.29.34_PM-hApumthKHhRumeFQN6QpYRYgesNWve.png",
  "mulberry": "https://live.staticflickr.com/4619/25631401007_d4f96050b4_b.jpg",
  "niangua": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1773883574106-Screenshot_2026-03-18_at_8.26.06_PM-KvQqnT3PZJtQeXmQ2woqigz7Jnui8B.png",
  "north-fork-white": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Hebron%20Access.JPG?itok=sqDqwbyR",
  "spring-river": "https://www.arkansas.com/sites/default/files/styles/max_2600x2600/public/2026-01/Mammoth_Springs_closeWaterfall_opt.jpg?itok=Y-H8m6Ss",
  "st-francis": "https://commons.wikimedia.org/wiki/Special:FilePath/St._Francis_River_at_Silver_Mines_Recreation_Area_1.jpg?width=1200",
  "war-eagle-creek": "https://commons.wikimedia.org/wiki/Special:FilePath/War_Eagle_Creek_at_Withrow_Springs_State_Park.jpg?width=1200",
  "big-river": "https://commons.wikimedia.org/wiki/Special:FilePath/Cedar_Hill_Dam_on_Big_River_in_Missouri.JPG?width=1280",
  "bryant-creek": "https://commons.wikimedia.org/wiki/Special:FilePath/BryantCreek_02.jpg?width=1280",
  "james": "https://commons.wikimedia.org/wiki/Special:FilePath/James_River_in_Springfield_Missouri_USA.jpg?width=1280",
  "spring-river-mo": "https://commons.wikimedia.org/wiki/Special:FilePath/Spring_River%2C_La_Russell_Mo.JPG?width=1280",
  "elk": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Mount%20Shira%20Access.JPG?itok=P5pXzCkz",
  "white": "https://eddy.guide/images/river-guides/white.webp",
  "taneycomo": "https://eddy.guide/images/river-guides/taneycomo.webp",
  "norfork-tailwater": "https://eddy.guide/images/river-guides/norfork-tailwater-river.webp"
};

export const RIVER_PHOTO_CREDITS: Record<string, { text: string; url: string }> = {
  "buffalo": {
    "text": "Doug Wertman · CC BY 2.0",
    "url": "https://commons.wikimedia.org/wiki/File:Overlooking_The_Buffalo_River.jpg"
  },
  "caddo-river": {
    "text": "Brandonrush · CC0",
    "url": "https://commons.wikimedia.org/wiki/File:Norman,_AR_002.jpg"
  },
  "mulberry": {
    "text": "Tim Palmer / USDA Forest Service · Public domain",
    "url": "https://www.flickr.com/photo.gne?id=25631401007"
  },
  "st-francis": {
    "text": "Kbh3rd · CC BY 2.5",
    "url": "https://commons.wikimedia.org/wiki/File:St._Francis_River_at_Silver_Mines_Recreation_Area_1.jpg"
  },
  "big-river": {
    "text": "Marcusscotus1 · Public domain",
    "url": "https://commons.wikimedia.org/wiki/File:Cedar_Hill_Dam_on_Big_River_in_Missouri.JPG"
  },
  "bryant-creek": {
    "text": "Missouri State Parks · Public domain",
    "url": "https://commons.wikimedia.org/wiki/File:BryantCreek_02.jpg"
  },
  "james": {
    "text": "Cold417 · CC BY-SA 3.0",
    "url": "https://commons.wikimedia.org/wiki/File:James_River_in_Springfield_Missouri_USA.jpg"
  },
  "spring-river-mo": {
    "text": "Traveler7 · Public domain",
    "url": "https://commons.wikimedia.org/wiki/File:Spring_River%2C_La_Russell_Mo.JPG"
  },
  "big-piney": {
    "text": "Richard Ricciardi · CC BY 2.0",
    "url": "https://www.flickr.com/photos/ricricciardi/50113156763/"
  },
  "black": {
    "text": "Kbh3rd · CC BY 3.0",
    "url": "https://commons.wikimedia.org/wiki/File:Johnsons_Shutins_autumn_panorama-panini_20130126.jpg"
  },
  "bourbeuse": {
    "text": "Missouri Department of Conservation",
    "url": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Mill%20Rock%20Access_0.JPG?itok=s0Cfs7Bh"
  },
  "crooked-creek": {
    "text": "Brandonrush · CC BY-SA 4.0",
    "url": "https://commons.wikimedia.org/wiki/File:Yellville,_AR_022.jpg"
  },
  "gasconade": {
    "text": "Gasconade Hills Resort",
    "url": "https://gasconadehills.com/"
  },
  "huzzah": {
    "text": "Kbh3rd · CC BY-SA 3.0",
    "url": "https://commons.wikimedia.org/wiki/File:Dillard_Mill_SHS_20090726_02.jpg"
  },
  "jacks-fork": {
    "text": "NPS / Jessica Poppa · Public domain",
    "url": "https://www.nps.gov/ozar/planyourvisit/blue-spring-campground.htm"
  },
  "kings-river": {
    "text": "Brandonrush · CC BY-SA 3.0",
    "url": "https://commons.wikimedia.org/wiki/File:Kings_River_Falls_002.jpg"
  },
  "north-fork-white": {
    "text": "Missouri Department of Conservation",
    "url": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Hebron%20Access.JPG?itok=sqDqwbyR"
  },
  "war-eagle-creek": {
    "text": "Brandonrush · CC0",
    "url": "https://commons.wikimedia.org/wiki/File:War_Eagle_Creek_at_Withrow_Springs_State_Park.jpg"
  },
  "elk": {
    "text": "Missouri Department of Conservation",
    "url": "https://mdc.mo.gov/sites/default/files/styles/gallery_main_image/public/mo_nature/images/conservation/Mount%20Shira%20Access.JPG?itok=P5pXzCkz"
  },
  "white": {
    "text": "Brett Billings / USFWS · Public domain",
    "url": "https://commons.wikimedia.org/wiki/File:Group_fishing_in_boat_near_Bull_Shoals_Dam_on_White_River.jpg"
  },
  "taneycomo": {
    "text": "Luke Wisley · CC BY 2.0",
    "url": "https://commons.wikimedia.org/wiki/File:Taneycomo_fog.jpg"
  },
  "norfork-tailwater": {
    "text": "Brandonrush · CC0",
    "url": "https://commons.wikimedia.org/wiki/File:North_Fork_White_River_downstream_from_Norfork_Dam.jpg"
  }
};
