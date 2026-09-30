// "Prompt" aktörü (Firefox'ta browser/actors/PromptParent). İçerik sayfasındaki alert/confirm/prompt ve
// kimlik doğrulama istemleri toolkit'in Prompter'ı tarafından buraya gelir ("Prompt:Open"). Bu aktör
// olmadığında Prompter sessizce "iptal" döndürür (confirm → false). Diyaloğu ana pencerenin
// Vento.dialogs modülü çizer.
//
// NOT: dışa aktarılan sınıf adı aktör adına göre olmak ZORUNDA (Prompt → PromptParent), dosya adına göre değil.
// Çocuk (child) tarafı yok: Prompter doğrudan sendQuery ile yollar.

export class PromptParent extends JSWindowActorParent {
  #vento() {
    return this.browsingContext?.top?.embedderElement?.ownerDocument?.defaultView?.Vento;
  }

  didDestroy() {
    // Sayfa gezindi / sekme çöktü: açık istemleri iptal et
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
