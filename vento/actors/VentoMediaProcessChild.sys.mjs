// Camera/microphone (getUserMedia), process level. Listens for the "getUserMedia:request" notification in the
// content process and hands the request to the VentoMedia actor of the right window. In Firefox, browser/'s
// BrowserProcessChild does this; nobody was listening here, so when a site asked for the camera the
// request hung forever.

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
      // the window may be gone
    }
    if (actor) {
      actor.gum(subject);
    } else {
      Services.obs.notifyObservers(null, "getUserMedia:response:deny", subject.callID);
    }
  }
}
