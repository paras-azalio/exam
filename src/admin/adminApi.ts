import { BACKEND_URL } from '../config';

const API_BASE = `${BACKEND_URL}/api/admin`;

export interface ExamRow {
  id: number;
  examCode: string;
  examTitle: string;
  examData: string;
  active: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface RecordingsData {
  sessionKey: string;
  html: string | null;       // filename like "{sessionKey}.html", or null
  camera: string[];          // sorted chunk filenames
  screen: string[];          // sorted chunk filenames
  verbal: string[];          // verbal_*.webm filenames (one per verbal question)
}

/** One verbal AI evaluation record — mirrors the ai_result DB table. */
export interface AiResultRow {
  id: number;
  questionId: string;
  question: string;
  precisionLevel: number | null;
  aiScore: number | null;
  maxMarks: number | null;
  expectedReply: string | null;
  audioPath: string | null;
  initiatedAt: string | null;   // ISO datetime
  receivedAt: string | null;    // ISO datetime
  status: 'PENDING' | 'SENT' | 'SUCCESS' | 'FAILED';
}

export interface ResultRow {
  id: number;
  studentName: string | null;
  studentEmail: string | null;
  /** MCQ / subjective score only. */
  score: number | null;
  /** Maximum MCQ / subjective marks. */
  totalMarks: number | null;
  grade: string | null;
  startedAt: string | null;  // ISO datetime
  createdAt: string;         // ISO datetime
  checked: boolean;
  /** MCQ score + Σ ai_score (SUCCESS verbal rows) — computed server-side. */
  totalScore: number;
  /** MCQ totalMarks + Σ maxMarks (all verbal questions) — computed server-side. */
  totalMaxMarks: number;
  /** Verbal AI evaluation records — one per verbal question in the exam. */
  aiResults: AiResultRow[];
}

const authHeader = (creds: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Basic ${btoa(creds)}`,
});

export const adminApi = {
  async verify(creds: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/exams`, {
      headers: authHeader(creds),
    });
    return res.ok;
  },

  async list(creds: string): Promise<ExamRow[]> {
    const res = await fetch(`${API_BASE}/exams`, { headers: authHeader(creds) });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  async create(creds: string, examData: string, active: boolean): Promise<ExamRow> {
    const res = await fetch(`${API_BASE}/exams`, {
      method: 'POST',
      headers: authHeader(creds),
      body: JSON.stringify({ examData, active }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to create');
    return data;
  },

  async update(creds: string, id: number, examData: string, active: boolean): Promise<ExamRow> {
    const res = await fetch(`${API_BASE}/exams/${id}`, {
      method: 'PUT',
      headers: authHeader(creds),
      body: JSON.stringify({ examData, active }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to update');
    return data;
  },

  /** Soft-delete: moves exam to the trash bin. */
  async remove(creds: string, id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/exams/${id}`, {
      method: 'DELETE',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to move to trash');
  },

  /** Returns all soft-deleted (trashed) exams. */
  async listTrashed(creds: string): Promise<ExamRow[]> {
    const res = await fetch(`${API_BASE}/exams/trash`, { headers: authHeader(creds) });
    if (!res.ok) throw new Error('Failed to load trash');
    return res.json();
  },

  /** Restores a trashed exam back to the live list. */
  async restore(creds: string, id: number): Promise<ExamRow> {
    const res = await fetch(`${API_BASE}/exams/${id}/restore`, {
      method: 'PATCH',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to restore exam');
    return res.json();
  },

  /** Permanently deletes an exam — cannot be undone. */
  async deletePermanently(creds: string, id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/exams/${id}/permanent`, {
      method: 'DELETE',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to permanently delete');
  },

  async toggle(creds: string, id: number): Promise<ExamRow> {
    const res = await fetch(`${API_BASE}/exams/${id}/toggle`, {
      method: 'PATCH',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to toggle');
    return res.json();
  },

  /** Retries a failed or stale AI evaluation for a single verbal question. */
  async retryAiEvaluation(creds: string, aiResultId: number): Promise<{
    status: string; aiResultId: number; questionId: string;
  }> {
    const res = await fetch(`${API_BASE}/ai-results/${aiResultId}/retry`, {
      method: 'POST',
      headers: authHeader(creds),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to retry');
    return data;
  },

  async getResults(creds: string, id: number): Promise<ResultRow[]> {
    const res = await fetch(`${API_BASE}/exams/${id}/results`, {
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to fetch results');
    return res.json();
  },

  async updateResultCheck(creds: string, resultId: number, checked: boolean): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/admin/results/${resultId}/check`, {
      method: 'PATCH',
      headers: authHeader(creds),
      body: JSON.stringify({ checked }),
    });
    if (!res.ok) throw new Error('Failed to update check status');
  },

  async getRecordings(creds: string, resultId: number): Promise<RecordingsData> {
    const res = await fetch(`${BACKEND_URL}/api/admin/results/${resultId}/recordings`, {
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to load recordings');
    return res.json();
  },

  async deleteRecordingFolder(creds: string, resultId: number): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/admin/results/${resultId}/folder`, {
      method: 'DELETE',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to delete folder');
  },

  /** Returns the fetch-ready URL + auth header for a recording file. */
  recordingFileUrl(sessionKey: string, filePath: string): string {
    return `${BACKEND_URL}/api/admin/recordings/file?sessionKey=${encodeURIComponent(sessionKey)}&filePath=${encodeURIComponent(filePath)}`;
  },

  async generateLink(
    creds: string,
    id: number,
    userName: string,
    userEmail: string,
    validForMinutes: number,
    validFromIso?: string,
    validUntilIso?: string,
  ): Promise<{ link: string; expiresAt: string; validFrom?: string | null }> {
    const res = await fetch(`${API_BASE}/exams/${id}/generate-link`, {
      method: 'POST',
      headers: authHeader(creds),
      body: JSON.stringify({ userName, userEmail, validForMinutes, validFromIso, validUntilIso }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
    return data;
  },
};
