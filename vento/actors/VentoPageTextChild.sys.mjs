// Sayfa metni çıkarma aktörü (içerik süreci tarafı).
//
// Firefox'un PageExtractor'ı ile AYNI modülleri kullanır (Reader modu ile gürültü temizleme +
// DOMExtractor) ama waitForPageReady()'yi atlar: o, requestIdleCallback + çift requestAnimationFrame
// bekler; arka plandaki sekmelerde çizim durduğu için bu 2–7 sn sürer. Çoklu sekme bağlamında
// (arka plan sekmeleri) kabul edilemez. Sayfa zaten yüklenmiş ("Esin'e sor" anında) olduğundan
// beklemeye gerek yok.

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
      // Reader modu başarısızsa ham sayfadan devam et
      document = window.document;
      rootNode = document.body;
    }

    const { text } = lazy.extractTextFromDOM(document, rootNode, {
      sufficientLength: data?.sufficientLength,
    });
    return { text, title: window.document.title, language: window.document.documentElement.lang };
  }
}
