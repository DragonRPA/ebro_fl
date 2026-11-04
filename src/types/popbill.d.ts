declare module 'popbill' {
  const popbill: any;
  export default popbill;
  export function config(options: Record<string, any>): void;
  export function TaxinvoiceService(): any;
}
