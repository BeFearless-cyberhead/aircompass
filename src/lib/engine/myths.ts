/**
 * Myth cards (§5.8): common misconceptions about air quality.
 * Each cites a source in METHODOLOGY.
 */
export interface Myth {
  id: string;
  i18nKey: string;
  titleEn: string;
  factEn: string;
  source: string;
}

export const MYTHS: Myth[] = [
  {
    id: "cloth_mask_vs_n95",
    i18nKey: "myth.cloth_mask",
    titleEn: "Cloth and surgical masks filter PM2.5",
    factEn: "Only N95/FFP2 respirators with a proper seal significantly reduce fine particle inhalation. Cloth and surgical masks block large droplets but let most PM2.5 through.",
    source: "US EPA, WHO guidance on respiratory protection",
  },
  {
    id: "indoor_plants",
    i18nKey: "myth.plants",
    titleEn: "Indoor plants clean the air",
    factEn: "Peer-reviewed studies show that the number of plants needed to measurably reduce PM2.5 in a room is impractically large. A single HEPA purifier outperforms hundreds of plants.",
    source: "Cummings & Waring, 2020, J Expo Sci Environ Epidemiol",
  },
  {
    id: "ionizer_ozone",
    i18nKey: "myth.ionizer",
    titleEn: "Ionizer or ozone purifiers are effective",
    factEn: "Ionizers and ozone generators can produce ozone, a lung irritant, and are far less effective at particle removal than HEPA filters. Some consumer models exceed safe ozone levels.",
    source: "California EPA, US EPA ozone generator guidance",
  },
  {
    id: "air_fresheners",
    i18nKey: "myth.fresheners",
    titleEn: "Air fresheners improve air quality",
    factEn: "Air fresheners mask odours but add volatile organic compounds (VOCs) and secondary particulate matter to indoor air, worsening overall air quality.",
    source: "Steinemann, 2017, Building & Environment",
  },
];
