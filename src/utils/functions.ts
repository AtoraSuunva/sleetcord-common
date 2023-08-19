/**
 * A predicate function for filtering out nullish values
 *
 * @example
 * const notNull: string[] = ['a', null, 'b', undefined, 'c'].filter(notNullish)
 * @param value A value that might be null or undefined
 * @returns True if the value is not null or undefined, false otherwise
 */
export function notNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
