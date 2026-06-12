# Blueslate

AI receptionist for franchise businesses.

## Structure

```
blueslate/
├── frontend/   # Next.js 14 (App Router)
└── backend/    # Python FastAPI
```

## Getting Started

### Frontend

```bash
source venv/bin/activate
cd frontend
npm run dev
#http://localhost:3000
```

### Backend

```bash
source venv/bin/activate
cd backend
uvicorn app.main:app --reload
#http://localhost:8000/docs
```
