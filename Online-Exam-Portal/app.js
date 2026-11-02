/**
 * ExamPortal — Client Application Controller
 * Manages full multi-screen state transitions, live timer engine, and telemetry
 */

document.addEventListener('DOMContentLoaded', () => {

  /* --------------------------------------------------------------------------
     1. Mock Database & Application State
     -------------------------------------------------------------------------- */
  const state = {
    currentRole: 'TEACHER', // 'TEACHER' | 'STUDENT'
    currentUser: null,
    activeExam: null,
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
            prompt: 'What is the worst-case time complexity of searching for an element in an unaugmented Red-Black Binary Search Tree with N keys?',
            options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
            correctIndex: 1
          },
          {
            prompt: 'Which data structure is primarily utilized in Dijkstra\'s single-source shortest path algorithm to extract minimum weights efficiently?',
            options: ['LIFO Stack', 'Min-Priority Queue / Binary Heap', 'Disjoint Set Union (DSU)', 'Circular Doubly Linked List'],
            correctIndex: 1
          },
          {
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
            prompt: 'Which algorithm is typically utilized to find strongly connected components (SCC) in a directed graph in linear time O(V + E)?',
            options: ['Bellman-Ford', 'Tarjan\'s or Kosaraju\'s Algorithm', 'Kruskal\'s Algorithm', 'Floyd-Warshall'],
            correctIndex: 1
          }
        ]
      }
    ]
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

  authLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.currentRole === 'TEACHER') {
      state.currentUser = {
        role: 'TEACHER',
        name: 'Dr. Alan Vance',
        identifier: loginIdentifier.value
      };
      document.getElementById('teacherDisplayName').textContent = state.currentUser.name;
      renderCreatedExamsTable();
      showScreen('screen-teacher');
    } else {
      state.currentUser = {
        role: 'STUDENT',
        name: 'Elena Rostova',
        identifier: loginIdentifier.value || 'ST-94821'
      };
      document.getElementById('studentDisplayName').textContent = state.currentUser.name;
      document.getElementById('studentDisplayId').textContent = `Student ID: ${state.currentUser.identifier}`;
      showScreen('screen-student-dash');
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
        fileNameDisplay.textContent = e.dataTransfer.files[0].name;
        filePreview.classList.add('active');
      }
    });

    examFileInput.addEventListener('change', () => {
      if (examFileInput.files && examFileInput.files.length > 0) {
        fileNameDisplay.textContent = examFileInput.files[0].name;
        filePreview.classList.add('active');
      }
    });
  }

  function renderCreatedExamsTable() {
    createdExamsTableBody.innerHTML = '';
    createdExamsCount.textContent = `${state.exams.length} active exam blueprints`;

    state.exams.forEach(exam => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span class="exam-meta-title">${exam.title}</span>
          <span class="exam-meta-code">Target: ${exam.batch} • ${exam.questions.length} Questions</span>
        </td>
        <td>
          <span class="code-pill">${exam.code}</span>
        </td>
        <td>${exam.duration} mins</td>
        <td><strong>${exam.submissions}</strong> entries</td>
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

    // Generate unique code format: EXAM-XXXX
    const randomFour = Math.floor(1000 + Math.random() * 9000);
    const newCode = `EXAM-${randomFour}`;

    // Sample question templates for dynamic creation
    const newExam = {
      code: newCode,
      title: title,
      duration: duration,
      batch: batch,
      submissions: 0,
      questions: [
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
        },
        {
          prompt: `Assessment Question 3 for ${title}: What is the primary purpose of circuit breaker patterns in distributed network requests?`,
          options: [
            'Preventing cascading system failures by failing fast when dependent services are degraded',
            'Encrypting TLS packets at the kernel level',
            'Accelerating DNS resolution via local caches',
            'Compressing JSON request bodies into binary schemas'
          ],
          correctIndex: 0
        }
      ]
    };

    // Add to state and re-render
    state.exams.unshift(newExam);
    renderCreatedExamsTable();

    // Reveal Highlight Banner
    displayGeneratedCode.textContent = newCode;
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

  function findAndDisplayExam(codeQuery) {
    const cleanCode = codeQuery.trim().toUpperCase();
    const found = state.exams.find(e => e.code.toUpperCase() === cleanCode);

    if (found) {
      state.activeExam = found;
      preExamTitle.textContent = found.title;
      preExamBatch.textContent = `Target: ${found.batch} • Access Code: ${found.code}`;
      preExamDuration.textContent = `${found.duration} Mins`;
      preExamQuestions.textContent = `${found.questions.length} MCQs`;
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

  function triggerProctorStrike() {
    const runnerScreen = document.getElementById('screen-runner');
    // Only track if currently in active exam runner
    if (runnerScreen.classList.contains('active')) {
      state.strikeCount++;
      warningStrikeNum.textContent = state.strikeCount;
      tabWarningModal.classList.add('active');

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
