# ThirdEye v2 — Full-Stack Smart Contract Security Auditor

ThirdEye is a polished capstone project that combines local AI, deterministic analysis, and vector memory search to automate smart contract security reviews for Solidity contracts.

## Project Summary

ThirdEye provides a complete workflow for smart contract auditing:

- **Contract intake** through a React-based UI
- **Multi-stage analysis** with code pattern extraction, optional Slither results, and LLM reasoning
- **Similarity search** using ChromaDB embeddings for exploit recall
- **GO / NO-GO verdicts** with explainable findings
- **Professional PDF audit reports** for deliverables
- **Batch evaluation** on verified Solidity contracts

## Professional Highlights

- Full-stack application: React + TypeScript frontend, FastAPI Python backend
- Local-first AI architecture using Ollama
- Modular audit pipeline supporting deterministic and probabilistic analysis
- Dataset-driven validation across 50+ Etherscan-verified contracts
- Resume-ready project structure and documentation

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Python
- FastAPI
- Uvicorn
- Pydantic
- aiosqlite
- ChromaDB
- ReportLab

### AI and Security

- Ollama for local LLM inference
- Optional Slither integration for static Solidity analysis
- Vector similarity search for historical exploit memory

## Repository Structure

```
thirdeye-v2/
├── backend/
│   ├── main.py
│   ├── db.py
│   ├── dataset_runner.py
│   ├── requirements.txt
│   ├── datasets/
│   │   ├── index.json
│   │   └── results_summary.csv
│   └── services/
│       ├── llm.py
│       ├── report.py
│       ├── slither.py
│       └── vectordb.py
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── index.css
├── etherscan_verified-20260420T143345Z-3-001/
│   └── *.sol
├── .gitignore
├── README.md
└── run.ps1
```

## Getting Started

### Prerequisites

- Python 3.10 or newer
- Node.js 20.x or newer
- npm
- Ollama installed locally
- Optional: Slither installed for deterministic audit validation

### Backend Setup

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Frontend Setup

```powershell
cd frontend
npm install
```

### Run the app

Start the backend API:

```powershell
cd backend
venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173` in your browser.

## Batch Evaluation

Run the batch evaluation pipeline to score contracts against the labeled dataset:

```powershell
cd backend
python dataset_runner.py
```

Results are saved to `backend/datasets/results_summary.csv`.

## Notes for Reviewers

This repository is organized for clarity, maintainability, and presentation. It demonstrates a practical bridge between smart contract security engineering and AI-driven automation, which is ideal for portfolio and resume use.
