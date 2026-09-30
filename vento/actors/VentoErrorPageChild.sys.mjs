// Hata sayfasına Ebabil ekler (about:neterror). İçerik sürecinde, sayfa yüklenince çalışır; toolkit'in sayfasına dokunmaz
// (motor yaması gerekmez): yalnız bir stil dosyası ve bir <img> ekler.
//
// Yalnız bağlantı/ağ hatalarında görünür. Sertifika uyarısında (about:certerror) ve güvenlik engellerinde GÖRÜNMEZ:
// ciddi bir risk uyarısının sevimli bir kuşla yumuşatılması yanlış olur.
//
// NOT: sınıf adı aktör adına göre olmak ZORUNDA (VentoErrorPage → VentoErrorPageChild).

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
  netOffline: "idle", // çevrimdışı: uyuyan Ebabil
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
