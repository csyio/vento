// Sağ tık: içerik tarafı. Tıklanan yerde ne olduğunu (bağlantı, resim, seçili metin, yazı alanı…) toplar ve
// ana sürece yollar. Menüyü ana süreç çizer (bkz. vento-menu.js). Firefox'un ContextMenuChild'ından
// (browser/ içinde, bizde yok) çok daha küçük; yalnızca Vento'nun menüsünün ihtiyaç duyduğu veri.

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "password", "number", ""]);
const MAX_SELECTION = 2000;

export class VentoContextMenuChild extends JSWindowActorChild {
  handleEvent(event) {
    try {
      this.#collect(event);
    } catch (e) {
      // İçerik sürecinde sessiz ölmesin: ana süreç iz dosyasına yazar.
      this.sendAsyncMessage("VentoContextMenu:Error", `${e}`);
    }
  }

  #collect(event) {
    if (event.type !== "contextmenu" || event.defaultPrevented) {
      return; // sayfa kendi menüsünü yapıyorsa dokunma
    }
    const win = this.contentWindow;
    const doc = this.document;
    const target = event.composedTarget;
    if (!win || !target || target.nodeType !== 1) {
      return;
    }

    // pageUrl'yi ana süreç doldurur (seçili sekmenin adresi); içerikten top belgesine erişilmez.
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

    // Bağlantı: hedeften yukarı, birleştirilmiş ağaç boyunca
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

    // Seçili metin (şifre alanında asla gönderme)
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
