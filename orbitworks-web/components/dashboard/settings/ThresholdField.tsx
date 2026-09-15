"use client";

export function ThresholdField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 pb-3.5">
      <label className="text-xs text-gray-600">{label}</label>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : 0)}
        className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <span className="text-xs text-gray-600">{suffix}</span>
    </div>
  );
}
