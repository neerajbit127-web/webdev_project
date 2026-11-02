# | Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/exams/parse-document` | `Teacher` | Upload `.pdf` or `.docx` for heuristic parsing. |
| `POST` | `/api/exams` | `Teacher` | Persist new exam draft with parsed questions. |
| `GET` | `/api/exams/teacher` | `Teacher` | List all exams created by authenticated teacher. |
| `GET` | `/api/exams/:id/analytics` | `Teacher` | Aggregate student metrics, question stats, and roster. |
| `PUT` | `/api/exams/:id/publish` | `Teacher` | Toggle exam visibility status (`is_published`). |
| `DELETE`| `/api/exams/:id` | `Teacher` | Delete an exam and all dependent questions/records. |
### Student Test Engine
| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/exams/available` | `Student` | List active exams available for student participation. |
| `POST` | `/api/exams/:id/start` | `Student` | Start exam attempt; locks `started_at` and returns sanitized questions. |
| `POST` | `/api/submissions/:id/telemetry`| `Student` | Push anti-cheat event log (tab switch, window blur). |
| `POST` | `/api/submissions/:id/save-answer` | `Student` | Asynchronously cache single question response. |
| `POST` | `/api/submissions/:id/submit` | `Student` | Submit all answers for immediate server evaluation. |
| `GET` | `/api/submissions/:id/result` | `Student / Teacher` | Fetch final score, awarded marks, and summary breakdown. |
---
## 🗺️ Roadmap
- [ ] **AI-Powered Intelligent Document Parser**:
  - Integrate Vision-Language Models (Gemini / Claude / GPT-4o) to reliably parse unstructured exam papers containing mathematical LaTeX equations, handwritten questions, and embedded vector diagrams.
- [ ] **Automated WebRTC Proctoring Suite**:
  - Add client-side TensorFlow.js / MediaPipe models for head-pose tracking, multi-person presence detection, and background speech detection via microphone stream.
- [ ] **Live Proctoring Command Center**:
  - Implement bidirectional WebSockets (`Socket.io`) allowing instructors to monitor live candidate screens, send direct warnings, pause exams, or disqualify students in real time.
- [ ] **Code Assessment Engine**:
  - Embed an isolated Docker-based code execution sandbox (supporting Python, JavaScript, Java, and C++) with automated unit-test validation for technical programming assessments.
---
## 📄 Contributing & License
Distributed under the **MIT License**. See `LICENSE` for details.
```text
Copyright (c) 2026 ExamPortal Contributors
Permission is hereby granted, free of charge, to any person obtaining a copy of this software...
```
