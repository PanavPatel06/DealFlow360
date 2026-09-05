import { applyBps } from '@dealflow/contracts';

/** The only arithmetic on a quote. Integers in, integers out (invariant 1). */
export type TotalsLine = {
  qty: number;
  unitPriceMinor: number;
  discountBps: number;
  costMinor: number;
};

export const lineGrossMinor = (l: TotalsLine) => l.qty * l.unitPriceMinor;
export const lineTotalMinor = (l: TotalsLine) =>
  lineGrossMinor(l) - applyBps(lineGrossMinor(l), l.discountBps);

export type Totals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  marginBps: number;
};

/** taxBps comes from B3's tax rules. Nothing here decides a rate. */
export function computeTotals(lines: TotalsLine[], taxBps: number): Totals {
  const subtotalMinor = lines.reduce((s, l) => s + lineGrossMinor(l), 0);
  const netMinor = lines.reduce((s, l) => s + lineTotalMinor(l), 0);
  const costMinor = lines.reduce((s, l) => s + l.qty * l.costMinor, 0);
  const taxMinor = applyBps(netMinor, taxBps);
  return {
    subtotalMinor,
    discountMinor: subtotalMinor - netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    marginBps: netMinor === 0 ? 0 : Math.round(((netMinor - costMinor) * 10000) / netMinor),
  };
}
