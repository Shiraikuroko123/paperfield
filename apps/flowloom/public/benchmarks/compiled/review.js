(() => {
  'use strict';

  const caseDataElement = document.querySelector('#review-case-data');
  const caseData = JSON.parse(caseDataElement?.textContent || '{}');
  const caseId = String(caseData.caseId || 'unknown-case');
  const rubricVersion = String(caseData.rubricVersion || 'top-conference-figure-v1');
  const artifactContentSha256 = String(caseData.artifact?.contentSha256 || 'unversioned');
  const storageKey = `flowloom:figure-review:${caseId}:${rubricVersion}:${artifactContentSha256.slice(0, 16)}`;
  const acceptanceThreshold = 4.2;
  const dimensions = Array.from(document.querySelectorAll('[data-dimension]')).map((row) => ({
    id: row.dataset.dimension,
    weight: Number(row.dataset.weight),
  }));
  const gateInputs = Array.from(document.querySelectorAll('[data-review-gate]'));
  const decisionInputs = Array.from(document.querySelectorAll('input[name="review-decision"]'));
  const acceptInput = decisionInputs.find((input) => input.value === 'accepted');
  const notesInput = document.querySelector('#reviewNotes');
  const weightedScoreOutput = document.querySelector('#weightedScore');
  const dimensionProgress = document.querySelector('#dimensionProgress');
  const gateProgress = document.querySelector('#gateProgress');
  const decisionReason = document.querySelector('#decisionReason');
  const reviewStatus = document.querySelector('#reviewStatus');
  const importedReview = caseData.humanReview && typeof caseData.humanReview === 'object'
    ? caseData.humanReview
    : null;
  const historicalReview = caseData.historicalHumanReview && typeof caseData.historicalHumanReview === 'object'
    ? caseData.historicalHumanReview
    : null;
  const initialDecision = ['needs-revision', 'accepted'].includes(caseData.reviewStatus)
    ? caseData.reviewStatus
    : 'pending';

  const defaultState = () => ({
    scores: Object.fromEntries(Object.entries(importedReview?.scores ?? {}).filter(([key, value]) => (
      dimensions.some((dimension) => dimension.id === key) && Number.isInteger(value) && value >= 1 && value <= 5
    ))),
    gates: Object.fromEntries(Object.entries(importedReview?.gates ?? {}).filter(([key, value]) => (
      gateInputs.some((input) => input.dataset.reviewGate === key) && typeof value === 'boolean'
    ))),
    notes: Array.isArray(importedReview?.findings)
      ? importedReview.findings.filter((value) => typeof value === 'string').join('\n')
      : '',
    decision: ['needs-revision', 'accepted'].includes(importedReview?.status) ? importedReview.status : initialDecision,
    updatedAt: typeof importedReview?.reviewedAt === 'string' ? importedReview.reviewedAt : null,
  });

  let state = defaultState();

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (!stored || typeof stored !== 'object') return;
      state.scores = Object.fromEntries(Object.entries(stored.scores ?? {}).flatMap(([key, value]) => (
        dimensions.some((dimension) => dimension.id === key) && Number.isInteger(value) && value >= 1 && value <= 5
          ? [[key, value]]
          : []
      )));
      state.gates = Object.fromEntries(Object.entries(stored.gates ?? {}).flatMap(([key, value]) => (
        gateInputs.some((input) => input.dataset.reviewGate === key) && typeof value === 'boolean'
          ? [[key, value]]
          : []
      )));
      state.notes = typeof stored.notes === 'string' ? stored.notes.slice(0, 8000) : '';
      state.decision = ['pending', 'needs-revision', 'accepted'].includes(stored.decision) ? stored.decision : 'pending';
      state.updatedAt = typeof stored.updatedAt === 'string' ? stored.updatedAt : null;
    } catch {
      state = defaultState();
    }
  }

  function persistState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // The workbench remains usable when storage is unavailable.
    }
  }

  function weightedScore() {
    if (dimensions.some((dimension) => !Number.isInteger(state.scores[dimension.id]))) return null;
    return dimensions.reduce((total, dimension) => (
      total + state.scores[dimension.id] * dimension.weight
    ), 0) / 100;
  }

  function completedGateCount() {
    return gateInputs.filter((input) => state.gates[input.dataset.reviewGate] === true).length;
  }

  function candidateEligibility() {
    const score = weightedScore();
    return score !== null && score >= acceptanceThreshold && completedGateCount() === gateInputs.length;
  }

  function renderReviewState({ persist = false } = {}) {
    const answered = dimensions.filter((dimension) => Number.isInteger(state.scores[dimension.id])).length;
    const passedGates = completedGateCount();
    const score = weightedScore();
    const eligible = candidateEligibility();

    if (state.decision === 'accepted' && !eligible) state.decision = 'pending';
    if (acceptInput) acceptInput.disabled = !eligible;

    weightedScoreOutput.textContent = score === null ? '--' : score.toFixed(2);
    dimensionProgress.textContent = `${answered} / ${dimensions.length}`;
    gateProgress.textContent = `${passedGates} / ${gateInputs.length}`;

    if (answered < dimensions.length) {
      decisionReason.textContent = `还需评分 ${dimensions.length - answered} 个维度。`;
    } else if (passedGates < gateInputs.length) {
      decisionReason.textContent = `还需确认 ${gateInputs.length - passedGates} 个硬门槛。`;
    } else if (score < acceptanceThreshold) {
      decisionReason.textContent = `加权分 ${score.toFixed(2)}，尚未达到 4.20 候选线。`;
    } else {
      decisionReason.textContent = '已达到候选线；仍需人工主动选择“接受本图”。';
    }

    decisionInputs.forEach((input) => {
      input.checked = input.value === state.decision;
    });
    reviewStatus.classList.remove('is-pending', 'is-revision', 'is-accepted');
    if (state.decision === 'accepted') {
      reviewStatus.textContent = '人工已接受';
      reviewStatus.classList.add('is-accepted');
    } else if (state.decision === 'needs-revision') {
      reviewStatus.textContent = '需要修改';
      reviewStatus.classList.add('is-revision');
    } else {
      reviewStatus.textContent = historicalReview && answered === 0 ? '待复评' : '待人工验收';
      reviewStatus.classList.add('is-pending');
    }

    if (persist) persistState();
  }

  function hydrateReviewForm() {
    dimensions.forEach((dimension) => {
      const value = state.scores[dimension.id];
      const input = document.querySelector(`input[name="score-${dimension.id}"][value="${value}"]`);
      if (input) input.checked = true;
    });
    gateInputs.forEach((input) => {
      input.checked = state.gates[input.dataset.reviewGate] === true;
    });
    notesInput.value = state.notes;
    renderReviewState();
  }

  dimensions.forEach((dimension) => {
    document.querySelectorAll(`input[name="score-${dimension.id}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        state.scores[dimension.id] = Number(input.value);
        renderReviewState({ persist: true });
      });
    });
  });

  gateInputs.forEach((input) => {
    input.addEventListener('change', () => {
      state.gates[input.dataset.reviewGate] = input.checked;
      renderReviewState({ persist: true });
    });
  });

  notesInput.addEventListener('input', () => {
    state.notes = notesInput.value;
    persistState();
  });

  decisionInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.value === 'accepted' && !candidateEligibility()) return;
      state.decision = input.value;
      renderReviewState({ persist: true });
    });
  });

  document.querySelector('#resetReview').addEventListener('click', () => {
    const message = importedReview
      ? '清除这张图保存在本机的修改，并恢复项目归档的评分？'
      : '清空这张图保存在本机的评分与评审意见？';
    if (!window.confirm(message)) return;
    state = defaultState();
    document.querySelector('#reviewForm').reset();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // No action is required when storage is unavailable.
    }
    hydrateReviewForm();
  });

  document.querySelector('#exportReview').addEventListener('click', () => {
    const score = weightedScore();
    const payload = {
      format: 'flowloom-human-figure-review',
      version: 1,
      caseId,
      rubricVersion,
      reviewedAt: new Date().toISOString(),
      status: state.decision,
      scores: state.scores,
      weightedScore: score === null ? null : Number(score.toFixed(3)),
      gates: state.gates,
      findings: state.notes ? [state.notes] : [],
      reference: caseData.reference || {},
      artifact: caseData.artifact || {},
      compilerAudit: {
        purpose: 'structural-only',
        excludedFromHumanScore: true,
      },
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${caseId}-human-review.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  const comparisonGrid = document.querySelector('#comparisonGrid');
  document.querySelectorAll('[data-compare-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.compareMode;
      comparisonGrid.dataset.mode = mode;
      document.querySelectorAll('[data-compare-mode]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
    });
  });

  const zoomRange = document.querySelector('#zoomRange');
  const zoomValue = document.querySelector('#zoomValue');
  const mediaCanvases = Array.from(document.querySelectorAll('.media-canvas'));

  function setZoom(value) {
    const zoom = Math.max(Number(zoomRange.min), Math.min(Number(zoomRange.max), Number(value)));
    zoomRange.value = String(zoom);
    zoomValue.textContent = `${zoom}%`;
    mediaCanvases.forEach((canvas) => {
      canvas.style.width = `${zoom}%`;
    });
  }

  zoomRange.addEventListener('input', () => setZoom(zoomRange.value));
  document.querySelectorAll('[data-zoom-step]').forEach((button) => {
    button.addEventListener('click', () => setZoom(Number(zoomRange.value) + Number(button.dataset.zoomStep)));
  });
  document.querySelector('[data-zoom-reset]').addEventListener('click', () => setZoom(100));

  const viewports = Array.from(document.querySelectorAll('.media-viewport'));
  let syncingScroll = false;
  viewports.forEach((viewport) => {
    viewport.addEventListener('scroll', () => {
      if (syncingScroll) return;
      const other = viewports.find((candidate) => candidate !== viewport);
      if (!other) return;
      syncingScroll = true;
      const horizontalRange = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const verticalRange = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const otherHorizontalRange = Math.max(0, other.scrollWidth - other.clientWidth);
      const otherVerticalRange = Math.max(0, other.scrollHeight - other.clientHeight);
      other.scrollLeft = horizontalRange ? (viewport.scrollLeft / horizontalRange) * otherHorizontalRange : 0;
      other.scrollTop = verticalRange ? (viewport.scrollTop / verticalRange) * otherVerticalRange : 0;
      window.requestAnimationFrame(() => { syncingScroll = false; });
    }, { passive: true });
  });

  document.querySelectorAll('[data-media-image]').forEach((image) => {
    image.addEventListener('error', () => {
      image.hidden = true;
      const error = image.parentElement.querySelector('.media-error');
      if (error) error.hidden = false;
    });
  });

  weightedScoreOutput.setAttribute('aria-live', 'polite');
  reviewStatus.setAttribute('aria-live', 'polite');
  loadState();
  hydrateReviewForm();
  setZoom(100);
})();
