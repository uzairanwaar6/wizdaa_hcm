import { ValueTransformer } from 'typeorm';

export class NumericTransformer implements ValueTransformer {
  to(value: number | null | undefined): number | null | undefined {
    return value;
  }

  from(value: string | number | null | undefined): number | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return typeof value === 'string' ? Number.parseFloat(value) : value;
  }
}

export const numericTransformer = new NumericTransformer();
