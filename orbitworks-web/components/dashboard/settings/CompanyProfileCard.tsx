"use client";

export function CompanyProfileCard({
  companyName,
  onCompanyNameChange,
  logoUrl,
  logoPreview,
  onLogoChange,
}: {
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  logoUrl: string | null;
  logoPreview: string | null;
  onLogoChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">
        Company profile
      </h2>

      <div className="mt-5 flex items-center gap-4">
        {logoPreview || logoUrl ? (
          <img
            src={logoPreview ?? logoUrl ?? undefined}
            alt="Company logo"
            className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-600">
            No logo
          </div>
        )}
        <div>
          <label
            htmlFor="companyLogo"
            className="cursor-pointer rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
          >
            {logoUrl ? "Change logo" : "Upload logo"}
          </label>
          <input
            id="companyLogo"
            type="file"
            accept="image/*"
            onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="companyName"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Company name
        </label>
        <input
          id="companyName"
          type="text"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
  );
}
