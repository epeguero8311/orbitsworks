import BiometricPolicyContent from "@/components/legal/BiometricPolicyContent";

export default function BiometricPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 p-6 md:p-10">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">
          Biometric Data Policy
        </h1>
        <BiometricPolicyContent />
      </div>
    </div>
  );
}