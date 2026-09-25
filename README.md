# InsightMesh AI 🕸️

> **Automated Cross-Document Knowledge Graph & Evidence Synthesizer**

A full-stack research intelligence platform that turns uploaded PDFs and text documents into interactive knowledge graphs with AI-extracted entities, claims, and evidence traceability — powered by **Google Gemini 2.5 Flash**.

---

## 🏗 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React 19, Vanilla CSS (glassmorphism) |
| Backend | Express.js 5, Node.js (ESM) |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini 2.5 Flash via `@google/genai` |
| Auth | JWT + bcrypt |
| Graph | `react-force-graph-2d` (canvas/WebGL) |
| PDF Parsing | `pdf-parse` |

---

## 📁 Project Structure

```
insight-mesh/
├── client/                    # Vite + React Frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx          # Auth (login + register tabs)
│   │   │   ├── DashboardPage.jsx      # Document list + upload modal
│   │   │   └── ResearchWorkspace.jsx  # AI analysis + Knowledge Graph
│   │   ├── hooks/
│   │   │   └── useAuth.jsx            # Auth context
│   │   ├── services/
│   │   │   └── api.js                 # Axios client + JWT interceptor
│   │   └── index.css                  # Global design system
│   └── .env                           # VITE_API_URL
│
└── server/                    # Express Backend
    ├── controllers/
    │   ├── authController.js          # Register + Login
    │   ├── documentController.js      # Upload + List + Delete
    │   └── aiController.js            # Gemini analysis + cache
    ├── middleware/
    │   ├── authMiddleware.js          # JWT verification
    │   └── uploadMiddleware.js        # Multer (PDF/TXT, 10MB)
    ├── config/
    │   └── supabaseClient.js          # Supabase JS client
    ├── routes/
    │   ├── auth.js
    │   ├── documents.js
    │   └── ai.js
    ├── server.js
    └── .env                           # All backend secrets
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Supabase project (free tier works)
- Google AI Studio API key (Gemini)

### 1. Supabase Schema

Run this SQL in your Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  extracted_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_entities JSONB NOT NULL,
  claims_analysis JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Backend Setup

```bash
cd server
cp .env .env.local   # Edit with your real values
# Fill in: SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY, JWT_SECRET
npm install
npm run dev          # http://localhost:5000
```

### 3. Frontend Setup

```bash
cd client
# .env already set to http://localhost:5000
npm install
npm run dev          # http://localhost:5173
```

---

## 🔑 Environment Variables

### `server/.env`
| Variable | Description |
|---|---|
| `PORT` | Server port (default: 5000) |
| `JWT_SECRET` | Secret key for JWT signing |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase service role or anon key |
| `GEMINI_API_KEY` | Google AI Studio API key (**backend only**) |
| `CLIENT_URL` | Vercel frontend URL (for production CORS) |

### `client/.env`
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API URL |

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Get current user |

### Documents
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/documents/upload` | Upload PDF or TXT |
| GET | `/api/documents` | List user's documents |
| GET | `/api/documents/:id` | Get document with text |
| DELETE | `/api/documents/:id` | Delete document + insights |

### AI
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/analyze/:documentId` | Run Gemini analysis (cached) |
| GET | `/api/ai/insights/:documentId` | Fetch existing insights |

---

## ☁️ Deployment

### Backend → [Render](https://render.com)
1. Push `server/` to GitHub
2. New Web Service → connect repo → **Root Directory**: `server`
3. Build: `npm install` | Start: `node server.js`
4. Add all env vars from `server/.env`

### Frontend → [Vercel](https://vercel.com)
1. Push `client/` to GitHub
2. New Project → **Framework Preset**: Vite | **Root Directory**: `client`
3. Add env var: `VITE_API_URL=https://your-backend.onrender.com`

---

## ✨ Features

- **JWT Authentication** — Register/Login with bcrypt-hashed passwords
- **PDF + TXT Upload** — Drag & drop, up to 10MB, instant text extraction
- **AI Analysis** — Gemini 2.5 Flash extracts entities, claims, relationships
- **Knowledge Graph** — Force-directed graph (WebGL) with node click interactions
- **Evidence Traceability** — Click any graph node → highlights matching claim cards with source citations
- **Result Caching** — Analyzed insights stored in Supabase, no re-billing on revisit
- **Dark Glassmorphism UI** — Inter + Space Grotesk fonts, violet/teal accent palette
