// Who appears on the public home page: the "NPS Family Heads" carousel and today's birthday wishes. Only ACTIVE
// families an administrator switched on (families.show_on_home); birthdays only for ACTIVE adult members, so no
// child's name and birthday is published. Neither list shows a family id, a contact or a birth year.

export const MIN_BIRTHDAY_AGE = 18;

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

// Whether a birth date falls on `today` (YYYY-MM-DD, India time). 29 February birthdays are wished on 28 February in
// other years.
export const isBirthdayOn = (dob: Date, today: string): boolean => {
  const [, month, day] = isoDay(dob).split("-");
  const [year, todayMonth, todayDay] = today.split("-");
  if (month === todayMonth && day === todayDay) return true;
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return month === "02" && day === "29" && todayMonth === "02" && todayDay === "28" && !leap(Number(year));
};

// Whole years between a birth date and `today` (YYYY-MM-DD).
export const ageOn = (dob: Date, today: string): number => {
  const [y, m, d] = isoDay(dob).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

export const isHead = (relationship: string | null | undefined): boolean => ["head", "self", "मुखिया"].includes((relationship || "").trim().toLowerCase());
