// exceljs's ESM/browser bundle has no bundled type declarations for this
// specific deep-import path. We lazy-load it (see lib/reportExcelUtils.ts)
// to avoid Next.js bundler issues with the full package - this shim just
// tells TypeScript the shape matches the regular "exceljs" package types,
// which the top-level "exceljs" package.json already ships.
declare module "exceljs/dist/exceljs.min.js" {
  import ExcelJS from "exceljs";
  export = ExcelJS;
}
