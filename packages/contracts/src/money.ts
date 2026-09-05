/** Money is always integer minor units plus a currency code. No floats, anywhere. */
export type Money = { amountMinor: number; currency: string };

export const money = (amountMinor: number, currency: string): Money => ({
  amountMinor: Math.round(amountMinor),
  currency,
});

/** bps of an amount, rounded half-up to the minor unit. */
export const applyBps = (amountMinor: number, bps: number): number =>
  Math.round((amountMinor * bps) / 10000);
