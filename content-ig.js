const Instagram = {
  initialized: false,
  observer: null,
  checkScheduled: false,
  isRedirecting: false,
  currentMode: "strict",
  lastPath: "",
  storiesOverlayId: "ft-ig-stories-overlay",
  hiddenNavContainers: new Set(),
  igSelectors: {
    nav: {
      reels: 'a[href="/reels/"], a[href$="/reels/"]',
    },
  },
  init: function () {
    if (this.initialized) return;
    Utils.ensureBody(() => this._start());
  },
  _start: function () {
    if (this.initialized) return;
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    document.body.classList.add("ft-platform-ig");
    this.isRedirecting = false;
    this.ensureObservers();
    window.addEventListener("popstate", () => this.runChecks());
    chrome.storage.onChanged.addListener((changes) => {
      if (
        changes.platformSettings ||
        changes.focusMode ||
        changes.ft_timer_end ||
        changes.ft_timer_type ||
        changes.hide_ig_stories ||
        changes.hide_ig_reels_nav ||
        changes.hide_ig_suggested ||
        changes.popup_visible_ig ||
        changes.restrictHiddenPlatforms ||
        changes.visualHideHiddenPlatforms
      ) {
        this.runChecks();
      }
    });
    document.addEventListener("ft-settings-changed", () => this.runChecks());
    this.runChecks();
    this.checkKick();
  },
  ensureObservers: function () {
    if (!document.body) return;
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver(() => this.scheduleChecks()),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  scheduleChecks: function () {
    if (this.checkScheduled) return;
    this.checkScheduled = true;
    requestAnimationFrame(() => {
      this.checkScheduled = false;
      this.runChecks();
    });
  },
  disable: function () {
    this.isRedirecting = false;
    UI.remove();
    IGFeed.disable();
    this.removeStoriesOverlay();
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.reels),
    );
    this.restoreHidden(this.hiddenNavContainers);
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  },
  enable: function () {
    if (!document.body) return;
    document.body.classList.add("ft-platform-ig");
    this.ensureObservers();
    this.runChecks();
    this.checkKick();
  },
  runChecks: function () {
    if (!Utils.isExtensionEnabled()) {
      IGFeed.disable();
      this.removeStoriesOverlay();
      this.applyVisible(
        document.body.querySelectorAll(this.igSelectors.nav.reels),
      );
      this.restoreHidden(this.hiddenNavContainers);
      UI.remove();
      return;
    }
    if (this.isRedirecting || !document.body) return;
    const path = window.location.pathname;
    const isFocusActive = FocusState.shouldBlock;
    let action = "none";
    let reason = "";
    const mode = CONFIG.platformSettings.ig;
    if (mode === "strict" && this.currentMode !== "strict") {
      Utils.clearSession();
      this.removeStoriesOverlay();
    }
    this.currentMode = mode;
    if (FocusState.isBreak) {
      action = "remove";
      reason = "break timer";
      this.showNavLinks();
      IGFeed.sync();
      this.removeStoriesOverlay();
      Utils.debugLog("ig", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        isFocusActive,
        action,
        reason,
      });
      return;
    }
    const shouldHideNav =
      isFocusActive &&
      CONFIG.visualHiding.igReelsNav &&
      Utils.shouldApplyVisualHiding("ig");
    if (shouldHideNav) {
      this.hideNavLinks();
    } else {
      this.showNavLinks();
    }
    if (this.isBlockablePath(path)) {
      const warnScope = this.getWarnScope(path);
      if (Utils.isSessionAllowed("ig", warnScope) && !FocusState.isWork) {
        action = "allow";
        reason = "session allowed";
        UI.remove();
      } else if ((FocusState.isWork || mode === "strict") && !this.isRedirecting) {
        action = "redirect";
        reason = "blockable path";
        this.rapidKick(path);
      } else if (mode === "warn") {
        action = "warn";
        reason = "warn mode";
        UI.create(
          "warn",
          "ig",
          () => {
            this.runChecks();
          },
          () => {
            window.location.href = "/";
          },
          { scope: warnScope },
        );
      } else {
        action = "allow";
        reason = "no block condition";
        UI.remove();
      }
    } else {
      action = "safe";
      reason = "non-blockable path";
      if (CONFIG.session.platform === "ig") Utils.clearSession();
      this.showKickNotice();
    }
    const isHomepage = path === "/" || path === "";
    const shouldHideStories =
      isHomepage &&
      isFocusActive &&
      CONFIG.visualHiding.igStories &&
      Utils.shouldApplyVisualHiding("ig");
    if (shouldHideStories) {
      this.showStoriesOverlay();
    } else {
      this.removeStoriesOverlay();
    }
    IGFeed.sync();
    Utils.debugLog("ig", {
      path,
      mode: this.currentMode,
      isWork: FocusState.isWork,
      isBreak: FocusState.isBreak,
      isFocusActive,
      action,
      reason,
    });
  },
  isBlockablePath: function (path) {
    return (
      path.startsWith("/reels/") ||
      path.startsWith("/reel/") ||
      path.startsWith("/explore/")
    );
  },
  getWarnScope: function (path) {
    if (path.startsWith("/explore/")) return "explore";
    return "reels";
  },
  rapidKick: function (path) {
    if (this.isRedirecting) return;
    if (
      sessionStorage.getItem("ft_kicked") &&
      Date.now() - parseInt(sessionStorage.getItem("ft_kicked_time") || "0") <
        5000
    )
      return;
    if (path === "/") return;
    this.isRedirecting = true;
    Utils.logStat();
    Utils.markKick("ig", () => {
      window.location.replace("/");
    });
    setTimeout(() => {
      this.isRedirecting = false;
      if (!this.isBlockablePath(window.location.pathname)) {
        this.showKickNotice();
      }
      this.runChecks();
    }, 2000);
  },
  checkKick: function () {
    if (!this.isBlockablePath(window.location.pathname)) {
      this.showKickNotice();
    }
  },
  showKickNotice: function () {
    Utils.consumeKick("ig", () => UI.showKickNotification());
  },
  applyHidden: function (elements) {
    if (!elements) return;
    if (elements instanceof NodeList) {
      elements.forEach((el) =>
        Utils.setInlineStyle(el, "display", "none", "important"),
      );
    } else {
      Utils.setInlineStyle(elements, "display", "none", "important");
    }
  },
  applyVisible: function (elements) {
    if (!elements) return;
    if (elements instanceof NodeList) {
      elements.forEach((el) => Utils.restoreInlineStyle(el, "display"));
    } else {
      Utils.restoreInlineStyle(elements, "display");
    }
  },
  hideNavLinks: function () {
    Utils.pruneDetachedElements(this.hiddenNavContainers);
    const reelsLinks = document.body.querySelectorAll(
      this.igSelectors.nav.reels,
    );
    this.applyHidden(reelsLinks);
    [...reelsLinks].forEach((link) => {
      if (!link) return;
      const navRoot = link.closest("nav");
      if (!navRoot) return;
      const parent = link.parentElement;
      if (
        parent &&
        (parent.tagName === "DIV" || parent.tagName === "LI") &&
        parent.querySelectorAll("a").length === 1
      ) {
        Utils.setInlineStyle(parent, "display", "none", "important");
        this.hiddenNavContainers.add(parent);
      }
    });
  },
  showNavLinks: function () {
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.reels),
    );
    this.restoreHidden(this.hiddenNavContainers);
  },
  restoreHidden: function (set) {
    set.forEach((el) => Utils.restoreInlineStyle(el, "display"));
    set.clear();
  },
  showStoriesOverlay: function () {
    const iconUrl = Utils.getExtensionUrl("icons/icon48.png");
    if (!iconUrl) return;
    if (document.getElementById(this.storiesOverlayId)) return;
    const storyTray = this.findStoriesTray();
    if (!storyTray) return;
    Utils.setInlineStyle(storyTray, "position", "relative");
    const overlay = document.createElement("div");
    overlay.id = this.storiesOverlayId;
    overlay.className = "ft-stories-overlay";
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.className = "ft-stories-overlay-icon";
    const text = document.createElement("span");
    text.textContent = "Stories Hidden";
    overlay.appendChild(icon);
    overlay.appendChild(text);
    storyTray.appendChild(overlay);
  },
  findStoriesTray: function () {
    const storyButton = document.querySelector('[aria-label^="Story by"]');
    if (storyButton) {
      const scrollableContainer = storyButton.closest('[scrollable="true"]');
      if (scrollableContainer) return scrollableContainer;
      const presentationContainer = storyButton.closest(
        '[role="presentation"]',
      );
      if (presentationContainer) {
        const rect = presentationContainer.getBoundingClientRect();
        if (rect.width > 200 && rect.height < 300) {
          return presentationContainer;
        }
      }
    }
    const storyUL = document.querySelector("ul._acay");
    if (storyUL) {
      const scrollableContainer = storyUL.closest('[scrollable="true"]');
      if (scrollableContainer) return scrollableContainer;
      const container = storyUL.closest('div[role="presentation"]');
      if (container) return container;
    }
    const scrollableContainers = document.querySelectorAll(
      '[scrollable="true"]',
    );
    for (const container of scrollableContainers) {
      if (container.querySelector('[aria-label^="Story by"]')) {
        return container;
      }
    }
    return null;
  },
  removeStoriesOverlay: function () {
    const overlay = document.getElementById(this.storiesOverlayId);
    if (overlay) {
      const parent = overlay.parentElement;
      overlay.remove();
      if (parent) Utils.restoreInlineStyles(parent);
    }
  },
};
/* --------------------------------------------------------------------------
 * IGFeed - hide home-feed posts that are not from accounts you follow.
 *
 * Instagram's home feed is already limited to accounts you follow, plus two
 * injected classes of post: "Suggested for you" and "Sponsored". So there is
 * no follow list to fetch or store - filtering those two classes out leaves
 * exactly the people you follow. Everything here is local DOM work; no
 * network calls, no new permissions.
 *
 * Hidden posts are collapsed to a stub rather than removed, so the feed keeps
 * some height and Instagram's infinite scroll does not spin. If too many
 * posts in a row are filtered we stop filtering entirely and say so - the
 * feed has simply run out of people you follow.
 * ------------------------------------------------------------------------ */
const IGFeed = {
  COLLAPSED_CLASS: "ft-ig-collapsed",
  STUB_CLASS: "ft-ig-stub",
  // A collapsed post keeps the height it had, so the page never gets shorter
  // and Instagram's infinite scroll is not goaded into loading more. This is
  // the whole defence against runaway pagination.
  MIN_COLLAPSED_HEIGHT: 400,
  MAX_COLLAPSE_PER_TICK: 8,
  MAX_STUB_REPAIRS: 3,
  TICK_INTERVAL_MS: 100,
  UNBOUNDED_SCAN: 20,
  MAX_BUTTON_TEXT: 24,
  ZERO_WIDTH: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g,
  SPONSORED_LABELS: ["sponsored", "paid partnership"],
  SUGGESTED_LABELS: [
    "suggested for you",
    "suggested post",
    "suggested posts",
    "recommended for you",
  ],
  NON_PROFILE_PATH:
    /^\/(explore|reel|reels|direct|stories|accounts|p|about|legal|privacy)(\/|$)/,

  observer: null,
  root: null,
  collapsed: new Set(),
  lastRevealAllowed: null,
  scheduled: false,
  trailingTimer: null,
  lastTick: 0,
  lastPath: null,
  active: false,

  norm: function (text) {
    return (text || "").replace(this.ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  },
  isFeedPath: function (path) {
    return path === "/" || path === "";
  },
  revealAllowed: function () {
    // Strict means strict: no way to peek at a hidden post. A running work
    // timer forces strict everywhere else in the extension, so it does here.
    if (FocusState.isWork) return false;
    return CONFIG.platformSettings.ig !== "strict";
  },
  shouldRun: function () {
    return (
      Utils.isExtensionEnabled() &&
      this.isFeedPath(window.location.pathname) &&
      FocusState.shouldBlock &&
      CONFIG.visualHiding.igSuggested &&
      Utils.shouldApplyVisualHiding("ig")
    );
  },
  sync: function () {
    const path = window.location.pathname;
    if (path !== this.lastPath) this.lastPath = path;
    if (this.shouldRun()) this.enable();
    else this.disable();
  },
  enable: function () {
    this.active = true;
    this.ensureObserver();
    this.schedule();
  },
  disable: function () {
    if (!this.active && !this.collapsed.size) return;
    this.active = false;
    if (this.observer) this.observer.disconnect();
    this.root = null;
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    this.scheduled = false;
    this.restoreAll();
  },
  findFeedRoot: function () {
    return (
      document.querySelector('main[role="main"]') ||
      document.querySelector("main") ||
      null
    );
  },
  ensureObserver: function () {
    const root = this.findFeedRoot();
    if (!root) return;
    if (!this.observer) {
      // Reused for the life of the page so repeated enable/disable cycles do
      // not pile up entries in Utils.observers.
      this.observer = Utils.trackObserver(
        new MutationObserver((records) => {
          for (const record of records) {
            if (!record.addedNodes.length) continue;
            const target = record.target;
            const post =
              target && target.nodeType === 1 ? target.closest("article") : null;
            // Video buffering, like counts, caption expansion - churn inside a
            // post we have already judged tells us nothing new.
            if (post && post.dataset.ftIgClass) continue;
            this.schedule();
            return;
          }
        }),
      );
    }
    if (this.root !== root) {
      this.observer.disconnect();
      this.root = root;
      this.observer.observe(root, { childList: true, subtree: true });
    }
  },
  schedule: function () {
    if (!this.active || this.scheduled) return;
    this.scheduled = true;
    const wait = Math.max(0, this.TICK_INTERVAL_MS - (Date.now() - this.lastTick));
    const run = () => {
      this.trailingTimer = null;
      this.lastTick = Date.now();
      requestAnimationFrame(() => {
        this.scheduled = false;
        this.tick();
      });
    };
    if (wait === 0) run();
    else this.trailingTimer = setTimeout(run, wait);
  },
  tick: function () {
    if (!this.active) return;
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    this.ensureObserver();
    if (!this.root) return;
    Utils.pruneDetachedElements(this.collapsed);

    // Switching between strict and warn changes whether the stubs offer a way
    // through, so redraw the ones already on screen.
    const revealAllowed = this.revealAllowed();
    if (revealAllowed !== this.lastRevealAllowed) {
      this.lastRevealAllowed = revealAllowed;
      this.collapsed.forEach((post) =>
        this.renderStub(post, post.dataset.ftIgClass),
      );
    }

    // Articles and section headings together, in document order. Instagram
    // ends the followed part of the feed with a divider carrying an <h3>
    // ("Suggested Posts"); every post below it is a suggestion, whatever its
    // own markup says. Only honoured after a real post has gone by, so a
    // stray heading above the feed can never blank the whole thing.
    const nodes = this.root.querySelectorAll("article, h3");
    let collapsedThisTick = 0;
    let pastDivider = false;
    let seenPost = false;

    nodes.forEach((node) => {
      if (node.tagName === "H3") {
        if (seenPost && !node.closest("article")) pastDivider = true;
        return;
      }
      const post = node;
      seenPost = true;
      if (post.dataset.ftIgGiveUp === "1") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (post.dataset.ftIgReveal === "1") {
        if (revealAllowed) {
          if (this.collapsed.has(post)) this.restore(post);
          return;
        }
        // Dropping into strict mode retracts anything revealed under warn.
        delete post.dataset.ftIgReveal;
      }
      const kind = this.classify(post, pastDivider);
      // "pending" means the post has not painted its chrome yet. Look again
      // next tick rather than judging it early.
      if (kind === "pending") return;
      if (kind === "keep") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (this.collapsed.has(post)) {
        this.repairStub(post, kind);
        return;
      }
      if (collapsedThisTick >= this.MAX_COLLAPSE_PER_TICK) return;
      this.collapse(post, kind);
      collapsedThisTick += 1;
    });
  },
  postChrome: function (post) {
    // Feed posts carry no <header>. The like/comment/share <section> is the
    // one stable landmark, and everything above it - avatar, username, time,
    // follow control, any "Suggested"/"Sponsored" label - is the post's own
    // chrome. Everything below is the caption and its trimmings.
    return post.querySelector("section");
  },
  inChrome: function (boundary, node) {
    if (!boundary) return true;
    return !!(
      boundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING
    );
  },
  labelNodes: function (post) {
    // Short text leaves in the post's chrome. Deliberately stops before the
    // caption - a caption that happens to say "sponsored" must not read as an
    // ad label.
    const boundary = this.postChrome(post);
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!this.inChrome(boundary, node)) break;
      if (!boundary && labels.length >= this.UNBOUNDED_SCAN) break;
      const text = this.norm(node.nodeValue).toLowerCase();
      if (text && text.length <= 40) labels.push(text);
    }
    return labels;
  },
  followButton: function (post) {
    // A follow control in the post's own chrome is the plainest statement
    // Instagram makes that this is not somebody you follow - and it says it
    // in whatever language the interface is in, so there is no word list to
    // keep up to date. Icon-only controls ("More options") and the counters
    // in the action bar are excluded by the svg and boundary checks.
    const boundary = this.postChrome(post);
    const controls = post.querySelectorAll('[role="button"], button');
    for (const control of controls) {
      if (!this.inChrome(boundary, control)) break;
      if (control.querySelector("svg")) continue;
      const text = this.norm(control.textContent);
      if (text && text.length <= this.MAX_BUTTON_TEXT) return control;
    }
    return null;
  },
  author: function (post) {
    const links = post.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (this.NON_PROFILE_PATH.test(href)) continue;
      const match = href.match(/^\/([A-Za-z0-9._]+)\/$/);
      if (match) return match[1];
    }
    return null;
  },
  classify: function (post, pastDivider) {
    const cached = post.dataset.ftIgClass;
    if (cached === "ad" || cached === "suggested" || cached === "keep") {
      return cached;
    }
    const labels = this.labelNodes(post);
    const hasTime = !!post.querySelector("time[datetime]");
    if (
      labels.some((text) =>
        this.SPONSORED_LABELS.some((label) => text.startsWith(label)),
      )
    ) {
      post.dataset.ftIgClass = "ad";
      return "ad";
    }
    // Ads route their call-to-action through Instagram's link shim and carry
    // no post timestamp - a language-independent second signal.
    if (!hasTime && post.querySelector('a[href*="l.instagram.com/"]')) {
      post.dataset.ftIgClass = "ad";
      return "ad";
    }
    if (
      labels.some((text) =>
        this.SUGGESTED_LABELS.some((label) => text.includes(label)),
      ) ||
      this.followButton(post) ||
      pastDivider
    ) {
      post.dataset.ftIgClass = "suggested";
      return "suggested";
    }
    // Only commit to "keep" once the post has really rendered, so a label
    // that paints a moment late is not missed for good. Fail open otherwise.
    if (hasTime && this.author(post)) {
      post.dataset.ftIgClass = "keep";
      return "keep";
    }
    return "pending";
  },
  measureHeight: function (post) {
    // Measured before collapsing, while the post is still laid out. The floor
    // covers a post whose media has not loaded yet and would otherwise pin
    // the page at a height it never really had.
    const height = Math.round(post.getBoundingClientRect().height);
    return Math.max(height, this.MIN_COLLAPSED_HEIGHT);
  },
  collapse: function (post, kind) {
    const height = this.measureHeight(post);
    post.classList.add(this.COLLAPSED_CLASS);
    Utils.setInlineStyle(post, "min-height", height + "px", "important");
    this.collapsed.add(post);
    this.renderStub(post, kind);
  },
  restore: function (post) {
    if (!post) return;
    post.classList.remove(this.COLLAPSED_CLASS);
    Utils.restoreInlineStyle(post, "min-height");
    post
      .querySelectorAll(":scope > ." + this.STUB_CLASS)
      .forEach((el) => el.remove());
    this.collapsed.delete(post);
  },
  restoreAll: function () {
    [...this.collapsed].forEach((post) => this.restore(post));
    this.collapsed.clear();
    this.lastRevealAllowed = null;
    document
      .querySelectorAll("." + this.COLLAPSED_CLASS)
      .forEach((post) => this.restore(post));
    document
      .querySelectorAll("." + this.STUB_CLASS)
      .forEach((el) => el.remove());
  },
  repairStub: function (post, kind) {
    if (post.querySelector(":scope > ." + this.STUB_CLASS)) return;
    // Instagram re-rendered the post out from under us. Put the stub back a
    // few times, then leave the post alone rather than fight React forever.
    const attempts = parseInt(post.dataset.ftIgStubs || "0", 10);
    if (attempts >= this.MAX_STUB_REPAIRS) {
      post.dataset.ftIgGiveUp = "1";
      this.restore(post);
      return;
    }
    this.renderStub(post, kind);
  },
  renderStub: function (post, kind) {
    let stub = post.querySelector(":scope > ." + this.STUB_CLASS);
    if (!stub) {
      stub = document.createElement("div");
      stub.className = this.STUB_CLASS;
      if (CONFIG.isDarkMode) stub.classList.add("dark");
      post.appendChild(stub);
      post.dataset.ftIgStubs = String(
        parseInt(post.dataset.ftIgStubs || "0", 10) + 1,
      );
    }
    while (stub.firstChild) stub.removeChild(stub.firstChild);

    const iconUrl = Utils.getExtensionUrl("icons/icon128.png");
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.src = iconUrl;
      icon.alt = "";
      icon.className = "ft-ig-stub-icon";
      stub.appendChild(icon);
    }

    const title = document.createElement("h3");
    title.textContent = kind === "ad" ? "Sponsored post" : "Suggested post";
    stub.appendChild(title);

    const subtitle = document.createElement("p");
    const author = this.author(post);
    subtitle.textContent =
      kind === "ad"
        ? "We're keeping you productive."
        : author
          ? "@" + author + " is not someone you follow."
          : "Not from someone you follow.";
    stub.appendChild(subtitle);

    if (this.revealAllowed()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ft-ig-stub-btn";
      button.textContent = "View Anyway";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        post.dataset.ftIgReveal = "1";
        this.restore(post);
      });
      stub.appendChild(button);
    }
  },
};

if (Site.isIG()) {
  if (window.__ftSettingsReady) Instagram.init();
  else document.addEventListener("ft-settings-ready", () => Instagram.init());
  Utils.registerLifecycle({
    onDisable: () => Instagram.disable(),
    onEnable: () => {
      if (!Utils.isExtensionEnabled()) return;
      if (!Instagram.initialized) Instagram.init();
      else Instagram.enable();
    },
  });
}
