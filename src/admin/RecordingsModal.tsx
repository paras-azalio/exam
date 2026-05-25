import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi, RecordingsData, ResultRow } from './adminApi';
import { generateAdminPDF } from '../utils/pdfGenerator';

interface Props {
  creds: string;
  result: ResultRow;
  examCode: string;
  cameraPip?: boolean;
  onClose: () => void;
}

// ── Sequential WebM chunk player ──────────────────────────────────────────────
interface VideoPlayerProps {
  sessionKey: string;
  chunks: string[];
  type: 'camera' | 'screen';
  creds: string;
  label: string;
}

function VideoPlayer({ sessionKey, chunks, type, creds, label }: VideoPlayerProps) {
  const [chunkIdx, setChunkIdx] = useState(0);
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadErr, setLoadErr]   = useState('');
  const [dlLoading, setDlLoading] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevBlobRef = useRef<string | null>(null);

  const authHeaders = { Authorization: `Basic ${btoa(creds)}` };

  const loadChunk = useCallback(async (idx: number, autoplay = true) => {
    if (idx < 0 || idx >= chunks.length) return;
    setLoading(true);
    setLoadErr('');
    try {
      const url = adminApi.recordingFileUrl(sessionKey, `${type}/${chunks[idx]}`);
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob    = await res.blob();
      const newUrl  = URL.createObjectURL(blob);
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = newUrl;
      setBlobUrl(newUrl);
      setChunkIdx(idx);
      if (autoplay && videoRef.current) {
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setLoadErr(`Could not load chunk: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [chunks, sessionKey, type, creds]);

  // Load first chunk on mount (no autoplay)
  useEffect(() => {
    if (chunks.length > 0) loadChunk(0, false);
    return () => { if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current); };
  }, []);  // eslint-disable-line

  const handleEnded = () => {
    if (chunkIdx < chunks.length - 1) loadChunk(chunkIdx + 1, true);
  };

  const downloadChunk = async (idx: number) => {
    setDlLoading(idx);
    try {
      const url  = adminApi.recordingFileUrl(sessionKey, `${type}/${chunks[idx]}`);
      const res  = await fetch(url, { headers: authHeaders });
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = chunks[idx];
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally {
      setDlLoading(null);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < chunks.length; i++) await downloadChunk(i);
  };

  if (chunks.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-400 italic">
        No {label.toLowerCase()} recording found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Player */}
      <div className="bg-black rounded-xl overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-10 gap-2">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-xs">Loading chunk {chunkIdx + 1}…</span>
          </div>
        )}
        <video
          ref={videoRef}
          src={blobUrl ?? undefined}
          controls
          onEnded={handleEnded}
          className="w-full max-h-64 object-contain"
        />
      </div>

      {loadErr && <p className="text-xs text-red-500">{loadErr}</p>}

      {/* Chunk nav */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Chunk <span className="font-semibold text-gray-700">{chunkIdx + 1}</span>
          {' '}of <span className="font-semibold text-gray-700">{chunks.length}</span>
          {chunkIdx < chunks.length - 1 && (
            <span className="ml-1 text-gray-400">(auto-advances on end)</span>
          )}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => loadChunk(chunkIdx - 1)}
            disabled={chunkIdx === 0 || loading}
            className="px-2.5 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition"
          >
            ‹ Prev
          </button>
          <button
            onClick={() => loadChunk(chunkIdx + 1)}
            disabled={chunkIdx === chunks.length - 1 || loading}
            className="px-2.5 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition"
          >
            Next ›
          </button>
          <button
            onClick={downloadAll}
            className="px-2.5 py-1 text-xs bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition"
            title="Download all chunks"
          >
            ⬇ All
          </button>
        </div>
      </div>

      {/* Chunk list */}
      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
        {chunks.map((chunk, idx) => (
          <div
            key={chunk}
            className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 text-xs transition ${
              idx === chunkIdx
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <button
              onClick={() => loadChunk(idx, true)}
              className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-current bg-opacity-10 hover:bg-opacity-20 transition"
              title="Play this chunk"
            >
              {idx === chunkIdx && !loading ? '▶' : '▷'}
            </button>
            <span className="flex-1 truncate font-mono">{chunk}</span>
            <button
              onClick={() => downloadChunk(idx)}
              disabled={dlLoading === idx}
              className="px-2 py-0.5 bg-white border border-gray-200 rounded hover:bg-gray-100 transition disabled:opacity-50"
              title="Download"
            >
              {dlLoading === idx ? '…' : '⬇'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen recording player with camera Picture-in-Picture overlay ────────────
interface ScreenWithCameraPiPProps {
  sessionKey: string;
  screenChunks: string[];
  cameraChunks: string[];
  creds: string;
}

function ScreenWithCameraPiP({ sessionKey, screenChunks, cameraChunks, creds }: ScreenWithCameraPiPProps) {
  const [chunkIdx,    setChunkIdx]    = useState(0);
  const [screenUrl,   setScreenUrl]   = useState<string | null>(null);
  const [cameraUrl,   setCameraUrl]   = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [loadErr,     setLoadErr]     = useState('');
  const [pipVisible,  setPipVisible]  = useState(true);
  const [dlLoading,   setDlLoading]   = useState<number | null>(null);

  const screenRef  = useRef<HTMLVideoElement>(null);
  const prevScreen = useRef<string | null>(null);
  const prevCamera = useRef<string | null>(null);

  const authHeaders = { Authorization: `Basic ${btoa(creds)}` };

  const loadChunk = useCallback(async (idx: number, autoplay = true) => {
    if (idx < 0 || idx >= screenChunks.length) return;
    setLoading(true);
    setLoadErr('');
    try {
      // Load screen chunk (required)
      const sUrl = adminApi.recordingFileUrl(sessionKey, `screen/${screenChunks[idx]}`);
      const sRes = await fetch(sUrl, { headers: authHeaders });
      if (!sRes.ok) throw new Error(`HTTP ${sRes.status}`);
      const sBlob   = await sRes.blob();
      const sNewUrl = URL.createObjectURL(sBlob);
      if (prevScreen.current) URL.revokeObjectURL(prevScreen.current);
      prevScreen.current = sNewUrl;
      setScreenUrl(sNewUrl);

      // Load matching camera chunk if available (best-effort)
      if (cameraChunks[idx]) {
        try {
          const cUrl = adminApi.recordingFileUrl(sessionKey, `camera/${cameraChunks[idx]}`);
          const cRes = await fetch(cUrl, { headers: authHeaders });
          if (cRes.ok) {
            const cBlob   = await cRes.blob();
            const cNewUrl = URL.createObjectURL(cBlob);
            if (prevCamera.current) URL.revokeObjectURL(prevCamera.current);
            prevCamera.current = cNewUrl;
            setCameraUrl(cNewUrl);
          }
        } catch { /* camera PiP is optional — ignore errors */ }
      } else {
        // No matching camera chunk — clear PiP
        if (prevCamera.current) { URL.revokeObjectURL(prevCamera.current); prevCamera.current = null; }
        setCameraUrl(null);
      }

      setChunkIdx(idx);
      if (autoplay && screenRef.current) {
        screenRef.current.load();
        screenRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setLoadErr(`Could not load chunk: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [screenChunks, cameraChunks, sessionKey, creds]);

  useEffect(() => {
    if (screenChunks.length > 0) loadChunk(0, false);
    return () => {
      if (prevScreen.current) URL.revokeObjectURL(prevScreen.current);
      if (prevCamera.current) URL.revokeObjectURL(prevCamera.current);
    };
  }, []); // eslint-disable-line

  const handleEnded = () => {
    if (chunkIdx < screenChunks.length - 1) loadChunk(chunkIdx + 1, true);
  };

  const downloadChunk = async (idx: number) => {
    setDlLoading(idx);
    try {
      const url  = adminApi.recordingFileUrl(sessionKey, `screen/${screenChunks[idx]}`);
      const res  = await fetch(url, { headers: authHeaders });
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = screenChunks[idx];
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally {
      setDlLoading(null);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < screenChunks.length; i++) await downloadChunk(i);
  };

  if (screenChunks.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-400 italic">
        No screen recording found.
      </div>
    );
  }

  const hasPiP = cameraChunks.length > 0;

  return (
    <div className="space-y-3">
      {/* Player with optional camera PiP overlay */}
      <div className="bg-black rounded-xl overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-10 gap-2">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-xs">Loading chunk {chunkIdx + 1}…</span>
          </div>
        )}

        {/* Main screen video */}
        <video
          ref={screenRef}
          src={screenUrl ?? undefined}
          controls
          onEnded={handleEnded}
          className="w-full max-h-72 object-contain"
        />

        {/* Camera PiP overlay — bottom-right corner */}
        {hasPiP && cameraUrl && pipVisible && (
          <div
            className="absolute bottom-10 right-2 z-20 rounded-lg overflow-hidden shadow-lg border-2 border-white border-opacity-60"
            style={{ width: '22%', aspectRatio: '4/3' }}
          >
            <video
              src={cameraUrl}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Toggle PiP button */}
        {hasPiP && (
          <button
            onClick={() => setPipVisible(v => !v)}
            title={pipVisible ? 'Hide camera overlay' : 'Show camera overlay'}
            className="absolute top-2 right-2 z-20 bg-black bg-opacity-50 hover:bg-opacity-75 text-white text-xs px-2 py-1 rounded-lg transition"
          >
            📷 {pipVisible ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {loadErr && <p className="text-xs text-red-500">{loadErr}</p>}

      {/* Chunk nav */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Chunk <span className="font-semibold text-gray-700">{chunkIdx + 1}</span>
          {' '}of <span className="font-semibold text-gray-700">{screenChunks.length}</span>
          {chunkIdx < screenChunks.length - 1 && (
            <span className="ml-1 text-gray-400">(auto-advances on end)</span>
          )}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => loadChunk(chunkIdx - 1)}
            disabled={chunkIdx === 0 || loading}
            className="px-2.5 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition"
          >
            ‹ Prev
          </button>
          <button
            onClick={() => loadChunk(chunkIdx + 1)}
            disabled={chunkIdx === screenChunks.length - 1 || loading}
            className="px-2.5 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition"
          >
            Next ›
          </button>
          <button
            onClick={downloadAll}
            className="px-2.5 py-1 text-xs bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition"
            title="Download all screen chunks"
          >
            ⬇ All
          </button>
        </div>
      </div>

      {/* Chunk list */}
      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
        {screenChunks.map((chunk, idx) => (
          <div
            key={chunk}
            className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 text-xs transition ${
              idx === chunkIdx
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <button
              onClick={() => loadChunk(idx, true)}
              className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-current bg-opacity-10 hover:bg-opacity-20 transition"
              title="Play this chunk"
            >
              {idx === chunkIdx && !loading ? '▶' : '▷'}
            </button>
            <span className="flex-1 truncate font-mono">{chunk}</span>
            <button
              onClick={() => downloadChunk(idx)}
              disabled={dlLoading === idx}
              className="px-2 py-0.5 bg-white border border-gray-200 rounded hover:bg-gray-100 transition disabled:opacity-50"
              title="Download"
            >
              {dlLoading === idx ? '…' : '⬇'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function RecordingsModal({ creds, result, examCode, cameraPip = false, onClose }: Props) {
  const [data, setData]             = useState<RecordingsData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [deleted, setDeleted]       = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const authHeaders = { Authorization: `Basic ${btoa(creds)}` };

  // Refs for scroll-to-section
  const bodyRef   = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const verbalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    adminApi.getRecordings(creds, result.id)
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openHtmlReport = async () => {
    if (!data?.html) return;
    setReportLoading(true);
    try {
      const url  = adminApi.recordingFileUrl(data.sessionKey, data.html);
      const res  = await fetch(url, { headers: authHeaders });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteFolder = async () => {
    setDeleting(true);
    try {
      await adminApi.deleteRecordingFolder(creds, result.id);
      setData(prev => prev ? { ...prev, html: null, camera: [], screen: [] } : null);
      setDeleted(true);
      setConfirmDelete(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadPDF = () => {
    generateAdminPDF(
      result.studentName ?? 'Unknown',
      examCode,
      result.score,
      result.totalMarks,
      result.totalScore,
      result.totalMaxMarks,
      result.grade,
      result.aiResults.map(ar => ({
        questionId: ar.questionId,
        question:   ar.question,
        aiScore:    ar.aiScore,
        maxMarks:   ar.maxMarks,
        status:     ar.status,
      }))
    );
  };

  const hasAnyRecording = data && (data.camera.length > 0 || data.screen.length > 0 || !!data.html || (data.verbal?.length ?? 0) > 0);
  const totalChunks = (data?.camera.length ?? 0) + (data?.screen.length ?? 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">Recordings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {result.studentName ?? 'Unknown'}
              {result.studentEmail && <span className="ml-1 text-gray-400">· {result.studentEmail}</span>}
            </p>
            {data && (
              <p className="text-xs font-mono text-gray-400 mt-0.5 truncate max-w-xs" title={data.sessionKey}>
                {data.sessionKey}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">✕</button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {deleted && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
              Recording folder deleted. Files are no longer available.
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary bar — chips scroll to their section */}
              <div className="flex flex-wrap gap-3">
                <Chip icon="📷" label="Camera" count={data.camera.length}
                  onClick={() => scrollTo(cameraRef)} />
                <Chip icon="🖥️" label="Screen"  count={data.screen.length}
                  onClick={() => scrollTo(screenRef)} />
                <Chip icon="🎤" label="Verbal"  count={data.verbal?.length ?? 0}
                  onClick={() => scrollTo(verbalRef)} />
                <Chip icon="📄" label="Report"  count={data.html ? 1 : 0} />
                <Chip icon="🎞️" label="Total chunks" count={totalChunks} plain />
              </div>

              {/* HTML report */}
              {data.html && (
                <section>
                  <SectionTitle>HTML Result Report</SectionTitle>
                  <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-800 truncate">{data.html}</p>
                      <p className="text-xs text-indigo-500">Full question-by-question result with highlights</p>
                    </div>
                    <button
                      onClick={openHtmlReport}
                      disabled={reportLoading}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {reportLoading ? 'Loading…' : '↗ View'}
                    </button>
                    <button
                      onClick={handleDownloadPDF}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
                    >
                      ⬇ PDF
                    </button>
                  </div>
                </section>
              )}

              {/* Camera recording */}
              <section ref={cameraRef}>
                <SectionTitle>
                  📷 Camera Recording
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {data.camera.length} chunk{data.camera.length !== 1 ? 's' : ''}
                  </span>
                </SectionTitle>
                <VideoPlayer
                  sessionKey={data.sessionKey}
                  chunks={data.camera}
                  type="camera"
                  creds={creds}
                  label="Camera"
                />
              </section>

              {/* Screen recording with camera PiP */}
              <section ref={screenRef}>
                <SectionTitle>
                  🖥️ Screen Recording
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {data.screen.length} chunk{data.screen.length !== 1 ? 's' : ''}
                  </span>
                  {cameraPip && data.camera.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-blue-400">· 📷 camera overlay active</span>
                  )}
                </SectionTitle>
                <ScreenWithCameraPiP
                  sessionKey={data.sessionKey}
                  screenChunks={data.screen}
                  cameraChunks={cameraPip ? data.camera : []}
                  creds={creds}
                />
              </section>

              {/* Verbal recordings */}
              <section ref={verbalRef}>
                {(data.verbal?.length ?? 0) > 0 ? (
                  <>
                    <SectionTitle>
                      🎤 Verbal Answers
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {data.verbal.length} question{data.verbal.length !== 1 ? 's' : ''}
                      </span>
                    </SectionTitle>
                    <div className="space-y-3">
                      {data.verbal.map((filename) => {
                        const qId = filename.replace(/^verbal_/, '').replace(/\.webm$/, '');
                        return (
                          <VerbalAudioPlayer
                            key={filename}
                            sessionKey={data.sessionKey}
                            filename={filename}
                            questionId={qId}
                            creds={creds}
                          />
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <SectionTitle>Verbal Answers</SectionTitle>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-400 italic">
                      No verbal recordings found.
                    </div>
                  </>
                )}
              </section>

              {/* Danger zone */}
              {hasAnyRecording && !deleted && (
                <section className="border border-red-200 rounded-xl p-4 bg-red-50">
                  <p className="text-sm font-semibold text-red-700 mb-1">Danger Zone</p>
                  <p className="text-xs text-red-500 mb-3">
                    Permanently deletes all recordings and the HTML report for this session from disk. This cannot be undone.
                  </p>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition"
                    >
                      🗑 Delete All Recordings
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-700 font-medium">Are you sure?</span>
                      <button
                        onClick={handleDeleteFolder}
                        disabled={deleting}
                        className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </section>
              )}

              {!hasAnyRecording && !deleted && (
                <p className="text-sm text-gray-400 italic text-center py-6">
                  No recordings found for this session.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">{children}</h4>
  );
}

// ── Verbal audio player ───────────────────────────────────────────────────────
interface VerbalAudioPlayerProps {
  sessionKey: string;
  filename: string;
  questionId: string;
  creds: string;
}

function VerbalAudioPlayer({ sessionKey, filename, questionId, creds }: VerbalAudioPlayerProps) {
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError]       = useState('');

  const authHeaders = { Authorization: `Basic ${btoa(creds)}` };

  const load = async () => {
    if (blobUrl) { setExpanded(e => !e); return; }
    setLoading(true);
    setError('');
    try {
      const url = adminApi.recordingFileUrl(sessionKey, filename);
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob    = await res.blob();
      const newUrl  = URL.createObjectURL(new Blob([blob], { type: 'audio/webm' }));
      setBlobUrl(newUrl);
      setExpanded(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-orange-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={load}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 transition text-left"
      >
        <span className="text-lg">🎤</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">Question: <span className="font-mono text-orange-700">{questionId}</span></p>
          <p className="text-xs text-gray-400">{filename}</p>
        </div>
        {loading ? (
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-gray-400 text-sm">{expanded ? '▾' : '▸'}</span>
        )}
      </button>
      {error && <p className="px-4 pb-3 text-xs text-red-500">{error}</p>}
      {expanded && blobUrl && (
        <div className="px-4 pb-4">
          <audio controls src={blobUrl} className="w-full h-10" />
        </div>
      )}
    </div>
  );
}

function Chip({
  icon, label, count, plain, onClick,
}: {
  icon: string; label: string; count: number; plain?: boolean; onClick?: () => void;
}) {
  const active = count > 0;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        onClick ? 'cursor-pointer hover:brightness-95 active:scale-95' : 'cursor-default'
      } ${
        plain
          ? 'bg-gray-50 text-gray-600 border-gray-200'
          : active
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-50 text-gray-400 border-gray-200'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span className="font-bold">{count}</span>
    </button>
  );
}
