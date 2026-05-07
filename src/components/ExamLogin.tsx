import React, { useState } from 'react';
import { ExamData } from '../types/exam';
import { loadExamData } from '../utils/examUtils';

interface ExamLoginProps {
  onStart: (examData: ExamData, studentName: string) => void;
}

export const ExamLogin: React.FC<ExamLoginProps> = ({ onStart }) => {
  const [studentName, setStudentName] = useState('');
  const [examCode, setExamCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!studentName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!examCode.trim()) {
      setError('Please enter exam code');
      return;
    }

    setLoading(true);
    const data = await loadExamData(examCode.toUpperCase());
    setLoading(false);

    if (!data) {
      setError('Invalid exam code. Please check and try again.');
      return;
    }

    onStart(data, studentName.trim());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Exam Portal</h1>
          <p className="text-gray-600">Enter your details to begin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Exam Code
            </label>
            <input
              type="text"
              id="code"
              value={examCode}
              onChange={(e) => setExamCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition uppercase"
              placeholder="Enter exam code"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Start Exam'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-2">Enter Name and Exam code</p>
        </div>
      </div>
    </div>
  );
};
