import React from 'react';
import { ExamData } from '../types/exam';
import { generatePDF } from '../utils/pdfGenerator';

interface ResultScreenProps {
  examData: ExamData;
  studentName: string;
  score: number;
  totalMarks: number;
  details: any[];
  onRestart: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  examData,
  studentName,
  score,
  totalMarks,
  details,
  onRestart,
}) => {
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  const rd = examData.resultDisplay ?? {};

  const hasAnyDisplay = Object.values(rd).some((v) => v === true);

  const handleDownloadPDF = () => {
    generatePDF(
      examData,
      studentName,
      score,
      totalMarks,
      details,
      examData.resultDisplay?.pdfMode ?? 'summary'
    );
  };

  const getGrade = (percent: number): string => {
    const grades = examData.grading;
    if (!grades || grades.length === 0) return 'N/A';
    const grade = [...grades]
      .sort((a, b) => b.minPercentage - a.minPercentage)
      .find((g) => percent >= g.minPercentage);
    return grade ? grade.grade : 'F';
  };

  // Minimal view: only success message + exam title
  if (!hasAnyDisplay) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <svg
              className="w-12 h-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-3">Exam Submitted Successfully!</h1>
          <p className="text-gray-600 text-lg">{examData.examTitle}</p>
        </div>
      </div>
    );
  }

  // Determine which fields to show in the score panel
  const showPanel =
    rd.showStudentName || rd.showExamCode || rd.showScore || rd.showTotalMarks || rd.showGrade;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-4xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <svg
              className="w-12 h-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Exam Submitted Successfully!</h1>
          <p className="text-gray-600">{examData.examTitle}</p>
        </div>

        {showPanel && (
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white mb-6">
            {(rd.showStudentName || rd.showExamCode) && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                {rd.showStudentName && (
                  <div>
                    <p className="text-blue-100 text-sm mb-1">Student Name</p>
                    <p className="text-xl font-semibold">{studentName}</p>
                  </div>
                )}
                {rd.showExamCode && (
                  <div>
                    <p className="text-blue-100 text-sm mb-1">Exam Code</p>
                    <p className="text-xl font-semibold">{examData.examCode}</p>
                  </div>
                )}
              </div>
            )}

            {(rd.showScore || rd.showTotalMarks || rd.showGrade) && (
              <div className={`${(rd.showStudentName || rd.showExamCode) ? 'border-t border-blue-400 pt-4' : ''}`}>
                <div
                  className={`grid gap-4 text-center ${
                    [rd.showScore, rd.showTotalMarks, rd.showGrade].filter(Boolean).length === 1
                      ? 'grid-cols-1'
                      : [rd.showScore, rd.showTotalMarks, rd.showGrade].filter(Boolean).length === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-3'
                  }`}
                >
                  {rd.showScore && (
                    <div>
                      <p className="text-4xl font-bold">{score.toFixed(2)}</p>
                      <p className="text-blue-100 text-sm mt-1">Score</p>
                    </div>
                  )}
                  {rd.showTotalMarks && (
                    <div>
                      <p className="text-4xl font-bold">{totalMarks}</p>
                      <p className="text-blue-100 text-sm mt-1">Total Marks</p>
                    </div>
                  )}
                  {rd.showGrade && examData.grading && (
                    <div>
                      <p className="text-4xl font-bold">{getGrade(percentage)}</p>
                      <p className="text-blue-100 text-sm mt-1">Grade</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {rd.showPerformanceSummary && (
          <>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Performance Summary</h2>
              {/* Verbal questions are scored asynchronously — exclude from MCQ counters */}
              {(() => {
                const mcq     = details.filter((d) => d.questionType !== 'verbal');
                const verbal  = details.filter((d) => d.questionType === 'verbal');
                const correct = mcq.filter((d) => d.correct).length;
                const wrong   = mcq.filter((d) => !d.correct && d.marksAwarded < 0).length;
                const skip    = mcq.filter((d) => d.marksAwarded === 0 && !d.correct).length;
                const cols    = verbal.length > 0 ? 5 : 4;
                return (
                  <>
                    <div className={`grid grid-cols-2 md:grid-cols-${cols} gap-4 mb-4`}>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{correct}</p>
                        <p className="text-sm text-gray-600">Correct</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-500">{wrong}</p>
                        <p className="text-sm text-gray-600">Incorrect</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-500">{skip}</p>
                        <p className="text-sm text-gray-600">Unattempted</p>
                      </div>
                      {verbal.length > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-orange-500">{verbal.length}</p>
                          <p className="text-sm text-gray-600">Verbal</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-800">{percentage.toFixed(1)}%</p>
                        <p className="text-sm text-gray-600">MCQ %</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all duration-1000"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="max-h-64 overflow-y-auto bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="font-bold text-gray-800 mb-3">Question-wise Results</h3>
              <div className="space-y-2">
                {details.map((detail) => (
                  <div
                    key={detail.questionId}
                    className="flex items-center justify-between p-3 bg-white rounded-lg"
                  >
                    <span className="font-medium text-gray-700">Question {detail.questionNumber}</span>
                    <div className="flex items-center gap-4">
                      {detail.questionType === 'verbal' ? (
                        <span className="font-semibold text-orange-600">Verbal — Audio Recorded</span>
                      ) : (
                        <span className={`font-semibold ${detail.correct ? 'text-green-600' : 'text-red-600'}`}>
                          {detail.correct ? '✓ Correct' : '✗ Incorrect'}
                        </span>
                      )}
                      <span className="text-gray-600">
                        {detail.questionType === 'verbal'
                          ? `— / ${detail.totalMarks}`
                          : `${detail.marksAwarded >= 0 ? '+' : ''}${detail.marksAwarded.toFixed(2)} / ${detail.totalMarks}`
                        }
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {(rd.showPdfDownload || rd.showRetakeButton) && (
          <div className="flex gap-4">
            {rd.showPdfDownload && (
              <button
                onClick={handleDownloadPDF}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
              >
                Download PDF Report
              </button>
            )}
            {rd.showRetakeButton && (
              <button
                onClick={onRestart}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition"
              >
                Take Another Exam
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
