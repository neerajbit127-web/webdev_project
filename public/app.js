/**
 * ExamPortal — Client Application Controller
 * Connects to the Express REST API backend with resilient offline fallback
 */

document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = '/api';

  /* --------------------------------------------------------------------------
     1. Local State & Mock Fallback Data
     -------------------------------------------------------------------------- */
  const state = {
    currentRole: 'TEACHER', // 'TEACHER' | 'STUDENT'
    currentUser: null,
    authToken: localStorage.getItem('examportal_jwt') || null,
    activeExam: null,
    currentSubmissionId: null,
    currentQuestionIndex: 0,
    userAnswers: {},       // { [questionIndex]: optionIndex }
    timerInterval: null,
    remainingSeconds: 0,
    strikeCount: 0,
    exams: [
      {
        code: 'EXAM-4020',
        title: 'CS402: Advanced Distributed Systems',
        duration: 45,
        batch: 'Fall 2026 CS Senior',
        submissions: 18,
        questions: [
          {
            id: 'q1',
            prompt: 'In the Raft consensus algorithm, which condition must be met before a Leader node is permitted to safely commit a log entry originated from its current term to the state machine?',
            options: [
              'The entry has been replicated on at least one candidate node and verified by a two-phase commit coordinator.',
              'The entry has been successfully replicated on a strict majority (quorum) of the cluster servers.',
              'Every follower has responded with an explicit acknowledgement and applied the command locally.',
              'The entry matches the hash sequence of an entry previously committed in an earlier epoch.'
            ],
            correctIndex: 1
          },
          {
            id: 'q2',
            prompt: 'Which guarantee is provided by Byzantine Fault Tolerance (BFT) algorithms in a network of N nodes?',
            options: [
              'Tolerates up to (N-1)/3 malicious or failing nodes while maintaining consensus.',
              'Requires absolute synchronous physical clocks across all member nodes.',
              'Guarantees zero latency on cross-datacenter state machine replication.',
              'Eliminates the possibility of network partitioning.'
            ],
            correctIndex: 0
          },
          {
            id: 'q3',
            prompt: 'In distributed transaction processing, what is the primary operational weakness of the standard Two-Phase Commit (2PC) protocol?',
            options: [
              'It requires exponential message complexity O(2^N).',
              'It is a blocking protocol; if the Coordinator crashes during the prepare phase, Cohorts may remain indefinitely blocked.',
              'It cannot support ACID properties across relational databases.',
              'It does not allow multiple read queries simultaneously.'
            ],
            correctIndex: 1
          },
          {
            id: 'q4',
            prompt: 'What core property does the CAP Theorem state a distributed data store can NEVER simultaneously provide in the event of a network partition (P)?',
            options: [
              'Performance and Security.',
              'Consistency and Availability.',
              'Latency and Fault Recovery.',
              'Durability and Atomicity.'
            ],
            correctIndex: 1
          },
          {
            id: 'q5',
            prompt: 'How does vector clock synchronization differ from standard Lamport timestamps in distributed systems?',
            options: [
              'Vector clocks can establish causal concurrency and determine if two events are causally independent.',
              'Vector clocks rely strictly on hardware GPS atomic clocks.',
              'Vector clocks reduce storage size to a single 64-bit integer.',
              'Lamport timestamps are only applicable to single-node relational databases.'
            ],
            correctIndex: 0
          }
        ]
      },
      {
        code: 'EXAM-2010',
        title: 'CS201: Data Structures & Algorithms Quiz 3',
        duration: 30,
        batch: 'Fall 2026 Sophomore',
        submissions: 42,
        questions: [
          {
            id: 'q2-1',
            prompt: 'What is the worst-case time complexity of searching for an element in an unaugmented Red-Black Binary Search Tree with N keys?',
            options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
            correctIndex: 1
          },
          {
            id: 'q2-2',
            prompt: 'Which data structure is primarily utilized in Dijkstra\'s single-source shortest path algorithm to extract minimum weights efficiently?',
            options: ['LIFO Stack', 'Min-Priority Queue / Binary Heap', 'Disjoint Set Union (DSU)', 'Circular Doubly Linked List'],
            correctIndex: 1
          },
          {
            id: 'q2-3',
            prompt: 'In dynamic programming, what two fundamental properties must a problem exhibit to be suitably solved via optimal substructure?',
            options: [
              'Overlapping subproblems and optimal substructure.',
              'Linear time recurrence and greedy choices.',
              'Amortized complexity and tree depth.',
              'Non-deterministic polynomial time bounds.'
            ],
            correctIndex: 0
          },
          {
            id: 'q2-4',
            prompt: 'Which algorithm is typically utilized to find strongly connected components (SCC) in a directed graph in linear time O(V + E)?',
            options: ['Bellman-Ford', 'Tarjan\'s or Kosaraju\'s Algorithm', 'Kruskal\'s Algorithm', 'Floyd-Warshall'],
            correctIndex: 1
          }
        ]
      }
    ]
  };

  /* --------------------------------------------------------------------------
     2. Helper: Fetch with Authorization Header
     -------------------------------------------------------------------------- */
  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    if (state.authToken) {
      headers['Authorization'] = `Bearer ${state.authToken}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      return await res.json();
    } catch (err) {
      console.warn(`[API Connection Notice] ${endpoint} request fell back to client runner:`, err.message);
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     3. Screen Navigation Controller
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

  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      clearInterval(state.timerInterval);
      state.activeExam = null;
      state.userAnswers = {};
      state.strikeCount = 0;
      state.authToken = null;
      localStorage.removeItem('examportal_jwt');
      showScreen('screen-auth');
    });
  });

  /* --------------------------------------------------------------------------
     4. Screen 1: Role Selection & Authentication
     -------------------------------------------------------------------------- */
  const roleBtnTeacher = document.getElementById('roleBtnTeacher');
  const roleBtnStudent = document.getElementById('roleBtnStudent');
  const lblIdentifier = document.getElementById('lblIdentifier');
  const loginIdentifier = document.getElementById('loginIdentifier');
  const hintIdentifier = document.getElementById('hintIdentifier');
  const loginPassword = document.getElementById('loginPassword');
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
    const idVal = loginIdentifier.value.trim();
    const pwdVal = loginPassword.value || 'password123';

    // Attempt backend API login
    const apiRes = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: idVal,
        password: pwdVal,
        role: state.currentRole,
      }),
    });

    if (apiRes && apiRes.success && apiRes.data.token) {
      state.authToken = apiRes.data.token;
      localStorage.setItem('examportal_jwt', state.authToken);
      state.currentUser = apiRes.data.user;
    } else {
      // Offline fallback profile
      state.currentUser = {
        role: state.currentRole,
        name: state.currentRole === 'TEACHER' ? 'Dr. Alan Vance' : 'Elena Rostova',
        identifier: idVal,
      };
    }

    if (state.currentRole === 'TEACHER') {
      document.getElementById('teacherDisplayName').textContent = state.currentUser.name;
      loadTeacherExams();
      showScreen('screen-teacher');
    } else {
      document.getElementById('studentDisplayName').textContent = state.currentUser.name;
      document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
      showScreen('screen-student-dash');
    }
  });

  /* --------------------------------------------------------------------------
     5. Screen 2: Teacher Portal (Exam Creation & Code Generation)
     -------------------------------------------------------------------------- */
  const createExamForm = document.getElementById('createExamForm');
  const publishedCodeBanner = document.getElementById('publishedCodeBanner');
  const displayGeneratedCode = document.getElementById('displayGeneratedCode');
  const btnCopyGeneratedCode = document.getElementById('btnCopyGeneratedCode');
  const btnDismissBanner = document.getElementById('btnDismissBanner');
  const btnJumpToStudentTest = document.getElementById('btnJumpToStudentTest');
  const createdExamsTableBody = document.getElementById('createdExamsTableBody');
  const createdExamsCount = document.getElementById('createdExamsCount');

  // File Upload Dropzone
  const fileDropzone = document.getElementById('fileDropzone');
  const examFileInput = document.getElementById('examFileInput');
  const filePreview = document.getElementById('filePreview');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  let parsedQuestionsCache = [];

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
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });

    examFileInput.addEventListener('change', () => {
      if (examFileInput.files && examFileInput.files.length > 0) {
        handleFileSelection(examFileInput.files[0]);
      }
    });
  }

  async function handleFileSelection(file) {
    fileNameDisplay.textContent = file.name;
    filePreview.classList.add('active');

    // Attempt backend API parsing
    const formData = new FormData();
    formData.append('document', file);

    const parseRes = await apiFetch('/exams/parse-document', {
      method: 'POST',
      body: formData,
    });

    if (parseRes && parseRes.success && parseRes.data.questions) {
      parsedQuestionsCache = parseRes.data.questions;
      console.log(`[Parser Success] Extracted ${parsedQuestionsCache.length} questions from ${file.name}`);
    }
  }

  async function loadTeacherExams() {
    const apiRes = await apiFetch('/exams/teacher');
    if (apiRes && apiRes.success && Array.isArray(apiRes.data) && apiRes.data.length > 0) {
      state.exams = apiRes.data;
    }
    renderCreatedExamsTable();
  }

  function renderCreatedExamsTable() {
    createdExamsTableBody.innerHTML = '';
    createdExamsCount.textContent = `${state.exams.length} active exam blueprints`;

    state.exams.forEach(exam => {
      const qCount = exam.questionsCount || (exam.questions ? exam.questions.length : 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span class="exam-meta-title">${exam.title}</span>
          <span class="exam-meta-code">Target: ${exam.batch || 'General'} • ${qCount} Questions</span>
        </td>
        <td>
          <span class="code-pill">${exam.code}</span>
        </td>
        <td>${exam.duration || exam.durationMinutes} mins</td>
        <td><strong>${exam.submissions !== undefined ? exam.submissions : 0}</strong> entries</td>
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

  createExamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('examTitle').value.trim();
    const duration = parseInt(document.getElementById('examDuration').value, 10) || 45;
    const batch = document.getElementById('targetBatch').value.trim() || 'General Batch';

    let generatedCode;

    // Send payload to backend
    const apiRes = await apiFetch('/exams', {
      method: 'POST',
      body: JSON.stringify({
        title,
        duration,
        batch,
        questions: parsedQuestionsCache.length > 0 ? parsedQuestionsCache : undefined,
      }),
    });

    if (apiRes && apiRes.success && apiRes.data) {
      generatedCode = apiRes.data.code;
      await loadTeacherExams();
    } else {
      // Fallback local code generation
      const randomFour = Math.floor(1000 + Math.random() * 9000);
      generatedCode = `EXAM-${randomFour}`;

      const newExam = {
        code: generatedCode,
        title: title,
        duration: duration,
        batch: batch,
        submissions: 0,
        questions: parsedQuestionsCache.length > 0 ? parsedQuestionsCache : [
          {
            prompt: `Assessment Question 1 for ${title}: Which architectural pattern provides optimal decoupling for asynchronous event pipelines?`,
            options: [
              'Event-Driven Microservices with Distributed Commit Log (e.g. Apache Kafka)',
              'Synchronous Monolithic RPC with hardcoded IP bindings',
              'Point-to-point unbuffered socket streams',
              'Periodic polling via single-threaded timer loops'
            ],
            correctIndex: 0
          },
          {
            prompt: `Assessment Question 2 for ${title}: When deploying across multi-region cloud infrastructures, how is split-brain scenario prevented during a partition?`,
            options: [
              'Disabling database write logs entirely during the event',
              'Enforcing Quorum-based leader election requiring (N/2 + 1) nodes',
              'Accepting unverified writes blindly from all partitioned nodes',
              'Shutting down all storage clusters permanently'
            ],
            correctIndex: 1
          }
        ]
      };
      state.exams.unshift(newExam);
      renderCreatedExamsTable();
    }

    displayGeneratedCode.textContent = generatedCode;
    publishedCodeBanner.classList.add('active');
    publishedCodeBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      identifier: 'ST-94821',
    };
    document.getElementById('studentDisplayName').textContent = state.currentUser.name;
    document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
    document.getElementById('inputExamCode').value = code;
    showScreen('screen-student-dash');
    findAndDisplayExam(code);
  });

  /* --------------------------------------------------------------------------
     6. Screen 3: Student Dashboard (Exam Entry)
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

    // Query backend API
    const apiRes = await apiFetch(`/exams/code/${encodeURIComponent(cleanCode)}`);

    let examData = null;
    if (apiRes && apiRes.success && apiRes.data) {
      examData = apiRes.data;
    } else {
      examData = state.exams.find(e => e.code.toUpperCase() === cleanCode);
    }

    if (examData) {
      state.activeExam = examData;
      preExamTitle.textContent = examData.title;
      preExamBatch.textContent = `Target: ${examData.batch || 'General'} • Access Code: ${examData.code}`;
      preExamDuration.textContent = `${examData.durationMinutes || examData.duration} Mins`;
      const qNum = examData.questionsCount || (examData.questions ? examData.questions.length : 5);
      preExamQuestions.textContent = `${qNum} MCQs`;
      preExamDetailsCard.classList.add('active');
      preExamDetailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      alert(`Exam code "${codeQuery}" was not found. Please verify the code or check teacher portal.`);
      preExamDetailsCard.classList.remove('active');
    }
  }

  findExamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    findAndDisplayExam(inputExamCode.value);
  });

  btnStartExam.addEventListener('click', async () => {
    if (!state.activeExam) return;

    // Call backend start API
    const apiRes = await apiFetch(`/exams/${encodeURIComponent(state.activeExam.code)}/start`, {
      method: 'POST',
    });

    if (apiRes && apiRes.success && apiRes.data) {
      state.currentSubmissionId = apiRes.data.submissionId;
      startLiveExamRunner(apiRes.data.exam, apiRes.data.questions);
    } else {
      // Fallback local runner
      const questions = state.activeExam.questions || [
        {
          id: 'q1',
          prompt: `Assessment Question 1 for ${state.activeExam.title}: Identify the correct consensus condition.`,
          options: ['Option A', 'Quorum Majority (B)', 'Option C', 'Option D'],
          correctIndex: 1,
        }
      ];
      startLiveExamRunner(state.activeExam, questions);
    }
  });

  /* --------------------------------------------------------------------------
     7. Screen 4: Student Live Exam Runner Engine
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

  function startLiveExamRunner(exam, questions) {
    state.activeExam = { ...exam, questions };
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.strikeCount = 0;

    runnerExamTitle.textContent = exam.title;
    runnerSessionCode.textContent = `Active Session: ${exam.code} • High-Security Sandbox`;
    runnerStudentName.textContent = state.currentUser ? state.currentUser.name : 'Elena Rostova';
    runnerStudentId.textContent = state.currentUser ? `ID: ${state.currentUser.identifier}` : 'ID: ST-94821';
    runnerTotalQBadge.textContent = `${questions.length} Questions`;

    buildQuestionGrid(questions.length);
    renderQuestion(0);
    updateSummaryStats();

    const durationMins = exam.durationMinutes || exam.duration || 45;
    state.remainingSeconds = durationMins * 60;
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
    runnerQuestionPrompt.textContent = q.prompt || q.questionText || q.question_text;

    runnerOptionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    q.options.forEach((opt, optIdx) => {
      const optText = typeof opt === 'string' ? opt : (opt.text || opt.optionText || opt.option_text);
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
     8. Submission & Grade Evaluation
     -------------------------------------------------------------------------- */
  async function submitExam(isAuto = false) {
    clearInterval(state.timerInterval);

    const questions = state.activeExam.questions;
    const answeredCount = Object.keys(state.userAnswers).length;

    // Format answers keyed by question ID or index
    const formattedAnswers = {};
    questions.forEach((q, idx) => {
      if (state.userAnswers[idx] !== undefined) {
        const key = q.id || idx;
        formattedAnswers[key] = state.userAnswers[idx];
      }
    });

    let resultData = null;

    if (state.currentSubmissionId) {
      const apiRes = await apiFetch(`/submissions/${state.currentSubmissionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: formattedAnswers,
          isAutoSubmit: Boolean(isAuto),
          tabSwitchCount: state.strikeCount,
        }),
      });

      if (apiRes && apiRes.success && apiRes.data) {
        resultData = apiRes.data;
      }
    }

    // Fallback evaluation if offline
    if (!resultData) {
      let score = 0;
      let correct = 0;
      questions.forEach((q, idx) => {
        if (state.userAnswers[idx] === q.correctIndex) {
          score += 2;
          correct++;
        } else if (state.userAnswers[idx] !== undefined) {
          score = Math.max(0, score - 0.5);
        }
      });
      resultData = {
        totalScore: score,
        maxScore: questions.length * 2,
        correctAnswers: correct,
        status: isAuto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
      };
    }

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
      <strong>Calculated Score:</strong> ${resultData.totalScore.toFixed(2)} / ${resultData.maxScore.toFixed(2)} pts (${resultData.correctAnswers} correct)<br>
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
     9. Anti-Cheat & Telemetry Logging
     -------------------------------------------------------------------------- */
  const tabWarningModal = document.getElementById('tabWarningModal');
  const btnDismissWarningModal = document.getElementById('btnDismissWarningModal');
  const warningStrikeNum = document.getElementById('warningStrikeNum');

  async function triggerProctorStrike() {
    const runnerScreen = document.getElementById('screen-runner');
    if (runnerScreen.classList.contains('active')) {
      state.strikeCount++;
      warningStrikeNum.textContent = state.strikeCount;
      tabWarningModal.classList.add('active');

      if (state.currentSubmissionId) {
        apiFetch(`/submissions/${state.currentSubmissionId}/telemetry`, {
          method: 'POST',
          body: JSON.stringify({
            eventType: 'TAB_SWITCH',
            details: 'Browser window lost focus during examination.',
          }),
        });
      }

      if (state.strikeCount >= 3) {
        alert('Disqualification Notice: 3 integrity strikes exceeded. Your exam will be immediately submitted.');
        tabWarningModal.classList.remove('active');
        submitExam(true);
      }
    }
  }

  window.addEventListener('blur', triggerProctorStrike);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      triggerProctorStrike();
    }
  });

  btnDismissWarningModal.addEventListener('click', () => {
    tabWarningModal.classList.remove('active');
  });

  /* --------------------------------------------------------------------------
     10. Global Window Helpers
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
      identifier: 'ST-94821',
    };
    document.getElementById('studentDisplayName').textContent = state.currentUser.name;
    document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
    document.getElementById('inputExamCode').value = code;
    showScreen('screen-student-dash');
    findAndDisplayExam(code);
  };

});
