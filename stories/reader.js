/**
 * Trees Pinyin™ — Universal 4K Interactive Storybook Reader (stories/reader.js)
 * Reuses official site modules:
 *  - TreesCompiler (../js/compiler.js)
 *  - TREES_DICT (../js/dict.js)
 *  - TreesFunData & TreesFunHub (../js/fun-data.js, ../js/fun-hub.js) -> tpCharMnemonicBar
 *  - TreesStoriesMembership (./membership.js) -> Pro gating & Cloudflare R2 media URLs
 */
(function () {
  const Membership = window.TreesStoriesMembership;

  const state = {
    catalog: null,
    bookEntry: null,
    bookData: null,
    pages: [],
    pageIndex: 0,
    lastUnlockedIndex: 0,
    isReadingPage: false,
    speechSeq: 0,
    activeAudio: null,
    activeTokenId: null,
    activeSpeakerKey: null,
    activeHotspot: null,
    cachedVoices: [],
    overrides: {},
    editingToken: null,
    webcamStream: null,
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    displayStream: null,
    micStream: null,
    audioCtx: null,
  };

  // DOM References
  const bookTitleEl = document.getElementById("book-title");
  const stageEl = document.getElementById("book-stage");
  const artworkLayer = document.getElementById("artwork-layer");
  const hotspotsLayer = document.getElementById("hotspots-layer");
  const contentLayer = document.getElementById("content-layer");
  const pageDotsEl = document.getElementById("page-dots");

  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnReadPage = document.getElementById("btn-read-page");
  const btnRecord = document.getElementById("btn-record");
  const btnFullscreen = document.getElementById("btn-fullscreen");

  const speechBubble = document.getElementById("speech-bubble");
  const bubbleSpeaker = document.getElementById("bubble-speaker");
  const bubbleBody = document.getElementById("bubble-body");
  const bubbleClose = document.getElementById("bubble-close");

  const proPaywall = document.getElementById("pro-paywall");
  const paywallTitle = document.getElementById("paywall-title");
  const paywallSub = document.getElementById("paywall-sub");
  const paywallSubscribeBtn = document.getElementById("paywall-subscribe-btn");
  const paywallBackBtn = document.getElementById("paywall-back-btn");
  const paywallCodeInput = document.getElementById("paywall-code-input");
  const paywallCodeBtn = document.getElementById("paywall-code-btn");
  const paywallCodeMsg = document.getElementById("paywall-code-msg");

  const webcamPip = document.getElementById("webcam-pip");
  const webcamVideo = document.getElementById("webcam-video");
  const webcamClose = document.getElementById("webcam-close");
  const recBadge = document.getElementById("rec-badge");

  const editModal = document.getElementById("edit-modal");
  const editHanzi = document.getElementById("edit-hanzi");
  const editPinyin = document.getElementById("edit-pinyin");
  const editInput = document.getElementById("edit-input");
  const editSave = document.getElementById("edit-save");
  const editCancel = document.getElementById("edit-cancel");
  const editReset = document.getElementById("edit-reset");

  // Initialize official site mnemonic bar module
  if (window.TreesFunHub && typeof window.TreesFunHub.init === "function") {
    window.TreesFunHub.init();
  }

  // Per-book localStorage overrides for right-click TP editing
  function getOverrideKey() {
    const id = (state.bookEntry && state.bookEntry.id) || "default";
    return `trees_pinyin_story_overrides_${id}_v1`;
  }

  function loadOverrides() {
    try {
      return JSON.parse(localStorage.getItem(getOverrideKey()) || "{}");
    } catch {
      return {};
    }
  }

  function saveOverrides(map) {
    try {
      localStorage.setItem(getOverrideKey(), JSON.stringify(map));
    } catch {}
  }

  // Build reverse S2T map from official TREES_DICT for Taiwanese TTS clarity if speakTw omitted
  const S2T_FALLBACK = {};
  if (typeof TREES_DICT !== "undefined" && TREES_DICT.T2S_MAP) {
    Object.entries(TREES_DICT.T2S_MAP).forEach(([trad, simp]) => {
      if (!S2T_FALLBACK[simp]) S2T_FALLBACK[simp] = trad;
    });
  }

  function compileToken(token) {
    if (!token || token.punct) return token;
    // Always compile via official site TreesCompiler (../js/compiler.js) when pyNum is present
    const compiled = (typeof TreesCompiler !== "undefined" && token.pyNum)
      ? TreesCompiler.compile(token.pyNum)
      : (token.trees || "");
    const speakTw = token.speakTw || S2T_FALLBACK[token.hanzi] || token.hanzi;
    return {
      ...token,
      trees: compiled || token.trees || "",
      speakTw,
    };
  }

  function hydrateBookPages(rawPages) {
    return (rawPages || []).map((page) => {
      const cards = (page.cards || []).map((card) => ({
        ...card,
        tokens: (card.tokens || []).map(compileToken),
      }));
      const hotspots = (page.hotspots || []).map((h) => ({
        ...h,
        dialogue: h.dialogue
          ? {
              ...h.dialogue,
              tokens: (h.dialogue.tokens || []).map(compileToken),
            }
          : null,
      }));
      return { ...page, cards, hotspots };
    });
  }

  // =========================================================================
  // Audio Engine: Dual-Track R2/Local Audio Priority + Taiwan Female TTS
  // =========================================================================
  const MALE_OR_NOVELTY_RE = /\b(albert|alex|bruce|daniel|eddy|fred|grandpa|junior|oliver|ralph|reed|rocko|sandy|shelley|whisper|zarvox|bahh|bells|boing|bubbles|cellos|good news|bad news|jester|organ|superstar|trinoids|wobble|yunjian|yunxi|yunyang|kangkang|zhiwei)\b/i;

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    state.cachedVoices = window.speechSynthesis.getVoices() || [];
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoiceForRole(role) {
    const voices = state.cachedVoices.length ? state.cachedVoices : window.speechSynthesis?.getVoices?.() || [];

    if (role === "narrator_en") {
      return (
        voices.find((v) => /samantha|jenny|ava|allison|aria|karen|victoria/i.test(v.name) && v.lang.startsWith("en")) ||
        voices.find((v) => v.lang === "en-US" && !MALE_OR_NOVELTY_RE.test(v.name)) ||
        voices.find((v) => v.lang.startsWith("en") && !MALE_OR_NOVELTY_RE.test(v.name)) ||
        null
      );
    }

    if (role === "man_tw" || role === "king_tw") {
      return (
        voices.find((v) => /yun|kangkang|zhiwei|male|男|eddy|reed/i.test(v.name) && /zh/i.test(v.lang)) ||
        voices.find((v) => /zh[-_]TW/i.test(v.lang)) ||
        voices.find((v) => /zh/i.test(v.lang)) ||
        null
      );
    }

    // Default & single-character voice: Taiwan Female (Meijia / HsiaoChen / HsiaoYu / zh-TW female)
    return (
      voices.find((v) => /meijia|美佳|hsiaochen|曉臻|hsiaoyu|曉雨/i.test(v.name)) ||
      voices.find((v) => /zh[-_]TW/i.test(v.lang) && !MALE_OR_NOVELTY_RE.test(v.name)) ||
      voices.find((v) => /tingting|婷婷|sinji|善怡|xiaoxiao|曉曉/i.test(v.name)) ||
      voices.find((v) => /zh/i.test(v.lang) && !MALE_OR_NOVELTY_RE.test(v.name)) ||
      null
    );
  }

  const ROLE_TUNING = {
    narrator_en: { lang: "en-US", rate: 0.94, pitch: 1.04 },
    narrator_tw: { lang: "zh-TW", rate: 0.88, pitch: 1.12 },
    deer_tw:     { lang: "zh-TW", rate: 0.86, pitch: 1.16 },
    crow_tw:     { lang: "zh-TW", rate: 1.08, pitch: 1.32 },
    lotus_tw:    { lang: "zh-TW", rate: 0.84, pitch: 1.08 },
    queen_tw:    { lang: "zh-TW", rate: 0.94, pitch: 1.04 },
    man_tw:      { lang: "zh-TW", rate: 0.90, pitch: 0.78 },
    king_tw:     { lang: "zh-TW", rate: 0.84, pitch: 0.72 },
  };

  function resolveBookMedia(relPath) {
    if (!relPath) return "";
    const base = state.bookEntry ? state.bookEntry.mediaBaseUrl : "";
    return Membership.resolveMediaUrl(base, relPath);
  }

  function stopSpeech() {
    state.speechSeq += 1;
    state.isReadingPage = false;
    state.activeTokenId = null;
    state.activeSpeakerKey = null;
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio.currentTime = 0;
      state.activeAudio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    btnReadPage.classList.remove("playing");
    syncActiveHighlights();
  }

  function speak({ role, audioPath = null, text, tokenId = null, speakerKey = null, onEnd = null }) {
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    state.activeTokenId = tokenId;
    state.activeSpeakerKey = speakerKey;
    syncActiveHighlights();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (state.activeTokenId === tokenId) state.activeTokenId = null;
      if (state.activeSpeakerKey === speakerKey) state.activeSpeakerKey = null;
      syncActiveHighlights();
      if (onEnd) onEnd();
    };

    const speakBrowserTTS = () => {
      if (!("speechSynthesis" in window) || !text) {
        finish();
        return;
      }
      const tuning = ROLE_TUNING[role] || ROLE_TUNING.narrator_tw;
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickVoiceForRole(role);
      if (voice) utter.voice = voice;
      utter.lang = tuning.lang;
      utter.rate = tuning.rate;
      utter.pitch = tuning.pitch;
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
    };

    const resolvedAudio = audioPath ? resolveBookMedia(audioPath) : "";
    if (resolvedAudio) {
      const audio = new Audio(resolvedAudio);
      state.activeAudio = audio;
      audio.onended = () => {
        if (state.activeAudio === audio) state.activeAudio = null;
        finish();
      };
      audio.onerror = () => {
        if (state.activeAudio === audio) state.activeAudio = null;
        speakBrowserTTS();
      };
      audio.play().catch(() => {
        if (state.activeAudio === audio) state.activeAudio = null;
        speakBrowserTTS();
      });
    } else {
      speakBrowserTTS();
    }
  }

  function syncActiveHighlights() {
    document.querySelectorAll("[data-token-id]").forEach((el) => {
      el.classList.toggle("active", el.dataset.tokenId === state.activeTokenId);
    });
    document.querySelectorAll("[data-speaker-key]").forEach((el) => {
      el.classList.toggle("speaking", el.dataset.speakerKey === state.activeSpeakerKey);
    });
  }

  // =========================================================================
  // 4-Tier Vertically Aligned Block Rendering (Shared by Story & Bubbles)
  // =========================================================================
  function getTreesValue(token) {
    return state.overrides[token.id] ?? token.trees;
  }

  function formatTreesHtml(str) {
    const escaped = String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return escaped.replace(/\(([^)]+)\)/g, '<span class="silent-paren">($1)</span>');
  }

  function renderEnglishWords(item) {
    return String(item.english || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word, idx) => {
        const cleanWord = word.replace(/^["“”'‘’]+|["“”'‘’.,!?]+$/g, "");
        const wid = `${item.id}-enw-${idx}`;
        return `<span class="word-token" data-token-id="${wid}" data-en-word="${cleanWord}">${word}</span>`;
      })
      .join("");
  }

  function renderAlignedBlockHtml(item) {
    const colsHtml = (item.tokens || [])
      .map((t) => {
        const tpVal = getTreesValue(t);
        if (t.punct) {
          return `
            <span class="aligned-col punct">
              <span class="col-tp">${tpVal}</span>
              <span class="col-hp">${t.pinyin}</span>
              <span class="col-hz">${t.hanzi}</span>
            </span>
          `;
        }
        return `
          <span class="aligned-col" data-token-id="${t.id}" data-editable="1" title="Left-click: speak & memory trick · Right-click: edit Trees Pinyin">
            <span class="col-tp">${formatTreesHtml(tpVal)}</span>
            <span class="col-hp">${t.pinyin}</span>
            <span class="col-hz">${t.hanzi}</span>
          </span>
        `;
      })
      .join("");

    return `
      <div class="aligned-block" data-block-id="${item.id}">
        <div class="en-row">
          <button class="line-speaker-btn" data-speaker-key="${item.id}-en" data-full-lang="en" title="Play English sentence">🔊</button>
          <div class="en-words">${renderEnglishWords(item)}</div>
        </div>
        <div class="zh-aligned-row">
          <button class="line-speaker-btn" data-speaker-key="${item.id}-tw" data-full-lang="tw" title="Play Mandarin sentence">🔊</button>
          <div class="aligned-columns">${colsHtml}</div>
        </div>
      </div>
    `;
  }

  function bindAlignedBlockEvents(container, item, zhRole = "narrator_tw") {
    const blockEl = container.querySelector(`[data-block-id="${item.id}"]`);
    if (!blockEl) return;

    const fullSentenceZh = item.twFullText || (item.tokens || []).map((t) => t.hanzi).join("");

    blockEl.querySelectorAll(".line-speaker-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopSpeech();
        const isEn = btn.dataset.fullLang === "en";
        speak({
          role: isEn ? "narrator_en" : zhRole,
          audioPath: isEn ? item.audioEn : (item.audioTw || item.audio || null),
          text: isEn ? item.english : fullSentenceZh,
          speakerKey: btn.dataset.speakerKey,
        });
      });
    });

    blockEl.querySelectorAll(".word-token").forEach((wordEl) => {
      wordEl.addEventListener("click", () => {
        stopSpeech();
        const w = wordEl.dataset.enWord;
        if (!w) return;
        speak({ role: "narrator_en", text: w, tokenId: wordEl.dataset.tokenId });
      });
    });

    blockEl.querySelectorAll(".aligned-col[data-editable='1']").forEach((colEl) => {
      const token = (item.tokens || []).find((t) => t.id === colEl.dataset.tokenId);
      if (!token) return;

      colEl.addEventListener("click", () => {
        stopSpeech();
        // 1. Single-char left-click: always speak with Taiwan female voice
        speak({
          role: "narrator_tw",
          text: token.speakTw || token.hanzi,
          tokenId: token.id,
        });
        // 2. Synchronously pop up official site tpCharMnemonicBar at bottom
        if (window.TreesFunHub && typeof window.TreesFunHub.showCharBar === "function") {
          window.TreesFunHub.showCharBar(
            token.hanzi,
            getTreesValue(token),
            token.pinyin || "",
            fullSentenceZh
          );
        }
      });

      colEl.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        openEditModal(token);
      });
    });
  }

  // =========================================================================
  // Scenic Fallback Artwork (Used while 4K R2/local images are loading/absent)
  // =========================================================================
  function renderFallbackBackdrop(page) {
    const title = (page && page.chapterEn) || (state.bookData && state.bookData.titleEn) || "Trees Pinyin";
    return `
      <svg class="mural-svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tp-sky" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#17344f"/>
            <stop offset="52%" stop-color="#224c64"/>
            <stop offset="100%" stop-color="#4e3422"/>
          </linearGradient>
          <radialGradient id="tp-halo" cx="68%" cy="42%" r="36%">
            <stop offset="0%" stop-color="#facc15" stop-opacity="0.42"/>
            <stop offset="60%" stop-color="#f59e0b" stop-opacity="0.12"/>
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#tp-sky)"/>
        <rect width="1920" height="1080" fill="url(#tp-halo)"/>
        <path d="M0 720 Q420 520 860 660 T1920 580 L1920 1080 L0 1080 Z" fill="#132c3d" opacity="0.88"/>
        <path d="M0 820 Q560 680 1120 790 T1920 740 L1920 1080 L0 1080 Z" fill="#0d1e2b" opacity="0.92"/>
        <circle cx="1310" cy="410" r="145" fill="none" stroke="#facc15" stroke-opacity="0.28" stroke-width="3"/>
        <circle cx="1310" cy="410" r="96" fill="#facc15" fill-opacity="0.14"/>
        <text x="960" y="450" text-anchor="middle" fill="#fff8e7" fill-opacity="0.2" font-size="64" font-weight="800" font-family="Inter, sans-serif">${title}</text>
      </svg>
    `;
  }

  function renderArtwork(page) {
    artworkLayer.innerHTML = renderFallbackBackdrop(page);
    const rawImg = page.image || page.imagePath || "";
    const resolvedImg = resolveBookMedia(rawImg);
    if (resolvedImg) {
      const img = new Image();
      img.className = "mural-img";
      img.alt = page.chapterEn || "";
      img.onload = () => {
        if (state.pages[state.pageIndex] && state.pages[state.pageIndex].id === page.id) {
          artworkLayer.innerHTML = "";
          artworkLayer.appendChild(img);
        }
      };
      img.src = resolvedImg;
    }
  }

  // =========================================================================
  // Page Rendering & Membership Gating
  // =========================================================================
  function hideCharMnemonicBar() {
    const bar = document.getElementById("tpCharMnemonicBar");
    if (bar) bar.style.display = "none";
  }

  function renderPaywall(page) {
    proPaywall.classList.remove("hidden");
    const bookTitle = (state.bookEntry && state.bookEntry.titleEn) || "this storybook";
    const freeCount = (state.bookEntry && typeof state.bookEntry.freePages === "number")
      ? state.bookEntry.freePages
      : 3;
    paywallTitle.textContent = `Unlock "${bookTitle}"`;
    paywallSub.textContent = `Pages 1–${Math.max(1, freeCount - 1)} (plus Cover) are free to preview. Subscribe to Trees Pinyin Pro to read "${page.chapterEn || page.pageLabel}" and the entire 4K interactive library.`;
    paywallCodeMsg.textContent = "";
    if (state.catalog && state.catalog.subscribeUrl) {
      paywallSubscribeBtn.href = state.catalog.subscribeUrl;
    }
  }

  function hidePaywall() {
    proPaywall.classList.add("hidden");
  }

  function renderPage() {
    stopSpeech();
    hideBubble();
    hideCharMnemonicBar();

    const page = state.pages[state.pageIndex];
    if (!page) return;

    const allowed = Membership.canReadPage(state.bookEntry, state.pageIndex);
    renderArtwork(page);

    if (!allowed) {
      hotspotsLayer.innerHTML = "";
      contentLayer.innerHTML = "";
      renderPaywall(page);
    } else {
      state.lastUnlockedIndex = state.pageIndex;
      hidePaywall();
      renderHotspots(page);

      const blocksHtml = (page.cards || []).map(renderAlignedBlockHtml).join("");
      const isCover = page.type === "cover";

      contentLayer.innerHTML = `
        <div class="bottom-story-band ${isCover ? "cover-band" : ""}">
          ${blocksHtml}
          ${isCover ? `<button id="cover-start-btn" class="cover-start-btn">Start Reading →</button>` : ""}
        </div>
      `;

      if (isCover) {
        const startBtn = document.getElementById("cover-start-btn");
        if (startBtn) startBtn.addEventListener("click", () => goToPage(1));
      }

      (page.cards || []).forEach((card) => bindAlignedBlockEvents(contentLayer, card, "narrator_tw"));
    }

    btnPrev.disabled = state.pageIndex === 0;
    btnNext.disabled = state.pageIndex === state.pages.length - 1;
    renderPageTabs();
  }

  function renderHotspots(page) {
    hotspotsLayer.innerHTML = (page.hotspots || [])
      .map(
        (h) => `
        <button class="hotspot-btn"
                data-hotspot-id="${h.id}"
                style="left: ${h.x}%; top: ${h.y}%;"
                title="Tap to hear ${h.label}">
          <span class="hotspot-dot"></span>
          <span>${h.label}</span>
        </button>
      `
      )
      .join("");

    hotspotsLayer.querySelectorAll(".hotspot-btn").forEach((btn) => {
      const hotspot = (page.hotspots || []).find((h) => h.id === btn.dataset.hotspotId);
      if (!hotspot) return;
      btn.addEventListener("click", () => {
        stopSpeech();
        openHotspotBubble(hotspot);
      });
    });
  }

  function openHotspotBubble(hotspot) {
    if (!hotspot || !hotspot.dialogue) return;
    state.activeHotspot = hotspot;
    bubbleSpeaker.textContent = hotspot.speaker || hotspot.label;
    bubbleBody.innerHTML = renderAlignedBlockHtml(hotspot.dialogue);
    bindAlignedBlockEvents(bubbleBody, hotspot.dialogue, hotspot.voiceRole || "narrator_tw");
    speechBubble.classList.remove("hidden");

    const dlg = hotspot.dialogue;
    speak({
      role: "narrator_en",
      audioPath: dlg.audioEn || null,
      text: dlg.english,
      speakerKey: `${dlg.id}-en`,
    });
  }

  function hideBubble() {
    state.activeHotspot = null;
    speechBubble.classList.add("hidden");
  }

  function renderPageTabs() {
    pageDotsEl.innerHTML = state.pages
      .map((p, idx) => {
        const locked = !Membership.canReadPage(state.bookEntry, idx);
        const label = idx === 0 ? "Cover" : idx;
        return `
          <button class="page-tab ${idx === state.pageIndex ? "active" : ""} ${locked ? "locked" : ""}"
                  role="tab"
                  aria-selected="${idx === state.pageIndex}"
                  data-index="${idx}"
                  title="${p.chapterEn || p.pageLabel}${locked ? " (Pro Member)" : ""}">
            ${label}${locked ? '<span class="lock-mini">🔒</span>' : ""}
          </button>
        `;
      })
      .join("");

    pageDotsEl.querySelectorAll(".page-tab").forEach((tab) => {
      tab.addEventListener("click", () => goToPage(Number(tab.dataset.index)));
    });
  }

  function toggleReadWholePage() {
    if (!Membership.canReadPage(state.bookEntry, state.pageIndex)) return;
    if (state.isReadingPage) {
      stopSpeech();
      return;
    }

    const page = state.pages[state.pageIndex];
    if (!page) return;
    const queue = [];
    (page.cards || []).forEach((card) => {
      queue.push({
        role: "narrator_en",
        audioPath: card.audioEn || null,
        text: card.english,
        speakerKey: `${card.id}-en`,
      });
      queue.push({
        role: "narrator_tw",
        audioPath: card.audioTw || card.audio || null,
        text: card.twFullText,
        speakerKey: `${card.id}-tw`,
      });
    });

    if (!queue.length) return;

    state.isReadingPage = true;
    btnReadPage.classList.add("playing");
    hideBubble();

    let i = 0;
    const nextStep = () => {
      if (!state.isReadingPage || i >= queue.length) {
        state.isReadingPage = false;
        state.activeSpeakerKey = null;
        btnReadPage.classList.remove("playing");
        syncActiveHighlights();
        return;
      }
      speak({ ...queue[i++], onEnd: nextStep });
    };
    nextStep();
  }

  // =========================================================================
  // Right-Click Inline Edit Trees Pinyin Modal
  // =========================================================================
  function openEditModal(token) {
    state.editingToken = token;
    editHanzi.textContent = token.hanzi;
    editPinyin.textContent = token.pinyin || "";
    editInput.value = getTreesValue(token);
    editModal.classList.remove("hidden");
    editInput.focus();
    editInput.select();
  }

  function closeEditModal() {
    editModal.classList.add("hidden");
    state.editingToken = null;
  }

  function rerenderAfterEdit() {
    const activeHotspot = state.activeHotspot;
    renderPage();
    if (activeHotspot) {
      state.activeHotspot = activeHotspot;
      bubbleSpeaker.textContent = activeHotspot.speaker || activeHotspot.label;
      bubbleBody.innerHTML = renderAlignedBlockHtml(activeHotspot.dialogue);
      bindAlignedBlockEvents(bubbleBody, activeHotspot.dialogue, activeHotspot.voiceRole || "narrator_tw");
      speechBubble.classList.remove("hidden");
    }
  }

  editSave.addEventListener("click", () => {
    if (!state.editingToken) return;
    const val = editInput.value.trim();
    if (val) {
      state.overrides[state.editingToken.id] = val;
      saveOverrides(state.overrides);
    }
    closeEditModal();
    rerenderAfterEdit();
  });

  editReset.addEventListener("click", () => {
    if (!state.editingToken) return;
    delete state.overrides[state.editingToken.id];
    saveOverrides(state.overrides);
    closeEditModal();
    rerenderAfterEdit();
  });

  editCancel.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (ev) => {
    if (ev.target === editModal) closeEditModal();
  });
  editInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") editSave.click();
    if (ev.key === "Escape") closeEditModal();
  });

  // =========================================================================
  // Paywall Interactions
  // =========================================================================
  paywallBackBtn.addEventListener("click", () => {
    const safeIdx = Math.min(
      state.lastUnlockedIndex,
      Math.max(0, ((state.bookEntry && state.bookEntry.freePages) || 3) - 1)
    );
    goToPage(safeIdx);
  });

  paywallCodeBtn.addEventListener("click", () => {
    const res = Membership.activateWithCode(paywallCodeInput.value);
    paywallCodeMsg.textContent = res.message;
    paywallCodeMsg.style.color = res.ok ? "#4ade80" : "#f87171";
    if (res.ok) {
      paywallCodeInput.value = "";
      renderPage();
    }
  });

  paywallCodeInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") paywallCodeBtn.click();
  });

  // =========================================================================
  // Family PiP Webcam & One-Click Screen + Mic Recording (.webm)
  // =========================================================================
  async function startCamera() {
    if (state.webcamStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 400 }, facingMode: "user" },
        audio: false,
      });
      state.webcamStream = stream;
      webcamVideo.srcObject = stream;
      webcamPip.classList.remove("hidden");
    } catch {}
  }

  function stopCamera() {
    if (!state.webcamStream) return;
    state.webcamStream.getTracks().forEach((t) => t.stop());
    state.webcamStream = null;
    webcamVideo.srcObject = null;
    webcamPip.classList.add("hidden");
  }

  let dragOffset = null;
  webcamPip.addEventListener("pointerdown", (ev) => {
    if (ev.target === webcamClose) return;
    const rect = webcamPip.getBoundingClientRect();
    dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    webcamPip.setPointerCapture(ev.pointerId);
  });
  webcamPip.addEventListener("pointermove", (ev) => {
    if (!dragOffset) return;
    const stageRect = stageEl.getBoundingClientRect();
    const pipRect = webcamPip.getBoundingClientRect();
    let left = ev.clientX - stageRect.left - dragOffset.x;
    let top = ev.clientY - stageRect.top - dragOffset.y;
    left = Math.max(8, Math.min(stageRect.width - pipRect.width - 8, left));
    top = Math.max(8, Math.min(stageRect.height - pipRect.height - 8, top));
    webcamPip.style.left = `${left}px`;
    webcamPip.style.top = `${top}px`;
    webcamPip.style.right = "auto";
    webcamPip.style.bottom = "auto";
  });
  webcamPip.addEventListener("pointerup", () => { dragOffset = null; });
  webcamClose.addEventListener("click", stopCamera);

  async function toggleRecording() {
    if (state.isRecording) {
      stopRecording();
      return;
    }

    await startCamera();

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
        preferCurrentTab: true,
      });
      state.displayStream = displayStream;

      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        state.micStream = micStream;
      } catch {}

      const tracks = [...displayStream.getVideoTracks()];
      const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
      const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

      if (hasDisplayAudio || hasMicAudio) {
        const audioCtx = new AudioContext();
        state.audioCtx = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        if (hasDisplayAudio) {
          audioCtx.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks())).connect(dest);
        }
        if (hasMicAudio) {
          audioCtx.createMediaStreamSource(micStream).connect(dest);
        }
        tracks.push(...dest.stream.getAudioTracks());
      }

      const combined = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      state.recordedChunks = [];
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 });
      state.mediaRecorder = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) state.recordedChunks.push(ev.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(state.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const slug = (state.bookEntry && state.bookEntry.id) || "TreesPinyinStory";
        a.href = url;
        a.download = `${slug}-${stamp}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        cleanupRecordingStreams();
      };

      displayStream.getVideoTracks()[0].onended = () => {
        if (state.isRecording) stopRecording();
      };

      recorder.start(500);
      state.isRecording = true;
      btnRecord.classList.add("recording");
      btnRecord.setAttribute("aria-pressed", "true");
      recBadge.classList.remove("hidden");
    } catch {
      cleanupRecordingStreams();
    }
  }

  function stopRecording() {
    state.isRecording = false;
    btnRecord.classList.remove("recording");
    btnRecord.setAttribute("aria-pressed", "false");
    recBadge.classList.add("hidden");
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    } else {
      cleanupRecordingStreams();
    }
  }

  function cleanupRecordingStreams() {
    state.displayStream?.getTracks().forEach((t) => t.stop());
    state.micStream?.getTracks().forEach((t) => t.stop());
    state.audioCtx?.close?.();
    state.displayStream = null;
    state.micStream = null;
    state.audioCtx = null;
  }

  function autoReadPageEnglish() {
    if (!Membership.canReadPage(state.bookEntry, state.pageIndex)) return;
    const page = state.pages[state.pageIndex];
    if (!page || !Array.isArray(page.cards) || !page.cards.length) return;

    const queue = page.cards
      .filter((card) => card && (card.audioEn || card.english))
      .map((card) => ({
        role: "narrator_en",
        audioPath: card.audioEn || null,
        text: card.english,
        speakerKey: `${card.id}-en`,
      }));
    if (!queue.length) return;

    const mySeq = state.speechSeq;
    let i = 0;
    const nextStep = () => {
      if (state.speechSeq !== mySeq || i >= queue.length) return;
      speak({ ...queue[i++], onEnd: nextStep });
    };
    nextStep();
  }

  // =========================================================================
  // Navigation & Keyboard Shortcuts
  // =========================================================================
  function goToPage(index) {
    if (index < 0 || index >= state.pages.length) return;
    state.pageIndex = index;
    renderPage();
    autoReadPageEnglish();
  }

  btnPrev.addEventListener("click", () => goToPage(state.pageIndex - 1));
  btnNext.addEventListener("click", () => goToPage(state.pageIndex + 1));
  btnReadPage.addEventListener("click", toggleReadWholePage);
  btnRecord.addEventListener("click", toggleRecording);

  btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  bubbleClose.addEventListener("click", hideBubble);

  window.addEventListener("keydown", (ev) => {
    if (!editModal.classList.contains("hidden")) return;
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
      return;
    }
    if (ev.key === "ArrowRight") goToPage(state.pageIndex + 1);
    if (ev.key === "ArrowLeft") goToPage(state.pageIndex - 1);
    if (ev.key === " ") {
      ev.preventDefault();
      toggleReadWholePage();
    }
    if (ev.key.toLowerCase() === "f") btnFullscreen.click();
    if (ev.key === "Escape") {
      hideBubble();
      hideCharMnemonicBar();
    }
  });

  // =========================================================================
  // Bootstrap: Load catalog.json -> ?book=<id> -> book.json
  // =========================================================================
  async function bootstrap() {
    try {
      const catRes = await fetch("./catalog.json", { cache: "no-store" });
      state.catalog = await catRes.json();

      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get("book") || "";
      const books = state.catalog.books || [];
      state.bookEntry =
        books.find((b) => b.id === requestedId) ||
        books.find((b) => b.status === "published") ||
        books[0];

      if (!state.bookEntry) {
        bookTitleEl.textContent = "No Storybook Found";
        return;
      }

      state.overrides = loadOverrides();
      bookTitleEl.textContent = state.bookEntry.titleEn;
      document.title = `${state.bookEntry.titleEn} — Trees Pinyin™`;

      const bookRes = await fetch(state.bookEntry.dataUrl, { cache: "no-store" });
      state.bookData = await bookRes.json();
      state.pages = hydrateBookPages(state.bookData.pages || []);

      renderPage();
    } catch (err) {
      console.error("Failed to load storybook:", err);
      bookTitleEl.textContent = "Unable to Load Storybook";
    }
  }

  bootstrap();
})();
