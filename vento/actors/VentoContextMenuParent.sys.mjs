// Context menu, parent side. Forwards the message to Vento.contextMenu of the window hosting the tab.

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
    // NOTE: browser.ownerGlobal.Vento does NOT work (returns undefined); ownerDocument.defaultView does.
    const vento = browser?.ownerDocument?.defaultView?.Vento;
    if (name === "VentoContextMenu:Error") {
      trace(`context menu (content) ERROR: ${data}`);
    } else if (name === "VentoContextMenu:Open") {
      vento?.contextMenu?.show(browser, data);
    }
  }
}
