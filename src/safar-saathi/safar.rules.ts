// Place names as members type them, in Hindi or a common English spelling, mapped to one key per place, so
// "इंदौर", " INDORE " and "Indore, M.P." are the same starting point. Add a spelling here and to the
// migration that rewrites stored keys (20261220000000_safar_route_keys) together.
const spellings: Record<string, string> = {
  इंदौर: "indore",
  indor: "indore",
  खरगोन: "khargone",
  khargon: "khargone",
  khargaon: "khargone",
  खंडवा: "khandwa",
  khandava: "khandwa",
  भोपाल: "bhopal",
  उज्जैन: "ujjain",
  बड़वानी: "barwani",
  badwani: "barwani",
  धार: "dhar",
  मुंबई: "mumbai",
  bombay: "mumbai",
  दिल्ली: "delhi",
  बुरहानपुर: "burhanpur",
  सनावद: "sanawad",
  बड़वाह: "barwaha",
  badwaha: "barwaha",
  कसरावद: "kasrawad",
  महेश्वर: "maheshwar",
  मंडलेश्वर: "mandleshwar",
  सेंधवा: "sendhwa",
  ओंकारेश्वर: "omkareshwar",
};
// Keys in the same Unicode form as routeKey's input (ड़ may be typed as one letter or ड + ़).
const aliases: Record<string, string> = Object.fromEntries(Object.entries(spellings).map(([spelling, key]) => [spelling.normalize("NFKC"), key]));
export const routeKey = (value: string): string => {
  const key = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\(.*?\)/g, " ") // "Khargone (MP)"
    .replace(/[\s,.-]+/g, " ")
    .trim()
    .replace(/ (m ?p|madhya pradesh)$/, ""); // "Indore, M.P.", "Indore Madhya Pradesh"
  return aliases[key] || key;
};
export const indiaToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const validTravelDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= indiaToday();
};
// What a request can get from a travel plan: a parcel needs a traveller who carries items (DELIVERY or BOTH), a
// companion request a traveller who takes people (TRAVEL or BOTH); an urgent request is a journey, so TRAVEL too.
export const compatibleType = (request: string, offer: string): boolean => offer === "BOTH" || (request === "URGENT" ? offer === "TRAVEL" : request === offer);
export const mobileDigits = (value: string | null | undefined): string => (value || "").replace(/\D/g, "").slice(-10);

// A travel plan and a request match when their departures are at most this far apart, counted on date and time
// together (23:30 and 00:30 the next day are one hour apart). Both are India times as the member typed them, so no
// time zone is involved.
export const MATCH_WINDOW_MINUTES = 240;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const departureMinutes = (travelDate: Date, preferredTime: string): number => {
  const [hours, minutes] = preferredTime.split(":").map(Number);
  return Math.round(travelDate.getTime() / 60000) + hours * 60 + minutes;
};
export const minutesApart = (a: { travelDate: Date; preferredTime: string }, b: { travelDate: Date; preferredTime: string }): number =>
  Math.abs(departureMinutes(a.travelDate, a.preferredTime) - departureMinutes(b.travelDate, b.preferredTime));

// One request and one travel plan that may help each other: opposite kinds, same route (by key), compatible
// assistance, departures within the window. Who posted them and their status are checked by the caller.
export interface MatchableEntry {
  kind: string;
  requestType: string;
  originKey: string;
  destinationKey: string;
  travelDate: Date;
  preferredTime: string;
}
export const canMatch = (a: MatchableEntry, b: MatchableEntry): boolean => {
  if (a.kind === b.kind) return false;
  const [request, offer] = a.kind === "REQUEST" ? [a, b] : [b, a];
  return (
    request.originKey === offer.originKey &&
    request.destinationKey === offer.destinationKey &&
    compatibleType(request.requestType, offer.requestType) &&
    minutesApart(request, offer) <= MATCH_WINDOW_MINUTES
  );
};
