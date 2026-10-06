// Only the listed fields of `input` (those that are present).
export const pick = <T extends object, K extends keyof T>(input: T, fields: readonly K[]): Pick<T, K> =>
  Object.fromEntries(fields.filter((field) => field in input).map((field) => [field, input[field]])) as Pick<T, K>;
