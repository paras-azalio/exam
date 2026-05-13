import React from 'react';

interface Props {
  violations: number;
  maxViolations: number;
  onAcknowledge: () => void;
}

/**
 * Shown when the violation count reaches the limit and the exam is auto-submitted.
 * Replaces the native browser alert().
 */
export const ViolationModal: React.FC<Props> = ({ violations, maxViolations, onAcknowledge }) => (
  <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4">
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Exam Auto-Submitted</h2>
      <p className="text-gray-500 text-sm mb-1">
        You reached <span className="font-semibold text-red-600">{violations} of {maxViolations}</span> allowed violations.
      </p>
      <p className="text-gray-500 text-sm mb-6">
        Your exam has been automatically submitted with all answers recorded so far.
      </p>
      <button
        onClick={onAcknowledge}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-xl transition text-sm"
      >
        View Results
      </button>
    </div>
  </div>
);
