/**
 * camelCase -> snake_case.
 *
 * A boundary is inserted only before an uppercase letter that follows a
 * lowercase one, so `smiKgM2` -> `smi_kg_m2` (the `2` stays attached to its
 * `M`) while `totalBodyWaterL` -> `total_body_water_l`. Splitting on digits as
 * well would produce `smi_kg_m_2`, which does not match the column name.
 */
export const toSnake = (input: string): string =>
  input.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

/** snake_case -> camelCase. Inverse of `toSnake`. */
export const toCamel = (input: string): string =>
  input.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
