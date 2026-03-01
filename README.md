# NIX AI

An AI-powered document intelligence platform with a React frontend and Python (FastAPI) backend deployed on AWS.

## Project Structure

```
nix-ai/
├── frontend/      # React + Vite SPA (Tailwind CSS, Zustand, AWS Amplify)
├── backend/       # FastAPI backend (AWS Lambda, DynamoDB, S3, Bedrock)
└── project/       # Project documentation
```

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
```

## Tech Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Zustand      |
| Backend  | FastAPI, AWS Lambda, DynamoDB, S3, Bedrock       |
| Auth     | AWS Cognito via Amplify                          |
| Infra    | SAM (Serverless Application Model)               |
