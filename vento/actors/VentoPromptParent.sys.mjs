// "Prompt" actor (browser/actors/PromptParent in Firefox). alert/confirm/prompt and authentication
// prompts from content pages reach it through the toolkit's Prompter ("Prompt:Open"). Without this actor
// the Prompter silently returns "cancel" (confirm → false). The main window's Vento.dialogs module
// draws the dialog.
//
// NOTE: the exported class name MUST follow the actor name (Prompt → PromptParent), not the file name.
// There is no child side: the Prompter sends directly with sendQuery.

export class PromptParent extends JSWindowActorParent {
  #vento() {
    return this.browsingContext?.top?.embedderElement?.ownerDocument?.defaultView?.Vento;
  }

  didDestroy() {
    // Page navigated / tab crashed: cancel open prompts
    this.#vento()?.dialogs?.abortActor(this);
  }

  receiveMessage({ name, data }) {
    if (name !== "Prompt:Open") {
      return undefined;
    }
    const browser = this.browsingContext.top.embedderElement;
    const dialogs = this.#vento()?.dialogs;
    if (!browser || !dialogs) {
      return { promptAborted: true };
    }
    return dialogs.open(browser, data, this);
  }
}
