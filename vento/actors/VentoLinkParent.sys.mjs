// Sekme simgeleri (favicon): ana süreç tarafı. İçerik sürecindeki VentoLinkChild simgeyi bulup yükler
// (FaviconLoader, Firefox'unkiyle aynı) ve buraya gönderir; biz sekmeye yazarız.
// Firefox'un browser/actors/LinkHandlerParent.sys.mjs dosyasından uyarlandı: gBrowser yerine Vento.tabs.

import {
  TYPE_ICO,
  SVG_DATA_URI_PREFIX,
  TRUSTED_FAVICON_SCHEMES,
  blobAsDataURL,
} from "moz-src:///toolkit/modules/FaviconUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

async function drawImageOnCanvas(canvas, image) {
  let data = await image.blob.bytes();
  let frame = new VideoFrame(data, {
    timestamp: 0,
    format: image.format,
    codedWidth: image.displayWidth,
    codedHeight: image.displayHeight,
  });

  canvas.width = frame.displayWidth;
  canvas.height = frame.displayHeight;
  let ctx = canvas.getContext("2d");
  ctx.drawImage(frame, 0, 0);
}

// Re-construct the ICO file with different sized PNG images.
// See https://en.wikipedia.org/wiki/ICO_(file_format).
function createICO(images) {
  const ICO_HEADER_SIZE = 6;
  const ICO_DIR_ENTRY_SIZE = 16;

  const metadataSize = ICO_HEADER_SIZE + ICO_DIR_ENTRY_SIZE * images.length;
  const size =
    metadataSize + images.reduce((acc, image) => acc + image.byteLength, 0);

  let buffer = new ArrayBuffer(size);
  let u8 = new Uint8Array(buffer);
  let view = new DataView(buffer);

  view.setUint16(0, 0, true); // idReserved
  view.setUint16(2, 1, true); // idType (1 = ICO)
  view.setUint16(4, images.length, true); // idCount

  let dataOffset = metadataSize; // Append image data directly after the meta data.
  for (let i = 0; i < images.length; i++) {
    const off = ICO_HEADER_SIZE + ICO_DIR_ENTRY_SIZE * i;

    // We use a zero width and height because we always use compressed PNGs,
    // which require this and have their own width/height information.
    view.setUint8(off, 0); // bWidth
    view.setUint8(off + 1, 0); // bHeight
    view.setUint8(off + 2, 0); // bColorCount
    view.setUint8(off + 3, 0); // bReserved
    view.setUint16(off + 4, 1, true); // wPlanes
    view.setUint16(off + 6, 32, true); // wBitCount
    view.setUint32(off + 8, images[i].byteLength, true); // dwBytesInRes
    view.setUint32(off + 12, dataOffset, true); // dwImageOffset

    // Copy the image's bytes into the ICO buffer.
    u8.set(images[i], dataOffset);

    dataOffset += images[i].byteLength;
  }

  return buffer;
}

export class VentoLinkParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const browser = this.browsingContext.top.embedderElement;
    // NOT: browser.ownerGlobal.Vento ÇALIŞMAZ (undefined döner); ownerDocument.defaultView çalışır.
    const vento = browser?.ownerDocument?.defaultView?.Vento;
    if (!vento) {
      return;
    }
    // "Link:LoadingIcon" (yükleniyor) ve "Link:SetFailedIcon" (yüklenemedi): sekme zaten harf işaretini gösterir.
    if (msg.name === "Link:SetIcon") {
      this.#setIcon(vento, browser, msg.data).catch(e => console.error("Vento simge:", e));
    }
  }

  async #setIcon(vento, browser, { pageURL, originalURL, expiration, iconURL, images, canStoreIcon, isRichIcon }) {
    // Zengin simgeler (apple-touch vb.) sekmede gösterilmez; yalnız Places'e saklanabilir.
    if (images) {
      const canvas = browser.ownerDocument.createElement("canvas");
      if (images.length > 1) {
        const blobs = [];
        for (const image of images) {
          await drawImageOnCanvas(canvas, image);
          blobs.push(await new Promise(resolve => canvas.toBlob(resolve)));
        }
        const buffers = await Promise.all(blobs.map(blob => blob.bytes()));
        iconURL = await blobAsDataURL(new Blob([createICO(buffers)], { type: TYPE_ICO }));
      } else {
        await drawImageOnCanvas(canvas, images[0]);
        iconURL = canvas.toDataURL();
      }
    }

    let iconURI;
    try {
      iconURI = Services.io.newURI(iconURL);
    } catch (e) {
      console.error(e);
      return;
    }

    // İçerik süreci, güvenilir şemalar ve SVG dışındaki her şey için ÇÖZÜLMÜŞ görüntü göndermeli;
    // aksi hâlde (ele geçirilmiş bir içerik sürecinden gelen ham adres) reddedilir.
    if (!images && !TRUSTED_FAVICON_SCHEMES.includes(iconURI.scheme) && !iconURL.startsWith(SVG_DATA_URI_PREFIX)) {
      console.error(`Bu şemayla simge ayarlanamaz: "${iconURL}"`);
      return;
    }
    if (!iconURI.schemeIs("data")) {
      try {
        Services.scriptSecurityManager.checkLoadURIWithPrincipal(
          browser.contentPrincipal,
          iconURI,
          Services.scriptSecurityManager.ALLOW_CHROME
        );
      } catch (e) {
        return;
      }
    }

    if (canStoreIcon) {
      try {
        lazy.PlacesUtils.favicons
          .setFaviconForPage(
            Services.io.newURI(pageURL),
            Services.io.newURI(originalURL),
            iconURI,
            expiration && lazy.PlacesUtils.toPRTime(expiration),
            isRichIcon
          )
          .catch(console.error);
      } catch (e) {
        console.error(e);
      }
    }

    if (!isRichIcon) {
      vento.tabs.setIcon(browser, iconURL);
    }
  }
}
