import EmployeeNoticeContent from "@/components/legal/EmployeeNoticeContent";

export default function EmployeeNoticePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 p-6 md:p-10 print:border-0 print:p-0">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6 print:hidden">
          Employee Biometric and Location Notice Template
        </h1>
        <EmployeeNoticeContent />
      </div>
    </div>
  );
}
