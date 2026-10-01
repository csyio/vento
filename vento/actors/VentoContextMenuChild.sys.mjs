// Context menu, content side. Collects what is under the click (link, image, selected text, editable field...)
// and sends it to the parent process. The parent process draws the menu (see vento-menu.js). Much smaller than
// Firefox's ContextMenuChild (it lives in browser/, which we don't have); only the data Vento's menu needs.

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "password", "number", ""]);
const MAX_SELECTION = 2000;

export class VentoContextMenuChild extends JSWindowActorChild {
  handleEvent(event) {
    try {
      this.#collect(event);
    } catch (e) {
      // Don't fail silently in the content process: the parent process writes it to the trace file.
      this.sendAsyncMessage("VentoContextMenu:Error", `${e}`);
    }
  }

  #collect(event) {
    if (event.type !== "contextmenu" || event.defaultPrevented) {
      return; // the page draws its own menu, leave it alone
    }
    const win = this.contentWindow;
    const doc = this.document;
    const target = event.composedTarget;
    if (!win || !target || target.nodeType !== 1) {
      return;
    }

    // The parent process fills in pageUrl (the selected tab's address); the top document isn't reachable from content.
    const data = {
      frameUrl: this.browsingContext.parent ? doc.documentURI : "",
      linkUrl: "",
      linkText: "",
      imageUrl: "",
      mediaUrl: "",
      mediaKind: "",
      editable: false,
      password: false,
      selection: "",
      screenXDevPx: event.screenX * win.devicePixelRatio,
      screenYDevPx: event.screenY * win.devicePixelRatio,
    };

    // Link: walk up from the target through the flattened tree
    for (let n = target; n && n.nodeType === 1; n = n.flattenedTreeParentNode) {
      if ((win.HTMLAnchorElement.isInstance(n) || win.HTMLAreaElement.isInstance(n)) && n.href) {
        data.linkUrl = n.href;
        data.linkText = (n.textContent || "").trim().slice(0, 200);
        break;
      }
    }

    if (win.HTMLImageElement.isInstance(target)) {
      data.imageUrl = target.currentSrc || target.src || "";
    } else if (win.HTMLVideoElement.isInstance(target) || win.HTMLAudioElement.isInstance(target)) {
      data.mediaUrl = target.currentSrc || target.src || "";
      data.mediaKind = win.HTMLVideoElement.isInstance(target) ? "video" : "audio";
    }

    const isTextInput = win.HTMLInputElement.isInstance(target) && TEXT_INPUT_TYPES.has(target.type);
    if (isTextInput || win.HTMLTextAreaElement.isInstance(target) || target.isContentEditable) {
      data.editable = true;
      data.password = win.HTMLInputElement.isInstance(target) && target.type === "password";
    }

    // Selected text (never send it from a password field)
    if (!data.password) {
      let sel = "";
      if (data.editable && (isTextInput || win.HTMLTextAreaElement.isInstance(target))) {
        sel = (target.value ?? "").substring(target.selectionStart ?? 0, target.selectionEnd ?? 0);
      } else {
        sel = win.getSelection()?.toString() ?? "";
      }
      data.selection = sel.trim().slice(0, MAX_SELECTION);
    }

    this.sendAsyncMessage("VentoContextMenu:Open", data);
  }
}
