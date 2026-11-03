/**
 * ExamPortal Enterprise Client Controller
 * Decoupled JavaScript for Teacher Portal and Student Runner
 */

document.addEventListener('DOMContentLoaded', () => {

  /* --------------------------------------------------------------------------
     1. Digital Countdown Timer (Student Runner)
     -------------------------------------------------------------------------- */
  const clockEl = document.getElementById('countdownClock');
  if (clockEl) {
    let remainingSeconds = 44 * 60 + 58; // 00:44:58 initial state

    const timerInterval = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        const hours = String(Math.floor(remainingSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(remainingSeconds % 60).padStart(2, '0');
        clockEl.textContent = `${hours}:${minutes}:${seconds}`;
      } else {
        clearInterval(timerInterval);
        alert('Examination duration elapsed. Submitting responses automatically.');
      }
    }, 1000);
  }

  /* --------------------------------------------------------------------------
     2. Anti-Cheat Tab-Switch Detection & Warning Modal
     -------------------------------------------------------------------------- */
  const warningModal = document.getElementById('tabWarningModal');
  const btnTestModal = document.getElementById('btnTestWarningModal');

  if (btnTestModal && warningModal) {
    btnTestModal.addEventListener('click', () => {
      warningModal.classList.add('active');
    });
  }

  // Detect when candidate leaves tab or blurs viewport
  if (warningModal) {
    window.addEventListener('blur', () => {
      warningModal.classList.add('active');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        warningModal.classList.add('active');
      }
    });
  }

  /* --------------------------------------------------------------------------
     3. Dropzone & File Ingestion (Teacher Portal)
     -------------------------------------------------------------------------- */
  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('examFileInput');
  const filePreview = document.getElementById('filePreview');
  const fileNameDisplay = document.getElementById('fileNameDisplay');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileNameDisplay.textContent = e.dataTransfer.files[0].name;
        filePreview.classList.add('active');
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
        filePreview.classList.add('active');
      }
    });
  }

});

/* --------------------------------------------------------------------------
   4. Global Helper Functions
   -------------------------------------------------------------------------- */

// Modal Dismiss
function closeWarningModal() {
  const modal = document.getElementById('tabWarningModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Option Block Selection
function handleOptionSelect(labelEl) {
  const allOptionBlocks = document.querySelectorAll('.option-block');
  allOptionBlocks.forEach(opt => opt.classList.remove('selected'));
  labelEl.classList.add('selected');

  const radio = labelEl.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  // Mark question 4 as answered
  const q4Btn = document.getElementById('gridBtn4');
  if (q4Btn) {
    q4Btn.classList.remove('unanswered');
    q4Btn.classList.add('answered');
  }

  const answeredCount = document.getElementById('answeredCount');
  const unansweredCount = document.getElementById('unansweredCount');
  if (answeredCount && unansweredCount) {
    answeredCount.textContent = '4';
    unansweredCount.textContent = '16';
  }
}

// Clear Option Selection
function clearOptionSelection() {
  const allOptionBlocks = document.querySelectorAll('.option-block');
  allOptionBlocks.forEach(opt => {
    opt.classList.remove('selected');
    const radio = opt.querySelector('input[type="radio"]');
    if (radio) radio.checked = false;
  });

  const q4Btn = document.getElementById('gridBtn4');
  if (q4Btn) {
    q4Btn.classList.remove('answered');
    q4Btn.classList.add('current');
  }

  const answeredCount = document.getElementById('answeredCount');
  const unansweredCount = document.getElementById('unansweredCount');
  if (answeredCount && unansweredCount) {
    answeredCount.textContent = '3';
    unansweredCount.textContent = '17';
  }
}

// Question Grid Navigation Mock
function goToQuestion(num) {
  const allQBtns = document.querySelectorAll('.q-btn');
  allQBtns.forEach(btn => btn.classList.remove('current'));

  const targetBtn = allQBtns[num - 1];
  if (targetBtn) {
    targetBtn.classList.add('current');
  }

  const heading = document.getElementById('currentQuestionHeading');
  if (heading) {
    heading.textContent = `Question ${String(num).padStart(2, '0')} of 20`;
  }
}

// Copy Exam Link
function copyLink(button) {
  const original = button.textContent;
  button.textContent = 'Copied!';
  button.style.backgroundColor = 'var(--primary-subtle)';
  button.style.borderColor = 'var(--primary-border)';
  button.style.color = 'var(--primary)';
  setTimeout(() => {
    button.textContent = original;
    button.style.backgroundColor = '';
    button.style.borderColor = '';
    button.style.color = '';
  }, 1500);
}

// Submit Confirm Dialog
function openSubmitConfirm() {
  if (confirm('Are you sure you want to finalize and submit your assessment? This action cannot be undone.')) {
    alert('Examination submitted successfully! Redirecting to results summary...');
  }
}
