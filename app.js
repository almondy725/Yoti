(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const body = document.body;
  const views = $$('.view');
  const sidebar = $('.sidebar');
  const mobileMenuButton = $('.mobile-menu');
  const toast = $('.toast');
  let toastTimer;
  let activeModal = null;
  let modalOpener = null;
  let importedHtmlSource = '';
  let importedHtmlFile = null;
  let activeHtmlProject = null;

  const DB_NAME = 'yoti-local-ut';
  const DB_VERSION = 1;
  const PROJECT_STORE = 'projects';
  const SESSION_STORE = 'sessions';

  const openDatabase = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 로컬 프로젝트 저장을 지원하지 않습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        const sessionStore = database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessionStore.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('로컬 저장소를 열 수 없습니다.'));
  });

  const runStoreRequest = async (storeName, mode, action) => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('로컬 저장에 실패했습니다.'));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error || new Error('로컬 저장에 실패했습니다.'));
    });
  };

  const localDb = {
    put: (storeName, value) => runStoreRequest(storeName, 'readwrite', (store) => store.put(value)),
    get: (storeName, key) => runStoreRequest(storeName, 'readonly', (store) => store.get(key)),
    all: (storeName) => runStoreRequest(storeName, 'readonly', (store) => store.getAll())
  };

  const makeId = (prefix) => {
    const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  };

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const prepareImportedHtml = (source, task = null) => {
    const inlineSuccessCheck = JSON.stringify({
      mode: task?.successMode || 'none',
      pageTarget: String(task?.pageTarget || ''),
      elementTarget: String(task?.elementTarget || ''),
      expectedAnswer: task?.successMode === 'text-match' ? String(task.expectedAnswer || '') : ''
    }).replaceAll('<', '\\u003c');
    const tracker = `
<script>
(() => {
  const successCheck = ${inlineSuccessCheck};
  let successSent = false;
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase();
  const send = (kind, detail = {}) => {
    window.parent.postMessage({ source: 'yoti-html-runtime', kind, detail, at: Date.now() }, '*');
  };
  const pageInfo = () => ({
    pageTitle: document.title || 'HTML prototype',
    pagePath: window.location.hash || '/',
    pageUrl: window.location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY)
  });
  const markSuccess = (mode, detail = {}) => {
    if (successSent) return;
    successSent = true;
    send('condition-met', { ...detail, mode });
  };
  const includesTarget = (candidate, target) => {
    const normalizedCandidate = normalize(candidate);
    const normalizedTarget = normalize(target);
    return Boolean(normalizedCandidate && normalizedTarget && (normalizedCandidate === normalizedTarget || normalizedCandidate.includes(normalizedTarget)));
  };
  const checkPage = () => {
    if (successSent || successCheck.mode !== 'page-reach' || !successCheck.pageTarget) return;
    const info = pageInfo();
    const candidates = [info.pageTitle, info.pagePath, info.pageUrl, window.location.pathname, window.location.hash];
    if (candidates.some((candidate) => includesTarget(candidate, successCheck.pageTarget))) {
      markSuccess('page-reach', { ...info, matchedTarget: successCheck.pageTarget });
    }
  };
  document.addEventListener('click', (event) => {
    const target = event.target.closest('a, button, input, select, textarea, label, [role="button"]') || event.target;
    const rect = target.getBoundingClientRect();
    const link = target.closest('a');
    const fieldLabel = target.labels?.[0]?.innerText || '';
    const readableText = target.innerText
      || target.getAttribute('aria-label')
      || fieldLabel
      || target.getAttribute('placeholder')
      || target.getAttribute('name')
      || target.tagName;
    const clickDetail = {
      ...pageInfo(),
      tag: target.tagName.toLowerCase(),
      text: readableText.trim().slice(0, 120),
      id: target.id || '',
      name: target.getAttribute('name') || '',
      ariaLabel: target.getAttribute('aria-label') || '',
      href: link?.getAttribute('href') || '',
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      pageX: Math.round(event.pageX),
      pageY: Math.round(event.pageY),
      targetX: Math.round(rect.x),
      targetY: Math.round(rect.y)
    };
    send('click', clickDetail);
    if (!successSent && successCheck.mode === 'element-click' && successCheck.elementTarget) {
      let selectorMatched = false;
      try {
        selectorMatched = Boolean(target.matches(successCheck.elementTarget) || target.closest(successCheck.elementTarget));
      } catch (error) {
        selectorMatched = false;
      }
      const candidates = [clickDetail.text, clickDetail.id, clickDetail.name, clickDetail.ariaLabel, clickDetail.href];
      if (selectorMatched || candidates.some((candidate) => includesTarget(candidate, successCheck.elementTarget))) {
        markSuccess('element-click', { ...clickDetail, matchedTarget: successCheck.elementTarget });
      }
    }
  }, true);
  const checkAnswer = (event) => {
    if (successSent || successCheck.mode !== 'text-match' || !successCheck.expectedAnswer) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('textarea, input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="tel"], input[type="url"], input[type="email"]')) return;
    if (String(target.value || '').trim() !== String(successCheck.expectedAnswer).trim()) return;
    successSent = true;
    const fieldLabel = target.labels?.[0]?.innerText || target.getAttribute('aria-label') || target.getAttribute('placeholder') || target.getAttribute('name') || target.tagName;
    send('success-match', {
      ...pageInfo(),
      tag: target.tagName.toLowerCase(),
      inputType: target.getAttribute('type') || 'text',
      fieldLabel: String(fieldLabel).trim().slice(0, 120)
    });
  };
  document.addEventListener('input', checkAnswer, true);
  document.addEventListener('change', checkAnswer, true);
  document.addEventListener('submit', (event) => {
    send('submit', { ...pageInfo(), id: event.target.id || '', action: event.target.action || '' });
  }, true);
  const reportPageView = () => {
    send('page-view', pageInfo());
    checkPage();
  };
  window.addEventListener('hashchange', reportPageView);
  window.addEventListener('popstate', reportPageView);
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.setTimeout(reportPageView, 0);
      return result;
    };
  });
  window.addEventListener('error', (event) => {
    send('runtime-error', { ...pageInfo(), message: event.message || 'HTML 실행 오류' });
  });
  send('ready', pageInfo());
  window.setTimeout(checkPage, 0);
})();
<\/script>`;
    let prepared = source;
    if (!/<meta[^>]+name=["']viewport["']/i.test(prepared)) {
      const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      prepared = /<head[^>]*>/i.test(prepared)
        ? prepared.replace(/<head([^>]*)>/i, `<head$1>${viewport}`)
        : viewport + prepared;
    }
    return /<\/body>/i.test(prepared)
      ? prepared.replace(/<\/body>/i, `${tracker}</body>`)
      : prepared + tracker;
  };

  const showToast = (message) => {
    clearTimeout(toastTimer);
    $('span', toast).textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  };

  const showView = (name) => {
    const target = $(`[data-view="${name}"]`);
    if (!target) return;
    views.forEach((view) => view.classList.toggle('is-visible', view === target));
    target.setAttribute('tabindex', '-1');
    body.classList.toggle('editor-active', name === 'editor');
    $$('.nav-item[data-view-target]').forEach((item) => {
      const projectDetail = name === 'editor' || name === 'html-preview';
      const active = item.dataset.viewTarget === name || (projectDetail && item.dataset.viewTarget === 'projects');
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    sidebar.classList.remove('is-open');
    mobileMenuButton?.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    target.focus({ preventScroll: true });
  };

  $$('[data-view-target]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.viewTarget));
  });

  mobileMenuButton?.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    mobileMenuButton.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 900 || !sidebar.classList.contains('is-open')) return;
    if (!sidebar.contains(event.target) && !mobileMenuButton.contains(event.target)) {
      sidebar.classList.remove('is-open');
      mobileMenuButton.setAttribute('aria-expanded', 'false');
    }
  });

  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe:not([hidden]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

  const openModal = (name, opener = document.activeElement) => {
    const backdrop = $(`[data-modal="${name}"]`);
    if (!backdrop) return;
    modalOpener = opener;
    activeModal = backdrop;
    backdrop.hidden = false;
    body.classList.add('is-locked');
    window.requestAnimationFrame(() => {
      const focusable = $(focusableSelector, backdrop);
      focusable?.focus();
    });
  };

  const closeModal = (backdrop = activeModal, restoreFocus = true) => {
    if (!backdrop) return;
    backdrop.hidden = true;
    if (activeModal === backdrop) activeModal = null;
    if (!$('.modal-backdrop:not([hidden])') && $('.test-runner').hidden && $('.recording-player').hidden) {
      body.classList.remove('is-locked');
    }
    if (restoreFocus) modalOpener?.focus?.();
  };

  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop && backdrop.dataset.modal !== 'generating') closeModal(backdrop);
    });
    $$('.modal-close', backdrop).forEach((button) => button.addEventListener('click', () => closeModal(backdrop)));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('.recording-player').hidden) closePlayer();
      else if (!$('.test-runner').hidden) closeRunner();
      else if (activeModal?.dataset.modal !== 'generating') closeModal();
    }
    const focusScope = activeModal
      || (!$('.test-runner').hidden ? $('.test-runner') : null)
      || (!$('.recording-player').hidden ? $('.recording-player') : null);
    if (event.key !== 'Tab' || !focusScope) return;
    const items = $$(focusableSelector, focusScope).filter((item) => item.offsetParent !== null && !item.closest('[inert]'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const createBackdrop = $('[data-modal="create"]');
  const createForm = $('#create-form');
  const formSteps = $$('.form-step', createForm);
  const formBack = $('.form-back', createForm);
  const formNext = $('.form-next', createForm);
  const taskInput = $('#test-task');
  const successModeLabels = {
    'page-reach': '특정 페이지 도달',
    quiz: '퀴즈',
    none: '조건 없음',
    'element-click': '특정 버튼이나 요소 클릭'
  };
  const successDetailInputs = {
    'page-reach': [$('#success-page-target')],
    quiz: [$('#success-quiz-question'), $('#success-expected-answer')],
    none: [],
    'element-click': [$('#success-element-target')]
  };
  let formStep = 1;

  const selectedMethod = () => $('input[name="method"]:checked', createForm)?.value || 'ai';
  const selectedSuccessMode = () => $('input[name="success-mode"]:checked', createForm)?.value || '';

  const syncSuccessCondition = () => {
    const mode = selectedSuccessMode();
    $$('.success-condition-option', createForm).forEach((option) => {
      option.classList.toggle('is-selected', Boolean($('input', option)?.checked));
    });
    $$('.success-condition-detail', createForm).forEach((detail) => {
      detail.hidden = detail.dataset.successDetail !== mode;
    });
    Object.entries(successDetailInputs).forEach(([detailMode, inputs]) => {
      inputs.forEach((input) => {
        input.required = detailMode === mode;
        if (detailMode !== mode) {
          input.classList.remove('is-error');
          input.removeAttribute('aria-invalid');
        }
      });
    });
    if (mode) $('#success-condition-error').classList.remove('is-visible');
  };

  const syncMethod = (method) => {
    const radio = $(`input[name="method"][value="${method}"]`, createForm);
    if (radio) radio.checked = true;
    $$('.method-option', createForm).forEach((option) => {
      option.classList.toggle('is-selected', $('input', option).checked);
    });
    $$('.method-content', createForm).forEach((panel) => {
      panel.classList.toggle('is-visible', panel.dataset.methodPanel === method);
    });
  };

  const updateFormStep = () => {
    formSteps.forEach((step) => step.classList.toggle('is-visible', Number(step.dataset.formStep) === formStep));
    formBack.disabled = formStep === 1;
    const finishLabels = { ai: '요령이에게 만들기', figma: '테스트 만들기', html: 'HTML 테스트 만들기' };
    formNext.textContent = formStep === 2 ? finishLabels[selectedMethod()] : '다음';
    const taskSummary = $('.create-task-summary strong');
    if (taskSummary) taskSummary.textContent = taskInput.value.trim();
    const successSummary = $('.create-success-summary');
    if (successSummary) successSummary.textContent = `성공 조건 · ${successModeLabels[selectedSuccessMode()] || '미선택'}`;
    const firstField = $(focusableSelector, formSteps[formStep - 1]);
    firstField?.focus({ preventScroll: true });
  };

  const resetErrors = () => {
    [taskInput, $('#figma-url'), ...Object.values(successDetailInputs).flat()].forEach((input) => {
      input?.classList.remove('is-error');
      input?.removeAttribute('aria-invalid');
    });
    $$('.field-error', createForm).forEach((error) => error.classList.remove('is-visible'));
  };

  const validateStep = () => {
    resetErrors();
    if (formStep === 1) {
      const taskValid = Boolean(taskInput.value.trim());
      const mode = selectedSuccessMode();
      const modeValid = Boolean(mode);
      const requiredInputs = successDetailInputs[mode] || [];
      const emptyInputs = requiredInputs.filter((input) => !input.value.trim());
      taskInput.classList.toggle('is-error', !taskValid);
      $('#task-error').classList.toggle('is-visible', !taskValid);
      $('#success-condition-error').textContent = modeValid
        ? '선택한 성공 조건에 필요한 값을 모두 입력해주세요.'
        : '성공 조건을 선택해주세요.';
      $('#success-condition-error').classList.toggle('is-visible', !modeValid || Boolean(emptyInputs.length));
      emptyInputs.forEach((input) => {
        input.classList.add('is-error');
        input.setAttribute('aria-invalid', 'true');
      });
      if (!taskValid) taskInput.focus();
      else if (!modeValid) $('input[name="success-mode"]', createForm)?.focus();
      else if (emptyInputs.length) emptyInputs[0].focus();
      return taskValid && modeValid && !emptyInputs.length;
    }
    if (formStep === 2 && selectedMethod() === 'figma') {
      const figmaUrl = $('#figma-url');
      if (!figmaUrl.value.trim() || !figmaUrl.value.includes('figma.com')) {
        figmaUrl.classList.add('is-error');
        showToast('올바른 Figma 프로토타입 링크를 입력해주세요.');
        figmaUrl.focus();
        return false;
      }
    }
    if (formStep === 2 && selectedMethod() === 'html' && !importedHtmlSource) {
      const uploadError = $('.html-upload-error');
      uploadError.textContent = '실행 가능한 HTML 파일을 선택해주세요.';
      uploadError.hidden = false;
      showToast('실행할 HTML 파일을 선택해주세요.');
      fileInput.focus();
      return false;
    }
    return true;
  };

  const openCreate = (method = 'ai', opener) => {
    createForm.reset();
    importedHtmlSource = '';
    importedHtmlFile = null;
    $('#html-file').value = '';
    $('.uploaded-file').hidden = true;
    $('.html-upload-error').hidden = true;
    formStep = 1;
    syncMethod(method);
    syncSuccessCondition();
    updateFormStep();
    openModal('create', opener);
    window.setTimeout(() => taskInput.focus(), 50);
  };

  $$('.create-test-button').forEach((button) => button.addEventListener('click', () => openCreate('ai', button)));
  $$('[data-create-method]').forEach((button) => button.addEventListener('click', () => openCreate(button.dataset.createMethod, button)));

  $$('input[name="method"]', createForm).forEach((radio) => {
    radio.addEventListener('change', () => {
      syncMethod(radio.value);
      if (formStep === 2) updateFormStep();
    });
  });
  $$('input[name="success-mode"]', createForm).forEach((radio) => {
    radio.addEventListener('change', syncSuccessCondition);
  });

  taskInput.addEventListener('blur', () => {
    if (taskInput.value.trim()) {
      taskInput.classList.remove('is-error');
      $('#task-error').classList.remove('is-visible');
    }
  });
  Object.values(successDetailInputs).flat().forEach((input) => {
    input.addEventListener('blur', () => {
      if (!input.value.trim()) return;
      input.classList.remove('is-error');
      input.removeAttribute('aria-invalid');
      const mode = selectedSuccessMode();
      if ((successDetailInputs[mode] || []).every((field) => field.value.trim())) {
        $('#success-condition-error').classList.remove('is-visible');
      }
    });
  });

  formBack.addEventListener('click', () => {
    if (formStep > 1) {
      formStep -= 1;
      updateFormStep();
    }
  });

  const startGeneration = () => {
    const method = selectedMethod();
    const generationText = {
      ai: {
        title: '프로토타입을 만들고 있어요',
        steps: ['UT 과업 이해', '디자인 시스템 컴포넌트 조합', '화면 간 인터랙션 연결'],
        messages: ['과업에 맞는 화면 흐름을 구성하는 중...', 'EZIT 컴포넌트로 화면을 조립하는 중...', '과업과 화면의 주요 행동을 연결하는 중...'],
        done: '요령이가 편집 가능한 프로토타입을 만들었어요.'
      },
      figma: {
        title: 'Figma 프로토타입을 연결하고 있어요',
        steps: ['공유 권한과 시작 화면 확인', '프로토타입 화면 불러오기', 'UT 기록 레이어 연결'],
        messages: ['Figma 링크와 접근 권한을 확인하는 중...', '프로토타입 화면을 안전하게 불러오는 중...', '과업과 기록 플러그인을 연결하는 중...'],
        done: 'Figma 프로토타입에 UT 기록 레이어를 연결했어요.'
      },
      html: {
        title: 'HTML 화면을 가져오고 있어요',
        steps: ['파일 구조와 시작 화면 확인', '실행 가능한 미리보기 준비', 'UT 기록 레이어 연결'],
        messages: ['업로드한 파일 구조를 확인하는 중...', '브라우저에서 실행할 화면을 준비하는 중...', '과업과 기록 플러그인을 연결하는 중...'],
        done: 'HTML 화면을 테스트 가능한 프로토타입으로 가져왔어요.'
      }
    }[method];
    closeModal(createBackdrop, false);
    openModal('generating', formNext);
    const generating = $('[data-modal="generating"]');
    $('#generating-title').textContent = generationText.title;
    const copy = $('.generation-copy', generating);
    const items = $$('li', generating);
    copy.textContent = generationText.messages[0];
    items.forEach((item, index) => {
      item.classList.toggle('is-done', index === 0);
      item.innerHTML = index === 0
        ? `<svg><use href="#i-check"></use></svg>${generationText.steps[index]}`
        : `<span${index === 1 ? ' class="mini-spinner"' : ''}></span>${generationText.steps[index]}`;
    });
    window.setTimeout(() => {
      copy.textContent = generationText.messages[1];
      items[1].classList.add('is-done');
      items[1].innerHTML = `<svg><use href="#i-check"></use></svg>${generationText.steps[1]}`;
    }, 1100);
    window.setTimeout(() => {
      copy.textContent = generationText.messages[2];
      items[2].classList.add('is-done');
      items[2].innerHTML = `<svg><use href="#i-check"></use></svg>${generationText.steps[2]}`;
    }, 2200);
    window.setTimeout(() => {
      closeModal(generating, false);
      showView('editor');
      showToast(generationText.done);
    }, 3400);
  };

  formNext.addEventListener('click', async () => {
    if (!validateStep()) return;
    if (formStep < 2) {
      formStep += 1;
      updateFormStep();
      return;
    }
    if (selectedMethod() === 'html') {
      await createHtmlProject();
    } else {
      startGeneration();
    }
  });

  const fileInput = $('#html-file');
  const uploadedFile = $('.uploaded-file');
  const uploadError = $('.html-upload-error');
  const uploadNote = $('.html-upload-note');
  const clearImportedFile = () => {
    fileInput.value = '';
    importedHtmlSource = '';
    importedHtmlFile = null;
    uploadedFile.hidden = true;
    uploadError.hidden = true;
  };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadError.hidden = true;
    const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
    if (!isHtml) {
      clearImportedFile();
      uploadError.textContent = 'HTML 또는 HTM 파일만 실행할 수 있어요.';
      uploadError.hidden = false;
      showToast('HTML 파일 형식을 확인해주세요.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      clearImportedFile();
      uploadError.textContent = '파일이 10MB를 넘어요. 이미지나 라이브러리 용량을 줄인 뒤 다시 시도해주세요.';
      uploadError.hidden = false;
      showToast('HTML 파일은 최대 10MB까지 가능해요.');
      return;
    }
    try {
      const source = await file.text();
      if (!/<(?:!doctype|html|head|body|main|section|div|form|button)\b/i.test(source)) {
        throw new Error('HTML 문서 구조를 찾을 수 없습니다.');
      }
      importedHtmlSource = source;
      importedHtmlFile = { name: file.name, size: file.size, type: file.type || 'text/html' };
      uploadedFile.hidden = false;
      $('strong', uploadedFile).textContent = file.name;
      $('small', uploadedFile).textContent = `${Math.max(1, Math.round(file.size / 1024))}KB · 실행 확인됨`;
      const relativeAssets = [...source.matchAll(/(?:src|href)=["'](?!https?:|data:|blob:|#|mailto:|tel:|javascript:|\/\/|\/)([^"']+)/gi)];
      uploadNote.innerHTML = relativeAssets.length
        ? '<svg><use href="#i-settings"></use></svg>상대 경로 자산 ' + relativeAssets.length + '개는 표시되지 않을 수 있어요. HTML 안에 포함하거나 절대 URL을 사용해주세요.'
        : '<svg><use href="#i-check"></use></svg>브라우저에서 바로 실행할 수 있는 HTML 파일이에요.';
      showToast('HTML을 읽었어요. 이제 UT를 만들 수 있어요.');
    } catch (error) {
      clearImportedFile();
      uploadError.textContent = error.message || 'HTML 파일을 읽지 못했어요. 파일을 확인한 뒤 다시 시도해주세요.';
      uploadError.hidden = false;
      showToast('HTML 파일을 읽지 못했어요.');
    }
  });
  $('.uploaded-file .icon-button').addEventListener('click', clearImportedFile);

  const collectTasks = () => {
    const successMode = selectedSuccessMode();
    const pageTarget = $('#success-page-target').value.trim();
    const quizQuestion = $('#success-quiz-question').value.trim();
    const expectedAnswer = $('#success-expected-answer').value.trim();
    const elementTarget = $('#success-element-target').value.trim();
    const successDescriptions = {
      'page-reach': `“${pageTarget}” 페이지 도달`,
      quiz: `퀴즈 “${quizQuestion}” 정답 일치`,
      none: '성공 조건 없음 · 완료 기록만 수집',
      'element-click': `“${elementTarget}” 버튼 또는 요소 클릭`
    };
    return [{
      instruction: taskInput.value.trim() || '페이지에서 핵심 작업을 완료해보세요.',
      successMode,
      pageTarget: successMode === 'page-reach' ? pageTarget : '',
      quizQuestion: successMode === 'quiz' ? quizQuestion : '',
      expectedAnswer: successMode === 'quiz' ? expectedAnswer : '',
      elementTarget: successMode === 'element-click' ? elementTarget : '',
      success: successDescriptions[successMode] || '성공 조건 없음'
    }];
  };

  const createProjectTitle = (task) => {
    const normalized = task.replace(/\s+/g, ' ').replace(/[.!?。]+$/g, '').trim();
    return normalized.length > 32 ? `${normalized.slice(0, 31).trim()}…` : normalized;
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes ? `${minutes}분 ${String(rest).padStart(2, '0')}초` : `${rest}초`;
  };

  const formatElapsed = (milliseconds) => {
    const safeMilliseconds = Math.max(0, milliseconds || 0);
    const seconds = safeMilliseconds / 1000;
    if (seconds < 60) return `+${seconds.toFixed(seconds < 10 ? 1 : 0)}초`;
    const minutes = Math.floor(seconds / 60);
    return `+${minutes}분 ${String(Math.round(seconds % 60)).padStart(2, '0')}초`;
  };

  const formatLocalTime = (timestamp) => new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));

  const normalizeSuccessMode = (task) => {
    const mode = task?.successMode;
    if (mode === 'text-match') return 'quiz';
    if (mode === 'manual' || !mode) return 'none';
    return ['page-reach', 'quiz', 'none', 'element-click'].includes(mode) ? mode : 'none';
  };
  const isQuizTask = (task) => normalizeSuccessMode(task) === 'quiz' && Boolean(String(task?.expectedAnswer || '').trim());
  const describeTaskSuccess = (task, { participant = false } = {}) => {
    const mode = normalizeSuccessMode(task);
    if (mode === 'page-reach') {
      return participant ? '지정된 페이지에 도착하면 자동으로 완료돼요.' : `“${task.pageTarget || '지정 페이지'}” 도달 시 자동 성공`;
    }
    if (mode === 'quiz') {
      return participant ? 'UT 종료 후 퀴즈 답변으로 성공 여부를 확인해요.' : `퀴즈 “${task.quizQuestion || '마지막 질문'}” · 정답 “${task.expectedAnswer || '미설정'}”`;
    }
    if (mode === 'element-click') {
      return participant ? '지정된 버튼이나 요소를 선택하면 자동으로 완료돼요.' : `“${task.elementTarget || '지정 요소'}” 클릭 시 자동 성공`;
    }
    if (mode === 'none') {
      return participant ? '성공과 실패를 판정하지 않고 경험만 기록해요.' : '성공 조건 없음 · 완료 기록만 수집';
    }
    return task?.success || '성공 조건 없음';
  };

  const renderHtmlSessions = async (projectId) => {
    const allSessions = await localDb.all(SESSION_STORE);
    const sessions = allSessions
      .filter((session) => session.projectId === projectId)
      .sort((a, b) => b.endedAt - a.endedAt);
    $('.html-session-count').textContent = `${sessions.length}회`;
    const list = $('.html-session-list');
    if (!sessions.length) {
      list.innerHTML = '<div class="html-session-empty"><svg><use href="#i-record"></use></svg><span>아직 실행 기록이 없어요.</span></div>';
      return sessions;
    }
    list.innerHTML = sessions.map((session, sessionIndex) => {
      const outcome = session.outcome || (session.status === 'completed' ? 'success' : 'stopped');
      const statusText = outcome === 'success' ? '성공' : outcome === 'completed' ? '완료' : outcome === 'failed' ? '조건 미충족' : outcome === 'unknown' ? '모르겠어요' : '중간 종료';
      const statusIcon = outcome === 'success' || outcome === 'completed' ? 'i-check' : 'i-close';
      const participantName = session.participantName || '이름 미입력';
      const clicks = (session.events || []).filter((event) => event.kind === 'click');
      const task = session.tasks?.[0] || { instruction: '기록된 과업 정보가 없습니다.', success: '—' };
      const judgmentLabels = {
        'page-reach': '자동 판정 · 지정 페이지 도달',
        'element-click': '자동 판정 · 지정 요소 클릭',
        'quiz-match': '퀴즈 판정 · 정답 일치',
        'quiz-mismatch': '퀴즈 판정 · 정답 불일치',
        'page-reach-not-met': '지정 페이지 미도달 · 참여자 종료',
        'element-click-not-met': '지정 요소 미선택 · 참여자 종료',
        none: '성공 조건 없음 · 참여자 완료',
        'text-match': '자동 판정 · 정답 일치',
        'text-mismatch': '자동 판정 · 입력값 불일치',
        'manual-before-match': '자동 조건 미충족 · 참여자 종료'
      };
      const judgmentText = judgmentLabels[session.outcomeSource]
        || (outcome === 'unknown' ? '참여자가 모르겠어요 선택' : outcome === 'stopped' ? '테스트 중간 종료' : '참여자가 완료 선택');
      const detailId = `session-detail-${sessionIndex}`;
      const clickTimeline = clicks.length
        ? `<ol class="html-click-list">${clicks.map((click, clickIndex) => {
            const detail = click.detail || {};
            const targetText = detail.text || detail.tag || '이름 없는 요소';
            const pageTitle = detail.pageTitle || '업로드한 HTML';
            const pagePath = detail.pagePath && detail.pagePath !== '/' ? ` · ${detail.pagePath}` : '';
            const linkText = detail.href ? `<span>이동 링크 · ${escapeHtml(detail.href)}</span>` : '';
            return `<li><span class="click-index">${clickIndex + 1}</span><div><strong>${escapeHtml(targetText)}</strong><span>${escapeHtml(pageTitle + pagePath)} · ${escapeHtml(detail.tag || 'element')} · 좌표 ${Number(detail.x) || 0}, ${Number(detail.y) || 0}</span>${linkText}</div><time>${formatElapsed((click.at || session.startedAt) - session.startedAt)}</time></li>`;
          }).join('')}</ol>`
        : '<div class="html-click-empty">기록된 클릭이 없습니다.</div>';
      return `<article class="html-session-record"><button class="html-session-item is-${outcome}" type="button" aria-expanded="false" aria-controls="${detailId}"><span><svg><use href="#${statusIcon}"></use></svg></span><span class="session-primary"><strong>${escapeHtml(participantName)} · ${statusText}</strong><small>${formatLocalTime(session.endedAt)} · 클릭 ${clicks.length}회</small></span><small>${formatDuration(session.duration)}</small><svg class="session-chevron"><use href="#i-chevron-right"></use></svg></button><div class="html-session-detail" id="${detailId}" hidden><dl><div><dt>참여자</dt><dd>${escapeHtml(participantName)}</dd></div><div><dt>결과</dt><dd>${statusText}</dd></div><div><dt>판정 방식</dt><dd>${escapeHtml(judgmentText)}</dd></div><div><dt>총 소요 시간</dt><dd>${formatDuration(session.duration)}</dd></div></dl><section><span>과업 상세</span><strong>${escapeHtml(task.instruction)}</strong><p>성공 조건 · ${escapeHtml(describeTaskSuccess(task))}</p></section><section><span>클릭 타임라인</span>${clickTimeline}</section></div></article>`;
    }).join('');
    return sessions;
  };

  $('.html-session-list').addEventListener('click', (event) => {
    const button = event.target.closest('.html-session-item');
    if (!button) return;
    const detail = document.getElementById(button.getAttribute('aria-controls'));
    if (!detail) return;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    detail.hidden = expanded;
  });

  const renderHtmlPreview = async (project) => {
    activeHtmlProject = project;
    const runtimeNotice = $('.html-runtime-notice');
    runtimeNotice.classList.remove('has-error');
    $('strong', runtimeNotice).textContent = '업로드한 HTML을 수정 없이 실행합니다';
    $('p', runtimeNotice).textContent = '페이지는 격리된 영역에서 실행되며, 요티는 참여자 이름과 클릭 페이지, 경과 시간, 과업 결과를 기록합니다.';
    $('#html-preview-title').textContent = project.title;
    $('#html-project-name').value = project.title;
    $('.html-project-title-view').hidden = false;
    $('.html-rename-form').hidden = true;
    $('.html-rename-error').hidden = true;
    $('.html-task-settings-form').hidden = true;
    $('.html-task-settings-button').hidden = false;
    $('.html-task-settings-error').hidden = true;
    $('.html-file-name').textContent = project.fileName;
    $('.html-test-goal').textContent = '참여자는 아래 과업을 확인한 뒤 테스트를 시작해요.';
    const task = project.tasks?.[0] || { instruction: '페이지에서 핵심 작업을 완료해보세요.', success: '완료 상태 확인' };
    $('.html-task-list').innerHTML = `<li><strong>${escapeHtml(task.instruction)}</strong><span>완료 기준 · ${escapeHtml(describeTaskSuccess(task))}</span></li>`;
    const framePanel = $('.html-frame-panel');
    const frame = $('#html-preview-frame');
    if (project.html) {
      framePanel.classList.remove('is-empty');
      frame.srcdoc = prepareImportedHtml(project.html, task);
    } else {
      frame.removeAttribute('srcdoc');
      framePanel.classList.add('is-empty');
    }
    await renderHtmlSessions(project.id);
  };

  const renderImportedProjects = async () => {
    const container = $('#imported-projects');
    if (!container) return;
    try {
      const [projects, sessions] = await Promise.all([
        localDb.all(PROJECT_STORE),
        localDb.all(SESSION_STORE)
      ]);
      const imported = projects.filter((project) => project.method === 'html').sort((a, b) => b.createdAt - a.createdAt);
      container.innerHTML = imported.map((project) => {
        const projectSessions = sessions.filter((session) => session.projectId === project.id);
        const succeeded = projectSessions.filter((session) => session.outcome === 'success' || (!session.outcome && session.status === 'completed')).length;
        return `<article class="project-card imported-html-card" data-html-project-id="${project.id}" tabindex="0" role="button" aria-label="${escapeHtml(project.title)} HTML 테스트 열기"><div class="project-cover upload-cover"><span class="badge badge-green">실행 가능</span><div class="code-mock"><i></i><i></i><i></i><i></i><i></i></div></div><div class="project-card-body"><div><span class="badge badge-gray">HTML</span><span class="badge badge-blue">로컬 저장</span></div><h2>${escapeHtml(project.title)}</h2><p>${escapeHtml(project.goal)}</p><dl><div><dt>테스트 기록</dt><dd>${projectSessions.length}회</dd></div><div><dt>성공</dt><dd>${succeeded}회</dd></div></dl></div></article>`;
      }).join('');
      const totalButton = $('.segmented-control button');
      if (totalButton) totalButton.textContent = `전체 ${4 + imported.length}`;
    } catch (error) {
      container.innerHTML = '';
      console.warn('요티 로컬 프로젝트를 불러오지 못했습니다.', error);
    }
  };

  const openHtmlProject = async (projectId) => {
    try {
      const project = await localDb.get(PROJECT_STORE, projectId);
      if (!project) {
        showToast('저장된 HTML 프로젝트를 찾지 못했어요.');
        return;
      }
      await renderHtmlPreview(project);
      showView('html-preview');
    } catch (error) {
      showToast(error.message || 'HTML 프로젝트를 열지 못했어요.');
    }
  };

  const createHtmlProject = async () => {
    if (!importedHtmlSource || !importedHtmlFile) {
      formStep = 2;
      updateFormStep();
      showToast('실행할 HTML 파일을 다시 선택해주세요.');
      return;
    }
    const originalLabel = formNext.textContent;
    formNext.disabled = true;
    formNext.innerHTML = '<span class="mini-spinner"></span>저장 중';
    const task = taskInput.value.trim();
    const project = {
      id: makeId('html'),
      method: 'html',
      title: createProjectTitle(task),
      goal: task,
      fileName: importedHtmlFile.name,
      fileSize: importedHtmlFile.size,
      html: importedHtmlSource,
      tasks: collectTasks(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    try {
      await localDb.put(PROJECT_STORE, project);
      activeHtmlProject = project;
      closeModal(createBackdrop, false);
      await renderImportedProjects();
      await renderHtmlPreview(project);
      showView('html-preview');
      clearImportedFile();
      showToast('HTML을 실행 가능한 UT 프로젝트로 저장했어요.');
    } catch (error) {
      showToast(error?.name === 'QuotaExceededError'
        ? '브라우저 저장 공간이 부족해요. 더 작은 HTML로 다시 시도해주세요.'
        : (error.message || 'HTML 프로젝트 저장에 실패했어요.'));
    } finally {
      formNext.disabled = false;
      formNext.textContent = originalLabel;
    }
  };

  $('#imported-projects').addEventListener('click', (event) => {
    const card = event.target.closest('[data-html-project-id]');
    if (card) openHtmlProject(card.dataset.htmlProjectId);
  });
  $('#imported-projects').addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-html-project-id]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openHtmlProject(card.dataset.htmlProjectId);
    }
  });
  $('.html-rename-button').addEventListener('click', () => {
    if (!activeHtmlProject) return;
    $('.html-project-title-view').hidden = true;
    $('.html-rename-form').hidden = false;
    $('.html-rename-error').hidden = true;
    const input = $('#html-project-name');
    input.value = activeHtmlProject.title;
    input.focus();
    input.select();
  });
  $('.html-rename-cancel').addEventListener('click', () => {
    $('.html-rename-form').hidden = true;
    $('.html-project-title-view').hidden = false;
    $('.html-rename-error').hidden = true;
    $('.html-rename-button').focus();
  });
  $('.html-rename-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeHtmlProject) return;
    const input = $('#html-project-name');
    const nextTitle = input.value.trim();
    if (!nextTitle) {
      $('.html-rename-error').hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    $('.html-rename-error').hidden = true;
    const saveButton = $('.html-rename-save');
    saveButton.disabled = true;
    saveButton.textContent = '저장 중';
    try {
      activeHtmlProject = { ...activeHtmlProject, title: nextTitle, updatedAt: Date.now() };
      await localDb.put(PROJECT_STORE, activeHtmlProject);
      $('#html-preview-title').textContent = nextTitle;
      $('.html-rename-form').hidden = true;
      $('.html-project-title-view').hidden = false;
      await renderImportedProjects();
      showToast('프로젝트 이름을 수정했어요.');
      $('.html-rename-button').focus();
    } catch (error) {
      showToast(error.message || '프로젝트 이름을 저장하지 못했어요.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = '저장';
    }
  });

  const htmlSuccessFields = {
    'page-reach': {
      panel: $('.html-page-success-field'),
      inputs: [$('#html-page-target')]
    },
    quiz: {
      panel: $('.html-quiz-success-field'),
      inputs: [$('#html-quiz-question'), $('#html-expected-answer')]
    },
    none: {
      panel: $('.html-none-success-field'),
      inputs: []
    },
    'element-click': {
      panel: $('.html-element-success-field'),
      inputs: [$('#html-element-target')]
    }
  };
  const syncHtmlTaskSettingsFields = () => {
    const mode = $('#html-success-mode').value;
    Object.entries(htmlSuccessFields).forEach(([fieldMode, config]) => {
      config.panel.hidden = fieldMode !== mode;
      config.inputs.forEach((input) => {
        input.required = fieldMode === mode;
        if (fieldMode !== mode) input.removeAttribute('aria-invalid');
      });
    });
    $('.html-task-settings-error').hidden = true;
  };
  $('.html-task-settings-button').addEventListener('click', () => {
    if (!activeHtmlProject) return;
    const task = activeHtmlProject.tasks?.[0] || {};
    $('#html-success-mode').value = normalizeSuccessMode(task);
    $('#html-page-target').value = task.pageTarget || '';
    $('#html-quiz-question').value = task.quizQuestion || (task.successMode === 'text-match' ? '과업에서 확인한 값을 입력해주세요.' : '');
    $('#html-expected-answer').value = task.expectedAnswer || '';
    $('#html-element-target').value = task.elementTarget || '';
    $('.html-task-settings-error').hidden = true;
    Object.values(htmlSuccessFields).flatMap((config) => config.inputs).forEach((input) => input.removeAttribute('aria-invalid'));
    syncHtmlTaskSettingsFields();
    $('.html-task-settings-button').hidden = true;
    $('.html-task-settings-form').hidden = false;
    $('#html-success-mode').focus();
  });
  $('#html-success-mode').addEventListener('change', syncHtmlTaskSettingsFields);
  Object.values(htmlSuccessFields).flatMap((config) => config.inputs).forEach((input) => {
    input.addEventListener('blur', () => {
      if (!input.value.trim()) return;
      input.removeAttribute('aria-invalid');
      $('.html-task-settings-error').hidden = true;
    });
  });
  $('.html-task-settings-cancel').addEventListener('click', () => {
    $('.html-task-settings-form').hidden = true;
    $('.html-task-settings-button').hidden = false;
    $('.html-task-settings-error').hidden = true;
    $('.html-task-settings-button').focus();
  });
  $('.html-task-settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeHtmlProject) return;
    const successMode = $('#html-success-mode').value;
    const pageTarget = $('#html-page-target').value.trim();
    const quizQuestion = $('#html-quiz-question').value.trim();
    const expectedAnswer = $('#html-expected-answer').value.trim();
    const elementTarget = $('#html-element-target').value.trim();
    const requiredInputs = htmlSuccessFields[successMode]?.inputs || [];
    const emptyInputs = requiredInputs.filter((input) => !input.value.trim());
    Object.values(htmlSuccessFields).flatMap((config) => config.inputs).forEach((input) => input.removeAttribute('aria-invalid'));
    if (emptyInputs.length) {
      emptyInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
      const error = $('.html-task-settings-error');
      error.textContent = '선택한 성공 조건에 필요한 값을 모두 입력해주세요.';
      error.hidden = false;
      emptyInputs[0].focus();
      return;
    }
    $('.html-task-settings-error').hidden = true;
    const currentTask = activeHtmlProject.tasks?.[0] || { instruction: '페이지에서 핵심 작업을 완료해보세요.' };
    const successDescriptions = {
      'page-reach': `“${pageTarget}” 페이지 도달`,
      quiz: `퀴즈 “${quizQuestion}” 정답 일치`,
      none: '성공 조건 없음 · 완료 기록만 수집',
      'element-click': `“${elementTarget}” 버튼 또는 요소 클릭`
    };
    const nextTask = {
      ...currentTask,
      successMode,
      pageTarget: successMode === 'page-reach' ? pageTarget : '',
      quizQuestion: successMode === 'quiz' ? quizQuestion : '',
      expectedAnswer: successMode === 'quiz' ? expectedAnswer : '',
      elementTarget: successMode === 'element-click' ? elementTarget : '',
      success: successDescriptions[successMode] || '성공 조건 없음'
    };
    const saveButton = $('.html-task-settings-save');
    saveButton.disabled = true;
    saveButton.textContent = '저장 중';
    try {
      activeHtmlProject = { ...activeHtmlProject, tasks: [nextTask], updatedAt: Date.now() };
      await localDb.put(PROJECT_STORE, activeHtmlProject);
      await renderHtmlPreview(activeHtmlProject);
      showToast(`${successModeLabels[successMode] || '성공'} 조건을 저장했어요.`);
      $('.html-task-settings-button').focus();
    } catch (error) {
      showToast(error.message || '성공 조건을 저장하지 못했어요.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = '저장';
    }
  });
  $('.html-replace-button').addEventListener('click', (event) => openCreate('html', event.currentTarget));
  $('.html-refresh-button').addEventListener('click', () => {
    if (!activeHtmlProject) return;
    const frame = $('#html-preview-frame');
    frame.srcdoc = '';
    window.requestAnimationFrame(() => {
      frame.srcdoc = prepareImportedHtml(activeHtmlProject.html, activeHtmlProject.tasks?.[0]);
      showToast('HTML 미리보기를 새로고침했어요.');
    });
  });

  const shareBackdrop = $('[data-modal="share"]');
  $$('.share-button').forEach((button) => button.addEventListener('click', () => openModal('share', button)));
  $('.copy-link-button').addEventListener('click', async () => {
    const linkInput = $('#share-link');
    let copied = false;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copied = true;
    } catch (_) {
      linkInput.select();
      copied = document.execCommand('copy');
    }
    showToast(copied ? '참여 링크를 복사했어요.' : '링크를 선택했어요. 직접 복사해주세요.');
    const button = $('.copy-link-button');
    button.innerHTML = '<svg><use href="#i-check"></use></svg>복사됨';
    window.setTimeout(() => { button.innerHTML = '<svg><use href="#i-copy"></use></svg>복사'; }, 1600);
  });

  $$('[data-open-project]').forEach((item) => {
    const open = () => {
      if (item.dataset.openProject === 'html') openCreate('html', item);
      else showView('analytics');
    };
    item.addEventListener('click', (event) => {
      if (event.target.closest('.icon-button')) return;
      open();
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });

  const setResultTab = (name) => {
    $$('.analytics-tabs [role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.resultTab === name)));
    $$('.result-tab').forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.resultPanel === name));
  };
  $$('[data-result-tab]').forEach((tab) => tab.addEventListener('click', () => setResultTab(tab.dataset.resultTab)));
  $$('[data-result-tab-jump]').forEach((button) => button.addEventListener('click', () => setResultTab(button.dataset.resultTabJump)));
  $$('.segmented-control button').forEach((button) => button.addEventListener('click', () => {
    $$('.segmented-control button').forEach((item) => item.classList.toggle('is-selected', item === button));
  }));
  $$('.insight-filter button').forEach((button) => button.addEventListener('click', () => {
    $$('.insight-filter button').forEach((item) => item.classList.toggle('is-active', item === button));
    showToast(`${button.childNodes[0].textContent.trim()} 인사이트만 모아봤어요.`);
  }));

  $$('[data-open-editor]').forEach((button) => button.addEventListener('click', () => showView('editor')));
  $$('.device-switch button').forEach((button) => button.addEventListener('click', () => {
    $$('.device-switch button').forEach((item) => item.classList.toggle('is-selected', item === button));
    $('.prototype-device').dataset.prototypeDevice = button.dataset.device;
  }));
  $$('.screen-item').forEach((button) => button.addEventListener('click', () => {
    $$('.screen-item').forEach((item) => item.classList.toggle('is-selected', item === button));
    showToast(`${$('strong', button).textContent} 화면을 선택했어요.`);
  }));
  $$('.choice-chips button').forEach((button) => button.addEventListener('click', () => {
    $$('.choice-chips button').forEach((item) => item.classList.toggle('is-selected', item === button));
    $('.search-widget').style.borderRadius = `${button.textContent}px`;
  }));

  const paddingRange = $('#padding-range');
  const gapRange = $('#gap-range');
  [paddingRange, gapRange].forEach((range) => range.addEventListener('input', () => {
    $(`output[for="${range.id}"]`).textContent = range.value;
    const variable = range === paddingRange ? '--widget-padding' : '--widget-gap';
    $('.search-widget').style.setProperty(variable, `${range.value}px`);
  }));

  $('#layout-select').addEventListener('change', (event) => {
    const widget = $('.search-widget');
    widget.classList.remove('layout-compact', 'layout-split');
    if (event.target.value !== 'stack') widget.classList.add(`layout-${event.target.value}`);
  });

  $('#element-title').addEventListener('input', (event) => {
    $('.travel-copy h2').textContent = event.target.value || '어디로 떠나세요?';
  });

  const aiEditInput = $('#ai-edit-input');
  $('.ai-submit').addEventListener('click', () => {
    const request = aiEditInput.value.trim();
    if (!request) {
      showToast('수정하고 싶은 내용을 적어주세요.');
      aiEditInput.focus();
      return;
    }
    const button = $('.ai-submit');
    button.disabled = true;
    button.innerHTML = '<span class="mini-spinner"></span>';
    showToast('요령이가 요청을 이해하고 있어요...');
    window.setTimeout(() => {
      const widget = $('.search-widget');
      widget.classList.add('layout-compact');
      $('#layout-select').value = 'compact';
      if (!$('.prototype-filter-chip')) {
        const chip = document.createElement('button');
        chip.className = 'prototype-filter-chip';
        chip.type = 'button';
        chip.textContent = '가격대 · 15만원 이하';
        widget.insertBefore(chip, $('.travel-search-button', widget));
      }
      button.disabled = false;
      button.innerHTML = '<svg><use href="#i-arrow-up"></use></svg>';
      aiEditInput.value = '';
      showToast('검색 카드를 간결하게 정리하고 가격 필터를 추가했어요.');
    }, 1300);
  });

  $$('[data-proto-action]').forEach((button) => button.addEventListener('click', () => {
    const messages = {
      destination: '여행지 입력 화면으로 연결되어 있어요.',
      date: '날짜 선택 화면으로 연결되어 있어요.',
      guests: '인원 선택 화면으로 연결되어 있어요.',
      search: '객실 목록 화면으로 이동하는 인터랙션이에요.'
    };
    showToast(messages[button.dataset.protoAction]);
  }));

  const runner = $('.test-runner');
  const runnerTitle = $('#runner-title');
  const runnerStep = $('.runner-step');
  const runnerHtmlFrame = $('.runner-html-frame');
  const runnerIntro = $('.runner-intro');
  const runnerIntroStart = $('.runner-intro-start');
  const runnerCountdown = $('.runner-countdown');
  const runnerParticipantName = $('#runner-participant-name');
  const runnerNameError = $('.runner-name-error');
  const runnerAnswerField = $('.runner-answer-field');
  const runnerAnswerInput = $('#runner-answer-input');
  const runnerAnswerError = $('#runner-answer-error');
  const runnerFinishButton = $('.runner-finish');
  const runnerWidget = $('.runner-widget');
  const runnerCompletionModal = $('.runner-completion-modal');
  const runnerCompletionTitle = $('#runner-completion-title');
  const runnerCompletionTask = $('.runner-completion-task');
  const runnerCompletionSubmit = $('.runner-completion-submit');
  const runnerResult = $('.runner-result');
  const runnerResultTitle = $('#runner-result-title');
  const runnerResultMessage = $('.runner-result-message');
  const runnerResultNote = $('.runner-result-note span');
  const runnerResultClose = $('.runner-result-close');
  const demoRunnerTasks = [{
    instruction: '원하는 객실을 찾아 예약을 완료해보세요.',
    successMode: 'none',
    success: '성공 조건 없음 · 완료 기록만 수집'
  }];
  let runnerTasks = demoRunnerTasks;
  let runnerTaskIndex = 0;
  let runnerOpener;
  let runnerMode = 'demo';
  let runnerSession = null;
  let runnerSessionSaved = false;
  let runnerTransitioning = false;
  let runnerCountdownTimer = null;
  let runnerPendingHtml = '';

  const showRunnerResult = (outcome, recorded = true) => {
    const successful = outcome === 'success';
    const completedWithoutCondition = outcome === 'completed';
    runnerResult.classList.toggle('is-success', successful);
    runnerResult.classList.toggle('is-neutral', completedWithoutCondition);
    runnerResult.classList.toggle('is-supportive', !successful && !completedWithoutCondition);
    runnerResultTitle.textContent = successful ? '성공했어요!' : completedWithoutCondition ? '테스트를 마쳤어요!' : '함께해주셔서 고마워요';
    runnerResultMessage.textContent = successful
      ? '과업을 잘 마쳤어요. 참여해주신 내용은 더 좋은 경험을 만드는 데 사용할게요.'
      : completedWithoutCondition
        ? '완료해주셔서 고마워요. 남겨주신 행동 기록을 서비스 개선에 활용할게요.'
        : '남겨주신 경험을 바탕으로 더 직관적인 서비스로 돌아올게요.';
    runnerResultNote.textContent = recorded ? '응답이 안전하게 기록됐어요.' : '미리보기 결과이며 기록에는 저장되지 않아요.';
    $('.runner-result-icon use').setAttribute('href', successful || completedWithoutCondition ? '#i-check' : '#i-sparkles');
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = true;
    runnerHtmlFrame.setAttribute('tabindex', '-1');
    runnerResult.hidden = false;
    runnerResultClose.focus();
  };

  const updateRunner = () => {
    const task = runnerTasks[runnerTaskIndex];
    const quiz = typeof task !== 'string' && isQuizTask(task);
    const instruction = typeof task === 'string' ? task : task.instruction;
    runnerTitle.textContent = instruction;
    runnerStep.textContent = '과업 내용';
    $('.runner-intro-task').textContent = instruction;
    runnerCompletionTask.textContent = instruction;
    $('.runner-intro-success').textContent = `완료 기준 · ${typeof task === 'string' ? '완료 상태 확인' : describeTaskSuccess(task, { participant: true })}`;
    runnerAnswerField.hidden = true;
    runnerAnswerInput.required = quiz;
    runnerCompletionSubmit.textContent = '답변 제출';
  };
  const closeRunnerCompletion = ({ restoreFocus = true } = {}) => {
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = false;
    runnerHtmlFrame.removeAttribute('tabindex');
    $('.runner-demo-site').inert = false;
    if (restoreFocus) runnerFinishButton.focus();
  };
  const openRunnerCompletion = () => {
    if (runnerTransitioning) return;
    const task = runnerTasks[runnerTaskIndex];
    const mode = typeof task === 'string' ? 'none' : normalizeSuccessMode(task);
    const quiz = mode === 'quiz';
    runnerCompletionTitle.textContent = quiz ? '퀴즈에 답해주세요' : '아직 성공 조건을 확인하지 못했어요';
    runnerCompletionTask.textContent = quiz
      ? (task.quizQuestion || '과업에서 확인한 값을 입력해주세요.')
      : describeTaskSuccess(task);
    runnerAnswerField.hidden = !quiz;
    runnerAnswerInput.required = quiz;
    runnerAnswerError.hidden = true;
    runnerAnswerInput.removeAttribute('aria-invalid');
    runnerCompletionSubmit.textContent = quiz ? '답변 제출' : '그래도 종료하기';
    runnerCompletionModal.hidden = false;
    runnerWidget.inert = true;
    runnerHtmlFrame.setAttribute('tabindex', '-1');
    $('.runner-demo-site').inert = true;
    window.setTimeout(() => (quiz ? runnerAnswerInput : runnerCompletionSubmit).focus(), 0);
  };
  const openRunner = (opener, project = null) => {
    if (!shareBackdrop.hidden) closeModal(shareBackdrop, false);
    runnerOpener = opener;
    runnerMode = project ? 'html' : 'demo';
    runnerTasks = project?.tasks?.length ? [project.tasks[0]] : demoRunnerTasks;
    runnerTaskIndex = 0;
    runnerSessionSaved = false;
    runnerTransitioning = false;
    window.clearTimeout(runnerCountdownTimer);
    runnerResult.hidden = true;
    runnerResult.classList.remove('is-success', 'is-neutral', 'is-supportive');
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = false;
    runner.classList.toggle('is-html', runnerMode === 'html');
    runner.classList.add('is-preparing');
    runnerHtmlFrame.hidden = runnerMode !== 'html';
    runnerHtmlFrame.setAttribute('tabindex', '-1');
    $('.runner-demo-site').hidden = runnerMode === 'html';
    $('.runner-demo-site').inert = true;
    if (project) {
      runnerPendingHtml = prepareImportedHtml(project.html, runnerTasks[0]);
      runnerHtmlFrame.srcdoc = '';
      runnerSession = {
        id: makeId('session'),
        projectId: project.id,
        projectTitle: project.title,
        startedAt: null,
        endedAt: null,
        duration: 0,
        status: 'ready',
        outcome: null,
        participantName: '',
        events: [],
        tasks: [{
          index: 0,
          instruction: runnerTasks[0].instruction,
          success: runnerTasks[0].success,
          successMode: normalizeSuccessMode(runnerTasks[0]),
          pageTarget: runnerTasks[0].pageTarget || '',
          quizQuestion: runnerTasks[0].quizQuestion || '',
          expectedAnswer: runnerTasks[0].expectedAnswer || '',
          elementTarget: runnerTasks[0].elementTarget || '',
          result: null,
          completedAt: null
        }]
      };
    } else {
      runnerPendingHtml = '';
      runnerHtmlFrame.removeAttribute('srcdoc');
      runnerSession = null;
    }
    updateRunner();
    runnerIntro.hidden = false;
    runnerIntro.classList.remove('is-counting');
    runnerIntroStart.hidden = false;
    runnerIntroStart.disabled = false;
    runnerParticipantName.value = '';
    runnerParticipantName.removeAttribute('aria-invalid');
    runnerNameError.hidden = true;
    runnerAnswerInput.value = '';
    runnerAnswerInput.removeAttribute('aria-invalid');
    runnerAnswerError.hidden = true;
    runnerCountdown.hidden = true;
    runnerCountdown.classList.remove('is-ticking');
    $('strong', runnerCountdown).textContent = '3';
    runner.hidden = false;
    body.classList.add('is-locked');
    runnerParticipantName.focus();
  };

  const beginRunnerCountdown = () => {
    if (runnerTransitioning) return;
    const participantName = runnerParticipantName.value.trim();
    if (!participantName) {
      runnerNameError.hidden = false;
      runnerParticipantName.setAttribute('aria-invalid', 'true');
      runnerParticipantName.focus();
      return;
    }
    runnerNameError.hidden = true;
    runnerParticipantName.removeAttribute('aria-invalid');
    if (runnerSession) runnerSession.participantName = participantName;
    runnerTransitioning = true;
    runnerIntroStart.disabled = true;
    runnerIntroStart.hidden = true;
    runnerIntro.classList.add('is-counting');
    runnerCountdown.hidden = false;
    let count = 3;
    const tick = () => {
      $('strong', runnerCountdown).textContent = String(count);
      runnerCountdown.classList.remove('is-ticking');
      void runnerCountdown.offsetWidth;
      runnerCountdown.classList.add('is-ticking');
      if (count === 1) {
        runnerCountdownTimer = window.setTimeout(() => {
          runnerIntro.hidden = true;
          runnerIntro.classList.remove('is-counting');
          runner.classList.remove('is-preparing');
          if (runnerSession) {
            runnerSession.startedAt = Date.now();
            runnerSession.status = 'running';
          }
          runnerHtmlFrame.removeAttribute('tabindex');
          $('.runner-demo-site').inert = false;
          runnerTransitioning = false;
          if (runnerMode === 'html') {
            runnerHtmlFrame.srcdoc = runnerPendingHtml;
            runnerHtmlFrame.focus();
          }
          else $('.runner-success-trigger').focus();
        }, 1000);
        return;
      }
      count -= 1;
      runnerCountdownTimer = window.setTimeout(tick, 1000);
    };
    tick();
  };

  const saveStoppedSession = async () => {
    if (!runnerSession || runnerSessionSaved) return;
    if (!runnerSession.startedAt) {
      runnerSessionSaved = true;
      return;
    }
    runnerSession.endedAt = Date.now();
    runnerSession.duration = runnerSession.endedAt - runnerSession.startedAt;
    runnerSession.status = 'stopped';
    runnerSession.outcome = 'stopped';
    await localDb.put(SESSION_STORE, runnerSession);
    runnerSessionSaved = true;
    await Promise.all([
      renderImportedProjects(),
      activeHtmlProject?.id === runnerSession.projectId
        ? renderHtmlSessions(runnerSession.projectId)
        : Promise.resolve()
    ]);
  };
  const closeRunner = async ({ saveStopped = true } = {}) => {
    window.clearTimeout(runnerCountdownTimer);
    if (saveStopped && runnerMode === 'html') {
      try {
        await saveStoppedSession();
      } catch (error) {
        showToast(error.message || '중간 종료 기록을 저장하지 못했어요.');
      }
    }
    runner.hidden = true;
    runner.classList.remove('is-html', 'is-preparing');
    runnerIntro.hidden = true;
    runnerIntro.classList.remove('is-counting');
    runnerCountdown.classList.remove('is-ticking');
    runnerResult.hidden = true;
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = false;
    runnerHtmlFrame.hidden = true;
    runnerHtmlFrame.removeAttribute('srcdoc');
    runnerHtmlFrame.removeAttribute('tabindex');
    runnerPendingHtml = '';
    $('.runner-demo-site').hidden = false;
    $('.runner-demo-site').inert = false;
    if (!$('.modal-backdrop:not([hidden])') && $('.recording-player').hidden) body.classList.remove('is-locked');
    runnerOpener?.focus?.();
  };
  $$('.preview-test-button').forEach((button) => button.addEventListener('click', () => openRunner(button)));
  $('.html-run-test-button').addEventListener('click', (event) => {
    if (!activeHtmlProject) {
      showToast('먼저 HTML 프로젝트를 열어주세요.');
      return;
    }
    openRunner(event.currentTarget, activeHtmlProject);
  });
  runnerIntroStart.addEventListener('click', beginRunnerCountdown);
  runnerParticipantName.addEventListener('input', () => {
    if (!runnerParticipantName.value.trim()) return;
    runnerNameError.hidden = true;
    runnerParticipantName.removeAttribute('aria-invalid');
  });
  runnerParticipantName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      beginRunnerCountdown();
    }
  });
  runnerAnswerInput.addEventListener('input', () => {
    if (!runnerAnswerInput.value.trim()) return;
    runnerAnswerInput.removeAttribute('aria-invalid');
    runnerAnswerError.hidden = true;
  });
  $('.runner-intro-close').addEventListener('click', () => closeRunner());
  $$('.runner-completion-cancel').forEach((button) => button.addEventListener('click', () => closeRunnerCompletion()));
  runnerCompletionModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeRunnerCompletion();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = $$(focusableSelector, runnerCompletionModal).filter((item) => !item.disabled && !item.hidden);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  runnerResultClose.addEventListener('click', () => closeRunner({ saveStopped: false }));

  const finishRunnerSession = async (outcome) => {
    if (!runnerSession || runnerSessionSaved) return;
    runnerSession.endedAt = Date.now();
    runnerSession.duration = runnerSession.endedAt - runnerSession.startedAt;
    runnerSession.status = 'completed';
    runnerSession.outcome = outcome;
    try {
      await localDb.put(SESSION_STORE, runnerSession);
      runnerSessionSaved = true;
      await Promise.all([
        renderImportedProjects(),
        renderHtmlSessions(runnerSession.projectId)
      ]);
      showRunnerResult(outcome);
    } catch (error) {
      showToast(error.message || 'UT 기록을 저장하지 못했어요.');
    }
  };

  const finishRunnerTask = async (outcome, source = 'manual') => {
    if (runnerTransitioning) return;
    runnerTransitioning = true;
    const previousSubmitLabel = runnerCompletionSubmit.textContent;
    runnerFinishButton.disabled = true;
    runnerCompletionSubmit.disabled = true;
    runnerCompletionSubmit.textContent = '기록 중...';
    if (runnerSession) {
      const task = runnerTasks[runnerTaskIndex];
      runnerSession.tasks[0] = {
        index: runnerTaskIndex,
        instruction: task.instruction,
        success: task.success,
        successMode: normalizeSuccessMode(task),
        pageTarget: task.pageTarget || '',
        quizQuestion: task.quizQuestion || '',
        expectedAnswer: task.expectedAnswer || '',
        elementTarget: task.elementTarget || '',
        result: outcome,
        resultSource: source,
        completedAt: Date.now()
      };
      runnerSession.outcomeSource = source;
    }
    if (runnerSession) {
      await finishRunnerSession(outcome);
    } else {
      showRunnerResult(outcome, false);
    }
    runnerFinishButton.disabled = false;
    runnerCompletionSubmit.disabled = false;
    runnerCompletionSubmit.textContent = previousSubmitLabel;
    runnerTransitioning = false;
  };
  $('.runner-success-trigger').addEventListener('click', () => showToast('과업을 마쳤다면 헤더의 “UT 종료”를 눌러주세요.'));
  const requestRunnerFinish = () => {
    if (runnerTransitioning) return;
    const task = runnerTasks[runnerTaskIndex];
    const mode = typeof task === 'string' ? 'none' : normalizeSuccessMode(task);
    if (mode === 'quiz' || mode === 'page-reach' || mode === 'element-click') {
      openRunnerCompletion();
      return;
    }
    finishRunnerTask('completed', 'none');
  };
  const submitRunnerAnswer = () => {
    const task = runnerTasks[runnerTaskIndex];
    const mode = typeof task === 'string' ? 'none' : normalizeSuccessMode(task);
    if (mode !== 'quiz') {
      closeRunnerCompletion({ restoreFocus: false });
      finishRunnerTask('failed', `${mode}-not-met`);
      return;
    }
    const answer = runnerAnswerInput.value.trim();
    if (!answer) {
      runnerAnswerError.textContent = '퀴즈 답변을 입력한 뒤 제출해주세요.';
      runnerAnswerError.hidden = false;
      runnerAnswerInput.setAttribute('aria-invalid', 'true');
      runnerAnswerInput.focus();
      return;
    }
    const matched = answer === String(task.expectedAnswer || '').trim();
    if (runnerSession?.startedAt && !runnerSessionSaved) {
      runnerSession.events.push({
        kind: 'answer-submit',
        detail: { matched, source: 'yoti-widget' },
        at: Date.now(),
        taskIndex: runnerTaskIndex
      });
    }
    if (!matched) {
      runnerAnswerError.hidden = true;
      runnerAnswerInput.removeAttribute('aria-invalid');
      closeRunnerCompletion({ restoreFocus: false });
      finishRunnerTask('failed', 'quiz-mismatch');
      return;
    }
    runnerAnswerError.hidden = true;
    runnerAnswerInput.removeAttribute('aria-invalid');
    closeRunnerCompletion({ restoreFocus: false });
    finishRunnerTask('success', 'quiz-match');
  };
  runnerFinishButton.addEventListener('click', requestRunnerFinish);
  runnerCompletionSubmit.addEventListener('click', submitRunnerAnswer);
  runnerAnswerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitRunnerAnswer();
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.source !== 'yoti-html-runtime') return;
    const fromPreview = event.source === $('#html-preview-frame').contentWindow;
    const fromRunner = event.source === runnerHtmlFrame.contentWindow;
    if (!fromPreview && !fromRunner) return;
    if (fromPreview && message.kind === 'runtime-error') {
      const runtimeNotice = $('.html-runtime-notice');
      runtimeNotice.classList.add('has-error');
      $('strong', runtimeNotice).textContent = 'HTML 안의 스크립트에서 오류가 발생했어요';
      $('p', runtimeNotice).textContent = message.detail?.message || '개발자 도구에서 오류 내용을 확인해주세요.';
      return;
    }
    if (!fromRunner || !runnerSession || !runnerSession.startedAt || runnerSessionSaved) return;
    runnerSession.events.push({
      kind: message.kind,
      detail: message.detail || {},
      at: Number(message.at) || Date.now(),
      taskIndex: runnerTaskIndex
    });
    if (message.kind === 'condition-met' && !runnerTransitioning) {
      const source = message.detail?.mode === 'element-click' ? 'element-click' : 'page-reach';
      finishRunnerTask('success', source);
    }
  });

  const player = $('.recording-player');
  let playerOpener;
  const openPlayer = (opener) => {
    playerOpener = opener;
    player.hidden = false;
    body.classList.add('is-locked');
    $('.player-close').focus();
  };
  const closePlayer = () => {
    player.hidden = true;
    if (!$('.modal-backdrop:not([hidden])') && runner.hidden) body.classList.remove('is-locked');
    playerOpener?.focus?.();
  };
  $$('[data-play-recording]').forEach((button) => button.addEventListener('click', () => openPlayer(button)));
  $('.player-close').addEventListener('click', closePlayer);
  $('.recording-player').addEventListener('mousedown', (event) => {
    if (event.target === player) closePlayer();
  });
  $('.player-play-button').addEventListener('click', (event) => {
    const screen = $('.player-site');
    screen.classList.toggle('is-paused');
    event.currentTarget.classList.toggle('is-paused');
    showToast(screen.classList.contains('is-paused') ? '재생을 일시정지했어요.' : '기록을 재생합니다.');
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      sidebar.classList.remove('is-open');
      mobileMenuButton?.setAttribute('aria-expanded', 'false');
    }
  });

  renderImportedProjects();
})();
