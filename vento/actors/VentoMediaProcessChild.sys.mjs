// Kamera/mikrofon (getUserMedia) — süreç düzeyi. İçerik sürecinde "getUserMedia:request" bildirimini dinler
// ve isteği ilgili pencerenin VentoMedia aktörüne verir. Firefox'ta bunu browser/'ın BrowserProcessChild'ı yapar;
// bizde kimse dinlemediği için site kamera isteyince cevap sonsuza kadar askıda kalıyordu.

export class VentoMediaProcessChild extends JSProcessActorChild {
  observe(subject, topic) {
    if (topic !== "getUserMedia:request") {
      return;
    }
    let actor = null;
    try {
      const win = Services.wm.getOuterWindowWithId(subject.windowID);
      actor = win?.windowGlobalChild?.getActor("VentoMedia");
    } catch (e) {
      // pencere gitmiş olabilir
    }
    if (actor) {
      actor.gum(subject);
    } else {
      Services.obs.notifyObservers(null, "getUserMedia:response:deny", subject.callID);
    }
  }
}
