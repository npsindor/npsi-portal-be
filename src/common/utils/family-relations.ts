// A family member's father / guardian, from the family registration. The family head is not everyone's father:
// a son or daughter of the head gets the head's name; the head gets the member registered as "Father"; for other
// relations (spouse, parents, siblings) nothing is guessed.
export const guardianNameOf = (
  member: { relationship: string | null | undefined },
  family: { headName: string | null | undefined },
  fatherInFamily: string | null | undefined,
): string | null => {
  const relationship = String(member.relationship || "").toLowerCase();
  if (relationship === "son" || relationship === "daughter") return family.headName || null;
  if (relationship === "head" || relationship === "self") return fatherInFamily || null;
  return null;
};
