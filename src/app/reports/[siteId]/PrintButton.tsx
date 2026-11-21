"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ui-button print:hidden bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
    >
      Print / Save as PDF
    </button>
  );
}
