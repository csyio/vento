// Page text extraction actor (content process side).
//
// Uses the SAME modules as Firefox's PageExtractor (Reader mode for noise removal +
// DOMExtractor) but skips waitForPageReady(): that waits for requestIdleCallback + a double
// requestAnimationFrame, and since painting stops in background tabs it takes 2-7 s. That's
// unacceptable with multiple tabs (background tabs). The page is already loaded (at the moment of
// "Ask Esin"), so there's no need to wait.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  ReaderMode: "moz-src:///toolkit/components/reader/ReaderMode.sys.mjs",
  extractTextFromDOM: "moz-src:///toolkit/components/pageextractor/DOMExtractor.sys.mjs",
  isProbablyReaderable: "resource://gre/modules/Readerable.sys.mjs",
});

export class VentoPageTextChild extends JSWindowActorChild {
  async receiveMessage({ name, data }) {
    if (name !== "VentoPageText:Get") {
      return null;
    }
    const window = this.browsingContext?.window;
    let document = window?.document;
    if (!document?.body) {
      return null;
    }

    let rootNode = document.body;
    try {
      if (lazy.isProbablyReaderable(document)) {
        const reader = await lazy.ReaderMode.parseDocument(document);
        if (reader) {
          document = new DOMParser().parseFromString(reader.content, "text/html");
          rootNode = document.body;
        }
      }
    } catch (e) {
      // If Reader mode fails, fall back to the raw page
      document = window.document;
      rootNode = document.body;
    }

    const { text } = lazy.extractTextFromDOM(document, rootNode, {
      sufficientLength: data?.sufficientLength,
    });
    return { text, title: window.document.title, language: window.document.documentElement.lang };
  }
}
