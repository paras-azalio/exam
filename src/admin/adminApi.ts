import { BACKEND_URL } from '../config';

const API_BASE = `${BACKEND_URL}/api/admin`;

export interface ExamRow {
  id: number;
  examCode: string;
  examTitle: string;
  examData: string;
  active: boolean;
  createdAt: string;
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

  async remove(creds: string, id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/exams/${id}`, {
      method: 'DELETE',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to delete');
  },

  async toggle(creds: string, id: number): Promise<ExamRow> {
    const res = await fetch(`${API_BASE}/exams/${id}/toggle`, {
      method: 'PATCH',
      headers: authHeader(creds),
    });
    if (!res.ok) throw new Error('Failed to toggle');
    return res.json();
  },
};
