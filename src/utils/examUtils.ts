import { ExamData, Section } from '../types/exam';
import { BACKEND_URL } from '../config';

const API_BASE = BACKEND_URL;

/** Fetch exam metadata (no questions/sections). */
export const loadExamData = async (examCode: string): Promise<ExamData | null> => {
  try {
    const response = await fetch(`${API_BASE}/api/exam/${examCode}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error loading exam:', error);
    return null;
  }
};

/**
 * Fetch exam sections (questions + options, no correct answers).
 * Requires the student's JWT invite token — only called when the exam actually starts,
 * so questions are never visible in the network tab during setup/disclaimer phases.
 */
export const loadExamQuestions = async (
  examCode: string,
  jwtToken: string,
): Promise<Section[] | null> => {
  try {
    const response = await fetch(`${API_BASE}/api/exam/${examCode}/questions`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.sections as Section[]) ?? null;
  } catch (error) {
    console.error('Error loading exam questions:', error);
    return null;
  }
};

export const formatTime = (seconds: number): string => {
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
