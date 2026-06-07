/**
 * Global TypeScript types, interfaces, and utility types.
 *
 * This file is auto-imported via tsconfig.json typeRoots.
 * Add project-wide type definitions here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Branded type — prevents accidental mixing of UUIDs with plain strings. */
export type UUID = string & { readonly __brand: 'UUID' };

/** ISO 8601 timestamp string (UTC). */
export type ISODateString = string & { readonly __brand: 'ISODateString' };

/** Numeric(15,2) monetary value in BDT. */
export type Money = number & { readonly __brand: 'Money' };

/** Percentage value (0-100). */
export type Percentage = number & { readonly __brand: 'Percentage' };

/** Generic constructor type for mixins and DI. */
export type Constructor<T = object> = new (...args: any[]) => T;

/** Deep partial — makes all nested properties optional. */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/** Require at least one key from a union of keys. */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

/** Extract the resolved type from a Promise. */
export type Awaited<T> = T extends Promise<infer U> ? U : T;
