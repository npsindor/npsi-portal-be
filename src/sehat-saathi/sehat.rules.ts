import { routeKey } from "../safar-saathi/safar.rules.js";

const areaAliases: Record<string, string> = {
  "विजय नगर": "vijay nagar",
  भंवरकुआँ: "bhawarkuan",
  भंवरकुआं: "bhawarkuan",
  bhanwarkuan: "bhawarkuan",
  बाणगंगा: "banganga",
  राऊ: "rau",
  "राजेंद्र नगर": "rajendra nagar",
  "राजेन्द्र नगर": "rajendra nagar",
  "सुदामा नगर": "sudama nagar",
  पलासिया: "palasia",
  खजराना: "khajrana",
  "महालक्ष्मी नगर": "mahalaxmi nagar",
  लसूड़िया: "lasudia",
  एरोड्रम: "aerodrome",
  "नंदा नगर": "nanda nagar",
};
export const regionKey = (value: string): string => {
  const normalized = routeKey(value);
  return areaAliases[normalized] || normalized;
};
