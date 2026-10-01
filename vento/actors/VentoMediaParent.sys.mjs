// Camera/microphone request, parent side. Vento.permissions draws the permission card.

export class VentoMediaParent extends JSWindowActorParent {
  #vento() {
    return this.browsingContext?.top?.embedderElement?.ownerDocument?.defaultView?.Vento;
  }

  receiveMessage({ name, data }) {
    if (name !== "VentoMedia:Request") {
      return;
    }
    const browser = this.browsingContext.top.embedderElement;
    const permissions = this.#vento()?.permissions;
    if (!browser || !permissions) {
      this.sendAsyncMessage("VentoMedia:Deny", { callID: data.callID });
      return;
    }
    permissions.requestMedia({
      browser,
      principal: this.manager.documentPrincipal,
      data,
      actor: this,
      respond: decision =>
        this.sendAsyncMessage(decision.allow ? "VentoMedia:Allow" : "VentoMedia:Deny", {
          callID: data.callID,
          devices: decision.devices ?? [],
        }),
    });
  }

  didDestroy() {
    this.#vento()?.permissions?.abortActor(this);
  }
}
