// Sağ tık: ana süreç tarafı. Mesajı, sekmeyi barındıran pencerenin Vento.contextMenu'sine iletir.

const TRACE = Services.env.exists("VENTO_TRACE") ? Services.env.get("VENTO_TRACE") : "";
function trace(msg) {
  dump(`VENTO: ${msg}\n`);
  if (TRACE) {
    IOUtils.writeUTF8(TRACE, `${msg}\n`, { mode: "appendOrCreate" }).catch(() => {});
  }
}

export class VentoContextMenuParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    const browser = this.manager.rootFrameLoader?.ownerElement;
    // NOT: browser.ownerGlobal.Vento ÇALIŞMAZ (undefined döner); ownerDocument.defaultView çalışır.
    const vento = browser?.ownerDocument?.defaultView?.Vento;
    if (name === "VentoContextMenu:Error") {
      trace(`bağlam menüsü (içerik) HATA: ${data}`);
    } else if (name === "VentoContextMenu:Open") {
      vento?.contextMenu?.show(browser, data);
    }
  }
}
