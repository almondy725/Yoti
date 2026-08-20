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
  let aiImages = [];   // AI 생성에 참고로 붙이는 화면 이미지
  let screenPreviewUrl = '';
  let screenPreviewUrlB = '';
  let editingProject = null;   // 수정 중이면 그 UT, 새로 만드는 중이면 null
  let skippedMethodStep = false;   // 메인에서 방식을 골라 1단계를 건너뛴 경우
  // /t/<id> 로 들어온 참여자는 사이드바 없이 UT만 봐요
  const participantMatch = location.pathname.match(/^\/t\/([A-Za-z0-9_-]+)\/?$/);
  const participantMode = Boolean(participantMatch);
  const participantUtId = participantMatch?.[1] || '';
  let participantVariant = 'A';
  const participantPreview = new URLSearchParams(location.search).get('preview') === '1';

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

  const prepareImportedHtml = (source, task = null, screens = [], { record = false } = {}) => {
    // 주소가 안 바뀌는 프로토타입도 도달을 재려면, 재볼 화면 목록을 안으로 넣어줘야 해요
    const inlineScreens = JSON.stringify(
      (screens || []).map((screen) => ({ id: String(screen?.id || ''), title: String(screen?.title || '') }))
        .filter((screen) => screen.id)
    ).replaceAll('<', '\\u003c');
    const inlineSuccessCheck = JSON.stringify({
      mode: task?.successMode || 'none',
      pageTarget: String(task?.pageTarget || ''),
      screenId: String(task?.screenId || ''),
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
    pageUrl: window.location.href.slice(0, 200),
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
  // 화면 블록은 id가 'screen-home' 처럼 접두어가 붙기도 해서 data-screen 도 같이 봐요
  const findScreenEl = (id) => {
    if (!id) return null;
    try {
      return document.getElementById(id)
        || document.querySelector('[data-screen="' + CSS.escape(id) + '"]')
        || document.querySelector('[data-page="' + CSS.escape(id) + '"]')
        || document.querySelector('[data-view="' + CSS.escape(id) + '"]');
    } catch (e) { return document.getElementById(id); }
  };
  // 처음부터 보이던 화면이면 '도달'이 아니에요
  let startedVisible = false;
  const noteInitialVisibility = () => {
    const el = successCheck.screenId ? findScreenEl(successCheck.screenId) : null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    startedVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 0.6;
  };
  const trackedScreens = ${inlineScreens};
  let lastScreenId = '';
  // 화면이 실제로 눈에 보이는 넓이.
  // 프로토타입은 보통 폰 프레임(overflow:hidden) 안에서 화면을 옆으로 밀어 감춰요.
  // 그래서 브라우저 창만 보면 안 되고, 조상이 잘라내는 상자와 투명도까지 따라 올라가야 합니다.
  const visibleArea = (el) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const own = window.getComputedStyle(el);
    if (own.display === 'none' || own.visibility === 'hidden') return 0;
    let opacity = Number(own.opacity);
    if (!(opacity > 0)) return 0;
    let top = rect.top;
    let bottom = rect.bottom;
    let left = rect.left;
    let right = rect.right;
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      opacity *= Number(style.opacity) || 0;
      if (!(opacity > 0)) return 0;
      if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const box = node.getBoundingClientRect();
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
    }
    top = Math.max(top, 0);
    left = Math.max(left, 0);
    bottom = Math.min(bottom, window.innerHeight);
    right = Math.min(right, window.innerWidth);
    if (bottom <= top || right <= left) return 0;
    // 흐릿하게 남아 있는 이전 화면이 이기지 않게 투명도로 눌러줍니다
    return (bottom - top) * (right - left) * opacity;
  };
  // 지금 가장 크게 보이는 화면이 바뀌면 그때만 기록해요
  const checkScreen = () => {
    if (!trackedScreens.length) return;
    let best = null;
    let bestArea = 0;
    trackedScreens.forEach((screen) => {
      const area = visibleArea(findScreenEl(screen.id));
      if (area > bestArea) { bestArea = area; best = screen; }
    });
    if (!best || best.id === lastScreenId) return;
    lastScreenId = best.id;
    send('screen-view', { ...pageInfo(), screenId: best.id, screenTitle: best.title });
  };
  const checkPage = () => {
    if (successSent || successCheck.mode !== 'page-reach') return;
    const info = pageInfo();
    // 업로드한 HTML은 화면 전환 방식이 제각각이라 세 가지를 다 봅니다
    const id = successCheck.screenId;
    if (id) {
      let hashId = '';
      try { hashId = decodeURIComponent(window.location.hash.replace(/^#/, '')); } catch (e) { hashId = window.location.hash.replace(/^#/, ''); }
      if (hashId === id) {
        markSuccess('page-reach', { ...info, matchedTarget: id, matchedBy: 'hash' });
        return;
      }
      const el = findScreenEl(id);
      if (el && !startedVisible) {
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0
          && rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.2;
        if (visible) {
          markSuccess('page-reach', { ...info, matchedTarget: id, matchedBy: 'visible' });
          return;
        }
      }
    }
    if (!successCheck.pageTarget) return;
    const candidates = [info.pageTitle, info.pagePath, info.pageUrl, window.location.pathname, window.location.hash];
    if (candidates.some((candidate) => includesTarget(candidate, successCheck.pageTarget))) {
      markSuccess('page-reach', { ...info, matchedTarget: successCheck.pageTarget, matchedBy: 'text' });
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
    checkScreen();
  };
  // 첫 화면도 '본 화면'으로 남겨야 도달 흐름이 맞아요
  const bootTracker = () => {
    noteInitialVisibility();
    send('page-view', pageInfo());
    checkPage();
    checkScreen();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTracker);
  else bootTracker();
  window.addEventListener('hashchange', reportPageView);
  window.addEventListener('popstate', reportPageView);
  // 해시 없이 보여주기/숨기기로 화면을 바꾸는 HTML도 있어요
  window.addEventListener('scroll', () => { checkPage(); checkScreen(); }, { passive: true });
  // 전환에 애니메이션이 걸린 경우가 있어 몇 번 나눠 재요
  document.addEventListener('click', () => {
    [120, 450, 900].forEach((delay) => window.setTimeout(() => { checkPage(); checkScreen(); }, delay));
  }, true);
  // 클릭 말고 타이머로 화면을 넘기는 프로토타입도 있어요
  window.setInterval(checkScreen, 500);
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

    // 화면 변화를 통째로 기록해요. 재생할 때 그대로 되살립니다.
    const recorder = record ? `
<script src="${location.origin}/vendor/rrweb.min.js"><\/script>
<script>
(() => {
  if (!window.rrweb) return;
  const MAX = 4000;              // 이벤트 상한 — 너무 길면 앞쪽을 버려요
  const buffer = [];
  window.rrweb.record({
    emit(event) {
      buffer.push(event);
      if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
    },
    sampling: { mousemove: 50, scroll: 100, input: 'last' },
    recordCanvas: false,
    collectFonts: false
  });
  // 부모가 달라고 할 때 한 번에 넘겨요
  window.addEventListener('message', (event) => {
    if (event.data !== 'yoti-replay-flush') return;
    window.parent.postMessage({ source: 'yoti-html-runtime', kind: 'replay-events', detail: { events: buffer }, at: Date.now() }, '*');
  });
})();
<\/script>` : '';

    let prepared = source;
    if (!/<meta[^>]+name=["']viewport["']/i.test(prepared)) {
      const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      prepared = /<head[^>]*>/i.test(prepared)
        ? prepared.replace(/<head([^>]*)>/i, `<head$1>${viewport}`)
        : viewport + prepared;
    }
    return /<\/body>/i.test(prepared)
      ? prepared.replace(/<\/body>/i, `${tracker}${recorder}</body>`)
      : prepared + tracker + recorder;
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
    $$('.nav-item[data-view-target]').forEach((item) => {
      const projectDetail = name === 'html-preview';
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
    button.addEventListener('click', () => {
      showView(button.dataset.viewTarget);
      if (button.dataset.viewTarget === 'participants') loadParticipants();
    });
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
    window.setTimeout(() => {
      const focusable = $(focusableSelector, backdrop);
      focusable?.focus();
    }, 0);
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
  const aiBrief = $('#ai-brief');   // 요령이에게 주는 지시 — 참여자 과업과 다릅니다
  const utTypeLabels = {
    'page-reach': '특정 페이지 도달',
    quiz: '퀴즈형',
    ab: 'A/B 테스트',   // 예전 데이터
    none: '조건 없음'
  };
  // A/B 여부는 성공 조건과 별개 축이에요
  const isAbProject = (project) => project?.mode === 'ab' || project?.utType === 'ab';
  const utTypeBadges = (project) => {
    const type = project?.utType === 'ab' ? 'none' : project?.utType;
    const badges = [];
    if (isAbProject(project)) badges.push('<span class="badge badge-purple">A/B</span>');
    if (type) badges.push(`<span class="badge badge-blue">${utTypeLabels[type] || 'UT'}</span>`);
    return badges.join('');
  };
  let formStep = 1;

  // 생성된 프로토타입과 UT 설정을 모아두는 임시 공간
  let draft = null;
  const emptyDraft = () => ({
    method: 'ai', task: '', html: '', screens: [], fileName: '', fileSize: 0,
    htmlB: '', screensB: [], targetScreen: null, targetScreenB: null, mode: 'single', questions: [],
    figmaUrl: '', figmaEmbed: '', figmaUrlB: '', figmaEmbedB: '', device: 'mobile'
  });

  const selectedMethod = () => $('input[name="method"]:checked', createForm)?.value || 'ai';
  const selectedUtType = () => $('input[name="ut-type"]:checked', createForm)?.value || '';
  const selectedUtMode = () => $('input[name="ut-mode"]:checked', createForm)?.value || 'single';
  const isAbMode = () => selectedUtMode() === 'ab';

  const utDetailInputs = () => ({
    'page-reach': [],
    quiz: [$('#ut-quiz-question'), $('#ut-quiz-answer')],
    ab: [],
    none: []
  });

  // B안이 준비되면 큰 업로드 영역은 접어요
  const syncAbFilled = () => {
    const ready = Boolean(draft?.htmlB);
    $('.ab-file-mode')?.classList.toggle('is-filled', ready);
    $('.ab-ai-mode')?.classList.toggle('is-filled', ready);
  };

  // A/B의 B안은 방식마다 받는 게 달라요
  const syncAbMode = () => {
    const method = draft?.method || selectedMethod();
    $('.ab-file-mode')?.toggleAttribute('hidden', method !== 'html');
    $('.ab-figma-mode')?.toggleAttribute('hidden', method !== 'figma');
    const ai = $('.ab-ai-mode');
    if (ai) ai.hidden = method !== 'ai';
    syncAbFilled();
  };

  // 성공·실패가 갈리는 UT만 문구를 두 개 받아요
  const judgesOutcome = (type) => type === 'page-reach' || type === 'quiz';

  const syncUtType = () => {
    const type = selectedUtType();
    const ab = isAbMode();
    if (draft) draft.mode = ab ? 'ab' : 'single';
    $('.completion-message-fields')?.classList.toggle('is-judged', judgesOutcome(type));
    $$('.success-condition-option, .ut-mode-option', createForm).forEach((option) => {
      option.classList.toggle('is-selected', Boolean($('input', option)?.checked));
    });
    $$('[data-ut-detail]', createForm).forEach((detail) => {
      detail.hidden = detail.dataset.utDetail !== type;
    });
    // B안 준비는 성공 조건과 별개예요
    const abFieldset = $('.ab-setup-fieldset');
    if (abFieldset) abFieldset.hidden = !ab;
    $('.screen-picker-b-wrap')?.toggleAttribute('hidden', !ab);
    $('.screen-picker-label')?.replaceChildren(...(ab
      ? [document.createTextNode('A안 목표 화면 '), Object.assign(document.createElement('span'), { textContent: '필수' })]
      : [document.createTextNode('목표 화면 '), Object.assign(document.createElement('span'), { textContent: '필수' })]));
    if (type === 'page-reach') renderScreenPicker();
    if (ab) syncAbMode();
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

  const STEP_TITLES = {
    1: '어떤 프로토타입으로 테스트할까요?',
    3: '무엇을 성공으로 볼까요?',
    4: '참여자에게 어떤 과업을 줄까요?',
    5: '끝나고 무엇을 물어볼까요?'
  };
  // 2단계는 고른 방식마다 물어볼 게 달라요
  const STEP2_TITLES = {
    ai: '어떤 화면을 만들까요?',
    figma: '어떤 Figma 프로토타입인가요?',
    html: '어떤 HTML을 실행할까요?'
  };
  const stepTitle = (step) => (step === 2 ? STEP2_TITLES[selectedMethod()] || STEP2_TITLES.ai : STEP_TITLES[step] || '');

  const updateFormStep = () => {
    formSteps.forEach((step) => step.classList.toggle('is-visible', Number(step.dataset.formStep) === formStep));
    // 3단계는 생성 직후라 되돌아갈 수 없어요. 수정 중에 그대로 넘어온 경우는 예외예요.
    formBack.disabled = formStep === 1
      || (formStep === 2 && skippedMethodStep)
      || (formStep === 3 && !keepsExistingPrototype());
    const buildLabels = { ai: '요령이에게 만들기', figma: '테스트 만들기', html: 'HTML 가져오기' };
    formNext.textContent =
      formStep === 2 ? (keepsExistingPrototype() ? '이 프로토타입 그대로' : buildLabels[selectedMethod()])
      : formStep === 5 ? (editingProject ? '수정 저장' : 'UT 링크 만들기')
      : '다음';
    // 단계 제목은 모달 헤더가 도맡아요 (각 단계 안에는 제목을 두지 않아요)
    const modalTitle = $('[data-modal="create"] .modal-header h2');
    const modalStep = $('[data-modal="create"] .modal-step-label');
    if (modalTitle) modalTitle.textContent = stepTitle(formStep);
    if (modalStep) modalStep.textContent = `${editingProject ? 'UT 수정' : '새 사용자 테스트'} · ${formStep}/${formSteps.length}`;
    const firstField = $(focusableSelector, formSteps[formStep - 1]);
    firstField?.focus({ preventScroll: true });
  };

  // 수정 중인데 방식·프롬프트·파일을 안 건드렸으면 다시 만들 필요가 없어요
  const keepsExistingPrototype = () => {
    if (!editingProject) return false;
    const method = selectedMethod();
    if (method !== (editingProject.method || 'html')) return false;
    if (method === 'ai') return (aiBrief?.value.trim() || '') === (editingProject.brief || '') && aiImages.length === 0;
    if (method === 'html') return importedHtmlSource === (editingProject.html || '');
    if (method === 'figma') return $('#figma-url').value.trim() === (editingProject.figmaUrl || '');
    return false;
  };

  const resetErrors = () => {
    [taskInput, aiBrief, $('#figma-url'), ...Object.values(utDetailInputs()).flat()].forEach((input) => {
      input?.classList.remove('is-error');
      input?.removeAttribute('aria-invalid');
    });
    $$('.field-error', createForm).forEach((error) => error.classList.remove('is-visible'));
  };

  const validateStep = () => {
    resetErrors();

    if (formStep === 1) return true;

    if (formStep === 2) {
      const method = selectedMethod();
      if (keepsExistingPrototype()) return true;
      if (method === 'ai') {
        const ok = Boolean(aiBrief.value.trim());
        aiBrief.classList.toggle('is-error', !ok);
        $('#ai-brief-error').classList.toggle('is-visible', !ok);
        if (!ok) aiBrief.focus();
        return ok;
      }
      if (method === 'figma') {
        const input = $('#figma-url');
        const embed = figmaEmbedUrl(input.value);
        if (!embed) {
          const error = $('.figma-url-error');
          if (error) { error.textContent = 'figma.com 프로토타입 링크를 넣어주세요.'; error.hidden = false; }
          input.focus();
          return false;
        }
        return true;
      }
      if (method === 'html' && !importedHtmlSource) {
        const uploadError = $('.html-upload-error');
        uploadError.textContent = '실행 가능한 HTML 파일을 선택해주세요.';
        uploadError.hidden = false;
        $('#html-file').focus();
        return false;
      }
      return true;
    }

    if (formStep === 3) {
      const type = selectedUtType();
      const error = $('#ut-type-error');
      if (!type) {
        error.textContent = 'UT 유형을 선택해주세요.';
        error.classList.add('is-visible');
        return false;
      }
      const ab = isAbMode();
      // B안 프로토타입이 있어야 B안 목표 화면을 고를 수 있어요
      if (ab && draft?.method === 'figma' && !draft?.figmaEmbedB) {
        error.textContent = '비교할 B안 Figma 링크를 넣어주세요.';
        error.classList.add('is-visible');
        $('#ab-figma-url')?.focus();
        return false;
      }
      if (ab && draft?.method !== 'figma' && !draft?.htmlB) {
        error.textContent = draft?.method === 'html'
          ? '비교할 B안 HTML 파일을 올려주세요.'
          : 'B안 이미지를 올리고 프로토타입을 만들어주세요.';
        error.classList.add('is-visible');
        return false;
      }
      if (type === 'page-reach' && !draft?.targetScreen) {
        error.textContent = draft?.screens?.length
          ? `참여자가 도달해야 할 ${ab ? 'A안 ' : ''}목표 화면을 골라주세요.`
          : '도달하면 성공으로 볼 화면 이름이나 주소를 적어주세요.';
        error.classList.add('is-visible');
        $('#ut-manual-target')?.focus();
        return false;
      }
      if (ab && type === 'page-reach' && !draft?.targetScreenB) {
        error.textContent = draft?.screensB?.length
          ? 'B안에서 도달해야 할 목표 화면도 골라주세요.'
          : 'B안에서 도달하면 성공으로 볼 화면 이름이나 주소를 적어주세요.';
        error.classList.add('is-visible');
        $('#ut-manual-target-b')?.focus();
        return false;
      }
      if (type === 'quiz') {
        const empty = [$('#ut-quiz-question'), $('#ut-quiz-answer')].filter((el) => !el.value.trim());
        if (empty.length) {
          error.textContent = '퀴즈 질문과 정답을 모두 입력해주세요.';
          error.classList.add('is-visible');
          empty.forEach((el) => { el.classList.add('is-error'); el.setAttribute('aria-invalid', 'true'); });
          empty[0].focus();
          return false;
        }
      }
      return true;
    }

    if (formStep === 4) {
      const ok = Boolean(taskInput.value.trim());
      taskInput.classList.toggle('is-error', !ok);
      $('#task-error').classList.toggle('is-visible', !ok);
      if (!ok) taskInput.focus();
      return ok;
    }

    if (formStep === 5) {
      const empty = draft.questions.find((q) => !q.title.trim());
      const error = $('#question-error');
      if (empty) {
        error.textContent = '질문 내용을 입력하거나 삭제해주세요.';
        error.classList.add('is-visible');
        return false;
      }
      const emptyChoice = draft.questions.find((q) => q.type === 'choice' && q.choices.filter((c) => c.trim()).length < 2);
      if (emptyChoice) {
        error.textContent = '선택지는 두 개 이상 적어주세요.';
        error.classList.add('is-visible');
        return false;
      }
      return true;
    }

    return true;
  };

  // skipMethod: 메인에서 방식을 이미 골랐으면 1단계를 건너뛰어요
  const openCreate = (method = 'ai', opener, { skipMethod = false } = {}) => {
    editingProject = null;
    createForm.reset();
    importedHtmlSource = '';
    importedHtmlFile = null;
    $('#html-file').value = '';
    $('.uploaded-file').hidden = true;
    $('.html-upload-error').hidden = true;
    clearAiImages();
    if (aiBrief) aiBrief.value = '';
    ['#completion-message', '#completion-success-message', '#completion-fail-message']
      .forEach((selector) => { const field = $(selector); if (field) field.value = ''; });
    skippedMethodStep = skipMethod;
    formStep = skipMethod ? 2 : 1;
    draft = emptyDraft();
    draft.method = method;
    $$('input[name="ut-type"]', createForm).forEach((radio) => { radio.checked = false; });
    const singleMode = $('input[name="ut-mode"][value="single"]', createForm);
    if (singleMode) singleMode.checked = true;
    ['#ut-quiz-question', '#ut-quiz-answer'].forEach((sel) => { const el = $(sel); if (el) el.value = ''; });
    clearAbImages();
    renderQuestions();
    syncMethod(method);
    syncUtType();
    updateFormStep();
    openModal('create', opener);
    window.setTimeout(() => $(focusableSelector, formSteps[0])?.focus(), 50);
  };

  // 만든 UT를 그대로 불러와 고칩니다
  const openEditProject = (project, opener) => {
    openCreate(project.method || 'html', opener);
    skippedMethodStep = false;
    editingProject = project;

    draft = emptyDraft();
    draft.method = project.method || 'html';
    draft.html = project.html || '';
    draft.htmlB = project.htmlB || '';
    draft.screens = project.screens || [];
    draft.screensB = project.screensB || [];
    draft.fileName = project.fileName || '';
    draft.fileSize = project.fileSize || 0;
    draft.figmaUrl = project.figmaUrl || '';
    draft.figmaEmbed = project.figmaEmbed || '';
    draft.figmaEmbedB = project.figmaEmbedB || '';
    draft.questions = (project.questions || []).map((question) => ({
      id: question.id || makeId('q'),
      type: question.type || 'text',
      title: question.title || '',
      choices: [...(question.choices || [])]
    }));
    const reach = project.config?.pageReach;
    if (reach?.screenId) draft.targetScreen = { id: reach.screenId, title: reach.screenTitle || reach.screenId };
    if (reach?.screenIdB) draft.targetScreenB = { id: reach.screenIdB, title: reach.screenTitleB || reach.screenIdB };
    // 예전 UT는 utType이 'ab'였어요
    draft.mode = (project.mode === 'ab' || project.utType === 'ab') ? 'ab' : 'single';

    // 이미 만들어진 프로토타입은 그대로 씁니다
    if (draft.method === 'html') {
      importedHtmlSource = draft.html;
      importedHtmlFile = null;
      const uploaded = $('.uploaded-file');
      uploaded.hidden = false;
      $('strong', uploaded).textContent = draft.fileName || 'index.html';
      $('small', uploaded).textContent = `${Math.max(1, Math.round(draft.fileSize / 1024))}KB · 화면 ${draft.screens.length}개`;
    }
    if (aiBrief) aiBrief.value = project.brief || '';
    const figmaInput = $('#figma-url');
    if (figmaInput) figmaInput.value = draft.figmaUrl;
    const abFigma = $('#ab-figma-url');
    if (abFigma) abFigma.value = project.figmaUrlB || '';
    if (draft.htmlB) {
      const nameBox = $('.ab-file-name');
      if (nameBox) { nameBox.hidden = false; nameBox.textContent = `기존 B안 · 화면 ${draft.screensB.length}개`; }
    }

    taskInput.value = project.goal || '';
    const completionFields = {
      '#completion-message': project.completionMessage,
      '#completion-success-message': project.successMessage,
      '#completion-fail-message': project.failMessage,
    };
    Object.entries(completionFields).forEach(([selector, value]) => {
      const field = $(selector);
      if (field) field.value = value || '';
    });
    const savedType = project.utType === 'ab' ? 'none' : (project.utType || 'none');
    const typeRadio = $(`input[name="ut-type"][value="${savedType}"]`, createForm);
    if (typeRadio) typeRadio.checked = true;
    const modeRadio = $(`input[name="ut-mode"][value="${draft.mode}"]`, createForm);
    if (modeRadio) modeRadio.checked = true;
    const quizQ = $('#ut-quiz-question');
    const quizA = $('#ut-quiz-answer');
    if (quizQ) quizQ.value = project.config?.quiz?.question || '';
    if (quizA) quizA.value = project.config?.quiz?.answer || '';
    const timeout = $('#ut-timeout');
    if (timeout) timeout.value = reach?.timeoutSec || 180;

    syncMethod(draft.method);
    syncUtType();
    renderQuestions();
    updateFormStep();
  };

  $('.html-edit-button')?.addEventListener('click', (event) => {
    if (!activeHtmlProject) return;
    openEditProject(activeHtmlProject, event.currentTarget);
  });

  $$('.create-test-button').forEach((button) => button.addEventListener('click', () => openCreate('ai', button)));
  $$('[data-create-method]').forEach((button) => button.addEventListener('click', () => openCreate(button.dataset.createMethod, button, { skipMethod: true })));

  $$('input[name="method"]', createForm).forEach((radio) => {
    radio.addEventListener('change', () => {
      syncMethod(radio.value);
      if (formStep === 2) updateFormStep();
    });
  });
  $$('input[name="ut-type"], input[name="ut-mode"]', createForm).forEach((radio) => {
    radio.addEventListener('change', () => { syncUtType(); updateFormStep(); });
  });

  taskInput.addEventListener('blur', () => {
    if (taskInput.value.trim()) {
      taskInput.classList.remove('is-error');
      $('#task-error').classList.remove('is-visible');
    }
  });
  aiBrief?.addEventListener('input', () => {
    if (aiBrief.value.trim()) {
      aiBrief.classList.remove('is-error');
      $('#ai-brief-error').classList.remove('is-visible');
    }
    if (formStep === 2) updateFormStep();
  });
  Object.values(utDetailInputs()).flat().filter(Boolean).forEach((input) => {
    input.addEventListener('blur', () => {
      if (!input.value.trim()) return;
      input.classList.remove('is-error');
      input.removeAttribute('aria-invalid');
      $('#ut-type-error').classList.remove('is-visible');
    });
  });

  formBack.addEventListener('click', () => {
    if (formStep > 1) {
      formStep -= 1;
      updateFormStep();
    }
  });

  // 생성 모달의 3단계 표시를 갱신합니다 (마크업은 그대로 씁니다)
  const setGenerationStep = (generating, steps, index, message) => {
    const copy = $('.generation-copy', generating);
    if (message) copy.textContent = message;
    $$('li', generating).forEach((item, i) => {
      const label = steps[i];
      if (i < index) {
        item.classList.add('is-done');
        item.innerHTML = `<svg><use href="#i-check"></use></svg>${label}`;
      } else if (i === index) {
        item.classList.remove('is-done');
        item.innerHTML = `<span class="mini-spinner"></span>${label}`;
      } else {
        item.classList.remove('is-done');
        item.innerHTML = `<span></span>${label}`;
      }
    });
  };

  const markAllGenerationStepsDone = (generating, steps) => {
    $$('li', generating).forEach((item, i) => {
      item.classList.add('is-done');
      item.innerHTML = `<svg><use href="#i-check"></use></svg>${steps[i]}`;
    });
  };

  // 서버에서 SSE로 오는 생성 진행 상황을 읽습니다
  const streamGeneration = async (payload, onEvent) => {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok || !response.body) {
      throw new Error('생성 서버에 연결하지 못했어요.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const eventName = frame.match(/^event: (.+)$/m)?.[1];
        const dataLine = frame.match(/^data: ([\s\S]+)$/m)?.[1];
        if (!eventName || !dataLine) continue;
        let parsed;
        try { parsed = JSON.parse(dataLine); } catch { continue; }
        onEvent(eventName, parsed);
      }
    }
  };

  // ── 참고 화면 이미지 ─────────────────────────────────────────────
  const AI_IMAGE_MAX = 30;
  const AI_IMAGE_EDGE = 1568;   // 긴 변 기준. 글자가 읽히면서 요청도 가벼운 크기예요

  const showAiImageError = (message) => {
    const box = $('.ai-upload-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  };

  // 파일을 이미지 엘리먼트로 읽어요. createImageBitmap은 환경에 따라 안 끝나는 경우가 있어요.
  const loadImageFile = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('이미지를 여는 데 너무 오래 걸려요'));
    }, 15000);
    image.onload = () => { window.clearTimeout(timer); cleanup(); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); cleanup(); reject(new Error('이미지를 열지 못했어요')); };
    image.src = url;
  });

  // 캔버스로 줄여서 JPEG로 담습니다. 원본 그대로 보내면 요청이 너무 커져요.
  const prepareAiImage = async (file) => {
    const image = await loadImageFile(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error('이미지 크기를 읽지 못했어요');
    const scale = Math.min(1, AI_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return {
      name: file.name,
      width,
      height,
      dataUrl,
      mediaType: 'image/jpeg',
      data: dataUrl.slice(dataUrl.indexOf(',') + 1)
    };
  };

  const thumbMarkup = (images, removeAttr) => images.map((image, index) => `
    <span class="thumb-item">
      <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
      <span class="thumb-order">${index + 1}</span>
      <button type="button" class="thumb-remove" ${removeAttr}="${index}" aria-label="${escapeHtml(image.name)} 빼기"><svg><use href="#i-close"></use></svg></button>
    </span>`).join('');

  const refreshBuildLabel = () => { if (formStep === 2) updateFormStep(); };

  const renderAiImages = () => {
    const list = $('.ai-image-list');
    if (!list) return;
    refreshBuildLabel();
    list.hidden = aiImages.length === 0;
    list.className = 'ai-image-list thumb-list';
    list.innerHTML = thumbMarkup(aiImages, 'data-remove-ai-image');
  };

  const clearAiImages = () => {
    aiImages = [];
    const input = $('#ai-images');
    if (input) input.value = '';
    showAiImageError('');
    renderAiImages();
  };

  const addAiImages = async (fileList) => {
    const picked = [...fileList].filter((file) => file.type.startsWith('image/'));
    if (!picked.length) {
      showAiImageError('이미지 파일만 올릴 수 있어요.');
      return;
    }
    const room = AI_IMAGE_MAX - aiImages.length;
    if (room <= 0) {
      showAiImageError(`화면 이미지는 최대 ${AI_IMAGE_MAX}장까지 올릴 수 있어요.`);
      return;
    }
    const tooBig = picked.find((file) => file.size > 20 * 1024 * 1024);
    if (tooBig) {
      showAiImageError(`${tooBig.name}은 20MB가 넘어요. 더 작은 이미지를 올려주세요.`);
      return;
    }
    showAiImageError(picked.length > room ? `${AI_IMAGE_MAX}장까지만 담았어요.` : '');
    for (const file of picked.slice(0, room)) {
      try {
        aiImages.push(await prepareAiImage(file));
      } catch (error) {
        showAiImageError(`${file.name}: ${error.message || '읽지 못했어요'}`);
      }
    }
    renderAiImages();
  };

  $('#ai-images')?.addEventListener('change', async (event) => {
    await addAiImages(event.target.files);
    event.target.value = '';
  });

  $('.ai-image-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-ai-image]');
    if (!button) return;
    aiImages.splice(Number(button.dataset.removeAiImage), 1);
    showAiImageError('');
    renderAiImages();
  });

  // 끌어다 놓기도 받아요
  const aiZone = $('.ai-upload-zone');
  if (aiZone) {
    ['dragenter', 'dragover'].forEach((name) => aiZone.addEventListener(name, (event) => {
      event.preventDefault();
      aiZone.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach((name) => aiZone.addEventListener(name, (event) => {
      event.preventDefault();
      aiZone.classList.remove('is-dragover');
    }));
    aiZone.addEventListener('drop', (event) => {
      if (event.dataTransfer?.files?.length) addAiImages(event.dataTransfer.files);
    });
  }

  // ── 목표 화면 고르기 (진짜 미리보기) ─────────────────────────
  // A안·B안이 같은 모양의 선택기를 써요
  const renderOneScreenPicker = (variant) => {
    const isB = variant === 'B';
    const box = $(isB ? '.screen-picker-b' : '.screen-picker');
    if (!box || !draft) return;
    if (draft.method === 'figma') { if (!isB) renderFigmaPicker(); return; }
    const screens = isB ? (draft.screensB || []) : draft.screens;
    const html = isB ? draft.htmlB : draft.html;
    const target = isB ? draft.targetScreenB : draft.targetScreen;
    const inputId = isB ? 'ut-manual-target-b' : 'ut-manual-target';

    // 화면을 못 찾으면 직접 적어서 성공 조건을 정할 수 있어요
    if (!screens.length) {
      box.innerHTML = `<div class="screen-manual">
        <label class="screen-manual-label" for="${inputId}">도달하면 성공으로 볼 화면</label>
        <input class="screen-manual-input" id="${inputId}" type="text" placeholder="예: 신청 완료 / #complete / /done"
          value="${escapeHtml(target?.id || '')}" autocomplete="off">
        <p class="screen-manual-hint">이 HTML에서는 화면 목록을 자동으로 읽지 못했어요. 화면 제목이나 주소(해시)를 적어주면 그때 성공 처리해요.</p>
      </div>`;
      return;
    }
    box.classList.toggle('is-naming', namingScreens && !isB);
    const previewUrl = URL.createObjectURL(new Blob([html || ''], { type: 'text/html' }));
    if (isB) {
      if (screenPreviewUrlB) URL.revokeObjectURL(screenPreviewUrlB);
      screenPreviewUrlB = previewUrl;
    } else {
      if (screenPreviewUrl) URL.revokeObjectURL(screenPreviewUrl);
      screenPreviewUrl = previewUrl;
    }
    box.innerHTML = screens.map((screen, index) => {
      const selected = target?.id === screen.id;
      return `<button type="button" class="screen-option${selected ? ' is-selected' : ''}" role="radio"
        aria-checked="${selected}" data-screen-id="${escapeHtml(screen.id)}">
        <span class="screen-shot"><iframe src="${previewUrl}#${escapeHtml(screen.id)}" title="" scrolling="no" tabindex="-1" aria-hidden="true"></iframe></span>
        <span class="screen-name"><b>${index + 1}</b>${escapeHtml(screen.title)}</span>
      </button>`;
    }).join('');
    // 카드 폭에 맞춰 미리보기 배율을 잡아요
    const fitScreenShots = () => {
      $$('.screen-option .screen-shot', box).forEach((shot) => {
        const frame = $('iframe', shot);
        if (frame && shot.clientWidth) frame.style.transform = `scale(${shot.clientWidth / 390})`;
      });
    };
    fitScreenShots();
    window.setTimeout(fitScreenShots, 0);
  };

  const renderScreenPicker = () => {
    renderOneScreenPicker('A');
    if (isAbMode()) renderOneScreenPicker('B');
  };

  ['.screen-picker', '.screen-picker-b'].forEach((selector) => {
    const isB = selector === '.screen-picker-b';
    const key = isB ? 'targetScreenB' : 'targetScreen';
    $(selector)?.addEventListener('input', (event) => {
      if (!draft || !event.target.matches('.screen-manual-input')) return;
      const value = event.target.value.trim();
      draft[key] = value ? { id: value, title: value, manual: true } : null;
      $('#ut-type-error').classList.remove('is-visible');
    });
    $(selector)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-screen-id]');
      if (!button || !draft) return;
      const id = button.dataset.screenId;
      const list = isB ? (draft.screensB || []) : draft.screens;
      draft[key] = list.find((sc) => sc.id === id) || null;
      $('#ut-type-error').classList.remove('is-visible');
      renderOneScreenPicker(isB ? 'B' : 'A');
    });
  });

  // B안 HTML 업로드
  $('#ab-html-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const status = $('.ab-status');
    const nameBox = $('.ab-file-name');
    if (!file || !draft) return;
    if (file.size > 10 * 1024 * 1024) {
      status.hidden = false;
      status.textContent = '10MB 이하 HTML만 올릴 수 있어요.';
      return;
    }
    const source = await file.text();
    draft.htmlB = source;
    draft.screensB = detectScreens(source);
    nameBox.hidden = false;
    nameBox.textContent = `${file.name} · 화면 ${draft.screensB.length}개`;
    status.hidden = true;
    $('#ut-type-error').classList.remove('is-visible');
    draft.targetScreenB = null;
    syncAbFilled();
    renderOneScreenPicker('B');
  });

  // B안 Figma 링크
  $('#ab-figma-url')?.addEventListener('input', (event) => {
    if (!draft) return;
    draft.figmaUrlB = event.target.value.trim();
    draft.figmaEmbedB = figmaEmbedUrl(draft.figmaUrlB);
    if (draft.figmaEmbedB) $('#ut-type-error').classList.remove('is-visible');
    renderOneScreenPicker('B');
  });

  // ── A/B: B안 이미지 ─────────────────────────────────────────
  let abImages = [];

  const renderAbImages = () => {
    const list = $('.ab-image-list');
    if (!list) return;
    list.hidden = abImages.length === 0;
    list.className = 'ab-image-list thumb-list';
    list.innerHTML = thumbMarkup(abImages, 'data-remove-ab-image');
  };

  const clearAbImages = () => {
    abImages = [];
    const input = $('#ab-images');
    if (input) input.value = '';
    const status = $('.ab-status');
    if (status) status.hidden = true;
    renderAbImages();
  };

  $('#ab-images')?.addEventListener('change', async (event) => {
    for (const file of [...event.target.files].filter((f) => f.type.startsWith('image/')).slice(0, AI_IMAGE_MAX - abImages.length)) {
      try { abImages.push(await prepareAiImage(file)); } catch {}
    }
    event.target.value = '';
    renderAbImages();
  });

  $('.ab-image-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-ab-image]');
    if (!button) return;
    abImages.splice(Number(button.dataset.removeAbImage), 1);
    renderAbImages();
  });

  $('.ab-build-button')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = $('.ab-status');
    if (!abImages.length) {
      status.textContent = 'B안 화면 이미지를 먼저 올려주세요.';
      status.hidden = false;
      return;
    }
    button.disabled = true;
    button.innerHTML = '<span class="mini-spinner"></span>B안 만드는 중';
    status.hidden = false;
    status.textContent = '요령이가 B안을 만들고 있어요...';
    try {
      const result = await generatePrototype({
        task: aiBrief.value.trim(),
        images: abImages.map(({ mediaType, data, name }) => ({ mediaType, data, name })),
        successMode: 'none'
      }, (message) => { status.textContent = message; });
      draft.htmlB = result.html;
      draft.screensB = result.screens;
      status.textContent = `B안이 준비됐어요 · 화면 ${result.screens.length}개`;
      $('#ut-type-error').classList.remove('is-visible');
      draft.targetScreenB = null;
      syncAbFilled();
      renderOneScreenPicker('B');
    } catch (error) {
      status.textContent = error.message || 'B안을 만들지 못했어요.';
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg><use href="#i-sparkles"></use></svg>B안 프로토타입 만들기';
    }
  });

  // ── 사후 질문 ───────────────────────────────────────────────
  const questionTypeLabels = { text: '주관식', choice: '단일 선택', scale: '1~5점 척도' };

  const renderQuestions = () => {
    const list = $('.question-list');
    if (!list || !draft) return;
    if (!draft.questions.length) {
      list.innerHTML = '<p class="question-empty">아직 질문이 없어요. 아래에서 추가할 수 있어요.</p>';
      return;
    }
    list.innerHTML = draft.questions.map((question, index) => `
      <div class="question-item" data-question-index="${index}">
        <div class="question-item-head">
          <span class="badge badge-gray">${questionTypeLabels[question.type]}</span>
          <button type="button" class="icon-button compact" data-remove-question="${index}" aria-label="질문 삭제"><svg><use href="#i-close"></use></svg></button>
        </div>
        <input type="text" data-question-title="${index}" value="${escapeHtml(question.title)}" maxlength="160" autocomplete="off" placeholder="예: 이 작업을 끝내는 과정은 얼마나 쉬웠나요?" />
        ${question.type === 'choice' ? `<div class="question-choices">${question.choices.map((choice, ci) => `
          <input type="text" data-question-choice="${index}:${ci}" value="${escapeHtml(choice)}" maxlength="60" autocomplete="off" placeholder="선택지 ${ci + 1}" />`).join('')}
          <button type="button" class="text-button" data-add-choice="${index}">선택지 추가</button></div>` : ''}
        ${question.type === 'scale' ? '<small>1점(전혀 아니다)부터 5점(매우 그렇다)까지 답해요.</small>' : ''}
      </div>`).join('');
  };

  $('.question-add-row')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-question]');
    if (!button || !draft) return;
    const type = button.dataset.addQuestion;
    draft.questions.push({
      id: makeId('q'),
      type,
      title: '',
      choices: type === 'choice' ? ['', ''] : []
    });
    $('#question-error').classList.remove('is-visible');
    renderQuestions();
    $$('.question-list [data-question-title]').pop()?.focus();
  });

  $('.question-list')?.addEventListener('click', (event) => {
    if (!draft) return;
    const remove = event.target.closest('[data-remove-question]');
    if (remove) {
      draft.questions.splice(Number(remove.dataset.removeQuestion), 1);
      renderQuestions();
      return;
    }
    const addChoice = event.target.closest('[data-add-choice]');
    if (addChoice) {
      const question = draft.questions[Number(addChoice.dataset.addChoice)];
      if (question.choices.length < 8) question.choices.push('');
      renderQuestions();
    }
  });

  $('.question-list')?.addEventListener('input', (event) => {
    if (!draft) return;
    const title = event.target.dataset.questionTitle;
    if (title !== undefined) { draft.questions[Number(title)].title = event.target.value; return; }
    const choice = event.target.dataset.questionChoice;
    if (choice !== undefined) {
      const [qi, ci] = choice.split(':').map(Number);
      draft.questions[qi].choices[ci] = event.target.value;
    }
  });

  // 생성 요청 한 번을 감싸는 공용 함수 (본 생성 · B안 생성 둘 다 씁니다)
  const generatePrototype = async (payload, onStatus) => {
    let result = null;
    let failure = null;
    await streamGeneration(payload, (eventName, data) => {
      if (eventName === 'status') onStatus?.(data.message, data);
      else if (eventName === 'done') result = data;
      else if (eventName === 'error') failure = data.message;
    }).catch(() => {
      failure = '생성 서버에 연결하지 못했어요. 터미널에서 node server.mjs 로 서버를 켠 뒤 http://localhost:4400 으로 열어주세요.';
    });
    if (failure || !result) throw new Error(failure || '프로토타입을 만들지 못했어요.');
    return {
      html: result.html,
      model: result.model,
      screens: result.screenList || (result.screenTitles || []).map((title, i) => ({ id: `screen-${i + 1}`, title }))
    };
  };

  const runAiGeneration = async (generating, generationText) => {
    const steps = generationText.steps;
    setGenerationStep(generating, steps, 0, generationText.messages[0]);

    let result = null;
    try {
      result = await generatePrototype({
        task: aiBrief.value.trim(),
        images: aiImages.map(({ mediaType, data, name }) => ({ mediaType, data, name })),
        device: 'mobile',
        successMode: 'none'
      }, (message, data) => {
        setGenerationStep(generating, steps, Math.min(data?.step ?? 0, steps.length - 1), message);
      });
    } catch (error) {
      closeModal(generating, false);
      showToast(error.message);
      return;
    }

    markAllGenerationStepsDone(generating, steps);
    draft.html = result.html;
    draft.screens = result.screens;
    draft.fileName = '요령이가 만든 프로토타입';
    draft.fileSize = new Blob([result.html]).size;

    closeModal(generating, false);
    const madeBy = result.model === 'mock' ? ' (목 데이터 — 진짜 AI 아님)' : result.model ? ` · ${result.model}` : '';
    goToUtSetup(`요령이가 화면 ${result.screens.length || 1}개를 만들었어요${madeBy}. 이제 UT 유형을 고를 차례예요.`);
  };

  const startGeneration = () => {
    // 이 단계에선 아직 과업을 안 받았어요. 실제로 하는 일에 맞춰 적습니다.
    const withImages = aiImages.length > 0;
    const generationText = withImages
      ? {
          title: '프로토타입을 만들고 있어요',
          steps: [`올린 화면 ${aiImages.length}장 읽기`, '화면 흐름 짜기', '눌러볼 수 있게 만들기'],
          messages: [
            `올린 화면 ${aiImages.length}장을 살펴보는 중...`,
            '어떤 순서로 이어질지 정하는 중...',
            '버튼과 입력이 실제로 동작하게 연결하는 중...'
          ],
          done: '요령이가 프로토타입을 만들었어요.'
        }
      : {
          title: '프로토타입을 만들고 있어요',
          steps: ['만들 내용 읽기', '화면 흐름 짜기', '눌러볼 수 있게 만들기'],
          messages: [
            '어떤 화면이 필요한지 정하는 중...',
            'YODI 컴포넌트로 화면을 조립하는 중...',
            '버튼과 입력이 실제로 동작하게 연결하는 중...'
          ],
          done: '요령이가 프로토타입을 만들었어요.'
        };
    closeModal(createBackdrop, false);
    openModal('generating', formNext);
    const generating = $('[data-modal="generating"]');
    $('#generating-title').textContent = generationText.title;
    runAiGeneration(generating, generationText);
  };

  // 생성이 끝나면 같은 모달을 3단계로 다시 엽니다
  const goToUtSetup = (message) => {
    formStep = 3;
    syncUtType();
    updateFormStep();
    openModal('create', null);
    if (message) showToast(message);
  };

  // ── Figma 프로토타입 ─────────────────────────────────────────
  const FIGMA_ORIGIN = 'https://www.figma.com';
  // client-id가 없으면 Figma가 이벤트를 안 보내요 (클릭·화면 전환 기록 불가)
  let figmaClientId = '';
  const loadConfig = async () => {
    let config = null;
    try {
      config = await api('/api/config');
      figmaClientId = config.figmaClientId || '';
    } catch (error) { figmaClientId = ''; }
    // 진짜 AI가 아닌 상태면 만들기 전에 알려줘야 해요
    const aiNotice = $('.ai-mode-notice');
    if (aiNotice) {
      const mode = config?.aiMode;
      aiNotice.hidden = mode === 'live';
      aiNotice.classList.toggle('is-warning', mode !== 'live');
      aiNotice.innerHTML = mode === 'mock'
        ? '<svg><use href="#i-settings"></use></svg><span><b>목 모드로 돌고 있어요.</b> 무엇을 적든 똑같은 예시 화면이 나와요. 진짜 AI를 쓰려면 <code>YOTI_MOCK</code> 없이 서버를 다시 켜주세요.</span>'
        : '<svg><use href="#i-settings"></use></svg><span><b>API 키가 없어요.</b> <code>OPENAI_API_KEY</code>를 넣고 서버를 다시 켜주세요.</span>';
    }
    // Figma 방식은 지금 UI에 없어요. 나중에 되살리면 이 안내가 다시 붙습니다.
    const notice = $('.figma-client-notice');
    if (notice) {
      notice.hidden = false;
      notice.classList.toggle('is-warning', !figmaClientId);
      notice.innerHTML = figmaClientId
        ? '<svg><use href="#i-check"></use></svg>Figma 앱이 연결돼 있어요. 클릭과 화면 이동을 자동으로 기록해요.'
        : '<svg><use href="#i-settings"></use></svg>Figma 앱 client-id가 없어요. 프로토타입은 보이지만 <b>클릭·도달 기록이 안 돼요.</b> figma.com/developers/apps 에서 앱을 만들고 <code>YOTI_FIGMA_CLIENT_ID</code>로 서버를 켜주세요.';
    }
  };

  // 공유 링크를 Embed Kit 2.0 주소로 바꿔요
  const figmaEmbedUrl = (rawUrl) => {
    let url;
    try { url = new URL(String(rawUrl).trim()); } catch (error) { return ''; }
    if (!/(^|\.)figma\.com$/.test(url.hostname)) return '';
    const match = url.pathname.match(/^\/(?:proto|design|file)\/([A-Za-z0-9]+)(?:\/([^/]*))?/);
    if (!match) return '';
    const embed = new URL(`https://embed.figma.com/proto/${match[1]}/${match[2] || 'prototype'}`);
    ['node-id', 'starting-point-node-id', 'page-id', 'scaling', 'content-scaling', 't'].forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) embed.searchParams.set(key, value);
    });
    embed.searchParams.set('embed-host', 'yoti');
    embed.searchParams.set('hide-ui', '1');
    if (figmaClientId) embed.searchParams.set('client-id', figmaClientId);
    return embed.toString();
  };

  const normalizeFigmaNode = (nodeId) => String(nodeId || '').replace(/-/g, ':');

  // 목표 화면을 고르는 동안 프로토타입에서 오는 화면 전환을 받아둬요
  let figmaPickerNode = null;
  const renderFigmaPicker = () => {
    const box = $('.screen-picker');
    if (!box || !draft) return;
    const picked = draft.targetScreen;
    box.innerHTML = `<div class="figma-picker">
      <iframe class="figma-picker-frame" title="Figma 프로토타입 미리보기" src="${escapeHtml(draft.figmaEmbed)}" allowfullscreen></iframe>
      <div class="figma-picker-side">
        <p class="figma-picker-hint">${figmaClientId
          ? '프로토타입을 눌러 목표로 삼을 화면까지 이동한 뒤, 아래 버튼을 눌러주세요.'
          : 'client-id가 없어 화면을 자동으로 읽지 못해요. Figma에서 목표 화면의 node-id를 복사해 아래에 붙여주세요.'}</p>
        ${figmaClientId ? '' : `<input class="screen-manual-input" id="figma-node-manual" type="text" autocomplete="off"
          placeholder="예: 3:2001" value="${escapeHtml(picked?.id || '')}">`}
        <p class="figma-picker-current">현재 화면 · <b>${picked ? escapeHtml(picked.title) : '아직 없음'}</b></p>
        <button type="button" class="button button-secondary full-width figma-pick-button">이 화면을 목표로 지정</button>
        <label class="figma-picker-name" for="figma-target-name">화면 이름</label>
        <input class="screen-manual-input" id="figma-target-name" type="text" maxlength="40" autocomplete="off"
          placeholder="예: 신청 완료" value="${escapeHtml(picked?.title || '')}">
      </div>
    </div>`;
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== FIGMA_ORIGIN || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'PRESENTED_NODE_CHANGED') {
      figmaPickerNode = normalizeFigmaNode(event.data.data?.presentedNodeId);
    }
  });

  $('.screen-picker')?.addEventListener('input', (event) => {
    if (!draft || !event.target.matches('#figma-node-manual')) return;
    figmaPickerNode = normalizeFigmaNode(event.target.value.trim());
  });

  $('.screen-picker')?.addEventListener('click', (event) => {
    if (!draft || !event.target.closest('.figma-pick-button')) return;
    if (!figmaPickerNode) {
      showToast(figmaClientId ? '프로토타입에서 화면을 한 번 이동한 뒤 지정해주세요.' : '목표 화면의 node-id를 먼저 적어주세요.');
      return;
    }
    const name = $('#figma-target-name')?.value.trim();
    draft.targetScreen = { id: figmaPickerNode, title: name || `화면 ${figmaPickerNode}` };
    $('#ut-type-error').classList.remove('is-visible');
    renderFigmaPicker();
    showToast('이 화면을 목표로 지정했어요.');
  });

  $('.screen-picker')?.addEventListener('input', (event) => {
    if (!draft || !event.target.matches('#figma-target-name') || !draft.targetScreen) return;
    draft.targetScreen.title = event.target.value.trim() || draft.targetScreen.id;
  });

  // 업로드한 HTML은 우리 규칙(data-screen)을 지킬 이유가 없어요. 화면을 여러 방법으로 찾습니다.
  const detectScreens = (source) => {
    let doc;
    try { doc = new DOMParser().parseFromString(source, 'text/html'); } catch (error) { return []; }
    const found = new Map();
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const sampleOf = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const push = (id, title, el) => {
      const key = clean(id);
      if (!key || found.has(key)) return;
      found.set(key, { id: key, title: clean(title) || key, sample: sampleOf(el) });
    };
    // 화면 이름 찾기 — 제목처럼 보이는 '텍스트'만 씁니다.
    // 컨테이너를 잡으면 자식 글이 다 붙어버려요 (예: "거의 다 왔어요!나에 대해 알려주세요")
    const textOf = (el) => {
      if (!el) return '';
      // 자식 요소가 있으면 제목이 아니라 묶음이에요
      if (el.children.length) return '';
      return el.textContent || '';
    };
    const headingOf = (el) => {
      if (!el?.querySelectorAll) return '';
      for (const candidate of el.querySelectorAll('h1, h2, h3, [class*="title"], [class*="Title"]')) {
        const text = textOf(candidate);
        if (text.trim()) return text;
      }
      // 제목 태그가 없으면 화면 안의 첫 문장을 써요
      for (const candidate of el.querySelectorAll('p, span, div, strong, li, button, a')) {
        const text = textOf(candidate);
        if (text.trim().length >= 2) return text;
      }
      return '';
    };
    const labelOf = (el, fallback) => el?.getAttribute?.('data-title')
      || el?.getAttribute?.('aria-label')
      || headingOf(el)
      || fallback;

    // 1) 요령이가 만든 프로토타입 — 우리 규칙
    doc.querySelectorAll('[data-screen]').forEach((el) => push(el.getAttribute('data-screen'), labelOf(el), el));
    if (found.size) return [...found.values()];

    // 2) 해시로 화면을 넘기는 구조 — <a href="#pay"> 가 가리키는 블록
    doc.querySelectorAll('a[href^="#"]').forEach((link) => {
      const raw = link.getAttribute('href').slice(1);
      let id = raw;
      try { id = decodeURIComponent(raw); } catch (error) { id = raw; }
      if (!id || id === 'top') return;
      const el = doc.getElementById(id);
      if (el) push(id, labelOf(el), el);
    });
    if (found.size) {
      // 시작 화면은 아무도 링크하지 않아요. 같은 부모·같은 태그의 형제까지 훑습니다.
      const first = doc.getElementById([...found.keys()][0]);
      [...(first?.parentElement?.children || [])]
        .filter((el) => el.id && el.tagName === first.tagName)
        .forEach((el) => push(el.id, labelOf(el), el));
      // 문서 순서대로 정렬해야 참여자가 보는 흐름과 같아요
      const order = [...doc.querySelectorAll('[id]')].map((el) => el.id);
      return [...found.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }

    // 3) id가 붙은 큰 블록 — 한 장에 여러 화면을 넣어둔 경우
    doc.querySelectorAll('section[id], main[id], article[id], [data-page], [data-view], [class*="screen"][id], [class*="page"][id]')
      .forEach((el) => push(el.id || el.getAttribute('data-page') || el.getAttribute('data-view'), labelOf(el), el));
    return [...found.values()];
  };

  // Figma도 같은 자리로 들어옵니다
  const importFigmaToDraft = () => {
    draft.method = 'figma';
    draft.figmaUrl = $('#figma-url').value.trim();
    draft.figmaEmbed = figmaEmbedUrl(draft.figmaUrl);
    draft.html = '';
    draft.screens = [];
    draft.fileName = 'Figma 프로토타입';
    draft.fileSize = 0;
    figmaPickerNode = null;
    goToUtSetup('Figma 프로토타입을 연결했어요. 이제 UT 유형을 고를 차례예요.');
  };

  // 업로드한 HTML도 같은 자리로 들어옵니다
  // 뽑아낸 이름을 요령이가 알아보기 쉽게 다듬어요
  let namingScreens = false;
  const refineScreenNames = async () => {
    const screens = draft?.screens || [];
    if (!screens.length) return;
    // 이 초안이 아직 살아 있을 때만 반영해요 (저장하고 나면 늦게 온 결과는 버립니다)
    const target = draft;
    namingScreens = true;
    if (selectedUtType() === 'page-reach') renderScreenPicker();
    try {
      const { names } = await api('/api/screen-names', {
        method: 'POST',
        body: { screens: screens.map(({ id, title, sample }) => ({ id, title, sample })) }
      });
      if (draft !== target) return;
      let changed = 0;
      draft.screens = screens.map((screen) => {
        const next = names?.[screen.id];
        if (next && next !== screen.title) changed += 1;
        return next ? { ...screen, title: next } : screen;
      });
      // 이미 고른 목표 화면 이름도 같이 갱신해요
      if (draft.targetScreen) {
        const updated = draft.screens.find((screen) => screen.id === draft.targetScreen.id);
        if (updated) draft.targetScreen = { ...draft.targetScreen, title: updated.title };
      }
      if (changed) showToast(`화면 이름 ${changed}개를 알아보기 쉽게 정리했어요.`);
    } catch (error) {
      // 실패하면 원래 이름을 그대로 씁니다
    } finally {
      namingScreens = false;
      if (draft === target) {
        if (selectedUtType() === 'page-reach') renderScreenPicker();
        updateFormStep();
      }
    }
  };

  const importHtmlToDraft = () => {
    draft.method = 'html';
    draft.html = importedHtmlSource;
    draft.screens = detectScreens(importedHtmlSource);
    draft.fileName = importedHtmlFile?.name || 'index.html';
    draft.fileSize = importedHtmlFile?.size || new Blob([importedHtmlSource]).size;
    goToUtSetup(draft.screens.length
      ? `HTML에서 화면 ${draft.screens.length}개를 찾았어요. 이제 UT 유형을 고를 차례예요.`
      : 'HTML을 가져왔어요. 화면은 자동으로 못 읽어서 직접 적어주시면 돼요.');
    refineScreenNames();
  };

  // srcdoc은 부모 주소를 기준으로 삼아요. 프로토타입이 location.replace('#home')를 하거나
  // <a href="#done">을 누르면 요티 앱으로 튕겨버립니다.
  // data: 주소로 띄우면 자기 주소 안에서 해시가 해결되고, sandbox도 그대로 유지돼요.
  // 프로토타입이 어떤 기기 화면인지 — 틀 크기를 정합니다
  const applyDevice = (frame, device) => {
    const stage = frame?.parentElement;
    if (stage) stage.dataset.device = device === 'desktop' || device === 'tablet' ? device : 'mobile';
  };

  const setFrameHtml = (frame, html) => {
    if (!frame) return;
    frame.removeAttribute('srcdoc');
    if (!html) {
      frame.removeAttribute('src');
      return;
    }
    frame.src = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  };

  // 서버에 저장해야 참여자가 링크로 들어올 수 있어요
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !participantMode && path !== '/api/login') {
      // 로그인이 풀렸어요. 하던 화면을 덮고 다시 받습니다.
      onSessionExpired?.();
    }
    if (!response.ok) throw new Error(data.error || '서버와 통신하지 못했어요.');
    return data;
  };
  // 로그인 화면을 만든 뒤에 연결해요
  let onSessionExpired = null;

  const shareLinkFor = (id) => `${location.origin}/t/${id}`;

  // 참여 기록은 서버에 남겨야 만든 사람이 볼 수 있어요
  const saveSession = async (session) => {
    // 만든 사람이 미리 해보는 건 결과에 섞이면 안 돼요
    if (participantPreview) return;
    if (participantMode) session.variant = participantVariant;
    session.utId = session.projectId;   // 서버는 utId로 찾아요
    try {
      await api('/api/sessions', { method: 'POST', body: session });
    } catch (error) {
      if (participantMode) throw error;
      // 만든 사람이 미리 해보는 중이면 서버가 없어도 넘어가요
      await localDb.put(SESSION_STORE, session);
    }
  };

  // 4단계에서 최종 저장
  const saveProject = async () => {
    const type = selectedUtType();
    const ab = isAbMode();
    const task = taskInput.value.trim();
    const project = {
      method: draft.method,
      title: createProjectTitle(task),
      goal: task,
      device: draft.device || 'mobile',
      brief: aiBrief?.value.trim() || '',
      fileName: draft.fileName,
      fileSize: draft.fileSize,
      html: draft.html,
      figmaUrl: draft.figmaUrl,
      figmaEmbed: draft.figmaEmbed,
      figmaEmbedB: ab ? draft.figmaEmbedB : '',
      htmlB: ab ? draft.htmlB : '',
      screens: draft.screens,
      screensB: ab ? draft.screensB : [],
      utType: type,
      mode: ab ? 'ab' : 'single',
      config: {
        pageReach: type === 'page-reach'
          ? {
            screenId: draft.targetScreen?.id || '',
            screenTitle: draft.targetScreen?.title || '',
            screenIdB: ab ? (draft.targetScreenB?.id || '') : '',
            screenTitleB: ab ? (draft.targetScreenB?.title || '') : '',
            timeoutSec: Number($('#ut-timeout')?.value) || 180,
          }
          : null,
        quiz: type === 'quiz'
          ? { question: $('#ut-quiz-question').value.trim(), answer: $('#ut-quiz-answer').value.trim() }
          : null
      },
      completionMessage: $('#completion-message')?.value.trim() || '',
      successMessage: $('#completion-success-message')?.value.trim() || '',
      failMessage: $('#completion-fail-message')?.value.trim() || '',
      questions: draft.questions.filter((q) => q.title.trim()).map((q) => ({
        ...q, title: q.title.trim(), choices: q.choices.filter((c) => c.trim())
      })),
      tasks: collectTasks(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    formNext.disabled = true;
    formNext.innerHTML = '<span class="mini-spinner"></span>저장 중';
    try {
      if (editingProject) {
        // 링크는 그대로 두고 내용만 갈아끼워요
        await api(`/api/uts/${encodeURIComponent(editingProject.id)}`, { method: 'PATCH', body: project });
        activeHtmlProject = { ...editingProject, ...project, id: editingProject.id };
        const editedId = editingProject.id;
        editingProject = null;
        draft = emptyDraft();
        closeModal(createBackdrop, false);
        setResultTab('preview');
        showView('analytics');
        renderImportedProjects();
        renderHtmlPreview(activeHtmlProject);
        renderAnalytics(editedId);
        showToast('UT를 수정했어요. 링크는 그대로예요.');
      } else {
        const saved = await api('/api/uts', { method: 'POST', body: project });
        activeHtmlProject = { ...project, id: saved.id, sessionCount: 0 };
        draft = emptyDraft();
        closeModal(createBackdrop, false);
        // 만들자마자 링크를 보여줍니다. 미리보기 화면은 뒤에서 준비돼요.
        openShareModal(activeHtmlProject);
        setResultTab('preview');
        showView('analytics');
        renderImportedProjects();
        renderHtmlPreview(activeHtmlProject);
        renderAnalytics(activeHtmlProject.id);
      }
    } catch (error) {
      showToast(error.message || 'UT를 저장하지 못했어요. 서버가 켜져 있는지 확인해주세요.');
    } finally {
      formNext.disabled = false;
      updateFormStep();
    }
  };

  formNext.addEventListener('click', async () => {
    if (!validateStep()) return;
    if (formStep === 1) { formStep = 2; updateFormStep(); return; }
    if (formStep === 2) {
      if (keepsExistingPrototype()) {
        goToUtSetup('프로토타입은 그대로 두고 설정만 이어서 고칠게요.');
        return;
      }
      const method = selectedMethod();
      if (method === 'html') importHtmlToDraft();
      else if (method === 'figma') importFigmaToDraft();
      else startGeneration();
      return;
    }
    if (formStep === 3) { formStep = 4; updateFormStep(); return; }
    if (formStep === 4) { formStep = 5; renderQuestions(); updateFormStep(); return; }
    if (formStep === 5) await saveProject();
  });

  $('#figma-url')?.addEventListener('input', () => {
    const e = $('.figma-url-error');
    if (e) e.hidden = true;
    if (formStep === 2) updateFormStep();
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
      if (formStep === 2) updateFormStep();   // '그대로' ↔ '가져오기' 문구 갱신
      showToast('HTML을 읽었어요. 이제 UT를 만들 수 있어요.');
    } catch (error) {
      clearImportedFile();
      uploadError.textContent = error.message || 'HTML 파일을 읽지 못했어요. 파일을 확인한 뒤 다시 시도해주세요.';
      uploadError.hidden = false;
      showToast('HTML 파일을 읽지 못했어요.');
    }
  });
  $('.uploaded-file .icon-button').addEventListener('click', clearImportedFile);

  // 러너의 추적기는 예전 tasks[0] 모양을 그대로 씁니다. UT 설정에서 파생시켜 채워요.
  const collectTasks = () => {
    const type = selectedUtType();
    const instruction = taskInput.value.trim() || '페이지에서 핵심 작업을 완료해보세요.';
    const target = draft?.targetScreen;
    const quizQuestion = $('#ut-quiz-question')?.value.trim() || '';
    const expectedAnswer = $('#ut-quiz-answer')?.value.trim() || '';
    const descriptions = {
      'page-reach': target ? `“${target.title}” 화면 도달` : '목표 화면 도달',
      quiz: `퀴즈 “${quizQuestion}” 정답 일치`,
      ab: 'A/B 두 안 비교 · 완료 기록',
      none: '성공 조건 없음 · 완료 기록만 수집'
    };
    return [{
      instruction,
      successMode: type === 'page-reach' ? 'page-reach' : type === 'quiz' ? 'quiz' : 'none',
      pageTarget: type === 'page-reach' ? (target?.title || '') : '',
      screenId: type === 'page-reach' ? (target?.id || '') : '',
      quizQuestion: type === 'quiz' ? quizQuestion : '',
      expectedAnswer: type === 'quiz' ? expectedAnswer : '',
      elementTarget: '',
      success: descriptions[type] || '성공 조건 없음'
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

  // 상세 서브타이틀은 만든 시각이 기준이에요
  const analyticsSubtitle = (project, sessions) => {
    const created = project?.createdAt ? `${formatLocalTime(project.createdAt)} 생성` : '생성일시 없음';
    if (!sessions) return created;
    return sessions.length
      ? `${created} · 참여 ${sessions.length}명 · 마지막 참여 ${formatLocalTime(sessions[0].endedAt)}`
      : `${created} · 아직 참여 기록이 없어요`;
  };

  const normalizeSuccessMode = (task) => {
    const mode = task?.successMode;
    if (mode === 'text-match') return 'quiz';
    if (mode === 'manual' || !mode) return 'none';
    return ['page-reach', 'quiz', 'none', 'element-click'].includes(mode) ? mode : 'none';
  };
  const isQuizTask = (task) => normalizeSuccessMode(task) === 'quiz' && Boolean(String(task?.expectedAnswer || '').trim());
  const outcomeLabel = (outcome) => ({
    success: '성공', completed: '완료', failed: '조건 미충족',
    unknown: '모르겠어요', timeout: '시간 초과', gaveup: '포기', stopped: '중간 종료'
  })[outcome] || '중간 종료';

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

  const renderHtmlPreview = async (project) => {
    activeHtmlProject = project;
    $('#analytics-title').textContent = project.title;
    $('.analytics-subtitle').textContent = analyticsSubtitle(project, null);
    const task = project.tasks?.[0] || { instruction: '페이지에서 핵심 작업을 완료해보세요.', success: '완료 상태 확인' };
    const framePanel = $('.html-frame-panel');
    const frame = $('#html-preview-frame');
    if (project.html) {
      framePanel.classList.remove('is-empty');
      applyDevice(frame, project.device);
      setFrameHtml(frame, prepareImportedHtml(project.html, task, project.screens));
    } else {
      setFrameHtml(frame, '');
      framePanel.classList.add('is-empty');
    }
    schedulePreviewFit();
  };

  // 미리보기 영역만 화면 아래까지 채워요. 안쪽 화면은 CSS로 그 영역을 그대로 채우고요.
  const fitPreview = () => {
    const wrap = $('.html-frame-viewport');
    if (!wrap || !wrap.offsetParent) return;
    wrap.style.height = `${Math.max(360, Math.round(window.innerHeight - wrap.getBoundingClientRect().top - 24))}px`;
  };

  const schedulePreviewFit = () => {
    fitPreview();
    window.requestAnimationFrame(fitPreview);
    window.setTimeout(fitPreview, 120);
  };
  window.addEventListener('resize', schedulePreviewFit);

  const methodBadge = (method) => ({ ai: 'AI 생성', figma: 'Figma', html: 'HTML' })[method] || 'HTML';

  // 홈 상단 KPI — 만든 UT 전체를 한 번에 보여줘요
  const renderDashboardKpi = async () => {
    const box = $('#dashboard-kpi');
    if (!box) return;
    let summary = null;
    try {
      summary = await api('/api/summary');
    } catch (error) {
      box.innerHTML = '';
      return;
    }
    if (!summary.utCount) { box.innerHTML = ''; return; }

    const rateIsSuccess = summary.successRate !== null;
    const rate = rateIsSuccess ? summary.successRate : summary.completionRate;

    const stats = [
      { label: '누적 참여', value: `${summary.sessions}<small>명</small>` },
      {
        label: rateIsSuccess ? '평균 과업 성공률' : '평균 완료율',
        value: rate === null ? '—' : `${rate}<small>%</small>`,
      },
    ];
    box.innerHTML = stats.map((stat) => (
      `<div><dt>${stat.label}</dt><dd>${stat.value}</dd></div>`
    )).join('');
  };

  const renderImportedProjects = async () => {
    const container = $('#imported-projects');
    const activeList = $('#active-projects');
    if (!container) return;
    let imported = [];
    try {
      imported = await api('/api/uts');
    } catch (error) {
      container.innerHTML = '';
      console.warn('요티 UT 목록을 불러오지 못했습니다.', error);
      return;
    }
    // 최근에 만든 게 위로
    imported.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderDashboardKpi();
    loadParticipants();

    container.innerHTML = imported.map((project) => {
      const sessions = project.sessionCount || 0;
      const succeeded = project.successCount || 0;
      const rate = sessions ? `${Math.round((succeeded / sessions) * 100)}%` : '—';
      return `<article class="project-card imported-html-card" data-html-project-id="${project.id}" tabindex="0" role="button" aria-label="${escapeHtml(project.title)} 열기"><div class="project-card-body"><div><span class="project-card-tags"><span class="badge badge-gray">${methodBadge(project.method)}</span>${utTypeBadges(project)}</span><span class="badge badge-green">실행 가능</span></div><h2>${escapeHtml(project.title)}</h2><dl><div><dt>참여자</dt><dd>${sessions}명</dd></div><div><dt>성공률</dt><dd>${rate}</dd></div></dl></div></article>`;
    }).join('');

    // 홈 화면 목록
    if (activeList) {
      activeList.innerHTML = imported.length
        ? imported.slice(0, 5).map((project) => {
            const sessions = project.sessionCount || 0;
            const succeeded = project.successCount || 0;
            const rate = sessions ? `${Math.round((succeeded / sessions) * 100)}%` : '—';
            return `<button class="project-row" type="button" data-html-project-id="${project.id}"><span class="project-thumbnail upload-thumb"><svg><use href="#i-${project.method === 'figma' ? 'figma' : project.method === 'ai' ? 'sparkles' : 'upload'}"></use></svg></span><span class="project-info"><span class="project-title-line"><strong>${escapeHtml(project.title)}</strong><span class="badge ${sessions ? 'badge-green' : 'badge-blue'}">${sessions ? '참여 중' : '참여 대기'}</span></span><span>${methodBadge(project.method)} · ${formatLocalTime(project.createdAt)}</span></span><span class="project-metric"><strong>${sessions}</strong><span>참여자</span></span><span class="project-rate"><strong>${rate}</strong><span>성공률</span></span><svg class="row-chevron"><use href="#i-chevron-right"></use></svg></button>`;
          }).join('')
        : '<p class="project-empty">아직 만든 UT가 없어요. 위에서 하나 만들어보세요.</p>';
    }

    const navCount = $('.nav-count');
    if (navCount) navCount.textContent = String(imported.length);

  };

  const openHtmlProject = async (projectId) => {
    try {
      const project = await api(`/api/uts/${encodeURIComponent(projectId)}`);
      if (!project) {
        showToast('저장된 UT를 찾지 못했어요.');
        return;
      }
      await renderHtmlPreview(project);
      setResultTab('preview');
      showView('analytics');
      renderAnalytics(project.id);
    } catch (error) {
      showToast(error.message || 'HTML 프로젝트를 열지 못했어요.');
    }
  };


  // 홈·프로젝트 어디서 눌러도 같은 UT가 열려요
  document.addEventListener('click', (event) => {
    const card = event.target.closest('[data-html-project-id]');
    if (card) openHtmlProject(card.dataset.htmlProjectId);
  });
  document.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-html-project-id]');
    if (card && card.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openHtmlProject(card.dataset.htmlProjectId);
    }
  });

  // ── 미리보기 화면 조작 ────────────────────────────────────────
  $('.html-refresh-button')?.addEventListener('click', () => {
    if (!activeHtmlProject) return;
    const frame = $('#html-preview-frame');
    setFrameHtml(frame, '');
    window.setTimeout(() => {
      applyDevice(frame, activeHtmlProject.device);
      setFrameHtml(frame, prepareImportedHtml(activeHtmlProject.html, activeHtmlProject.tasks?.[0], activeHtmlProject.screens));
      showToast('처음부터 다시 실행했어요.');
    }, 0);
  });

  // ── 참여자 ──────────────────────────────────────────────────
  let participantPeople = [];
  let selectedParticipant = '';

  const outcomeTone = (outcome) => (outcome === 'success' || outcome === 'completed' ? 'complete' : 'friction');

  const renderParticipantList = () => {
    const list = $('.participant-list');
    if (!list) return;
    if (!participantPeople.length) {
      list.innerHTML = '<p class="project-empty">아직 이메일을 남긴 참여자가 없어요. 공유 모달에서 <strong>참여 전 이메일 받기</strong>를 켜면 여기에 쌓여요.</p>';
      return;
    }
    list.innerHTML = participantPeople.map((person) => `
      <button class="participant-row${person.email === selectedParticipant ? ' is-active' : ''}" type="button" data-participant-email="${escapeHtml(person.email)}">
        <span class="participant-avatar">${escapeHtml(initials(person.name))}</span>
        <span class="participant-row-main"><strong>${escapeHtml(person.name || '이름 미입력')}</strong><small>${escapeHtml(person.email)}</small></span>
        <span class="participant-row-count">${person.count}회</span>
      </button>`).join('');
  };

  const renderParticipantDetail = () => {
    const detail = $('.participant-detail');
    if (!detail) return;
    const person = participantPeople.find((item) => item.email === selectedParticipant);
    if (!person) {
      detail.innerHTML = '<p class="project-empty">왼쪽에서 참여자를 골라주세요.</p>';
      return;
    }
    const runs = person.runs.map((run) => `
      <button class="participant-run" type="button" data-participant-ut="${escapeHtml(run.utId)}">
        <span class="participant-run-main"><strong>${escapeHtml(run.utTitle)}</strong><small>${formatLocalTime(run.at)}</small></span>
        <span class="participant-run-meta"><span class="${outcomeTone(run.outcome)}">${outcomeLabel(run.outcome)}</span><small>${formatDuration(run.duration)}</small></span>
      </button>`).join('');
    detail.innerHTML = `
      <div class="participant-detail-head">
        <span class="participant-avatar participant-avatar-lg">${escapeHtml(initials(person.name))}</span>
        <div><strong>${escapeHtml(person.name || '이름 미입력')}</strong><p>${escapeHtml(person.email)}</p></div>
        <button class="button button-secondary participant-copy" type="button" data-copy-email="${escapeHtml(person.email)}"><svg><use href="#i-copy"></use></svg>이메일 복사</button>
      </div>
      <div class="participant-detail-stats"><div><strong>${person.count}</strong><span>참여</span></div><div><strong>${person.runs.filter((run) => outcomeTone(run.outcome) === 'complete').length}</strong><span>성공</span></div><div><strong>${formatLocalTime(person.lastAt)}</strong><span>마지막 참여</span></div></div>
      <div class="panel-heading"><div><h2>참여 이력</h2><p>클릭하면 해당 UT로 이동해요.</p></div></div>
      <div class="participant-runs">${runs}</div>`;
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand('copy');
      helper.remove();
      return copied;
    }
  };

  const loadParticipants = async () => {
    try {
      participantPeople = await api('/api/participants');
    } catch (error) {
      participantPeople = [];
    }
    if (!participantPeople.some((person) => person.email === selectedParticipant)) {
      selectedParticipant = participantPeople[0]?.email || '';
    }
    const count = $('.nav-count-participants');
    if (count) count.textContent = String(participantPeople.length);
    renderParticipantList();
    renderParticipantDetail();
  };

  $('.participant-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-participant-email]');
    if (!row) return;
    selectedParticipant = row.dataset.participantEmail;
    renderParticipantList();
    renderParticipantDetail();
  });

  $('.participant-detail')?.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-copy-email]');
    if (copy) {
      const ok = await copyText(copy.dataset.copyEmail);
      showToast(ok ? '이메일을 복사했어요.' : '복사하지 못했어요. 직접 선택해주세요.');
      return;
    }
    const run = event.target.closest('[data-participant-ut]');
    if (run) openHtmlProject(run.dataset.participantUt);
  });

  $('.participants-copy-all')?.addEventListener('click', async () => {
    if (!participantPeople.length) {
      showToast('복사할 이메일이 없어요.');
      return;
    }
    const ok = await copyText(participantPeople.map((person) => person.email).join(', '));
    showToast(ok ? `이메일 ${participantPeople.length}개를 복사했어요.` : '복사하지 못했어요.');
  });

  // ── 링크 공유 ────────────────────────────────────────────────
  const shareBackdrop = $('[data-modal="share"]');
  let shareModalProject = null;

  const openShareModal = (project, opener = null) => {
    const target = project || activeHtmlProject;
    if (!target?.id) {
      showToast('먼저 UT를 만들어주세요.');
      return;
    }
    shareModalProject = target;
    $('#share-link').value = shareLinkFor(target.id);
    const collectEmail = $('#share-collect-email');
    if (collectEmail) collectEmail.checked = Boolean(target.collectEmail);
    const preview = $('.share-preview');
    if (preview) $('strong', preview).textContent = target.title || 'UT';
    openModal('share', opener);
  };

  $('#share-collect-email')?.addEventListener('change', async (event) => {
    const collectEmail = event.currentTarget.checked;
    if (!shareModalProject?.id) return;
    try {
      await api(`/api/uts/${encodeURIComponent(shareModalProject.id)}`, { method: 'PATCH', body: { collectEmail } });
      shareModalProject.collectEmail = collectEmail;
      if (activeHtmlProject?.id === shareModalProject.id) activeHtmlProject.collectEmail = collectEmail;
      showToast(collectEmail ? '참여 전에 이메일을 받아요.' : '이메일은 받지 않아요.');
    } catch (error) {
      event.currentTarget.checked = !collectEmail;
      showToast(error.message || '설정을 저장하지 못했어요.');
    }
  });

  $('.html-share-button')?.addEventListener('click', (event) => openShareModal(activeHtmlProject, event.currentTarget));
  $$('.share-button').forEach((button) => button.addEventListener('click', (event) => openShareModal(activeHtmlProject, event.currentTarget)));
  $('.copy-link-button')?.addEventListener('click', async () => {
    const linkInput = $('#share-link');
    let copied = false;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copied = true;
    } catch (error) {
      linkInput.select();
      copied = document.execCommand('copy');
    }
    showToast(copied ? '참여 링크를 복사했어요.' : '링크를 선택했어요. 직접 복사해주세요.');
    const button = $('.copy-link-button');
    button.innerHTML = '<svg><use href="#i-check"></use></svg>복사됨';
    window.setTimeout(() => { button.innerHTML = '<svg><use href="#i-copy"></use></svg>복사'; }, 1600);
  });

  const runner = $('.test-runner');
  const runnerTitle = $('#runner-title');
  const runnerStep = $('.runner-step');
  const runnerHtmlFrame = $('.runner-html-frame');
  const runnerIntro = $('.runner-intro');
  const runnerIntroStart = $('.runner-intro-start');
  const runnerCountdown = $('.runner-countdown');
  const runnerParticipantName = $('#runner-participant-name');
  const runnerNameError = $('#runner-name-error');
  const runnerEmailField = $('.runner-email-field');
  const runnerParticipantEmail = $('#runner-participant-email');
  const runnerEmailError = $('#runner-email-error');
  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  const runnerAnswerField = $('.runner-answer-field');
  const runnerAnswerInput = $('#runner-answer-input');
  const runnerAnswerError = $('#runner-answer-error');
  const runnerFinishButton = $('.runner-finish');
  let runnerCompletionMessage = '';
  let runnerSuccessMessage = '';
  let runnerFailMessage = '';
  // 조건을 충족해 성공한 참여도 바로 넘기지 않고 확인 모달을 한 번 거쳐요
  let runnerPendingSuccess = null;
  // 설문 중 조작은 과업 기록에 섞이면 안 돼요
  let surveyOpen = false;
  const runnerWidget = $('.runner-widget');
  const runnerCompletionModal = $('.runner-completion-modal');
  const runnerCompletionTitle = $('#runner-completion-title');
  const runnerCompletionEyebrow = $('.runner-completion-eyebrow');
  const runnerCompletionTask = $('.runner-completion-task');
  const runnerCompletionSubmit = $('.runner-completion-submit');
  const runnerResult = $('.runner-result');
  const runnerResultTitle = $('#runner-result-title');
  const runnerResultMessage = $('.runner-result-message');
  const runnerResultClose = $('.runner-result-close');
  const runnerFigmaFrame = $('.runner-figma-frame');
  const runnerGiveUp = $('.runner-giveup');
  const runnerTimer = $('.runner-timer');
  const runnerSurvey = $('.runner-survey');
  const runnerSurveyList = $('.runner-survey-list');
  const runnerSurveyError = $('.runner-survey-error');
  let runnerTimeoutTimer = null;
  let runnerDeadline = 0;
  let runnerQuestions = [];
  let runnerTimeLimit = 0;
  let runnerPendingOutcome = null;
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
  let runnerFigmaSrc = '';
  let figmaRunnerStarted = false;

  // 참여자에게는 성공·실패를 나눠 보여주지 않아요. 결과 기록은 그대로 남습니다.
  const showRunnerResult = () => {
    runnerResultTitle.textContent = 'UT가 끝났어요!';
    runnerResultMessage.textContent = '참여해주셔서 고마워요. 남겨주신 기록은 더 좋은 경험을 만드는 데 사용할게요.';
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
    runnerAnswerField.hidden = true;
    runnerAnswerInput.required = quiz;
    runnerCompletionSubmit.textContent = '답변 제출';
  };
  const closeRunnerCompletion = ({ restoreFocus = true } = {}) => {
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = false;
    runnerHtmlFrame.removeAttribute('tabindex');
    lockRunnerFrame(false);
    $('.runner-demo-site').inert = false;
    if (restoreFocus) runnerFinishButton.focus();
  };
  const openRunnerCompletion = () => {
    if (runnerTransitioning) return;
    const task = runnerTasks[runnerTaskIndex];
    const mode = typeof task === 'string' ? 'none' : normalizeSuccessMode(task);
    // 퀴즈는 답을 받아야 하니 판정 전에 한 번 더 물어요
    const quiz = mode === 'quiz' && !runnerPendingSuccess;
    const succeeded = Boolean(runnerPendingSuccess);
    const plain = mode === 'none';

    // 만든 사람이 정한 문구가 있으면 그게 제목이 돼요
    const custom = succeeded ? runnerSuccessMessage
      : plain ? runnerCompletionMessage
      : runnerFailMessage;
    const fallbackTitle = quiz ? '퀴즈에 답해주세요'
      : succeeded ? '과업을 완료했어요!'
      : plain ? '테스트를 마칠까요?'
      : '아직 성공 조건을 확인하지 못했어요';

    runnerCompletionEyebrow.textContent = quiz ? '성공 조건 확인' : succeeded ? '과업 성공' : '테스트 종료';
    runnerCompletionTitle.textContent = quiz ? fallbackTitle : (custom || fallbackTitle);

    // 문구를 제목에 올렸으면 아래 회색 박스는 비워둡니다
    const body = quiz
      ? (task.quizQuestion || '과업에서 확인한 값을 입력해주세요.')
      : custom
        ? ''
        : succeeded
          ? (runnerQuestions.length ? '이어서 짧은 질문 몇 개를 드릴게요.' : '종료하면 참여가 끝나요.')
          : plain
            ? (runnerQuestions.length
              ? '종료하면 간단한 질문 몇 개를 드릴게요. 아직 둘러볼 게 있다면 계속 진행하세요.'
              : '종료하면 참여가 끝나요. 아직 둘러볼 게 있다면 계속 진행하세요.')
            : describeTaskSuccess(task);
    runnerCompletionTask.textContent = body;
    runnerCompletionTask.hidden = !body;

    runnerAnswerField.hidden = !quiz;
    runnerAnswerInput.required = quiz;
    runnerAnswerError.hidden = true;
    runnerAnswerInput.removeAttribute('aria-invalid');
    runnerCompletionSubmit.textContent = quiz ? '답변 제출' : succeeded || plain ? '종료하기' : '그래도 종료하기';
    // 성공한 참여는 되돌릴 게 없어요
    $$('.runner-completion-cancel').forEach((button) => { button.hidden = succeeded; });
    runnerCompletionModal.hidden = false;
    runnerWidget.inert = true;
    runnerHtmlFrame.setAttribute('tabindex', '-1');
    lockRunnerFrame(true);
    $('.runner-demo-site').inert = true;
    window.setTimeout(() => (quiz ? runnerAnswerInput : runnerCompletionSubmit).focus(), 0);
  };
  const openRunner = (opener, project = null) => {
    if (!shareBackdrop.hidden) closeModal(shareBackdrop, false);
    runnerOpener = opener;
    runnerMode = project ? (project.method === 'figma' ? 'figma' : 'html') : 'demo';
    runnerTasks = project?.tasks?.length ? [project.tasks[0]] : demoRunnerTasks;
    runnerTaskIndex = 0;
    runnerQuestions = (project?.questions || []).filter((question) => question.title?.trim());
    runnerCompletionMessage = String(project?.completionMessage || '').trim();
    runnerSuccessMessage = String(project?.successMessage || '').trim();
    runnerFailMessage = String(project?.failMessage || '').trim();
    runnerPendingSuccess = null;
    runnerFigmaSrc = project?.figmaEmbed || '';
    figmaRunnerStarted = false;
    runnerTimeLimit = project?.config?.pageReach?.timeoutSec || 0;
    runnerPendingOutcome = null;
    runnerSurvey.hidden = true;
    runner.classList.remove('is-survey');
    surveyOpen = false;
    guardPanelFocus(false);
    stopRunnerTimer();
    runnerGiveUp.hidden = !project;
    runnerSessionSaved = false;
    runnerTransitioning = false;
    window.clearTimeout(runnerCountdownTimer);
    runnerResult.hidden = true;
    runnerCompletionModal.hidden = true;
    runnerWidget.inert = false;
    runner.classList.toggle('is-html', runnerMode !== 'demo');
    runner.classList.add('is-preparing');
    lockRunnerFrame(false);
    $('.runner-stage').hidden = runnerMode !== 'html';
    runnerHtmlFrame.setAttribute('tabindex', '-1');
    runnerFigmaFrame.hidden = runnerMode !== 'figma';
    if (runnerMode !== 'figma') runnerFigmaFrame.removeAttribute('src');
    $('.runner-demo-site').hidden = runnerMode !== 'demo';
    $('.runner-demo-site').inert = true;
    if (project) {
      applyDevice(runnerHtmlFrame, project.device);
      runnerPendingHtml = runnerMode === 'figma' ? '' : prepareImportedHtml(project.html, runnerTasks[0], project.screens, { record: true });
      setFrameHtml(runnerHtmlFrame, '');
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
        participantEmail: '',
        answers: [],
        replay: null,
        events: [],
        tasks: [{
          index: 0,
          instruction: runnerTasks[0].instruction,
          success: runnerTasks[0].success,
          successMode: normalizeSuccessMode(runnerTasks[0]),
          pageTarget: runnerTasks[0].pageTarget || '',
        screenId: runnerTasks[0].screenId || '',
          quizQuestion: runnerTasks[0].quizQuestion || '',
          expectedAnswer: runnerTasks[0].expectedAnswer || '',
          elementTarget: runnerTasks[0].elementTarget || '',
          result: null,
          completedAt: null
        }]
      };
    } else {
      runnerPendingHtml = '';
      setFrameHtml(runnerHtmlFrame, '');
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
    if (runnerEmailField) {
      runnerEmailField.hidden = !project?.collectEmail;
      runnerParticipantEmail.value = '';
      runnerParticipantEmail.removeAttribute('aria-invalid');
      runnerEmailError.hidden = true;
    }
    runnerAnswerInput.value = '';
    runnerAnswerInput.removeAttribute('aria-invalid');
    runnerAnswerError.hidden = true;
    runnerCountdown.hidden = true;
    runnerCountdown.classList.remove('is-ticking');
    $('strong', runnerCountdown).textContent = '3';
    if (participantMode) {
      $('.runner-intro-close').hidden = !participantPreview;   // 미리보기는 닫을 수 있어요
      runnerResultClose.hidden = !participantPreview;
    }
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
    let participantEmail = '';
    if (runnerEmailField && !runnerEmailField.hidden) {
      participantEmail = runnerParticipantEmail.value.trim().toLowerCase();
      if (!isEmail(participantEmail)) {
        runnerEmailError.hidden = false;
        runnerParticipantEmail.setAttribute('aria-invalid', 'true');
        runnerParticipantEmail.focus();
        return;
      }
      runnerEmailError.hidden = true;
      runnerParticipantEmail.removeAttribute('aria-invalid');
    }
    if (runnerSession) {
      runnerSession.participantName = participantName;
      runnerSession.participantEmail = participantEmail;
    }
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
            setFrameHtml(runnerHtmlFrame, runnerPendingHtml);
            runnerHtmlFrame.focus();
          } else if (runnerMode === 'figma') {
            runnerFigmaFrame.src = runnerFigmaSrc;
            runnerFigmaFrame.focus();
          } else $('.runner-success-trigger').focus();
          startRunnerTimer(runnerTimeLimit);
        }, 1000);
        return;
      }
      count -= 1;
      runnerCountdownTimer = window.setTimeout(tick, 1000);
    };
    tick();
  };

  // ── 제한 시간 ────────────────────────────────────────────────
  const stopRunnerTimer = () => {
    window.clearInterval(runnerTimeoutTimer);
    runnerTimeoutTimer = null;
    runnerTimer.hidden = true;
  };

  const startRunnerTimer = (seconds) => {
    stopRunnerTimer();
    if (!seconds || seconds <= 0) return;
    runnerDeadline = Date.now() + seconds * 1000;
    runnerTimer.hidden = false;
    const paint = () => {
      const left = Math.max(0, Math.round((runnerDeadline - Date.now()) / 1000));
      $('b', runnerTimer).textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      runnerTimer.classList.toggle('is-urgent', left <= 30);
      if (left <= 0) {
        stopRunnerTimer();
        finishRunnerTask('timeout', 'timeout');
      }
    };
    paint();
    runnerTimeoutTimer = window.setInterval(paint, 1000);
  };

  // 프로토타입이 자기 입력칸에 계속 포커스를 잡아두는 경우가 있어요.
  // 그 위에 뜬 설문·완료 화면에 글자가 안 들어가니 iframe을 잠가둡니다.
  // inert만으로는 iframe 안에서 스스로 focus()를 계속 부르는 걸 못 막아요.
  // 잠깐 숨겨야 포커스가 확실히 바깥으로 나옵니다. 설문·완료 창이 화면을 덮고 있어 티도 안 나요.
  // hide: true 면 화면에서 완전히 내려요. 그냥 잠그기만 하면 프로토타입은 계속 보입니다.
  const lockRunnerFrame = (locked, { hide = true } = {}) => {
    if (!runnerHtmlFrame) return;
    runnerHtmlFrame.inert = locked;
    runnerHtmlFrame.style.pointerEvents = locked ? 'none' : '';
    runnerHtmlFrame.style.display = locked && hide ? 'none' : '';
    if (locked && document.activeElement === runnerHtmlFrame) runnerHtmlFrame.blur();
  };

  // 일부 프로토타입은 입력칸에 계속 focus를 걸어요. 그러면 옆 패널에 타이핑이 안 됩니다.
  // 두 번 이상 뺏기면 그때 프로토타입을 내려요.
  let focusGuard = null;
  const guardPanelFocus = (on) => {
    if (focusGuard) { document.removeEventListener('focusin', focusGuard, true); focusGuard = null; }
    if (!on) return;
    let stolen = 0;
    focusGuard = (event) => {
      if (event.target !== runnerHtmlFrame) return;
      stolen += 1;
      if (stolen < 2) return;
      lockRunnerFrame(true);
      guardPanelFocus(false);
      showToast('프로토타입이 입력을 방해해서 잠시 감췄어요.');
    };
    document.addEventListener('focusin', focusGuard, true);
  };

  // ── 사후 질문 ────────────────────────────────────────────────
  // 한 번에 한 문항씩 — 참여자가 넘겨가며 답해요
  let surveyIndex = 0;
  let surveyAnswers = [];

  const surveyFieldMarkup = (question, index) => {
    const name = `rq-${index}`;
    const saved = surveyAnswers[index] || '';
    if (question.type === 'choice') {
      return `<div class="survey-choices">${question.choices.map((choice) => `
        <label class="survey-choice"><input type="radio" name="${name}" value="${escapeHtml(choice)}"${saved === choice ? ' checked' : ''} /><span>${escapeHtml(choice)}</span></label>`).join('')}</div>`;
    }
    if (question.type === 'scale') {
      return `<div class="survey-scale">${[1, 2, 3, 4, 5].map((n) => `
        <label class="survey-scale-item"><input type="radio" name="${name}" value="${n}"${String(saved) === String(n) ? ' checked' : ''} /><span>${n}</span></label>`).join('')}</div>`;
    }
    return `<textarea class="survey-text" name="${name}" rows="4" maxlength="500" placeholder="자유롭게 적어주세요">${escapeHtml(saved)}</textarea>`;
  };

  // -1이면 안내 화면, 0부터는 질문 화면이에요
  const renderRunnerSurvey = () => {
    const total = runnerQuestions.length;
    const eyebrow = $('.runner-survey-eyebrow');
    const title = $('#runner-survey-title');
    const desc = $('.runner-survey-desc');
    const progress = $('.survey-progress');
    const intro = surveyIndex < 0;

    if (intro) {
      eyebrow.textContent = '테스트 후 질문';
      title.textContent = '몇 가지만 더 여쭤볼게요';
      desc.textContent = `질문 ${total}개예요. 답해주신 내용은 서비스 개선에만 사용해요.`;
      desc.hidden = false;
      progress.hidden = true;
      runnerSurveyList.innerHTML = '';
      $('.runner-survey-prev').hidden = true;
      $('.runner-survey-submit').textContent = '설문 시작';
      $('.runner-survey-skip').textContent = '건너뛰기';
    } else {
      const question = runnerQuestions[surveyIndex];
      if (!question) return;
      eyebrow.textContent = `질문 ${surveyIndex + 1} / ${total}`;
      title.textContent = question.title;
      // 척도만 안내가 필요해요
      const hint = question.type === 'scale' ? '1 전혀 아니다 · 5 매우 그렇다' : '';
      desc.textContent = hint;
      desc.hidden = !hint;
      progress.hidden = false;
      $('.survey-progress-bar i').style.width = `${((surveyIndex + 1) / total) * 100}%`;
      runnerSurveyList.innerHTML = `<div class="survey-item">${surveyFieldMarkup(question, surveyIndex)}</div>`;
      $('.runner-survey-prev').hidden = surveyIndex === 0;
      $('.runner-survey-submit').textContent = surveyIndex === total - 1 ? '제출하기' : '다음';
      $('.runner-survey-skip').textContent = '남은 질문 건너뛰기';
    }

    runnerSurveyError.hidden = true;
    $('.runner-survey-card', runnerSurvey).scrollTop = 0;
    window.setTimeout(() => $('input, textarea', runnerSurveyList)?.focus(), 0);
  };

  // 지금 화면의 답을 기억해둬요 (이전으로 돌아가도 남아 있게)
  const captureSurveyAnswer = () => {
    const question = runnerQuestions[surveyIndex];
    if (surveyIndex < 0 || !question) return '';
    const name = `rq-${surveyIndex}`;
    const value = question.type === 'text'
      ? ($(`textarea[name="${name}"]`, runnerSurveyList)?.value || '').trim()
      : ($(`input[name="${name}"]:checked`, runnerSurveyList)?.value || '');
    surveyAnswers[surveyIndex] = value;
    return value;
  };

  const collectSurveyAnswers = () => runnerQuestions.map((question, index) => ({
    id: question.id,
    type: question.type,
    title: question.title,
    answer: surveyAnswers[index] || ''
  }));

  const openRunnerSurvey = (outcome) => {
    runnerPendingOutcome = outcome;
    surveyIndex = -1;
    surveyAnswers = runnerQuestions.map(() => '');
    runnerCompletionModal.hidden = true;
    // 답하면서 화면을 다시 눌러볼 수 있게 프로토타입은 그대로 열어둬요.
    // 다만 이때의 조작은 과업 기록이 아니라서 세션에 남기지 않습니다.
    lockRunnerFrame(false);
    surveyOpen = true;
    guardPanelFocus(true);
    runner.classList.add('is-survey');
    runnerSurvey.hidden = false;
    renderRunnerSurvey();
  };

  const finishRunnerSurvey = async ({ skip = false } = {}) => {
    if (runnerSession) runnerSession.answers = skip ? collectSurveyAnswers() : collectSurveyAnswers();
    runnerSurvey.hidden = true;
    runner.classList.remove('is-survey');
    surveyOpen = false;
    guardPanelFocus(false);
    await finishRunnerSession(runnerPendingOutcome);
  };

  // 다음 문항으로. 마지막이면 제출해요.
  const advanceRunnerSurvey = async () => {
    if (surveyIndex < 0) {
      surveyIndex = 0;
      renderRunnerSurvey();
      return;
    }
    if (!captureSurveyAnswer()) {
      runnerSurveyError.hidden = false;
      $('input, textarea', runnerSurveyList)?.focus();
      return;
    }
    if (surveyIndex < runnerQuestions.length - 1) {
      surveyIndex += 1;
      renderRunnerSurvey();
      return;
    }
    await finishRunnerSurvey();
  };

  const backRunnerSurvey = () => {
    if (surveyIndex <= 0) return;
    captureSurveyAnswer();
    surveyIndex -= 1;
    renderRunnerSurvey();
  };

  runnerGiveUp?.addEventListener('click', () => {
    if (runnerTransitioning) return;
    finishRunnerTask('gaveup', 'giveup');
  });
  $('.runner-survey-submit')?.addEventListener('click', () => advanceRunnerSurvey());
  $('.runner-survey-prev')?.addEventListener('click', backRunnerSurvey);
  $('.runner-survey-skip')?.addEventListener('click', () => finishRunnerSurvey({ skip: true }));
  // 답을 고르면 안내 문구를 지워요
  runnerSurveyList?.addEventListener('input', () => { runnerSurveyError.hidden = true; });
  runnerSurveyList?.addEventListener('change', () => { runnerSurveyError.hidden = true; });

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
    await collectReplay();
    await saveSession(runnerSession);
    runnerSessionSaved = true;
    if (!participantMode) await renderImportedProjects();
  };
  const closeRunner = async ({ saveStopped = true } = {}) => {
    window.clearTimeout(runnerCountdownTimer);
    stopRunnerTimer();
    runnerSurvey.hidden = true;
    runner.classList.remove('is-survey');
    surveyOpen = false;
    guardPanelFocus(false);
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
    $('.runner-stage').hidden = true;
    setFrameHtml(runnerHtmlFrame, '');
    runnerHtmlFrame.removeAttribute('tabindex');
    runnerPendingHtml = '';
    $('.runner-demo-site').hidden = false;
    $('.runner-demo-site').inert = false;
    if (!$('.modal-backdrop:not([hidden])') && $('.recording-player').hidden) body.classList.remove('is-locked');
    runnerOpener?.focus?.();
  };
  // 미리 해보기는 참여자가 보는 화면 그대로를 새 탭에서 열어요
  const openPreviewTab = (project) => {
    const target = project || activeHtmlProject;
    if (!target?.id) {
      showToast('먼저 UT를 열어주세요.');
      return;
    }
    window.open(`${shareLinkFor(target.id)}?preview=1`, '_blank', 'noopener');
  };
  $$('.preview-test-button').forEach((button) => button.addEventListener('click', () => openPreviewTab(shareModalProject)));
  $('.html-run-test-button').addEventListener('click', () => openPreviewTab(activeHtmlProject));
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
      if (runnerPendingSuccess) return;   // 성공 결과는 되돌릴 게 없어요
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

  // 프로토타입 안에 쌓인 화면 기록을 가져와요
  const collectReplay = () => new Promise((resolve) => {
    if (!runnerSession || runnerMode !== 'html' || !runnerHtmlFrame.contentWindow) return resolve();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      // 못 받았으면 '기록 없음'으로 남겨요. null이면 옛 참여로 오해돼요.
      if (runnerSession && !runnerSession.replay) runnerSession.replay = [];
      resolve();
    };
    const started = Date.now();
    const check = () => {
      if (runnerSession?.replay || Date.now() - started > 3000) return done();
      // 기록기가 늦게 붙을 수 있어 계속 다시 물어봐요
      runnerHtmlFrame.contentWindow?.postMessage('yoti-replay-flush', '*');
      window.setTimeout(check, 150);
    };
    check();
  });

  const finishRunnerSession = async (outcome) => {
    if (!runnerSession || runnerSessionSaved) return;
    runnerSession.endedAt = Date.now();
    runnerSession.duration = runnerSession.endedAt - runnerSession.startedAt;
    runnerSession.status = 'completed';
    runnerSession.outcome = outcome;
    await collectReplay();
    try {
      await saveSession(runnerSession);
      runnerSessionSaved = true;
      if (!participantMode) await renderImportedProjects();
      showRunnerResult();
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
        screenId: task.screenId || '',
        quizQuestion: task.quizQuestion || '',
        expectedAnswer: task.expectedAnswer || '',
        elementTarget: task.elementTarget || '',
        result: outcome,
        resultSource: source,
        completedAt: Date.now()
      };
      runnerSession.outcomeSource = source;
    }
    stopRunnerTimer();
    if (runnerSession && runnerQuestions.length) {
      openRunnerSurvey(outcome);
    } else if (runnerSession) {
      await finishRunnerSession(outcome);
    } else {
      showRunnerResult();
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
    openRunnerCompletion();
  };
  const submitRunnerAnswer = () => {
    const task = runnerTasks[runnerTaskIndex];
    const mode = typeof task === 'string' ? 'none' : normalizeSuccessMode(task);
    // 결과 문구를 이미 보여준 뒤라면 그대로 마칩니다
    if (runnerPendingSuccess) {
      const { source } = runnerPendingSuccess;
      runnerPendingSuccess = null;
      closeRunnerCompletion({ restoreFocus: false });
      finishRunnerTask('success', source);
      return;
    }
    if (mode === 'none') {
      closeRunnerCompletion({ restoreFocus: false });
      finishRunnerTask('completed', 'none');
      return;
    }
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
    // 성공 문구를 정해뒀으면 한 번 보여주고 넘어가요
    if (runnerSuccessMessage) {
      runnerPendingSuccess = { source: 'quiz-match' };
      openRunnerCompletion();
      return;
    }
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
    // Figma 프로토타입은 자체 이벤트를 보내요 (Embed Kit 2.0)
    if (event.origin === FIGMA_ORIGIN && event.source === runnerFigmaFrame.contentWindow) {
      handleFigmaRunnerEvent(event.data);
      return;
    }
    if (!message || message.source !== 'yoti-html-runtime') return;
    const fromPreview = event.source === $('#html-preview-frame').contentWindow;
    const fromRunner = event.source === runnerHtmlFrame.contentWindow;
    if (!fromPreview && !fromRunner) return;
    if (fromPreview && message.kind === 'runtime-error') {
      showToast(`HTML 스크립트 오류 · ${message.detail?.message || '개발자 도구에서 확인해주세요.'}`);
      return;
    }
    // 화면 기록은 세션에 따로 담아요
    if (fromRunner && message.kind === 'replay-events') {
      if (runnerSession) runnerSession.replay = message.detail?.events || [];
      return;
    }
    if (!fromRunner || !runnerSession || !runnerSession.startedAt || runnerSessionSaved) return;
    if (surveyOpen) return;   // 설문 중 조작은 과업 결과와 무관해요
    runnerSession.events.push({
      kind: message.kind,
      detail: message.detail || {},
      at: Number(message.at) || Date.now(),
      taskIndex: runnerTaskIndex
    });
    if (message.kind === 'condition-met' && !runnerTransitioning && !runnerPendingSuccess) {
      const source = message.detail?.mode === 'element-click' ? 'element-click' : 'page-reach';
      runnerPendingSuccess = { source };
      openRunnerCompletion();
    }
  });

  const handleFigmaRunnerEvent = (data) => {
    if (!data || typeof data !== 'object') return;
    if (!runnerSession || !runnerSession.startedAt || runnerSessionSaved) return;
    const task = runnerTasks[runnerTaskIndex];
    if (data.type === 'PRESENTED_NODE_CHANGED') {
      const nodeId = normalizeFigmaNode(data.data?.presentedNodeId);
      // 프로토타입이 열리며 오는 첫 신호는 시작 화면이라 도달로 치지 않아요
      const isFirst = !figmaRunnerStarted;
      figmaRunnerStarted = true;
      runnerSession.events.push({
        kind: 'page-view',
        detail: { pageTitle: nodeId, pagePath: nodeId, pageUrl: nodeId, source: 'figma' },
        at: Date.now(),
        taskIndex: runnerTaskIndex
      });
      const targetNode = normalizeFigmaNode(task?.screenId);
      if (targetNode && nodeId === targetNode && !isFirst && !runnerTransitioning) {
        runnerSession.events.push({
          kind: 'condition-met',
          detail: { mode: 'page-reach', matchedBy: 'figma-node', matchedTarget: targetNode },
          at: Date.now(),
          taskIndex: runnerTaskIndex
        });
        runnerPendingSuccess = { source: 'page-reach' };
        openRunnerCompletion();
      }
      return;
    }
    // 아무것도 없는 곳을 누른 것도 기록해요. 헤맨 흔적이 남아야 해요.
    if (data.type === 'MOUSE_PRESS_OR_RELEASE') {
      const rect = runnerFigmaFrame.getBoundingClientRect();
      const position = data.data.targetNodeMousePosition || data.data.nearestScrollingFrameMousePosition || {};
      runnerSession.events.push({
        kind: 'click',
        detail: {
          tag: 'figma',
          text: data.data.targetNodeName || data.data.targetNodeId || '빈 곳',
          x: Math.round(position.x ?? 0),
          y: Math.round(position.y ?? 0),
          viewportWidth: Math.round(rect.width),
          viewportHeight: Math.round(rect.height),
          source: 'figma'
        },
        at: Date.now(),
        taskIndex: runnerTaskIndex
      });
    }
  };

  // ── 결과 화면 ────────────────────────────────────────────────
  const setResultTab = (name) => {
    $$('.analytics-tabs [role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.resultTab === name)));
    $$('.result-tab').forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.resultPanel === name));
  };
  $$('[data-result-tab]').forEach((tab) => tab.addEventListener('click', () => {
    setResultTab(tab.dataset.resultTab);
    // 결과 탭으로 넘어갈 때마다 최신 참여 기록을 다시 읽어요
    if (tab.dataset.resultTab !== 'preview' && activeHtmlProject) renderAnalytics(activeHtmlProject.id);
    // 숨어있는 동안엔 크기를 못 재요. 다시 보일 때 맞춰줘요.
    else if (tab.dataset.resultTab === 'preview') schedulePreviewFit();
  }));
  $$('[data-result-tab-jump]').forEach((button) => button.addEventListener('click', () => setResultTab(button.dataset.resultTabJump)));

  let analyticsProject = null;
  let analyticsSessions = [];

  const initials = (name) => (name || '?').trim().slice(0, 2).toUpperCase();

  const renderAnalyticsMetrics = () => {
    const total = analyticsSessions.length;
    const succeeded = analyticsSessions.filter((session) => session.outcome === 'success').length;
    const finished = analyticsSessions.filter((session) => ['success', 'completed', 'failed'].includes(session.outcome));
    const dropped = analyticsSessions.filter((session) => ['gaveup', 'timeout', 'stopped'].includes(session.outcome)).length;
    const judged = analyticsProject?.utType !== 'none';
    const rate = total ? Math.round((succeeded / total) * 100) : 0;
    const average = finished.length
      ? Math.round(finished.reduce((sum, session) => sum + (session.duration || 0), 0) / finished.length)
      : 0;
    const minutes = Math.floor(average / 60000);
    const seconds = Math.round((average % 60000) / 1000);
    $('.analytics-metrics').innerHTML = `
      <article><span>참여자</span><strong>${total}<small>명</small></strong><p>${total ? '링크로 참여한 사람 수예요.' : '아직 참여한 사람이 없어요.'}</p></article>
      <article><span>${judged ? '과업 성공률' : '완료율'}</span><strong>${judged ? rate : (total ? Math.round((finished.length / total) * 100) : 0)}<small>%</small></strong><p>${judged ? `${succeeded}명이 목표를 달성했어요.` : `${finished.length}명이 끝까지 진행했어요.`}</p></article>
      <article><span>평균 소요 시간</span><strong>${minutes}<small>분</small> ${seconds}<small>초</small></strong><p>끝까지 진행한 참여자 기준이에요.</p></article>
      <article><span>중도 이탈</span><strong>${dropped}<small>명</small></strong><p>포기하거나 시간이 초과된 경우예요.</p></article>`;
  };

  // 세션마다 '닿은 화면 id'를 모아둬요 — 개요 그래프와 요령이가 같은 숫자를 쓰도록 여기 한 곳에서만 셉니다
  const computeScreenReach = (screens = [], sessions = []) => sessions.map((session) => {
    const events = session.events || [];
    const ids = new Set();

    // 1) 러너가 남긴 화면 기록 — 주소가 안 바뀌는 프로토타입도 이걸로 잡혀요
    events.forEach((eventItem) => {
      if (eventItem.kind === 'screen-view' && eventItem.detail?.screenId) ids.add(eventItem.detail.screenId);
    });
    const measured = ids.size > 0;

    // 성공 판정이 짚은 화면도 확실한 도달이에요
    events.forEach((eventItem) => {
      if (eventItem.kind !== 'condition-met') return;
      const matched = String(eventItem.detail?.matchedTarget || '');
      screens.forEach((screen) => { if (matched && matched.includes(screen.id)) ids.add(screen.id); });
    });

    // 2) 화면 기록이 없는 예전 세션은 주소·클릭 글자로 추정합니다
    if (!measured) {
      screens.forEach((screen, index) => {
        // pageUrl은 data: 주소라 프로토타입 HTML 전체가 들어 있어요. 여기 넣으면 모든 화면이 도달로 잡힙니다.
        const hashOf = (value) => {
          const raw = String(value || '').replace(/^#/, '');
          try { return decodeURIComponent(raw); } catch (error) { return raw; }
        };
        const byRoute = events.some((eventItem) => {
          if (eventItem.kind !== 'page-view' && eventItem.kind !== 'condition-met') return false;
          const detail = eventItem.detail || {};
          if (hashOf(detail.pagePath) === screen.id) return true;
          if (hashOf(detail.matchedTarget) === screen.id) return true;
          const title = String(detail.pageTitle || '').trim();
          return Boolean(title) && title === String(screen.title || '').trim();
        });
        // 주소가 안 바뀌면, 누른 글자가 그 화면 안에 있던 글자인지로 봐요
        const sample = String(screen.sample || '');
        const byText = sample.length > 0 && events.some((eventItem) => {
          if (eventItem.kind !== 'click') return false;
          const text = String(eventItem.detail?.text || '').trim();
          return text.length >= 6 && sample.includes(text);
        });
        // 첫 화면은 열면 바로 보이니 시작한 사람은 본 걸로 칩니다
        if (byRoute || byText || index === 0) ids.add(screen.id);
      });
    }
    return ids;
  });

  // 화면별로 몇 명이나 닿았는지
  const screenReachRows = (screens = [], sessions = []) => {
    const reach = computeScreenReach(screens, sessions);
    return screens.map((screen, index) => {
      const reached = reach.filter((ids) => ids.has(screen.id)).length;
      return {
        index,
        title: screen.title || screen.id,
        reached,
        total: sessions.length,
        percent: sessions.length ? Math.round((reached / sessions.length) * 100) : 0,
      };
    });
  };

  // A/B는 두 안을 나란히 놓고 봐야 의미가 있어요
  const renderAbCompare = () => {
    const panel = $('.ab-compare-panel');
    const box = $('.ab-compare');
    if (!panel || !box) return;
    if (!isAbProject(analyticsProject)) { panel.hidden = true; return; }
    panel.hidden = false;

    const reach = analyticsProject.config?.pageReach;
    const judged = analyticsProject.utType === 'page-reach' || analyticsProject.utType === 'quiz';
    const arms = [
      { key: 'A', label: 'A안', target: reach?.screenTitle || '' },
      { key: 'B', label: 'B안', target: reach?.screenTitleB || '' },
    ].map((arm) => {
      const runs = analyticsSessions.filter((session) => (session.variant || 'A') === arm.key);
      const done = runs.filter((session) => ['success', 'completed', 'failed'].includes(session.outcome || ''));
      const won = runs.filter((session) => session.outcome === 'success').length;
      const rate = judged
        ? (runs.length ? Math.round((won / runs.length) * 100) : null)
        : (runs.length ? Math.round((done.length / runs.length) * 100) : null);
      const average = done.length
        ? Math.round(done.reduce((sum, session) => sum + (session.duration || 0), 0) / done.length)
        : 0;
      return { ...arm, runs: runs.length, won, rate, average };
    });

    const best = arms.filter((arm) => arm.rate !== null).sort((a, b) => b.rate - a.rate)[0];
    const tie = arms.every((arm) => arm.rate === arms[0].rate);
    box.innerHTML = arms.map((arm) => `
      <div class="ab-arm${best && !tie && arm.key === best.key ? ' is-best' : ''}">
        <div class="ab-arm-head"><strong>${arm.label}</strong>${best && !tie && arm.key === best.key ? '<span class="badge badge-green">우세</span>' : ''}</div>
        <div class="ab-arm-rate">${arm.rate === null ? '—' : `${arm.rate}<small>%</small>`}</div>
        <p class="ab-arm-note">${judged ? '과업 성공률' : '완료율'}${arm.target ? ` · 목표 ${escapeHtml(arm.target)}` : ''}</p>
        <dl class="ab-arm-stats"><div><dt>참여</dt><dd>${arm.runs}명</dd></div><div><dt>평균 시간</dt><dd>${arm.average ? formatDuration(arm.average) : '—'}</dd></div></dl>
      </div>`).join('');

    const total = arms.reduce((sum, arm) => sum + arm.runs, 0);
    if (total < 6) {
      box.insertAdjacentHTML('beforeend', '<p class="ab-compare-note">아직 참여가 적어요. 한쪽이 우세해 보여도 참여가 더 쌓인 뒤에 판단하는 게 안전해요.</p>');
    }
  };

  const renderAnalyticsFunnel = () => {
    const box = $('.analytics-funnel');
    const screens = analyticsProject?.screens || [];
    const total = analyticsSessions.length;
    if (!screens.length || !total) {
      box.innerHTML = `<p class="question-empty">${total ? '화면 목록이 없어 도달 흐름을 그릴 수 없어요.' : '참여 기록이 쌓이면 화면별 도달을 보여드릴게요.'}</p>`;
      return;
    }
    box.innerHTML = screenReachRows(screens, analyticsSessions).map((row) => (
      `<div><span><b>${row.index + 1}</b>${escapeHtml(row.title)}</span><em>${row.percent}%</em><i><u class="${row.percent < 50 ? 'is-warning' : ''}" style="--progress:${row.percent}%"></u></i></div>`
    )).join('');
  };

  const sessionRowMarkup = (session, index) => {
    const outcome = session.outcome || 'stopped';
    const good = outcome === 'success' || outcome === 'completed';
    return `<button role="row" class="session-row" type="button" data-play-session="${index}">
      <span role="cell"><i class="participant-avatar">${escapeHtml(initials(session.participantName))}</i><b>${escapeHtml(session.participantName || '이름 미입력')}</b></span>
      <span role="cell" class="${good ? 'complete' : 'friction'}">${good ? '<svg><use href="#i-check"></use></svg>' : '<i></i>'}${outcomeLabel(outcome)}</span>
      <span role="cell">${formatDuration(session.duration)}</span>
      <span role="cell">클릭 ${(session.events || []).filter((eventItem) => eventItem.kind === 'click').length}회</span>
      <span role="cell">${formatLocalTime(session.endedAt)}</span>
      <span><svg><use href="#i-play"></use></svg></span>
    </button>`;
  };

  const renderAnalyticsSessions = () => {
    const box = $('.analytics-sessions');
    $('.analytics-sessions-title').textContent = `참여 기록 ${analyticsSessions.length}개`;
    $('.tab-count-sessions').textContent = String(analyticsSessions.length);
    if (!analyticsSessions.length) {
      box.innerHTML = '<p class="question-empty">아직 참여 기록이 없어요. 링크를 공유해보세요.</p>';
    } else {
      box.innerHTML = `<div role="row" class="session-head"><span role="columnheader">참여자</span><span role="columnheader">결과</span><span role="columnheader">소요 시간</span><span role="columnheader">행동</span><span role="columnheader">완료 일시</span><span></span></div>`
        + analyticsSessions.map(sessionRowMarkup).join('');
    }
    $('.analytics-recent').innerHTML = analyticsSessions.length
      ? analyticsSessions.slice(0, 3).map((session, index) => {
          const outcome = session.outcome || 'stopped';
          const good = outcome === 'success' || outcome === 'completed';
          return `<button class="recording-row" type="button" data-play-session="${index}">
            <span class="participant-avatar">${escapeHtml(initials(session.participantName))}</span>
            <span><strong>${escapeHtml(session.participantName || '이름 미입력')}</strong><small>${formatLocalTime(session.endedAt)}</small></span>
            <span class="${good ? 'complete' : 'friction'}">${good ? '<svg><use href="#i-check"></use></svg>' : '<i></i>'}${outcomeLabel(outcome)}</span>
            <span>${formatDuration(session.duration)}</span><svg><use href="#i-play"></use></svg></button>`;
        }).join('')
      : '<p class="question-empty">아직 참여 기록이 없어요.</p>';
  };

  const renderAnalyticsAnswers = () => {
    const box = $('.analytics-answers');
    const questions = (analyticsProject?.questions || []).filter((question) => question.title?.trim());
    if (!questions.length) {
      box.innerHTML = '<p class="question-empty">이 UT에는 사후 질문이 없어요.</p>';
      return;
    }
    // 누가 무엇을 답했는지 한 줄씩. 객관식·척도는 접어두고, 주관식은 이 목록 자체가 본문이에요.
    const respondentRow = ({ session, answer }, type) => {
      const who = `<span class="participant-avatar">${escapeHtml(initials(session.participantName))}</span>
        <span class="answer-respondent-who"><strong>${escapeHtml(session.participantName || '이름 미입력')}</strong><small>${formatLocalTime(session.endedAt)}</small></span>`;
      if (type === 'text') {
        return `<li class="is-text">${who}<p class="answer-respondent-text">${escapeHtml(answer.answer)}</p></li>`;
      }
      const value = type === 'scale' ? `${escapeHtml(String(answer.answer))}점` : escapeHtml(answer.answer);
      return `<li>${who}<span class="answer-respondent-value">${value}</span></li>`;
    };

    box.innerHTML = questions.map((question, index) => {
      const responses = analyticsSessions
        .map((session) => ({ session, answer: (session.answers || []).find((answer) => answer.id === question.id || answer.title === question.title) }))
        .filter(({ answer }) => answer && answer.answer);
      const answers = responses.map(({ answer }) => answer);
      const rows = responses.map((response) => respondentRow(response, question.type)).join('');
      const details = `<details class="answer-respondents"><summary>응답자 ${responses.length}명 · 개별 응답 보기</summary><ul class="answer-respondent-list">${rows}</ul></details>`;
      let body;
      if (!answers.length) {
        body = '<p class="question-empty">아직 응답이 없어요.</p>';
      } else if (question.type === 'scale') {
        const average = answers.reduce((sum, answer) => sum + Number(answer.answer || 0), 0) / answers.length;
        const buckets = [1, 2, 3, 4, 5].map((n) => answers.filter((answer) => Number(answer.answer) === n).length);
        body = `<p class="answer-average">평균 <b>${average.toFixed(1)}</b> / 5 · ${answers.length}명 응답</p>
          <div class="answer-bars">${buckets.map((count, i) => `<div><span>${i + 1}점</span><i><u style="--progress:${Math.round((count / answers.length) * 100)}%"></u></i><em>${count}명</em></div>`).join('')}</div>${details}`;
      } else if (question.type === 'choice') {
        const counts = question.choices.map((choice) => ({ choice, count: answers.filter((answer) => answer.answer === choice).length }));
        body = `<p class="answer-average">${answers.length}명 응답</p>
          <div class="answer-bars">${counts.map(({ choice, count }) => `<div><span>${escapeHtml(choice)}</span><i><u style="--progress:${Math.round((count / answers.length) * 100)}%"></u></i><em>${count}명</em></div>`).join('')}</div>${details}`;
      } else {
        body = `<ul class="answer-respondent-list">${rows}</ul>`;
      }
      return `<section class="answer-block"><h3><b>${index + 1}</b><span>${escapeHtml(question.title)}</span></h3>${body}</section>`;
    }).join('');
  };

  const renderAnalytics = async (projectId) => {
    try {
      const [project, sessions] = await Promise.all([
        api(`/api/uts/${projectId}`),
        api(`/api/uts/${projectId}/sessions`).catch(() => [])
      ]);
      analyticsProject = project;
      analyticsSessions = (Array.isArray(sessions) ? sessions : [])
        .filter((session) => session.startedAt)
        .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    } catch (error) {
      showToast(error.message || '결과를 불러오지 못했어요.');
      return;
    }
    $('#analytics-title').textContent = analyticsProject.title || '테스트 결과';
    $('.analytics-subtitle').textContent = analyticsSubtitle(analyticsProject, analyticsSessions);
    insightBindContext(analyticsProject, analyticsSessions);
    renderAnalyticsMetrics();
    renderAbCompare();
    renderAnalyticsFunnel();
    renderAnalyticsSessions();
    renderAnalyticsAnswers();
  };


  // ── 참여 기록 다시보기 ───────────────────────────────────────
  const player = $('.recording-player');
  let playerOpener;
  let playerSession = null;
  let rrPlayer = null;              // rrweb 재생기 인스턴스
  let rrLoading = null;             // 라이브러리 로드 약속

  const clockText = (ms) => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  // 재생기는 무거워서 처음 볼 때만 불러와요
  const loadReplayLib = () => {
    if (window.rrwebPlayer) return Promise.resolve(true);
    if (rrLoading) return rrLoading;
    rrLoading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = '/vendor/rrweb-player.min.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.append(script);
    });
    return rrLoading;
  };

  const destroyReplay = () => {
    const mount = $('.replay-mount');
    if (mount) mount.innerHTML = '';
    rrPlayer = null;
  };

  const renderReplay = async () => {
    const mount = $('.replay-mount');
    const empty = $('.replay-empty');
    if (!mount || !playerSession) return;
    const events = playerSession.replay || [];
    // rrweb은 스냅샷 1개 + 변화 1개 이상이 있어야 재생할 수 있어요
    if (events.length < 2) {
      destroyReplay();
      empty.hidden = false;
      empty.textContent = playerSession.replay
        ? '기록된 화면 변화가 없어요.'
        : '이 참여는 화면 기록 기능이 생기기 전에 진행돼서 다시 볼 수 없어요.';
      return;
    }
    empty.hidden = true;
    if (rrPlayer) return;           // 이미 만들어져 있으면 그대로
    if (!(await loadReplayLib())) {
      empty.hidden = false;
      empty.textContent = '재생기를 불러오지 못했어요.';
      return;
    }
    const Player = window.rrwebPlayer?.default || window.rrwebPlayer;
    const box = mount.getBoundingClientRect();
    mount.innerHTML = '';
    rrPlayer = new Player({
      target: mount,
      props: {
        events,
        width: Math.max(320, Math.round(box.width) || 720),
        height: Math.max(320, Math.round(box.height) - 80 || 520),
        autoPlay: false,
        showController: true,
        speedOption: [1, 2, 4, 8],
        mouseTail: { strokeStyle: 'rgba(72, 183, 237, 0.6)', lineWidth: 3 }
      }
    });
    // 재생기 기본 문구가 영어예요
    window.setTimeout(() => {
      mount.querySelectorAll('.rr-controller__btns span, .rr-controller__btns label').forEach((el) => {
        if (/skip\s*inactive/i.test(el.textContent)) el.textContent = '빈 구간 건너뛰기';
      });
    }, 0);
  };

  const ACTION_LABELS = {
    'page-view': '화면 진입',
    'condition-met': '목표 화면 도달',
    submit: '폼 제출',
    'success-match': '정답 입력'
  };

  const buildSessionTimeline = (session) => {
    const started = session.startedAt || session.events?.[0]?.at || 0;
    const rows = (session.events || [])
      .filter((eventItem) => ACTION_LABELS[eventItem.kind] || eventItem.kind === 'click')
      .map((eventItem) => {
        const detail = eventItem.detail || {};
        return {
          at: Math.max(0, (eventItem.at || started) - started),
          page: detail.pageTitle || detail.pagePath || '화면',
          kind: eventItem.kind,
          action: eventItem.kind === 'click'
            ? `“${detail.text || detail.tag || '요소'}” 클릭`
            : ACTION_LABELS[eventItem.kind]
        };
      })
      .sort((a, b) => a.at - b.at);
    // 머문 시간 = 다음 행동까지. 마지막 줄은 테스트가 끝날 때까지예요.
    const finishedAt = session.endedAt && started ? Math.max(0, session.endedAt - started) : (rows.length ? rows[rows.length - 1].at : 0);
    return rows.map((row, index) => ({
      ...row,
      stay: Math.max(0, (index + 1 < rows.length ? rows[index + 1].at : finishedAt) - row.at)
    }));
  };

  const renderSessionDetail = (session) => {
    const box = $('.detail-rows');
    if (!box) return;
    const rows = buildSessionTimeline(session);
    box.innerHTML = rows.length
      ? rows.map((row) => `<div role="row" class="detail-row${row.kind === 'click' ? ' is-click' : ''}">
          <span role="cell">${clockText(row.at)}</span>
          <span role="cell" title="${escapeHtml(row.page)}">${escapeHtml(row.page)}</span>
          <span role="cell">${escapeHtml(row.action)}</span>
          <span role="cell">${formatDuration(row.stay)}</span>
        </div>`).join('')
      : '<p class="question-empty">기록된 행동이 없어요.</p>';
  };

  const setPlayerTab = (name) => {
    $$('[data-player-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.playerTab === name)));
    $$('[data-player-panel]').forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.playerPanel === name));
    // 숨어있는 동안엔 크기를 못 재요. 보일 때 만듭니다.
    if (name === 'replay') renderReplay();
  };

  const openSessionPlayer = (session, opener) => {
    playerOpener = opener;
    playerSession = session;
    destroyReplay();
    renderSessionDetail(session);
    setPlayerTab('detail');
    const clicks = (session.events || []).filter((eventItem) => eventItem.kind === 'click').length;
    $('.player-avatar').textContent = initials(session.participantName);
    $('#player-title').textContent = session.participantName || '이름 미입력';
    $('.player-subtitle').textContent = `${outcomeLabel(session.outcome)} · ${formatDuration(session.duration)} · 클릭 ${clicks}회`;
    player.hidden = false;
    body.classList.add('is-locked');
    $('.player-close').focus();
  };

  const closePlayer = () => {
    destroyReplay();
    player.hidden = true;
    if (!$('.modal-backdrop:not([hidden])') && runner.hidden) body.classList.remove('is-locked');
    playerOpener?.focus?.();
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-play-session]');
    if (!button) return;
    const session = analyticsSessions[Number(button.dataset.playSession)];
    if (session) openSessionPlayer(session, button);
  });
  $$('[data-player-tab]').forEach((tab) => tab.addEventListener('click', () => setPlayerTab(tab.dataset.playerTab)));
  $('.player-close').addEventListener('click', closePlayer);
  player.addEventListener('mousedown', (event) => {
    if (event.target === player) closePlayer();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      sidebar.classList.remove('is-open');
      mobileMenuButton?.setAttribute('aria-expanded', 'false');
    }
  });

  // ── 참여자 링크(/t/<id>)로 들어온 경우 ────────────────────────
  const showParticipantError = (message) => {
    const shell = $('.app-shell');
    if (shell) {
      shell.hidden = false;
      shell.innerHTML = `<div class="participant-message">
        <img src="/assets/yoryeong.png" alt="" width="120" height="124">
        <h1>테스트를 열지 못했어요</h1>
        <p>${escapeHtml(message)}</p>
      </div>`;
    }
  };

  const bootParticipant = async () => {
    body.dataset.mode = 'participant';
    if (participantPreview) {
      body.dataset.preview = '1';
      const flag = $('.runner-preview-flag');
      if (flag) flag.hidden = false;
    }
    const shell = $('.app-shell');
    if (shell) shell.hidden = true;
    try {
      const [project, sessions] = await Promise.all([
        api(`/api/uts/${participantUtId}`),
        api(`/api/uts/${participantUtId}/sessions`).catch(() => [])
      ]);
      // A/B는 링크에 들어온 순서대로 번갈아 배정해요
      const isAb = (project.mode === 'ab' || project.utType === 'ab') && (project.htmlB || project.figmaEmbedB);
      if (isAb) {
        participantVariant = (Array.isArray(sessions) ? sessions.length : 0) % 2 === 0 ? 'A' : 'B';
        if (participantVariant === 'B') {
          if (project.htmlB) project.html = project.htmlB;
          if (project.figmaEmbedB) project.figmaEmbed = project.figmaEmbedB;
          if (project.screensB?.length) project.screens = project.screensB;
          // B안은 화면 id가 달라서 목표도 B안 것으로 바꿔줘야 성공 판정이 맞아요
          const reachB = project.config?.pageReach?.screenIdB;
          if (reachB) {
            project.config.pageReach.screenId = reachB;
            project.config.pageReach.screenTitle = project.config.pageReach.screenTitleB || reachB;
            if (project.tasks?.[0]) {
              project.tasks[0].screenId = reachB;
              project.tasks[0].pageTarget = reachB;
            }
          }
        }
      }
      openRunner(null, project);
    } catch (error) {
      showParticipantError(error.message || '링크가 만료됐거나 삭제된 테스트예요.');
    }
  };

  // ── 설정 (워크스페이스 · 계정) ─────────────────────────────
  // 로그인 연동 전이라 브라우저에만 저장해요. 서버가 붙으면 이 자리만 바꾸면 됩니다.
  const SETTINGS_KEY = 'yoti-settings';
  const DEFAULT_SETTINGS = { accountName: '김태은', accountEmail: 'jensen@plitsoft.com' };

  const readSettings = () => {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch (error) { return { ...DEFAULT_SETTINGS }; }
  };

  const writeSettings = (patch) => {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (error) { /* 저장 못 해도 화면은 갱신 */ }
    return next;
  };

  const applySettings = (settings) => {
    const initial = settings.accountName.trim().charAt(0) || '?';
    $$('[data-account-name]').forEach((el) => { el.textContent = settings.accountName; });
    $$('[data-account-email]').forEach((el) => { el.textContent = settings.accountEmail; });
    $$('[data-account-initial]').forEach((el) => { el.textContent = initial; });
    const avatarButton = $('.avatar-button');
    if (avatarButton) {
      avatarButton.textContent = initial;
      avatarButton.setAttribute('aria-label', `${settings.accountName} 계정 메뉴`);
    }
    const accountNameInput = $('#account-name');
    if (accountNameInput) accountNameInput.value = settings.accountName;
    const accountEmailInput = $('#account-email');
    if (accountEmailInput) accountEmailInput.value = settings.accountEmail;
  };

  // 빈 값이면 저장을 막고 에러를 띄워요
  const validateName = (input, errorId) => {
    const error = $(`#${errorId}`);
    const ok = Boolean(input?.value.trim());
    input?.classList.toggle('is-error', !ok);
    error?.classList.toggle('is-visible', !ok);
    if (!ok) input?.focus();
    return ok;
  };

  $('#account-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#account-name');
    if (!validateName(input, 'account-name-error')) return;
    applySettings(writeSettings({ accountName: input.value.trim() }));
    showToast('계정 이름을 저장했어요.');
  });

  $('#account-name')?.addEventListener('input', () => validateName($('#account-name'), 'account-name-error'));

  $('#account-signout')?.addEventListener('click', () => {
    showToast('로그인 연동 후에 쓸 수 있어요.');
  });


  // ── 요령이 — 쌓인 데이터로 바로 물어보는 챗봇 ──────────────────
  const chatRoot = $('.yoti-chat');
  const chatFab = $('.yoti-chat-fab');
  const chatPanel = $('.yoti-chat-panel');
  const chatLog = $('.yoti-chat-log');
  const chatInput = $('.yoti-chat-input');
  const chatSuggestions = $('.yoti-chat-suggestions');
  const chatContextButton = $('.yoti-chat-context-button');
  const chatContextList = $('.yoti-chat-context-list');
  const chatExpandButton = $('.yoti-chat-expand');

  let chatProject = null;
  let chatSessions = [];
  let chatBusy = false;
  const chatThreads = new Map();   // UT마다 대화를 따로 기억해요

  const chatInline = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // 굵게와 목록만 받는 아주 작은 마크다운
  const chatMarkup = (text) => {
    const out = [];
    let list = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.join('')}</ul>`); list = []; } };
    String(text).split('\n').forEach((raw) => {
      const line = raw.trimEnd();
      if (/^[-·]\s+/.test(line)) { list.push(`<li>${chatInline(line.replace(/^[-·]\s+/, ''))}</li>`); return; }
      flush();
      if (line.trim()) out.push(`<p>${chatInline(line)}</p>`);
    });
    flush();
    return out.join('');
  };

  const chatScroll = () => { chatLog.scrollTop = chatLog.scrollHeight; };

  // 답이 어떤 탭의 숫자에서 나왔는지 — 눌러서 바로 넘어갈 수 있게
  const insightTargetTab = (question) => {
    const q = String(question).replace(/\s+/g, '');
    const has = (...words) => words.some((word) => q.includes(word));
    if (has('답변', '설문', '응답', '만족', '점수')) return { tab: 'answers', label: '질문 응답에서 보기' };
    if (has('참여자', '몇명', '누가', '기록', '클릭', '눌렀', '시간', '얼마나')) return { tab: 'recordings', label: '참여 기록에서 보기' };
    if (has('도달', '이탈', '막힌', '막혔', '퍼널', '화면')) return { tab: 'overview', label: '개요에서 화면별 도달 보기' };
    return { tab: 'overview', label: '개요에서 보기' };
  };

  const chatPush = (role, text, action = null) => {
    const item = document.createElement('div');
    item.className = `chat-message is-${role}`;
    const jump = action && chatProject
      ? `<button class="chat-jump" type="button" data-chat-jump="${escapeHtml(action.tab)}">${escapeHtml(action.label)}<svg><use href="#i-chevron-right"></use></svg></button>`
      : '';
    item.innerHTML = role === 'bot'
      ? `<span class="chat-message-avatar"><span class="chat-face"><img src="/assets/yoryeong.png" alt="" /></span></span>
         <div class="chat-message-body"><div class="chat-bubble">${chatMarkup(text)}</div>${jump}</div>`
      : `<div class="chat-bubble">${escapeHtml(text)}</div>`;
    chatLog.append(item);
    chatScroll();
    return item;
  };

  const chatTyping = () => {
    const item = document.createElement('div');
    item.className = 'chat-message is-bot';
    item.innerHTML = `<span class="chat-message-avatar"><span class="chat-face"><img src="/assets/yoryeong.png" alt="" /></span></span>
      <div class="chat-bubble chat-typing"><i></i><i></i><i></i></div>`;
    chatLog.append(item);
    chatScroll();
    return item;
  };

  // 모델에는 원본 이벤트가 아니라 이 요약만 보냅니다
  const insightDigest = () => {
    const sessions = chatSessions;
    const total = sessions.length;
    const screens = chatProject?.screens || [];
    const bucket = (...names) => sessions.filter((session) => names.includes(session.outcome)).length;
    const finished = sessions.filter((session) => ['success', 'completed', 'failed'].includes(session.outcome));
    const average = finished.length
      ? Math.round(finished.reduce((sum, session) => sum + (session.duration || 0), 0) / finished.length) : 0;

    const rows = screenReachRows(screens, sessions);
    let dropoff = null;
    rows.forEach((row, index) => {
      if (!index) return;
      const lost = rows[index - 1].reached - row.reached;
      if (lost > 0 && (!dropoff || lost > dropoff.빠진사람)) {
        dropoff = { 앞화면: rows[index - 1].title, 뒷화면: row.title, 빠진사람: lost };
      }
    });

    const clicks = new Map();
    const errors = [];
    sessions.forEach((session) => (session.events || []).forEach((eventItem) => {
      if (eventItem.kind === 'click') {
        const text = String(eventItem.detail?.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text.length >= 2) clicks.set(text, (clicks.get(text) || 0) + 1);
      }
      if (eventItem.kind === 'runtime-error') errors.push(String(eventItem.detail?.message || '').slice(0, 120));
    }));

    const questions = (chatProject?.questions || []).filter((question) => question.title?.trim()).map((question) => {
      const answers = sessions
        .map((session) => (session.answers || []).find((answer) => answer.id === question.id || answer.title === question.title))
        .filter((answer) => answer && answer.answer);
      const row = { 질문: question.title, 응답수: `${answers.length}/${total}명` };
      if (!answers.length) return row;
      if (question.type === 'scale') {
        row.평균점수 = Number((answers.reduce((sum, answer) => sum + Number(answer.answer || 0), 0) / answers.length).toFixed(1));
        row.점수분포 = [1, 2, 3, 4, 5].map((n) => `${n}점 ${answers.filter((answer) => Number(answer.answer) === n).length}명`).join(', ');
      } else if (question.type === 'choice') {
        row.선택분포 = (question.choices || []).map((choice) => `${choice} ${answers.filter((answer) => answer.answer === choice).length}명`).join(', ');
      } else {
        row.주관식답변 = answers.map((answer) => String(answer.answer).slice(0, 200));
      }
      return row;
    });

    const reach = computeScreenReach(screens, sessions);
    const records = sessions.map((session, index) => {
      const ids = reach[index] || new Set();
      const last = screens.reduce((acc, screen, order) => (ids.has(screen.id) ? order : acc), -1);
      return {
        이름: session.participantName || '이름 미입력',
        결과: outcomeLabel(session.outcome || 'stopped'),
        소요시간: formatDuration(session.duration),
        마지막화면: last >= 0 ? (screens[last].title || screens[last].id) : '기록 없음',
        클릭수: (session.events || []).filter((eventItem) => eventItem.kind === 'click').length,
      };
    });

    return {
      테스트: {
        제목: chatProject?.title || '',
        목표: chatProject?.goal || '',
        설명: chatProject?.brief || '',
        만든방식: { ai: 'AI 생성', html: 'HTML 업로드' }[chatProject?.method] || chatProject?.method || '',
        성공판정: chatProject?.utType === 'none' ? '없음 — 완료 기록만 모아요' : (utTypeLabels[chatProject?.utType] || chatProject?.utType || ''),
      },
      과업: (chatProject?.tasks || []).map((task) => ({ 지시문: task.instruction, 성공조건: task.success })),
      참여자: { 전체: `${total}명`, 성공: bucket('success'), 완료: bucket('completed'), 실패: bucket('failed'), 중도이탈: bucket('gaveup', 'timeout', 'stopped') },
      소요시간: { 평균: formatDuration(average), 기준: '끝까지 진행한 사람만' },
      화면별도달: rows.map((row) => ({ 순서: row.index + 1, 화면: row.title, 도달: `${row.reached}/${row.total}명` })),
      가장크게빠진구간: dropoff,
      사후질문: questions,
      많이누른것: [...clicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, n]) => `${text} (${n}회)`),
      화면오류: errors.slice(0, 5),
      참여기록: records,
      주의: total < 5 ? `참여자가 ${total}명뿐이라 퍼센트로 일반화하면 안 돼요. "${total}명 중 몇 명"으로 세어서 말해주세요.` : '',
    };
  };

  // 숫자만으로 답이 되는 질문은 서버를 부르지 않고 바로 셉니다
  const localInsight = (question) => {
    if (!chatProject) return null;
    const q = question.replace(/\s+/g, '');
    const has = (...words) => words.some((word) => q.includes(word));
    // 이유·해석·제안을 묻는 건 모델이 낫습니다
    if (has('왜', '이유', '원인', '개선', '제안', '추천', '생각', '어떨까', '해석', '괜찮', '문제', '바꾸', '해야', '의미')) return null;

    const total = chatSessions.length;
    if (!total) return '아직 참여 기록이 없어요. 링크를 공유해서 한 명이라도 들어오면 바로 세어드릴게요.';
    const count = (n) => (total < 5 ? `${total}명 중 ${n}명` : `${n}명 (${Math.round((n / total) * 100)}%)`);
    const bucket = (...names) => chatSessions.filter((session) => names.includes(session.outcome)).length;

    if (has('도달', '이탈', '막힌', '막혔', '퍼널', '어디까지', '화면별', '빠져', '어디서')) {
      const rows = screenReachRows(chatProject.screens || [], chatSessions);
      if (!rows.length) return '이 UT에는 화면 목록이 없어서 도달을 셀 수 없어요.';
      let worst = null;
      rows.forEach((row, index) => {
        if (!index) return;
        const lost = rows[index - 1].reached - row.reached;
        if (lost > 0 && (!worst || lost > worst.lost)) worst = { lost, from: rows[index - 1], to: row };
      });
      const lines = rows.map((row) => `- ${row.index + 1}. ${row.title} — ${count(row.reached)}`).join('\n');
      const tail = worst
        ? `\n**${worst.from.title} → ${worst.to.title}**에서 ${worst.lost}명이 빠졌어요. 여기가 제일 크게 끊긴 구간이에요.`
        : '\n중간에 크게 빠지는 구간은 없어요.';
      return `화면별로 여기까지 갔어요.\n${lines}\n${tail}`;
    }

    if (has('답변', '설문', '응답', '만족', '점수', '평균점수')) {
      const questions = (chatProject.questions || []).filter((item) => item.title?.trim());
      if (!questions.length) return '이 UT에는 사후 질문이 없어요.';
      const lines = questions.map((item) => {
        const answers = chatSessions
          .map((session) => (session.answers || []).find((answer) => answer.id === item.id || answer.title === item.title))
          .filter((answer) => answer && answer.answer);
        if (!answers.length) return `- ${item.title} — 아직 응답 없음`;
        if (item.type === 'scale') {
          const avg = (answers.reduce((sum, answer) => sum + Number(answer.answer || 0), 0) / answers.length).toFixed(1);
          return `- ${item.title} — 평균 **${avg}점** (${answers.length}명 응답)`;
        }
        if (item.type === 'choice') {
          const top = (item.choices || [])
            .map((choice) => ({ choice, n: answers.filter((answer) => answer.answer === choice).length }))
            .sort((a, b) => b.n - a.n)[0];
          return `- ${item.title} — 가장 많은 답은 **${top?.choice || '—'}** (${top?.n || 0}명)`;
        }
        return `- ${item.title} — ${answers.length}명이 적었어요: "${String(answers[0].answer).slice(0, 60)}"${answers.length > 1 ? ' 외' : ''}`;
      }).join('\n');
      return `사후 질문 응답이에요.\n${lines}`;
    }

    if (has('성공', '실패', '완료율', '성공률', '결과')) {
      const judged = chatProject.utType !== 'none';
      const success = bucket('success');
      const done = bucket('success', 'completed', 'failed');
      const head = judged
        ? `${count(success)}이 과업에 성공했어요.`
        : `${count(done)}이 끝까지 진행했어요. 이 UT는 성공 조건을 안 걸어둬서 완료 여부만 봐요.`;
      return `${head}\n- 성공 ${success}명 · 완료 ${bucket('completed')}명 · 실패 ${bucket('failed')}명 · 중도 이탈 ${bucket('gaveup', 'timeout', 'stopped')}명`;
    }

    if (has('시간', '얼마나걸', '오래', '빠르')) {
      const finished = chatSessions.filter((session) => ['success', 'completed', 'failed'].includes(session.outcome));
      if (!finished.length) return '끝까지 진행한 사람이 아직 없어서 평균 시간을 낼 수 없어요.';
      const durations = finished.map((session) => session.duration || 0);
      const average = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
      return `평균 **${formatDuration(average)}** 걸렸어요. 끝까지 진행한 ${finished.length}명 기준이고, 가장 빠른 사람은 ${formatDuration(Math.min(...durations))}, 가장 오래 걸린 사람은 ${formatDuration(Math.max(...durations))}였어요.`;
    }

    if (has('클릭', '눌렀', '많이누', '어떤버튼')) {
      const clicks = new Map();
      chatSessions.forEach((session) => (session.events || []).forEach((eventItem) => {
        if (eventItem.kind !== 'click') return;
        const text = String(eventItem.detail?.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text.length >= 2) clicks.set(text, (clicks.get(text) || 0) + 1);
      }));
      if (!clicks.size) return '클릭 기록이 아직 없어요.';
      const top = [...clicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return `많이 누른 것들이에요.\n${top.map(([text, n]) => `- ${text} — ${n}회`).join('\n')}`;
    }

    if (has('참여자', '몇명', '몇사람', '누가')) {
      const names = chatSessions.map((session) => session.participantName || '이름 미입력').slice(0, 8);
      return `지금까지 **${total}명**이 참여했어요.\n- ${names.join(', ')}${chatSessions.length > 8 ? ' 외' : ''}`;
    }

    if (has('요약', '어땠', '어때', '인사이트', '정리', '전반', '알려줘', '한마디', '봐줘')) {
      const judged = chatProject.utType !== 'none';
      const success = bucket('success');
      const done = bucket('success', 'completed', 'failed');
      const rows = screenReachRows(chatProject.screens || [], chatSessions);
      let worst = null;
      rows.forEach((row, index) => {
        if (!index) return;
        const lost = rows[index - 1].reached - row.reached;
        if (lost > 0 && (!worst || lost > worst.lost)) worst = { lost, from: rows[index - 1], to: row };
      });
      const parts = [
        judged ? `${total}명이 참여해서 ${count(success)}이 과업에 성공했어요.` : `${total}명이 참여했고 ${count(done)}이 끝까지 갔어요.`,
      ];
      if (worst) parts.push(`가장 크게 끊긴 곳은 **${worst.from.title} → ${worst.to.title}**로 ${worst.lost}명이 빠졌어요.`);
      else if (rows.length) parts.push('화면 사이에서 크게 빠지는 구간은 없어요.');
      const scale = (chatProject.questions || []).find((item) => item.type === 'scale');
      if (scale) {
        const answers = chatSessions
          .map((session) => (session.answers || []).find((answer) => answer.id === scale.id || answer.title === scale.title))
          .filter((answer) => answer && answer.answer);
        if (answers.length) {
          const avg = (answers.reduce((sum, answer) => sum + Number(answer.answer || 0), 0) / answers.length).toFixed(1);
          parts.push(`"${scale.title}"은 평균 ${avg}점이에요.`);
        }
      }
      if (total < 5) parts.push(`다만 ${total}명은 경향을 말하기엔 적어요. 여기까지는 "이런 사람이 있었다" 정도로만 보는 게 안전해요.`);
      return parts.join(' ');
    }
    return null;
  };

  const chatRenderSuggestions = () => {
    const chips = !chatProject
      ? []
      : !chatSessions.length
      ? ['이 UT는 뭘 보려는 거야?']
      : ['이 데이터 어땠어?', '어디서 제일 많이 막혔어?', '이걸로 뭘 말할 수 있어?'];
    chatSuggestions.innerHTML = chips.map((chip) => `<button type="button" class="chat-chip">${escapeHtml(chip)}</button>`).join('');
  };

  const chatRestore = () => {
    chatLog.innerHTML = '';
    const thread = chatThreads.get(chatProject?.id) || [];
    if (thread.length) {
      thread.forEach((message) => chatPush(message.role === 'user' ? 'user' : 'bot', message.content, message.action || null));
    } else if (chatProject) {
      chatPush('bot', chatSessions.length
        ? `**${chatProject.title}** 데이터를 보고 있어요. 참여 기록 ${chatSessions.length}개가 쌓였네요. 뭐가 궁금하세요?`
        : `**${chatProject.title}**을 보고 있어요. 아직 참여 기록이 없어서 숫자로는 답해드릴 게 없어요.`);
    } else {
      chatPush('bot', '어떤 UT의 데이터가 궁금한지 위에서 골라주세요.');
    }
    chatRenderSuggestions();
  };

  const chatSetContext = (project, sessions) => {
    chatProject = project || null;
    chatSessions = Array.isArray(sessions) ? sessions : [];
    $('.yoti-chat-context-name').textContent = chatProject?.title || 'UT를 골라주세요';
    $('.yoti-chat-context-meta').textContent = chatProject
      ? `참여 ${chatSessions.length}명 · 화면 ${(chatProject.screens || []).length}개` : '';
    if (chatPanel && !chatPanel.hidden) chatRestore();
  };

  // 프로젝트 상세를 열면 그 UT가 자동으로 물립니다
  const insightBindContext = (project, sessions) => {
    if (participantMode || !chatRoot) return;
    chatSetContext(project, sessions);
  };

  const chatLoadProject = async (projectId) => {
    const [project, sessions] = await Promise.all([
      api(`/api/uts/${encodeURIComponent(projectId)}`),
      api(`/api/uts/${encodeURIComponent(projectId)}/sessions`).catch(() => []),
    ]);
    chatSetContext(project, (Array.isArray(sessions) ? sessions : [])
      .filter((session) => session.startedAt)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)));
    chatRestore();
  };

  const chatRenderContextList = async () => {
    chatContextList.innerHTML = '<li class="chat-context-empty">불러오는 중이에요...</li>';
    try {
      const projects = await api('/api/uts');
      projects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      chatContextList.innerHTML = projects.length
        ? projects.map((project) => `<li><button type="button" data-chat-project="${escapeHtml(project.id)}"${project.id === chatProject?.id ? ' aria-current="true"' : ''}><strong>${escapeHtml(project.title)}</strong><small>참여 ${project.sessionCount || 0}명</small></button></li>`).join('')
        : '<li class="chat-context-empty">아직 만든 UT가 없어요.</li>';
    } catch (error) {
      chatContextList.innerHTML = '<li class="chat-context-empty">목록을 불러오지 못했어요.</li>';
    }
  };

  const chatAsk = async (question) => {
    if (chatBusy || !question.trim()) return;
    const text = question.trim().slice(0, 500);
    chatPush('user', text);
    const thread = chatThreads.get(chatProject?.id) || [];
    thread.push({ role: 'user', content: text });
    chatThreads.set(chatProject?.id, thread);

    const action = chatSessions.length ? insightTargetTab(text) : null;
    const local = localInsight(text);
    if (local) {
      chatPush('bot', local, action);
      thread.push({ role: 'assistant', content: local, action });
      return;
    }
    if (!chatProject) {
      const guide = '어떤 UT에 대한 질문인지 위에서 먼저 골라주세요.';
      chatPush('bot', guide);
      thread.push({ role: 'assistant', content: guide });
      return;
    }

    chatBusy = true;
    chatRoot.classList.add('is-busy');
    const typing = chatTyping();
    try {
      const result = await api('/api/insight', {
        method: 'POST',
        body: { question: text, digest: insightDigest(), history: thread.slice(-7, -1) },
      });
      typing.remove();
      const modelAction = result.source === 'model' ? action : null;
      chatPush('bot', result.answer, modelAction);
      thread.push({ role: 'assistant', content: result.answer, action: modelAction });
    } catch (error) {
      typing.remove();
      chatPush('bot', error.message || '답을 만들지 못했어요. 잠시 뒤 다시 물어봐주세요.');
    } finally {
      chatBusy = false;
      chatRoot.classList.remove('is-busy');
      chatInput.focus();
    }
  };

  // 전체화면이면 접고, 그 UT의 해당 지표 탭으로 데려가요
  const chatJumpTo = async (tab) => {
    if (!chatProject) return;
    chatRoot.classList.remove('is-full');
    chatExpandButton.setAttribute('aria-pressed', 'false');
    chatExpandButton.setAttribute('aria-label', '크게 보기');
    try {
      if (activeHtmlProject?.id !== chatProject.id) await openHtmlProject(chatProject.id);
      else showView('analytics');
      setResultTab(tab);
      if (tab !== 'preview') renderAnalytics(chatProject.id);
    } catch (error) {
      showToast(error.message || '결과 화면으로 가지 못했어요.');
    }
  };

  const chatSetFull = (full) => {
    chatRoot.classList.toggle('is-full', full);
    chatExpandButton.setAttribute('aria-pressed', String(full));
    chatExpandButton.setAttribute('aria-label', full ? '작게 보기' : '크게 보기');
    chatScroll();
  };

  const chatToggle = (open) => {
    if (!chatPanel) return;
    chatPanel.hidden = !open;
    chatFab.setAttribute('aria-expanded', String(open));
    chatRoot.classList.toggle('is-open', open);
    if (!open) {
      chatContextList.hidden = true;
      chatContextButton.setAttribute('aria-expanded', 'false');
      chatSetFull(false);
      return;
    }
    chatRestore();
    chatInput.focus();
  };

  if (chatRoot && !participantMode) {
    chatRoot.hidden = false;
    chatFab.addEventListener('click', () => chatToggle(chatPanel.hidden));
    $('.yoti-chat-close').addEventListener('click', () => { chatToggle(false); chatFab.focus(); });
    chatExpandButton.addEventListener('click', () => chatSetFull(!chatRoot.classList.contains('is-full')));
    // 전체화면일 때 바깥을 누르면 구석으로 접혀요
    chatRoot.addEventListener('click', (event) => {
      if (event.target === chatRoot && chatRoot.classList.contains('is-full')) chatSetFull(false);
    });
    chatLog.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chat-jump]');
      if (button) chatJumpTo(button.dataset.chatJump);
    });

    chatContextButton.addEventListener('click', () => {
      const open = chatContextList.hidden;
      chatContextList.hidden = !open;
      chatContextButton.setAttribute('aria-expanded', String(open));
      if (open) chatRenderContextList();
    });

    chatContextList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-chat-project]');
      if (!button) return;
      chatContextList.hidden = true;
      chatContextButton.setAttribute('aria-expanded', 'false');
      try { await chatLoadProject(button.dataset.chatProject); }
      catch (error) { showToast(error.message || 'UT를 불러오지 못했어요.'); }
    });

    chatSuggestions.addEventListener('click', (event) => {
      const chip = event.target.closest('.chat-chip');
      if (chip) chatAsk(chip.textContent);
    });

    $('.yoti-chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = chatInput.value;
      chatInput.value = '';
      chatInput.style.height = 'auto';
      chatAsk(text);
    });

    // 엔터로 보내고, 시프트+엔터는 줄바꿈이에요
    chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      $('.yoti-chat-form').requestSubmit();
    });
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 96)}px`;
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || chatPanel.hidden) return;
      if (chatRoot.classList.contains('is-full')) { chatSetFull(false); return; }
      chatToggle(false);
      chatFab.focus();
    });
  }


  if (!participantMode) applySettings(readSettings());

  // ── 관리자 로그인 ────────────────────────────────────────────
  // 참여자 링크는 로그인 없이 열려야 해요. 잠그는 건 관리 화면뿐입니다.
  const appShell = $('.app-shell');
  const loginGate = $('.login-gate');
  const loginForm = $('.login-card');
  const loginPassword = $('#login-password');
  const loginError = $('.login-error');
  const loginSubmit = $('.login-submit');

  const showLoginGate = () => {
    if (!loginGate) return;
    loginGate.hidden = false;
    appShell.hidden = true;
    loginPassword.focus();
  };

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = loginPassword.value;
    if (!password) return;
    loginSubmit.disabled = true;
    loginError.hidden = true;
    try {
      await api('/api/login', { method: 'POST', body: { password } });
      loginGate.hidden = true;
      appShell.hidden = false;
      loginPassword.value = '';
      loadConfig();
      renderImportedProjects();
    } catch (error) {
      loginError.textContent = error.message || '비밀번호가 맞지 않아요.';
      loginError.hidden = false;
      loginPassword.select();
    } finally {
      loginSubmit.disabled = false;
    }
  });

  onSessionExpired = () => {
    if (!loginGate || !loginGate.hidden) return;
    showLoginGate();
    showToast('로그인이 만료됐어요. 다시 들어와주세요.');
  };

  const bootAdmin = async () => {
    let state = { authRequired: false, authed: true };
    try {
      state = await api('/api/session');
    } catch (error) { /* 서버가 예전 버전이면 그냥 열어둬요 */ }
    if (state.authRequired && !state.authed) {
      showLoginGate();
      return;
    }
    loadConfig();
    renderImportedProjects();
  };

  if (participantMode) {
    loadConfig();
    bootParticipant();
  } else bootAdmin();
})();
