// Phase 9 (H9 a/a): the Reports company filter. One filter for the whole
// page and every export, by the employee's CURRENT company (same as every
// report already uses). Pure - test/reportCompanyFilter.test.mjs.
//   "all"  - everyone
//   "main" - in-house (no subcontractor)
//   any other value - that subcontractor's id
export type CompanyFilter = string;

export const ALL_COMPANIES = "all";
export const MAIN_COMPANY = "main";

export function companyMatches(filter: CompanyFilter, subcontractorId: string | null | undefined): boolean {
  if (!filter || filter === ALL_COMPANIES) return true;
  if (filter === MAIN_COMPANY) return !subcontractorId;
  return subcontractorId === filter;
}
