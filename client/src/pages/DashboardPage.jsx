import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import toast from 'react-hot-toast';
import {
  Network, Upload, FileText, Trash2, ChevronRight,
  Clock, FileSearch, Plus, X, BookOpen, Zap, Loader2
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import './DashboardPage.css';

function UploadModal({ onClose, onSuccess }) {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState(''); // 'uploading' | 'analyzing'
  const [file, setFile] = useState(null);

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
    onDropRejected: (rejected) => {
      if (rejected[0]?.errors[0]?.code === 'file-too-large') {
        toast.error('File too large. Maximum 20MB.');
      } else {
        toast.error('Unsupported file type. Use PDF, DOCX, TXT, or MD.');
      }
    },
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadPhase('uploading');
    try {
      const formData = new FormData();
      formData.append('document', file);

      setUploadPhase('analyzing');
      const { data } = await API.post('/api/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 min for large docs + AI
      });

      const docId = data.document?.id;
      const hasInsights = !!data.insights;

      toast.success(
        hasInsights
          ? `"${file.name}" uploaded & analyzed!`
          : `"${file.name}" uploaded! Opening workspace...`,
        { icon: hasInsights ? '🧠' : '📄', duration: 3000 }
      );

      onSuccess();
      onClose();

      // Navigate to workspace — pass pre-loaded insights via state
      navigate(`/workspace/${docId}`, {
        state: { insights: data.insights || null, autoAnalyze: !data.insights },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
      setUploading(false);
      setUploadPhase('');
    }
  };

  return (
    <div className="modal-overlay animate-fade" onClick={!uploading ? onClose : undefined}>
      <div className="modal-card glass-card-elevated animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Upload Research Document</h3>
          {!uploading && <button className="btn btn-icon btn-secondary" onClick={onClose}><X size={16} /></button>}
        </div>

        {uploading ? (
          <div className="upload-progress">
            <div className={`upload-progress-icon ${uploadPhase === 'analyzing' ? 'analyzing' : ''}`}>
              {uploadPhase === 'analyzing' ? <Zap size={32} /> : <Loader2 size={32} className="spin" />}
            </div>
            <p className="upload-progress-title">
              {uploadPhase === 'analyzing' ? '🧠 AI Analyzing Your Document...' : '📤 Uploading Document...'}
            </p>
            <p className="upload-progress-sub">
              {uploadPhase === 'analyzing'
                ? 'Gemini is extracting entities, claims, and relationships'
                : `Uploading ${file?.name}`}
            </p>
            <div className="upload-progress-bar"><div className={`upload-progress-fill ${uploadPhase === 'analyzing' ? 'indeterminate' : ''}`} /></div>
          </div>
        ) : (
          <>
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}>
              <input {...getInputProps()} id="file-dropzone-input" />
              {file ? (
                <div className="dropzone-file">
                  <FileText size={36} className="dropzone-file-icon" />
                  <p className="dropzone-filename">{file.name}</p>
                  <p className="dropzone-filesize">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="dropzone-empty">
                  <Upload size={36} className="dropzone-upload-icon" />
                  <p>{isDragActive ? 'Drop your document here' : 'Drag & drop your document'}</p>
                  <span>PDF • DOCX • TXT • Markdown — max 20MB — all access</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {file && (
                <button className="btn btn-secondary btn-sm" onClick={() => setFile(null)}>Clear</button>
              )}
              <button
                id="upload-submit-btn"
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!file}
              >
                <Zap size={15} /> Upload & Analyze
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DocumentCard({ doc, onDelete }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.title}"? This will also remove all AI insights.`)) return;
    setDeleting(true);
    try {
      await API.delete(`/api/documents/${doc.id}`);
      toast.success('Document deleted');
      onDelete(doc.id);
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeleting(false);
    }
  };

  const wordCountLabel = doc.word_count > 1000
    ? `${(doc.word_count / 1000).toFixed(1)}k words`
    : `${doc.word_count} words`;

  return (
    <div className="doc-card glass-card" onClick={() => navigate(`/workspace/${doc.id}`)}>
      <div className="doc-card-icon">
        <FileText size={22} />
      </div>
      <div className="doc-card-body">
        <h3 className="doc-card-title">{doc.title}</h3>
        <div className="doc-card-meta">
          <span><Clock size={12} /> {new Date(doc.created_at).toLocaleDateString()}</span>
          <span><BookOpen size={12} /> {wordCountLabel}</span>
        </div>
      </div>
      <div className="doc-card-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${doc.id}`); }}
        >
          Analyze <ChevronRight size={14} />
        </button>
        <button
          className="btn btn-icon btn-danger"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete document"
        >
          {deleting ? <span className="btn-spinner" style={{ borderTopColor: '#ff6584' }} /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await API.get('/api/documents');
      setDocuments(data.documents || []);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleDeleteDoc = (id) => setDocuments(prev => prev.filter(d => d.id !== id));

  return (
    <div className="dashboard-page">
      {/* Navbar */}
      <header className="dashboard-nav glass-card">
        <div className="nav-brand">
          <div className="nav-logo"><Network size={20} strokeWidth={1.5} /></div>
          <span>Insight<strong>Mesh</strong> <span className="nav-subtitle">AI Research Platform</span></span>
        </div>
        <div className="nav-actions">
          <button
            id="upload-nav-btn"
            className="btn btn-primary btn-sm"
            onClick={() => setShowUpload(true)}
          >
            <Plus size={14} /> New Document
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Hero */}
        <div className="dashboard-hero animate-fade-up">
          <div>
            <h1 className="dashboard-title">Research Workspace</h1>
            <p className="dashboard-subtitle">
              Upload documents to extract entities, map claims, and build knowledge graphs.
            </p>
          </div>
          <button
            id="upload-doc-btn"
            className="btn btn-primary btn-lg"
            onClick={() => setShowUpload(true)}
          >
            <Plus size={18} /> Upload Document
          </button>
        </div>

        {/* Stats bar */}
        <div className="dashboard-stats animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="stat-item">
            <span className="stat-value">{documents.length}</span>
            <span className="stat-label">Documents</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">
              {documents.reduce((sum, d) => sum + (d.word_count || 0), 0).toLocaleString()}
            </span>
            <span className="stat-label">Total Words</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value accent">{documents.length > 0 ? 'Ready' : '—'}</span>
            <span className="stat-label">AI Status</span>
          </div>
        </div>

        {/* Documents */}
        <div className="dashboard-docs animate-fade-up" style={{ animationDelay: '0.1s' }}>
          {loading ? (
            <div className="docs-loading">
              {[1, 2, 3].map(i => <div key={i} className="skeleton doc-card-skeleton" />)}
            </div>
          ) : documents.length === 0 ? (
            <div className="docs-empty glass-card">
              <FileSearch size={48} className="docs-empty-icon" />
              <h3>No documents yet</h3>
              <p>Upload your first PDF or TXT research document to get started.</p>
              <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                <Upload size={16} /> Upload Your First Document
              </button>
            </div>
          ) : (
            <div className="docs-grid">
              {documents.map(doc => (
                <DocumentCard key={doc.id} doc={doc} onDelete={handleDeleteDoc} />
              ))}
            </div>
          )}
        </div>
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchDocuments} />
      )}
    </div>
  );
}
