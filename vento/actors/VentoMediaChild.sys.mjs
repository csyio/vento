// Kamera/mikrofon isteği — içerik tarafı. Cihaz listesini toplar, ana sürece sorar, cevabı MediaManager'a iletir.
// Yalnızca kamera ve mikrofon: ekran/ses yakalama henüz desteklenmiyor (isteği açıkça reddederiz, askıda bırakmayız).

const respond = (topic, subject, callID) => Services.obs.notifyObservers(subject, topic, callID);

export class VentoMediaChild extends JSWindowActorChild {
  #pending = new Map(); // callID → nsIMediaDevice[]

  /** Süreç aktöründen çağrılır. */
  gum(subject) {
    const { callID } = subject;
    const constraints = subject.getConstraints();
    const video = constraints.video || constraints.picture;
    const audio = constraints.audio;
    const sharingScreen = video && typeof video != "boolean" && video.mediaSource != "camera";
    const sharingAudio = audio && typeof audio != "boolean" && audio.mediaSource != "microphone";
    if (sharingScreen || sharingAudio) {
      respond("getUserMedia:response:deny", null, callID); // ekran paylaşımı henüz yok
      return;
    }

    const audioInputDevices = [];
    const videoInputDevices = [];
    const devices = [];
    for (let device of subject.devices) {
      device = device.QueryInterface(Ci.nsIMediaDevice);
      const info = { name: device.rawName, deviceIndex: devices.length, mediaSource: device.mediaSource };
      if (device.type === "audioinput" && audio && device.mediaSource === "microphone") {
        audioInputDevices.push(info);
        devices.push(device);
      } else if (device.type === "videoinput" && video && device.mediaSource === "camera") {
        videoInputDevices.push(info);
        devices.push(device);
      }
    }
    if (!devices.length) {
      respond("getUserMedia:response:deny", null, callID);
      return;
    }

    this.#pending.set(callID, devices);
    this.sendAsyncMessage("VentoMedia:Request", {
      callID,
      documentURI: this.document.documentURI,
      secure: subject.isSecure,
      audioInputDevices,
      videoInputDevices,
    });
  }

  receiveMessage({ name, data }) {
    const devices = this.#pending.get(data.callID);
    if (!devices) {
      return;
    }
    this.#pending.delete(data.callID);
    if (name === "VentoMedia:Allow") {
      const allowed = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
      for (const i of data.devices) {
        allowed.appendElement(devices[i]);
      }
      respond("getUserMedia:response:allow", allowed, data.callID);
    } else {
      respond("getUserMedia:response:deny", null, data.callID);
    }
  }

  didDestroy() {
    // Sayfa gezindi/kapandı: cevap bekleyen istekleri reddet ki MediaManager takılı kalmasın
    for (const callID of this.#pending.keys()) {
      respond("getUserMedia:response:deny", null, callID);
    }
    this.#pending.clear();
  }
}
