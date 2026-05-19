/** Конкатенация tailwind-классов с фильтрацией falsy */
export function cn(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(" ");
}
