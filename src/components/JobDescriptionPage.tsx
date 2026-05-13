import React from 'react';
import { ExamData } from '../types/exam';

interface Props {
  examData: ExamData;
  studentName: string;
  studentEmail: string;
  onNext: () => void;
}

export const JobDescriptionPage: React.FC<Props> = ({
  examData,
  studentName,
  studentEmail,
  onNext,
}) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-slate-800 px-8 py-6 text-white">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
            Exam Invitation
          </p>
          <h1 className="text-2xl font-bold">{examData.examTitle}</h1>
          <div className="flex items-center gap-3 mt-3 text-sm text-slate-300">
            <span>Code: <span className="font-mono font-semibold text-white">{examData.examCode}</span></span>
            <span className="text-slate-500">·</span>
            <span>Duration: {Math.floor(examData.duration / 60)} min</span>
          </div>
        </div>

        {/* Candidate info */}
        <div className="px-8 py-4 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
            {studentName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{studentName}</p>
            <p className="text-xs text-gray-500">{studentEmail}</p>
          </div>
        </div>

        {/* Job Description */}
        <div className="px-8 py-6">
          <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Job Description
          </h2>
          <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-4 border border-gray-100 max-h-80 overflow-y-auto">
            {examData.jobDescription?.trim()
              ? examData.jobDescription
              : <span className="text-gray-400 italic">No job description provided.</span>
            }
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Please read the job description carefully before proceeding.
          </p>
          <button
            onClick={onNext}
            className="px-6 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition flex items-center gap-2"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
