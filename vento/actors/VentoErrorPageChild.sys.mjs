// Adds Ebabil to the error page (about:neterror). Runs in the content process when the page loads; doesn't touch
// the toolkit page (no engine patch needed): it only adds a stylesheet and an <img>.
//
// Only shown for connection/network errors. NOT shown on certificate warnings (about:certerror) or security blocks:
// softening a serious risk warning with a cute bird would be wrong.
//
// NOTE: the class name MUST follow the actor name (VentoErrorPage → VentoErrorPageChild).

const POSES = {
  dnsNotFound: "error",
  connectionFailure: "error",
  netTimeout: "error",
  netReset: "error",
  netInterrupt: "error",
  proxyConnectFailure: "error",
  proxyResolveFailure: "error",
  redirectLoop: "error",
  fileNotFound: "error",
  malformedURI: "error",
  netOffline: "idle", // offline: sleeping Ebabil
};

export class VentoErrorPageChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type !== "DOMContentLoaded") {
      return;
    }
    const doc = this.document;
    const query = doc.documentURI.split("?")[1] ?? "";
    const code = new URLSearchParams(query).get("e");
    const pose = POSES[code];
    const container = doc.querySelector(".container");
    if (!pose || !container || doc.querySelector(".vento-ebabil")) {
      return;
    }
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = "chrome://vento-art/content/error-page.css";
    doc.head.append(link);
    const img = doc.createElement("img");
    img.className = "vento-ebabil";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.src = `chrome://vento-art/content/pose-${pose}.webp`;
    doc.documentElement.dataset.ventoPose = pose;
    container.prepend(img);
  }
}
