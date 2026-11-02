/**
 * ExamPortal — Client Application Controller
 * Manages full multi-screen state transitions, live timer engine, and telemetry
 */

document.addEventListener('DOMContentLoaded', () => {

  /* --------------------------------------------------------------------------
     1. Application State & Storage
     -------------------------------------------------------------------------- */
  const state = {
    token: localStorage.getItem('examportal_token') || null,
    currentRole: 'TEACHER', // 'TEACHER' | 'STUDENT'
    currentUser: null,
    activeExam: null,
    currentQuestionIndex: 0,
    userAnswers: {},       // { [questionIndex]: optionIndex }
    timerInterval: null,
    remainingSeconds: 0,
    strikeCount: 0,
    exams: []              // Loaded dynamically from server (no mock exams)
  };

  /* --------------------------------------------------------------------------
     2. Screen Navigation Controller
     -------------------------------------------------------------------------- */
  function showScreen(screenId) {
    document.querySelectorAll('.portal-screen').forEach(screen => {
      screen.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  // Logout Handlers across all screens
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      clearInterval(state.timerInterval);
      state.activeExam = null;
      state.userAnswers = {};
      state.strikeCount = 0;
      showScreen('screen-auth');
    });
  });

  /* --------------------------------------------------------------------------
     3. Screen 1: Role Selection & Authentication
     -------------------------------------------------------------------------- */
  const roleBtnTeacher = document.getElementById('roleBtnTeacher');
  const roleBtnStudent = document.getElementById('roleBtnStudent');
  const lblIdentifier = document.getElementById('lblIdentifier');
  const loginIdentifier = document.getElementById('loginIdentifier');
  const hintIdentifier = document.getElementById('hintIdentifier');
  const btnAuthSubmit = document.getElementById('btnAuthSubmit');
  const authLoginForm = document.getElementById('authLoginForm');

  function setRole(role) {
    state.currentRole = role;
    if (role === 'TEACHER') {
      roleBtnTeacher.classList.add('active');
      roleBtnTeacher.setAttribute('aria-pressed', 'true');
      roleBtnStudent.classList.remove('active');
      roleBtnStudent.setAttribute('aria-pressed', 'false');

      lblIdentifier.textContent = 'Username or Institutional Email';
      hintIdentifier.textContent = 'Authorized faculty email address.';
      loginIdentifier.value = 'alan.vance@university.edu';
      loginIdentifier.placeholder = 'e.g. name@university.edu';
      btnAuthSubmit.textContent = 'Sign In as Teacher';
    } else {
      roleBtnStudent.classList.add('active');
      roleBtnStudent.setAttribute('aria-pressed', 'true');
      roleBtnTeacher.classList.remove('active');
      roleBtnTeacher.setAttribute('aria-pressed', 'false');

      lblIdentifier.textContent = 'Student ID';
      hintIdentifier.textContent = 'Your official matriculation ID.';
      loginIdentifier.value = 'ST-94821';
      loginIdentifier.placeholder = 'e.g. ST-94821';
      btnAuthSubmit.textContent = 'Sign In as Student';
    }
  }

  roleBtnTeacher.addEventListener('click', () => setRole('TEACHER'));
  roleBtnStudent.addEventListener('click', () => setRole('STUDENT'));

  authLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = loginIdentifier.value.trim();
    const password = document.getElementById('loginPassword').value;

    btnAuthSubmit.disabled = true;
    btnAuthSubmit.textContent = 'Signing in...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, role: state.currentRole })
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        alert(result.error?.message || 'Authentication failed. Please verify your credentials.');
        return;
      }

      state.token = result.data.token;
      state.currentUser = result.data.user;
      localStorage.setItem('examportal_token', state.token);

      if (state.currentRole === 'TEACHER') {
        document.getElementById('teacherDisplayName').textContent = state.currentUser.fullName || state.currentUser.name || 'Dr. Alan Vance';
        await fetchTeacherExams();
        showScreen('screen-teacher');
      } else {
        document.getElementById('studentDisplayName').textContent = state.currentUser.fullName || state.currentUser.name || 'Elena Rostova';
        document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.studentId || state.currentUser.identifier || 'ST-94821'}`;
        showScreen('screen-student-dash');
      }
    } catch (err) {
      alert('Connection error communicating with assessment backend.');
    } finally {
      btnAuthSubmit.disabled = false;
      btnAuthSubmit.textContent = state.currentRole === 'TEACHER' ? 'Sign In as Teacher' : 'Sign In as Student';
    }
  });

  /* --------------------------------------------------------------------------
     4. Screen 2: Teacher Portal (Exam Creation & Code Generation)
     -------------------------------------------------------------------------- */
  const createExamForm = document.getElementById('createExamForm');
  const publishedCodeBanner = document.getElementById('publishedCodeBanner');
  const displayGeneratedCode = document.getElementById('displayGeneratedCode');
  const btnCopyGeneratedCode = document.getElementById('btnCopyGeneratedCode');
  const btnDismissBanner = document.getElementById('btnDismissBanner');
  const btnJumpToStudentTest = document.getElementById('btnJumpToStudentTest');
  const createdExamsTableBody = document.getElementById('createdExamsTableBody');
  const createdExamsCount = document.getElementById('createdExamsCount');

  // Drag and Drop File Ingestion
  const fileDropzone = document.getElementById('fileDropzone');
  const examFileInput = document.getElementById('examFileInput');
  const filePreview = document.getElementById('filePreview');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  let selectedFile = null;

  if (fileDropzone && examFileInput) {
    fileDropzone.addEventListener('click', () => examFileInput.click());

    fileDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropzone.classList.add('dragover');
    });

    fileDropzone.addEventListener('dragleave', () => {
      fileDropzone.classList.remove('dragover');
    });

    fileDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        selectedFile = e.dataTransfer.files[0];
        fileNameDisplay.textContent = selectedFile.name;
        filePreview.classList.add('active');
      }
    });

    examFileInput.addEventListener('change', () => {
      if (examFileInput.files && examFileInput.files.length > 0) {
        selectedFile = examFileInput.files[0];
        fileNameDisplay.textContent = selectedFile.name;
        filePreview.classList.add('active');
      }
    });
  }

  /**
   * Parses questions from plain text, Markdown, or JSON.
   */
  function parseQuestionsFromText(text) {
    // 1. Try parsing JSON format
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].prompt && parsed[0].options) {
        return parsed;
      }
      if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed.questions;
      }
    } catch (_) {}

    // 2. Parse structured questions (e.g. "1. Question", "A) Option", "Answer: B")
    const questions = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currentQ = null;
    const letterMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

    for (const line of lines) {
      const qMatch = line.match(/^(?:(?:Q|Question)\s*\d+[:.]?|\d+[.)])\s*(.+)/i);
      const optMatch = line.match(/^([A-D])[).:]\s*(.+)/i);
      const ansMatch = line.match(/^(?:Answer|Ans|Correct|Correct Answer)[:\s]+([A-D]|\d+)/i);

      if (qMatch) {
        if (currentQ && currentQ.options.length >= 2) {
          questions.push(currentQ);
        }
        currentQ = {
          prompt: qMatch[1].trim(),
          options: [],
          correctIndex: 0
        };
      } else if (optMatch && currentQ) {
        currentQ.options.push(optMatch[2].trim());
      } else if (ansMatch && currentQ) {
        const val = ansMatch[1].toUpperCase();
        if (letterMap[val] !== undefined) {
          currentQ.correctIndex = letterMap[val];
        } else if (!isNaN(parseInt(val, 10))) {
          currentQ.correctIndex = Math.max(0, parseInt(val, 10) - 1);
        }
      } else if (currentQ && currentQ.options.length === 0) {
        currentQ.prompt += ' ' + line;
      }
    }

    if (currentQ && currentQ.options.length >= 2) {
      questions.push(currentQ);
    }

    return questions;
  }

  /**
   * Fetches teacher's created examinations from server API.
   */
  async function fetchTeacherExams() {
    if (!state.token) return;

    try {
      const res = await fetch('/api/exams/mine', {
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });
      const result = await res.json();

      if (res.ok && result.success) {
        state.exams = result.data;
        renderCreatedExamsTable();
      } else if (result.statusCode === 503) {
        createdExamsCount.textContent = 'Database offline (PostgreSQL required)';
        createdExamsTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--danger); padding: 24px;">
              <strong>Database Connection Offline:</strong> PostgreSQL is not running. Please start PostgreSQL to persist and list examinations.
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.error('Failed to load teacher exams:', err);
    }
  }

  function renderCreatedExamsTable() {
    createdExamsTableBody.innerHTML = '';
    createdExamsCount.textContent = `${state.exams.length} active exam blueprint${state.exams.length === 1 ? '' : 's'}`;

    if (state.exams.length === 0) {
      createdExamsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">
            No examinations created yet. Use the form on the left with a question document to publish one.
          </td>
        </tr>
      `;
      return;
    }

    state.exams.forEach(exam => {
      const tr = document.createElement('tr');
      const questionsCount = exam.questionsCount !== undefined ? exam.questionsCount : (exam.questions ? exam.questions.length : 0);
      const submissionsCount = exam.submissionsCount !== undefined ? exam.submissionsCount : (exam.submissions || 0);

      tr.innerHTML = `
        <td>
          <span class="exam-meta-title">${exam.title}</span>
          <span class="exam-meta-code">Target: ${exam.batch || 'General'} • ${questionsCount} Questions • <span class="status-pill status-${(exam.status || 'draft').toLowerCase()}">${exam.status || 'DRAFT'}</span></span>
        </td>
        <td>
          <span class="code-pill">${exam.code}</span>
        </td>
        <td>${exam.duration} mins</td>
        <td><strong>${submissionsCount}</strong> entries</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyAccessCode('${exam.code}', this)">
              Copy Code
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="testExamDirectly('${exam.code}')">
              Test
            </button>
          </div>
        </td>
      `;
      createdExamsTableBody.appendChild(tr);
    });
  }

  // Publish Exam & Generate Code Handler
  createExamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('examTitle').value.trim();
    const duration = parseInt(document.getElementById('examDuration').value, 10) || 45;
    const batch = document.getElementById('targetBatch').value.trim() || 'General Batch';
    const btnPublish = document.getElementById('btnPublishExam');

    const proceedWithQuestions = async (questions) => {
      // Enforce: Do not publish an exam with zero valid questions. Do not fabricate questions.
      if (!questions || questions.length === 0) {
        alert('Cannot publish exam with zero questions.\n\nPlease upload a question file (.txt, .md, .json) formatted with questions, options, and answers before publishing.');
        return;
      }

      btnPublish.disabled = true;
      const originalBtnText = btnPublish.innerHTML;
      btnPublish.innerHTML = '<span>Publishing Exam...</span>';

      try {
        const res = await fetch('/api/exams', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({
            title,
            durationMinutes: duration,
            batch,
            publishImmediately: true,
            questions
          })
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
          alert(result.error?.message || 'Failed to publish examination.');
          return;
        }

        const createdExam = result.data;
        displayGeneratedCode.textContent = createdExam.accessCode;
        publishedCodeBanner.classList.add('active');
        publishedCodeBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Reset form inputs
        document.getElementById('examTitle').value = '';
        selectedFile = null;
        if (fileNameDisplay) fileNameDisplay.textContent = '';
        if (filePreview) filePreview.classList.remove('active');

        // Re-fetch table from database
        await fetchTeacherExams();
      } catch (err) {
        alert('Error communicating with server: ' + err.message);
      } finally {
        btnPublish.disabled = false;
        btnPublish.innerHTML = originalBtnText;
      }
    };

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileContent = event.target.result;
        const parsedQuestions = parseQuestionsFromText(fileContent);
        proceedWithQuestions(parsedQuestions);
      };
      reader.onerror = () => {
        alert('Failed to read uploaded question document.');
      };
      reader.readAsText(selectedFile);
    } else {
      proceedWithQuestions([]);
    }
  });

  btnDismissBanner.addEventListener('click', () => {
    publishedCodeBanner.classList.remove('active');
  });

  btnCopyGeneratedCode.addEventListener('click', () => {
    const code = displayGeneratedCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
      const orig = btnCopyGeneratedCode.textContent;
      btnCopyGeneratedCode.textContent = 'Copied!';
      setTimeout(() => btnCopyGeneratedCode.textContent = orig, 1500);
    });
  });

  btnJumpToStudentTest.addEventListener('click', () => {
    const code = displayGeneratedCode.textContent;
    state.currentUser = {
      role: 'STUDENT',
      name: 'Elena Rostova',
      identifier: 'ST-94821'
    };
    document.getElementById('studentDisplayName').textContent = state.currentUser.name;
    document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
    document.getElementById('inputExamCode').value = code;
    showScreen('screen-student-dash');
    findAndDisplayExam(code);
  });

  /* --------------------------------------------------------------------------
     5. Screen 3: Student Dashboard (Exam Entry)
     -------------------------------------------------------------------------- */
  const findExamForm = document.getElementById('findExamForm');
  const inputExamCode = document.getElementById('inputExamCode');
  const preExamDetailsCard = document.getElementById('preExamDetailsCard');
  const preExamTitle = document.getElementById('preExamTitle');
  const preExamBatch = document.getElementById('preExamBatch');
  const preExamDuration = document.getElementById('preExamDuration');
  const preExamQuestions = document.getElementById('preExamQuestions');
  const btnStartExam = document.getElementById('btnStartExam');

  async function findAndDisplayExam(codeQuery) {
    const cleanCode = codeQuery.trim().toUpperCase();
    if (!cleanCode) return;

    const btnFind = document.getElementById('btnFindExam');
    if (btnFind) btnFind.disabled = true;

    try {
      const res = await fetch(`/api/exams/code/${encodeURIComponent(cleanCode)}`);
      const result = await res.json();

      if (res.ok && result.success) {
        const found = result.data;
        state.activeExam = found;
        preExamTitle.textContent = found.title;
        preExamBatch.textContent = `Target: ${found.batch || 'General'} • Access Code: ${found.code}`;
        preExamDuration.textContent = `${found.duration} Mins`;
        preExamQuestions.textContent = `${found.questionCount || 0} Questions`;
        preExamDetailsCard.classList.add('active');
        preExamDetailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        alert(result.error?.message || `Exam code "${codeQuery}" was not found or is not currently active.`);
        preExamDetailsCard.classList.remove('active');
      }
    } catch (err) {
      // Local fallback if server unreachable
      const localFound = state.exams.find(e => e.code && e.code.toUpperCase() === cleanCode);
      if (localFound) {
        state.activeExam = localFound;
        preExamTitle.textContent = localFound.title;
        preExamBatch.textContent = `Target: ${localFound.batch} • Access Code: ${localFound.code}`;
        preExamDuration.textContent = `${localFound.duration} Mins`;
        preExamQuestions.textContent = `${localFound.questions ? localFound.questions.length : (localFound.questionsCount || 0)} Questions`;
        preExamDetailsCard.classList.add('active');
        preExamDetailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        alert(`Exam code "${codeQuery}" was not found.`);
        preExamDetailsCard.classList.remove('active');
      }
    } finally {
      if (btnFind) btnFind.disabled = false;
    }
  }

  findExamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    findAndDisplayExam(inputExamCode.value);
  });

  btnStartExam.addEventListener('click', () => {
    if (state.activeExam) {
      startLiveExamRunner(state.activeExam);
    }
  });

  /* --------------------------------------------------------------------------
     6. Screen 4: Student Live Exam Runner Engine
     -------------------------------------------------------------------------- */
  const runnerExamTitle = document.getElementById('runnerExamTitle');
  const runnerSessionCode = document.getElementById('runnerSessionCode');
  const runnerStudentName = document.getElementById('runnerStudentName');
  const runnerStudentId = document.getElementById('runnerStudentId');
  const runnerTimerBox = document.getElementById('runnerTimerBox');
  const timerLabel = document.getElementById('timerLabel');
  const countdownDisplay = document.getElementById('countdownDisplay');
  const runnerTotalQBadge = document.getElementById('runnerTotalQBadge');
  const runnerQuestionGrid = document.getElementById('runnerQuestionGrid');
  const runnerQuestionHeading = document.getElementById('runnerQuestionHeading');
  const runnerQuestionPrompt = document.getElementById('runnerQuestionPrompt');
  const runnerOptionsContainer = document.getElementById('runnerOptionsContainer');
  const runnerAnsweredCount = document.getElementById('runnerAnsweredCount');
  const runnerUnansweredCount = document.getElementById('runnerUnansweredCount');
  const btnPrevQuestion = document.getElementById('btnPrevQuestion');
  const btnNextQuestion = document.getElementById('btnNextQuestion');
  const btnClearSelection = document.getElementById('btnClearSelection');
  const btnRunnerHeaderSubmit = document.getElementById('btnRunnerHeaderSubmit');

  function startLiveExamRunner(exam) {
    state.activeExam = exam;
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.strikeCount = 0;

    // Header population
    runnerExamTitle.textContent = exam.title;
    runnerSessionCode.textContent = `Active Session: ${exam.code} • High-Security Sandbox`;
    runnerStudentName.textContent = state.currentUser ? state.currentUser.name : 'Elena Rostova';
    runnerStudentId.textContent = state.currentUser ? `ID: ${state.currentUser.identifier}` : 'ID: ST-94821';
    runnerTotalQBadge.textContent = `${exam.questions.length} Questions`;

    // Render Question Selector Matrix
    buildQuestionGrid(exam.questions.length);

    // Render Question 0
    renderQuestion(0);
    updateSummaryStats();

    // Initialize Timer
    state.remainingSeconds = exam.duration * 60;
    initTimerCountdown();

    showScreen('screen-runner');
  }

  function initTimerCountdown() {
    clearInterval(state.timerInterval);
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
      if (state.remainingSeconds > 0) {
        state.remainingSeconds--;
        updateTimerDisplay();

        // Warning state when under 5 minutes (300 seconds)
        if (state.remainingSeconds <= 300) {
          runnerTimerBox.classList.add('timer-warning-red');
          timerLabel.textContent = 'Critical Time';
        } else {
          runnerTimerBox.classList.remove('timer-warning-red');
          timerLabel.textContent = 'Time Remaining';
        }
      } else {
        clearInterval(state.timerInterval);
        handleAutoSubmit();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const hours = Math.floor(state.remainingSeconds / 3600);
    const mins = Math.floor((state.remainingSeconds % 3600) / 60);
    const secs = state.remainingSeconds % 60;

    if (hours > 0) {
      countdownDisplay.textContent = 
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      countdownDisplay.textContent = 
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  function buildQuestionGrid(total) {
    runnerQuestionGrid.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'q-btn unvisited';
      btn.id = `qBtn-${i}`;
      btn.textContent = String(i + 1).padStart(2, '0');
      btn.addEventListener('click', () => {
        renderQuestion(i);
      });
      runnerQuestionGrid.appendChild(btn);
    }
  }

  function renderQuestion(index) {
    state.currentQuestionIndex = index;
    const q = state.activeExam.questions[index];
    const total = state.activeExam.questions.length;

    runnerQuestionHeading.textContent = `Question ${index + 1} of ${total}`;
    runnerQuestionPrompt.textContent = q.prompt;

    // Render Options
    runnerOptionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    q.options.forEach((optText, optIdx) => {
      const isSelected = state.userAnswers[index] === optIdx;
      const label = document.createElement('label');
      label.className = `option-block ${isSelected ? 'selected' : ''}`;
      label.innerHTML = `
        <input 
          type="radio" 
          name="active_question_opt" 
          class="option-radio" 
          value="${optIdx}" 
          ${isSelected ? 'checked' : ''}
        >
        <span class="option-identifier">${letters[optIdx]}.</span>
        <span class="option-text">${optText}</span>
      `;

      label.addEventListener('click', () => {
        selectOption(index, optIdx);
      });

      runnerOptionsContainer.appendChild(label);
    });

    // Update Grid Button Highlights
    for (let i = 0; i < total; i++) {
      const btn = document.getElementById(`qBtn-${i}`);
      if (btn) {
        btn.classList.remove('current');
        if (state.userAnswers[i] !== undefined) {
          btn.className = 'q-btn answered';
        } else {
          btn.className = 'q-btn unvisited';
        }
      }
    }
    const currentBtn = document.getElementById(`qBtn-${index}`);
    if (currentBtn) {
      currentBtn.classList.add('current');
    }

    // Prev / Next button state
    btnPrevQuestion.disabled = (index === 0);
    btnNextQuestion.innerHTML = (index === total - 1)
      ? `<span>Review Answers</span>`
      : `<span>Next Question</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
  }

  function selectOption(qIndex, optIndex) {
    state.userAnswers[qIndex] = optIndex;
    renderQuestion(qIndex);
    updateSummaryStats();
  }

  btnClearSelection.addEventListener('click', () => {
    delete state.userAnswers[state.currentQuestionIndex];
    renderQuestion(state.currentQuestionIndex);
    updateSummaryStats();
  });

  btnPrevQuestion.addEventListener('click', () => {
    if (state.currentQuestionIndex > 0) {
      renderQuestion(state.currentQuestionIndex - 1);
    }
  });

  btnNextQuestion.addEventListener('click', () => {
    const total = state.activeExam.questions.length;
    if (state.currentQuestionIndex < total - 1) {
      renderQuestion(state.currentQuestionIndex + 1);
    }
  });

  function updateSummaryStats() {
    const total = state.activeExam ? state.activeExam.questions.length : 0;
    const answered = Object.keys(state.userAnswers).length;
    const pending = total - answered;

    runnerAnsweredCount.textContent = answered;
    runnerUnansweredCount.textContent = pending;
  }

  /* --------------------------------------------------------------------------
     7. Auto-Submission & Manual Submission Engine
     -------------------------------------------------------------------------- */
  function submitExam(isAuto = false) {
    clearInterval(state.timerInterval);

    // Compute score
    let score = 0;
    let correctCount = 0;
    const questions = state.activeExam.questions;

    questions.forEach((q, idx) => {
      if (state.userAnswers[idx] === q.correctIndex) {
        score += 2;
        correctCount++;
      } else if (state.userAnswers[idx] !== undefined) {
        score = Math.max(0, score - 0.5); // Negative marking
      }
    });

    const maxScore = questions.length * 2;
    const answeredCount = Object.keys(state.userAnswers).length;

    // Increment submissions count on active exam
    state.activeExam.submissions++;

    // Populate Results Modal
    const resultSummaryBox = document.getElementById('resultSummaryBox');
    const resultModalDesc = document.getElementById('resultModalDesc');

    if (isAuto) {
      resultModalDesc.textContent = 'Time limit reached (00:00:00). Your answers were automatically finalized and recorded by the server.';
    } else {
      resultModalDesc.textContent = 'Your exam was finalized and safely submitted to the assessment engine.';
    }

    resultSummaryBox.innerHTML = `
      <strong>Exam:</strong> ${state.activeExam.title}<br>
      <strong>Candidate:</strong> ${state.currentUser.name} (${state.currentUser.identifier})<br>
      <strong>Questions Attempted:</strong> ${answeredCount} of ${questions.length}<br>
      <strong>Calculated Score:</strong> ${score.toFixed(2)} / ${maxScore.toFixed(2)} pts (${correctCount} correct)<br>
      <strong>Security Audit:</strong> ${state.strikeCount} proctoring strikes recorded
    `;

    document.getElementById('submitResultModal').classList.add('active');
  }

  function handleAutoSubmit() {
    submitExam(true);
  }

  btnRunnerHeaderSubmit.addEventListener('click', () => {
    const answeredCount = Object.keys(state.userAnswers).length;
    const total = state.activeExam.questions.length;
    if (confirm(`You have answered ${answeredCount} of ${total} questions. Do you wish to finalize and submit?`)) {
      submitExam(false);
    }
  });

  document.getElementById('btnReturnToStudentDash').addEventListener('click', () => {
    document.getElementById('submitResultModal').classList.remove('active');
    preExamDetailsCard.classList.remove('active');
    inputExamCode.value = '';
    showScreen('screen-student-dash');
  });

  /* --------------------------------------------------------------------------
     8. Anti-Cheat & Proctoring Telemetry
     -------------------------------------------------------------------------- */
  const tabWarningModal = document.getElementById('tabWarningModal');
  const btnDismissWarningModal = document.getElementById('btnDismissWarningModal');
  const warningStrikeNum = document.getElementById('warningStrikeNum');

  let lastStrikeTime = 0;

  function triggerProctorStrike() {
    const runnerScreen = document.getElementById('screen-runner');
    // Only track if currently in active exam runner
    if (!runnerScreen || !runnerScreen.classList.contains('active')) {
      return;
    }

    // Do not trigger another strike while the warning modal is already open
    if (tabWarningModal.classList.contains('active')) {
      return;
    }

    // Cooldown protection: prevent rapid duplicate triggers within 2 seconds
    const now = Date.now();
    if (now - lastStrikeTime < 2000) {
      return;
    }
    lastStrikeTime = now;

    state.strikeCount++;
    warningStrikeNum.textContent = state.strikeCount;
    tabWarningModal.classList.add('active');

    if (state.strikeCount >= 3) {
      alert('Disqualification Notice: 3 integrity strikes exceeded. Your exam will be immediately submitted.');
      tabWarningModal.classList.remove('active');
      submitExam(true);
    }
  }

  // Detect genuine tab switches or minimizing browser (Page Visibility API)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      triggerProctorStrike();
    }
  });

  btnDismissWarningModal.addEventListener('click', () => {
    tabWarningModal.classList.remove('active');
  });

  /* --------------------------------------------------------------------------
     9. Global Window Helpers
     -------------------------------------------------------------------------- */
  window.fillAccessCode = function(code) {
    document.getElementById('inputExamCode').value = code;
    findAndDisplayExam(code);
  };

  window.copyAccessCode = function(code, btn) {
    navigator.clipboard.writeText(code).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.color = 'var(--primary)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 1500);
    });
  };

  window.testExamDirectly = function(code) {
    state.currentUser = {
      role: 'STUDENT',
      name: 'Elena Rostova',
      identifier: 'ST-94821'
    };
    document.getElementById('studentDisplayName').textContent = state.currentUser.name;
    document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
    document.getElementById('inputExamCode').value = code;
    showScreen('screen-student-dash');
    findAndDisplayExam(code);
  };

});
