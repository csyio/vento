"use strict";

// Find in page (⌘F). Engine: toolkit's Finder (browser.finder -> RemoteFinder); the UI is ours.
// Find is bound to the selected tab: the bar closes when the tab changes.

Vento.find = (() => {
  const $ = id => document.getElementById(id);
  const els = {};
  const state = { open: false, browser: null, listener: null };

  const FIND_NOTFOUND = Ci.nsITypeAheadFind.FIND_NOTFOUND;

  function setCount(text) {
    els.count.textContent = text;
  }

  function makeListener() {
    return {
      onFindResult(data) {
        const notFound = data.result === FIND_NOTFOUND;
        els.input.toggleAttribute("notfound", notFound);
        if (notFound) {
          setCount(Vento.l10n.t("find-not-found"));
        }
      },
      onMatchesCountResult(result) {
        if (state.browser?.finder && result.total) {
          setCount(result.total === -1 ? `${result.limit}+` : `${result.current}/${result.total}`);
        } else if (!els.input.hasAttribute("notfound")) {
          setCount("");
        }
      },
      onHighlightFinished() {},
      onCurrentSelection(selection, isInitial) {
        // If text is selected on the page, fill the find box with it (only if the user hasn't typed yet)
        if (isInitial && selection && !els.input.value) {
          els.input.value = selection;
          els.input.select();
          search();
        }
      },
    };
  }

  const value = () => els.input.value;

  function updateCount() {
    if (value()) {
      state.browser.finder.requestMatchesCount(value(), { linksOnly: false });
    }
  }

  /** As you type: jump to the first match, highlight all, request the count. */
  function search() {
    const finder = state.browser?.finder;
    if (!finder) {
      return;
    }
    els.input.removeAttribute("notfound");
    if (!value()) {
      setCount("");
      finder.highlight(false);
      finder.removeSelection();
      return;
    }
    finder.fastFind(value(), false, false);
    finder.highlight(true, value(), false);
    updateCount();
  }

  function step(backwards) {
    const finder = state.browser?.finder;
    if (!finder || !value()) {
      return;
    }
    finder.findAgain(value(), backwards, false, false);
    updateCount();
  }

  function open() {
    const tab = Vento.tabs.selected;
    if (!tab || tab.blank) {
      return; // nothing to search in a blank tab
    }
    if (state.open && state.browser !== tab.browser) {
      close(false);
    }
    state.browser = tab.browser;
    const finder = tab.browser.finder;
    if (!tab._findListener) {
      tab._findListener = makeListener();
      finder.addResultListener(tab._findListener);
    }
    state.listener = tab._findListener;
    if (!state.open) {
      state.open = true;
      Vento.motion.show(els.bar, "bar");
      finder.onFindbarOpen();
      finder.getInitialSelection();
    }
    els.input.focus();
    els.input.select();
  }

  function close(focusPage = true) {
    if (!state.open) {
      return;
    }
    const finder = state.browser?.finder;
    state.open = false;
    Vento.motion.hide(els.bar, "bar");
    els.input.removeAttribute("notfound");
    setCount("");
    if (finder) {
      finder.highlight(false);
      finder.onFindbarClose();
      if (focusPage) {
        finder.focusContent();
      }
    }
    state.browser = null;
  }

  function init() {
    Object.assign(els, {
      bar: $("findbar"),
      input: $("find-input"),
      count: $("find-count"),
    });
    els.input.addEventListener("input", search);
    els.input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        step(e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    });
    $("find-prev").addEventListener("click", () => step(true));
    $("find-next").addEventListener("click", () => step(false));
    $("find-close").addEventListener("click", () => close(true));
    // The bar closes when the tab changes (find is bound to the tab)
    Vento.tabs.addEventListener("tabselect", () => close(false));
    Vento.tabs.addEventListener("tabclose", e => {
      if (state.browser === e.detail.tab.browser) {
        close(false);
      }
    });
  }

  return {
    init,
    open,
    close,
    next: () => step(false),
    prev: () => step(true),
    get state() {
      return state;
    },
  };
})();
