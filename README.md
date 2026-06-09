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
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
