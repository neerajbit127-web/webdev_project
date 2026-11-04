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
    currentRole: 'TEACHER',
    pendingExamCode: null, // 'TEACHER' | 'STUDENT'
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
      state.token = null;
      state.currentUser = null;
      state.currentRole = 'TEACHER';
      state.pendingExamCode = null;
      state.activeExam = null;
      state.submissionId = null;
      state.userAnswers = {};
      state.strikeCount = 0;
      localStorage.removeItem('examportal_token');
      showScreen('screen-auth');
      setRole('TEACHER');
    });
  });

  /* --------------------------------------------------------------------------
     3. Screen 1: Role Selection & Authentication
     -------------------------------------------------------------------------- */
  const roleButtons = {
    TEACHER: document.getElementById('roleBtnTeacher'),
    STUDENT: document.getElementById('roleBtnStudent'),
    ADMIN: document.getElementById('roleBtnAdmin')
  };
  const lblIdentifier = document.getElementById('lblIdentifier');
  const loginIdentifier = document.getElementById('loginIdentifier');
  const hintIdentifier = document.getElementById('hintIdentifier');
  const btnAuthSubmit = document.getElementById('btnAuthSubmit');
  const authLoginForm = document.getElementById('authLoginForm');
  const authRegisterForm = document.getElementById('authRegisterForm');
  const btnShowRegister = document.getElementById('btnShowRegister');
  const authSwitchPrompt = document.getElementById('authSwitchPrompt');
  const authHelpText = document.getElementById('authHelpText');
  const registerStudentId = document.getElementById('registerStudentId');
  const registerStudentIdGroup = document.getElementById('registerStudentIdGroup');
  let authMode = 'login';

  function setRole(role) {
    state.currentRole = role;
    Object.entries(roleButtons).forEach(([key, button]) => {
      if (!button) return;
      const active = key === role;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (role === 'STUDENT') {
      lblIdentifier.textContent = 'Email or Student ID';
      hintIdentifier.textContent = 'Use the email or student ID linked to your account.';
      loginIdentifier.value = '';
      loginIdentifier.placeholder = 'name@example.com or student ID';
    } else {
      lblIdentifier.textContent = 'Email';
      hintIdentifier.textContent = role === 'ADMIN'
        ? 'Administrator accounts are provisioned separately.'
        : 'Use your registered email address.';
      loginIdentifier.value = '';
      loginIdentifier.placeholder = 'name@example.com';
    }
    btnAuthSubmit.textContent = role === 'ADMIN' ? 'Sign In as Administrator' : `Sign In as ${role === 'TEACHER' ? 'Teacher' : 'Student'}`;
    btnShowRegister.hidden = role === 'ADMIN';
    authSwitchPrompt.hidden = role === 'ADMIN';
    if (authMode === 'register' && role === 'ADMIN') showAuthMode('login');
    registerStudentIdGroup.hidden = role !== 'STUDENT';
    registerStudentId.required = role === 'STUDENT';
    document.getElementById('btnRegisterSubmit').textContent =
      role === 'TEACHER' ? 'Create Teacher Account' : 'Create Student Account';
  }

  function showAuthMode(mode) {
    authMode = mode;
    const registering = mode === 'register';
    authLoginForm.hidden = registering;
    authRegisterForm.hidden = !registering;
    btnShowRegister.textContent = registering ? 'Sign in instead' : 'Create an account';
    authSwitchPrompt.textContent = registering ? 'Already registered?' : 'New to ExamPortal?';
    authHelpText.textContent = registering
      ? 'Teachers and students can create accounts. Administrator access is managed separately.'
      : 'Sign in with your registered account. Teachers can register freely.';
  }

  Object.entries(roleButtons).forEach(([role, button]) => {
    if (button) button.addEventListener('click', () => setRole(role));
  });
  btnShowRegister.addEventListener('click', () => {
    showAuthMode(authMode === 'register' ? 'login' : 'register');
  });

  authRegisterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = document.getElementById('btnRegisterSubmit');
    const payload = {
      fullName: document.getElementById('registerFullName').value.trim(),
      email: document.getElementById('registerEmail').value.trim(),
      password: document.getElementById('registerPassword').value,
      role: state.currentRole
    };
    if (state.currentRole === 'STUDENT') payload.studentId = registerStudentId.value.trim();

    submit.disabled = true;
    submit.textContent = 'Creating account...';
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        alert(result.error?.message || 'Could not create account.');
        return;
      }
      alert('Account created. You can now sign in.');
      authRegisterForm.reset();
      loginIdentifier.value = payload.email;
      showAuthMode('login');
    } catch (_) {
      alert('Connection error communicating with the registration service.');
    } finally {
      submit.disabled = false;
      submit.textContent = state.currentRole === 'TEACHER' ? 'Create Teacher Account' : 'Create Student Account';
    }
  });

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
        document.getElementById('teacherDisplayName').textContent = state.currentUser.fullName || 'Teacher';
        await fetchTeacherExams();
        showScreen('screen-teacher');
      } else if (state.currentRole === 'ADMIN') {
        document.getElementById('adminDisplayName').textContent = state.currentUser.fullName || 'Administrator';
        await loadAdminDashboard();
        showScreen('screen-admin');
      } else {
        document.getElementById('studentDisplayName').textContent = state.currentUser.fullName || 'Student';
        document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.studentId || ''}`;
        showScreen('screen-student-dash');
        await loadStudentHistory();

        if (state.pendingExamCode) {
          const pendingCode = state.pendingExamCode;
          state.pendingExamCode = null;
          document.getElementById('inputExamCode').value = pendingCode;
          await findAndDisplayExam(pendingCode);
        }
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
            <button type="button" class="btn btn-primary btn-sm" data-results-exam="${exam.id}">
              Results
            </button>
          </div>
        </td>
      `;
      createdExamsTableBody.appendChild(tr);
    });
  }


  /* --------------------------------------------------------------------------
     Student Results History & Answer Review
     -------------------------------------------------------------------------- */
  const studentHistoryHost = document.createElement('section');
  studentHistoryHost.className = 'card';
  studentHistoryHost.id = 'studentHistoryCard';
  studentHistoryHost.style.marginTop = '24px';
  studentHistoryHost.innerHTML = `
    <header class="card-header">
      <div><h2 class="card-title">My Test History</h2><span class="exam-meta-code">Your completed assessments and performance</span></div>
      <button type="button" class="btn btn-secondary btn-sm" id="btnRefreshStudentHistory">Refresh</button>
    </header>
    <div class="table-responsive">
      <table class="data-table"><thead><tr><th>Test</th><th>Score</th><th>Percentage</th><th>Result</th><th>Submitted</th><th>Review</th></tr></thead>
      <tbody id="studentHistoryBody"><tr><td colspan="6">Loading test history...</td></tr></tbody></table>
    </div>
    <div id="studentReviewPanel" style="padding:0 20px 20px"></div>`;
  const studentEntry = document.querySelector('#screen-student-dash .student-entry-container');
  if (studentEntry) studentEntry.appendChild(studentHistoryHost);

  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  async function loadStudentHistory() {
    const body = document.getElementById('studentHistoryBody');
    if (!body || !state.token) return;
    body.innerHTML = '<tr><td colspan="6">Loading test history...</td></tr>';
    try {
      const response = await fetch('/api/submissions/mine', { headers: { Authorization: `Bearer ${state.token}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Unable to load test history.');
      if (!result.data.length) {
        body.innerHTML = '<tr><td colspan="6">No completed tests yet. Your results will appear here after you submit a test.</td></tr>';
        return;
      }
      body.innerHTML = result.data.map(item => `
        <tr>
          <td><strong>${safeText(item.exam_title)}</strong><div class="exam-meta-code">${safeText(item.batch || 'General')}</div></td>
          <td>${safeText(item.total_score ?? '—')} / ${safeText(item.total_marks)}</td>
          <td>${Number(item.percentage || 0).toFixed(1)}%</td>
          <td><span class="status-pill ${item.passed ? 'status-active' : 'status-draft'}">${item.passed ? 'PASSED' : 'NOT PASSED'}</span></td>
          <td>${item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}</td>
          <td><button class="btn btn-secondary btn-sm" data-review-id="${safeText(item.submission_id)}">Review answers</button></td>
        </tr>`).join('');
    } catch (error) {
      body.innerHTML = `<tr><td colspan="6">${safeText(error.message)}</td></tr>`;
    }
  }
  document.getElementById('btnRefreshStudentHistory')?.addEventListener('click', loadStudentHistory);
  document.getElementById('studentHistoryBody')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-review-id]');
    if (!button) return;
    const panel = document.getElementById('studentReviewPanel');
    panel.innerHTML = '<p>Loading answer review...</p>';
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(button.dataset.reviewId)}/review`, {
        headers: { Authorization: `Bearer ${state.token}` }
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Unable to load answer review.');
      const review = result.data;
      panel.innerHTML = `<h3 style="margin:20px 0 8px">${safeText(review.examTitle)} — Answer Review</h3>
        <p><strong>Score:</strong> ${safeText(review.totalScore)} / ${safeText(review.totalMarks)} · ${Number(review.percentage || 0).toFixed(1)}% · ${review.passed ? 'Passed' : 'Not passed'}</p>
        ${review.questions.map(q => `
          <article class="card" style="margin-top:12px;padding:16px">
            <h4>Q${q.number}. ${safeText(q.prompt)}</h4>
            <p><strong>${q.isCorrect ? 'Correct' : 'Incorrect / unanswered'}</strong> · Awarded: ${safeText(q.awardedMarks ?? 0)} / ${safeText(q.marks)}</p>
            ${q.options.map(option => `<p style="margin:6px 0;padding:8px;border-radius:6px;background:${option.isCorrect ? '#dcfce7' : option.id === q.selectedOptionId ? '#fee2e2' : 'transparent'}">${option.isCorrect ? '✓ Correct answer: ' : option.id === q.selectedOptionId ? 'Your answer: ' : ''}${safeText(option.text)}</p>`).join('')}
            ${q.explanation ? `<p><strong>Explanation:</strong> ${safeText(q.explanation)}</p>` : ''}
          </article>`).join('')}`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { panel.textContent = error.message; }
  });



  // Teacher results: show every attempt for the selected exam.
  const teacherResultsPanel = document.createElement('section');
  teacherResultsPanel.className = 'card';
  teacherResultsPanel.id = 'teacherResultsPanel';
  teacherResultsPanel.hidden = true;
  teacherResultsPanel.style.marginTop = '24px';
  teacherResultsPanel.innerHTML = `
    <header class="card-header"><div><h2 class="card-title" id="teacherResultsTitle">Student Results</h2><span class="exam-meta-code" id="teacherResultsMeta"></span></div><button class="btn btn-secondary btn-sm" id="btnCloseTeacherResults" type="button">Close</button></header>
    <div class="table-responsive"><table class="data-table"><thead><tr><th>Student</th><th>Student ID</th><th>Score</th><th>Percentage</th><th>Result</th><th>Attempt status</th><th>Submitted</th></tr></thead><tbody id="teacherResultsBody"></tbody></table></div>`;
  document.querySelector('#screen-teacher .layout-container')?.appendChild(teacherResultsPanel);
  async function loadTeacherResults(examId) {
    teacherResultsPanel.hidden = false;
    document.getElementById('teacherResultsBody').innerHTML = '<tr><td colspan="7">Loading results...</td></tr>';
    try {
      const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/results`, { headers: { Authorization: `Bearer ${state.token}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'Unable to load results.');
      document.getElementById('teacherResultsTitle').textContent = result.data.exam.title + ' — Student Results';
      document.getElementById('teacherResultsMeta').textContent = `${result.data.results.length} student attempt(s)`;
      document.getElementById('teacherResultsBody').innerHTML = result.data.results.length
        ? result.data.results.map(row => `<tr>
            <td>${safeText(row.student_name)}<div class="exam-meta-code">${safeText(row.student_email)}</div></td>
            <td>${safeText(row.student_id || '—')}</td>
            <td>${row.total_score === null ? '—' : safeText(row.total_score) + ' / ' + safeText(result.data.exam.totalMarks)}</td>
            <td>${row.percentage === null ? '—' : Number(row.percentage).toFixed(1) + '%'}</td>
            <td>${row.passed === null ? 'Pending' : row.passed ? 'PASSED' : 'NOT PASSED'}</td>
            <td>${safeText(row.status)}</td>
            <td>${row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}</td>
          </tr>`).join('')
        : '<tr><td colspan="7">No students have attempted this test yet.</td></tr>';
      teacherResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      document.getElementById('teacherResultsBody').innerHTML = `<tr><td colspan="7">${safeText(error.message)}</td></tr>`;
    }
  }
  document.getElementById('btnCloseTeacherResults')?.addEventListener('click', () => { teacherResultsPanel.hidden = true; });
  createdExamsTableBody?.addEventListener('click', event => {
    const button = event.target.closest('[data-results-exam]');
    if (button) loadTeacherResults(button.dataset.resultsExam);
  });


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

  btnJumpToStudentTest.addEventListener('click', async () => {
    await beginStudentTest(displayGeneratedCode.textContent.trim());
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

    // Restore the user associated with a persisted token after a page refresh.
    if (state.token && !state.currentUser) {
      try {
        const meResponse = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const meResult = await meResponse.json();
        if (meResponse.ok && meResult.success) {
          state.currentUser = meResult.data;
        }
      } catch (_) {}
    }

    if (!state.token || !state.currentUser || state.currentUser.role !== 'STUDENT') {
      state.pendingExamCode = cleanCode;
      setRole('STUDENT');
      showScreen('screen-auth');
      alert('Please sign in with your student account to access this examination.');
      return;
    }

    try {
      // POST /api/exams/lookup with accessCode
      const res = await fetch('/api/exams/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ accessCode: cleanCode })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        const found = result.data;
        state.activeExam = found;
        preExamTitle.textContent = found.title;
        preExamBatch.textContent = `Target: ${found.batch || 'General'} • Access Code: ${found.code}`;
        preExamDuration.textContent = `${found.durationMinutes || found.duration} Mins`;
        preExamQuestions.textContent = `${found.questionCount || 0} Questions`;
        preExamDetailsCard.classList.add('active');
        preExamDetailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        alert(result.error?.message || `Exam code "${codeQuery}" was not found or is not currently active.`);
        preExamDetailsCard.classList.remove('active');
      }
    } catch (err) {
      alert('Connection error checking exam code with assessment server.');
      preExamDetailsCard.classList.remove('active');
    } finally {
      if (btnFind) btnFind.disabled = false;
    }
  }

  findExamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    findAndDisplayExam(inputExamCode.value);
  });

  btnStartExam.addEventListener('click', async () => {
    if (!state.activeExam || !state.activeExam.id) {
      alert('Please look up a valid published exam first.');
      return;
    }

    btnStartExam.disabled = true;
    const originalText = btnStartExam.innerHTML;
    btnStartExam.innerHTML = '<span>Initializing Secure Session...</span>';

    try {
      // POST /api/exams/:id/start
      const res = await fetch(`/api/exams/${state.activeExam.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        }
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        alert(result.error?.message || 'Unable to start examination session.');
        return;
      }

      const session = result.data;
      state.submissionId = session.submissionId;
      state.activeExam = {
        ...state.activeExam,
        id: session.examId,
        title: session.examTitle,
        batch: session.batch,
        questions: session.questions,
        remainingSeconds: session.remainingSeconds,
        deadlineAt: session.deadlineAt,
        serverTime: session.serverTime
      };

      // Restore any previous answers if resuming session
      state.userAnswers = {};
      if (session.savedAnswers && typeof session.savedAnswers === 'object') {
        session.questions.forEach((q, idx) => {
          if (session.savedAnswers[q.id]) {
            const optIdx = q.options.findIndex(o => o.id === session.savedAnswers[q.id]);
            if (optIdx !== -1) {
              state.userAnswers[idx] = optIdx;
            }
          }
        });
      }

      startLiveExamRunner(state.activeExam);
    } catch (err) {
      alert('Error connecting to assessment engine: ' + err.message);
    } finally {
      btnStartExam.disabled = false;
      btnStartExam.innerHTML = originalText;
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
    state.strikeCount = 0;

    const questionsList = exam.questions || [];

    // Header population
    runnerExamTitle.textContent = exam.title;
    runnerSessionCode.textContent = `Active Session: ${exam.code || 'EXAM'} • Server Time Synchronized`;
    runnerStudentName.textContent = state.currentUser ? (state.currentUser.fullName || state.currentUser.name) : 'Elena Rostova';
    runnerStudentId.textContent = state.currentUser ? `ID: ${state.currentUser.studentId || state.currentUser.identifier}` : 'ID: ST-94821';
    runnerTotalQBadge.textContent = `${questionsList.length} Questions`;

    // Render Question Selector Matrix
    buildQuestionGrid(questionsList.length);

    // Render Question 0
    renderQuestion(0);
    updateSummaryStats();

    // Initialize Timer with server-authoritative remainingSeconds
    state.remainingSeconds = exam.remainingSeconds !== undefined
      ? parseInt(exam.remainingSeconds, 10)
      : (parseInt(exam.duration || exam.durationMinutes || 45, 10) * 60);

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
    const questionsList = state.activeExam.questions || [];
    const q = questionsList[index];
    const total = questionsList.length;

    if (!q) return;

    runnerQuestionHeading.textContent = `Question ${index + 1} of ${total}`;
    runnerQuestionPrompt.textContent = q.prompt || q.questionText || '';

    // Render Options
    runnerOptionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const options = q.options || [];

    options.forEach((opt, optIdx) => {
      const optText = typeof opt === 'string' ? opt : (opt.text || opt.optionText || '');
      const optId = typeof opt === 'object' && opt.id ? opt.id : optIdx;
      const isSelected = state.userAnswers[index] === optIdx;

      const label = document.createElement('label');
      label.className = `option-block ${isSelected ? 'selected' : ''}`;
      label.innerHTML = `
        <input 
          type="radio" 
          name="active_question_opt" 
          class="option-radio" 
          value="${optId}" 
          ${isSelected ? 'checked' : ''}
        >
        <span class="option-identifier">${letters[optIdx] || optIdx + 1}.</span>
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
    debounceSaveAnswer(qIndex, optIndex);
  }

  btnClearSelection.addEventListener('click', () => {
    const idx = state.currentQuestionIndex;
    delete state.userAnswers[idx];
    renderQuestion(idx);
    updateSummaryStats();
    debounceSaveAnswer(idx, null);
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
     7. Answer Save Debounce (network persistence layer)
     -------------------------------------------------------------------------- */
  const _answerSaveQueue = {};
  const _pendingAnswerValues = {};

  function showAnswerSaveError(msg) {
    let toast = document.getElementById('answerSaveToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'answerSaveToast';
      toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:8px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
  }

  function clearAnswerSaveError() {
    const toast = document.getElementById('answerSaveToast');
    if (toast) toast.style.display = 'none';
  }

  function debounceSaveAnswer(questionIndex, optionIndex) {
    clearTimeout(_answerSaveQueue[questionIndex]);
    _pendingAnswerValues[questionIndex] = optionIndex;
    _answerSaveQueue[questionIndex] = setTimeout(() => {
      delete _answerSaveQueue[questionIndex];
      delete _pendingAnswerValues[questionIndex];
      saveAnswerToServer(questionIndex, optionIndex);
    }, 500);
  }

  async function saveAnswerToServer(questionIndex, selectedOptionIndex) {
    if (!state.submissionId || !state.token) return;
    const q = state.activeExam && state.activeExam.questions && state.activeExam.questions[questionIndex];
    if (!q) return;

    const selectedOptionId = (selectedOptionIndex !== undefined && selectedOptionIndex !== null)
      ? (q.options[selectedOptionIndex]?.id || null)
      : null;

    try {
      const res = await fetch(`/api/submissions/${state.submissionId}/answers/${q.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ selectedOptionId })
      });

      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        const code = r.error?.code;
        if (code === 'EXAM_TIME_EXPIRED' || code === 'SUBMISSION_CLOSED') {
          // Server already finalized — stop timer and show result
          clearInterval(state.timerInterval);
          showAnswerSaveError('Exam time expired — submission recorded by server.');
        } else {
          showAnswerSaveError(r.error?.message || 'Answer not saved — check connection');
        }
      } else {
        clearAnswerSaveError();
        // Update localStorage answer cache
        try {
          const cacheKey = `ep_answers_${state.submissionId}`;
          const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
          if (selectedOptionId) cache[q.id] = selectedOptionId;
          else delete cache[q.id];
          localStorage.setItem(cacheKey, JSON.stringify(cache));
        } catch (_) {}
      }
    } catch (_err) {
      showAnswerSaveError('Offline — answer may not be saved, will retry on next selection');
    }
  }

  /* --------------------------------------------------------------------------
     8. Auto-Submission & Manual Submission Engine
     -------------------------------------------------------------------------- */
  async function submitExam(isAuto = false, reason = null) {
    clearInterval(state.timerInterval);

    if (!state.submissionId || !state.token) {
      // No active server session — fall back to local display only
      _showLocalResult(isAuto);
      return;
    }

    const resultModalDesc = document.getElementById('resultModalDesc');
    if (isAuto) {
      resultModalDesc.textContent = 'Time limit reached. Your answers were automatically finalized and recorded by the server.';
    } else {
      resultModalDesc.textContent = 'Your exam was finalized and safely submitted to the assessment engine.';
    }

    try {
      // Flush debounced answer writes before finalizing so the last selection
      // cannot be lost when the student submits immediately.
      const pendingWrites = Object.entries(_pendingAnswerValues).map(([index, optionIndex]) => {
        const questionIndex = Number(index);
        clearTimeout(_answerSaveQueue[questionIndex]);
        delete _answerSaveQueue[questionIndex];
        delete _pendingAnswerValues[questionIndex];
        return saveAnswerToServer(questionIndex, optionIndex);
      });
      await Promise.allSettled(pendingWrites);

      const finalReason = isAuto ? 'AUTO_SUBMITTED' : (reason || 'MANUAL');
      const res = await fetch(`/api/submissions/${state.submissionId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ reason: finalReason })
      });

      const result = await res.json().catch(() => ({}));

      if (res.ok && result.success) {
        const d = result.data;
        const resultSummaryBox = document.getElementById('resultSummaryBox');
        resultSummaryBox.innerHTML = `
          <strong>Exam:</strong> ${state.activeExam?.title || ''}<br>
          <strong>Candidate:</strong> ${state.currentUser?.fullName || state.currentUser?.name || ''} (${state.currentUser?.studentId || state.currentUser?.identifier || ''})<br>
          <strong>Questions Attempted:</strong> ${d.answeredCount} of ${d.totalQuestions}<br>
          <strong>Calculated Score:</strong> ${d.totalScore} pts — ${parseFloat(d.percentage).toFixed(1)}% ${d.passed ? '<span style="color:var(--success,#16a34a)">✓ PASSED</span>' : '<span style="color:#b91c1c">✗ NOT PASSED</span>'}<br>
          <strong>Security Audit:</strong> ${state.strikeCount} proctoring strikes recorded
        `;
      } else {
        // Do not imply that the server recorded a submission when it did not.
        resultModalDesc.textContent = 'The server could not confirm your submission. Your answers may still be saved, but the result is not verified. Reconnect and retry submission.';
        _showLocalResult(isAuto);
        console.warn('Submit API error:', result);
      }
    } catch (err) {
      resultModalDesc.textContent = 'The server could not be reached to confirm your submission. Your result is not verified. Reconnect and retry submission.';
      _showLocalResult(isAuto);
      console.warn('Submit network error:', err);
    }

    // Clear localStorage answer cache
    try {
      if (state.submissionId) localStorage.removeItem(`ep_answers_${state.submissionId}`);
    } catch (_) {}

    document.getElementById('submitResultModal').classList.add('active');
  }

  /** Fallback local result display when server is unreachable. */
  function _showLocalResult(isAuto) {
    const resultSummaryBox = document.getElementById('resultSummaryBox');
    const answeredCount = Object.keys(state.userAnswers).length;
    const total = (state.activeExam?.questions || []).length;
    resultSummaryBox.innerHTML = `
      <strong>Exam:</strong> ${state.activeExam?.title || ''}<br>
      <strong>Candidate:</strong> ${state.currentUser?.fullName || state.currentUser?.name || ''} (${state.currentUser?.studentId || state.currentUser?.identifier || ''})<br>
      <strong>Questions Attempted:</strong> ${answeredCount} of ${total}<br>
      <strong>Score:</strong> Calculated by server (result pending connection)<br>
      <strong>Security Audit:</strong> ${state.strikeCount} proctoring strikes recorded
    `;
  }

  function handleAutoSubmit() {
    submitExam(true, 'AUTO_SUBMITTED');
  }

  btnRunnerHeaderSubmit.addEventListener('click', () => {
    const answeredCount = Object.keys(state.userAnswers).length;
    const total = state.activeExam.questions.length;
    if (confirm(`You have answered ${answeredCount} of ${total} questions. Finalize and submit?`)) {
      submitExam(false, 'MANUAL');
    }
  });

  document.getElementById('btnReturnToStudentDash').addEventListener('click', async () => {
    document.getElementById('submitResultModal').classList.remove('active');
    preExamDetailsCard.classList.remove('active');
    inputExamCode.value = '';
    // Clear the cached answers before clearing the submission identifier.
    try {
      if (state.submissionId) localStorage.removeItem(`ep_answers_${state.submissionId}`);
    } catch (_) {}
    Object.values(_answerSaveQueue).forEach(clearTimeout);
    Object.keys(_answerSaveQueue).forEach(key => delete _answerSaveQueue[key]);
    Object.keys(_pendingAnswerValues).forEach(key => delete _pendingAnswerValues[key]);
    state.submissionId = null;
    state.activeExam = null;
    state.userAnswers = {};
    state.strikeCount = 0;
    clearAnswerSaveError();
    showScreen('screen-student-dash');
    await loadStudentHistory();
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

    // Record telemetry on the server (fire-and-forget)
    if (state.submissionId && state.token) {
      fetch(`/api/submissions/${state.submissionId}/integrity-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
        body: JSON.stringify({ eventType: 'TAB_SWITCH', eventData: { strikeCount: state.strikeCount, timestamp: new Date().toISOString() } })
      }).catch(() => {});
    }

    if (state.strikeCount >= 3) {
      alert('Disqualification Notice: 3 integrity strikes exceeded. Your exam will be immediately submitted.');
      tabWarningModal.classList.remove('active');
      submitExam(true, 'FORCE_SUBMITTED');
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

  async function loadAdminDashboard() {
    const usersBody = document.getElementById('adminUsersBody');
    const loginsBody = document.getElementById('adminLoginsBody');
    usersBody.innerHTML = '<tr><td colspan="6">Loading users...</td></tr>';
    loginsBody.innerHTML = '<tr><td colspan="5">Loading activity...</td></tr>';
    try {
      const headers = { 'Authorization': `Bearer ${state.token}` };
      const [usersResponse, loginsResponse] = await Promise.all([
        fetch('/api/auth/users', { headers }),
        fetch('/api/auth/login-activity?limit=100', { headers })
      ]);
      const [usersResult, loginsResult] = await Promise.all([usersResponse.json(), loginsResponse.json()]);
      if (!usersResponse.ok || !usersResult.success) throw new Error(usersResult.error?.message || 'Unable to load users.');
      if (!loginsResponse.ok || !loginsResult.success) throw new Error(loginsResult.error?.message || 'Unable to load login history.');

      usersBody.innerHTML = '';
      usersResult.data.forEach(user => {
        const row = document.createElement('tr');
        [user.full_name, user.email, user.student_id || '—', user.role, user.is_active ? 'Active' : 'Disabled',
          new Date(user.created_at).toLocaleString()].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });
        usersBody.appendChild(row);
      });
      if (!usersResult.data.length) usersBody.innerHTML = '<tr><td colspan="6">No registered users.</td></tr>';

      loginsBody.innerHTML = '';
      loginsResult.data.forEach(event => {
        const row = document.createElement('tr');
        [event.full_name, event.email, event.role, new Date(event.logged_in_at).toLocaleString(), event.ip_address || '—'].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });
        loginsBody.appendChild(row);
      });
      if (!loginsResult.data.length) loginsBody.innerHTML = '<tr><td colspan="5">No successful logins recorded yet.</td></tr>';
    } catch (error) {
      usersBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
      loginsBody.innerHTML = '<tr><td colspan="5">Could not load login activity.</td></tr>';
    }
  }

  document.getElementById('btnRefreshAdmin').addEventListener('click', loadAdminDashboard);

  async function beginStudentTest(code) {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      alert('No examination access code is available.');
      return;
    }

    // A teacher token must never be reused as a student session.
    if (state.currentUser?.role === 'STUDENT' && state.token) {
      document.getElementById('studentDisplayName').textContent =
        state.currentUser.fullName || state.currentUser.name || 'Student';
      document.getElementById('studentDisplayId').textContent =
        `Student ID: ${state.currentUser.studentId || state.currentUser.identifier || ''}`;
      document.getElementById('inputExamCode').value = cleanCode;
      showScreen('screen-student-dash');
      await findAndDisplayExam(cleanCode);
      return;
    }

    state.pendingExamCode = cleanCode;
    state.token = null;
    state.currentUser = null;
    localStorage.removeItem('examportal_token');
    setRole('STUDENT');
    showScreen('screen-auth');
    alert('Sign in with a student account to test this examination. The exam code will be filled in automatically after login.');
  }

  window.testExamDirectly = function(code) {
    beginStudentTest(code);
  };

});
