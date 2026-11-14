const aliases: Record<string, string> = {
  इंदौर: "indore",
  खरगोन: "khargone",
  खंडवा: "khandwa",
  भोपाल: "bhopal",
  उज्जैन: "ujjain",
  बड़वानी: "barwani",
  धार: "dhar",
  मुंबई: "mumbai",
  दिल्ली: "delhi",
  बुरहानपुर: "burhanpur",
};
export const routeKey = (value: string): string => {
  const key = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s,.-]+/g, " ");
  return aliases[key] || key;
};
export const indiaToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const validTravelDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= indiaToday();
};
export const compatibleType = (request: string, offer: string): boolean => offer === "BOTH" || (request === "URGENT" ? offer === "TRAVEL" : request === offer);
export const mobileDigits = (value: string | null | undefined): string => (value || "").replace(/\D/g, "").slice(-10);
