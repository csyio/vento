// nsIContentPermissionPrompt: konum, bildirim, kalıcı depolama vb. izin istemleri. Firefox'ta bunu browser/'ın
// ContentPermissionPrompt'u yapar; bizde sahibi yoktu → sayfalar cevap alamıyordu.
// Kartı ana pencerenin Vento.permissions modülü çizer.

export class VentoPermissionPrompt {
  QueryInterface = ChromeUtils.generateQI(["nsIContentPermissionPrompt"]);

  prompt(request) {
    const permissions = request.element?.ownerDocument?.defaultView?.Vento?.permissions;
    if (!permissions) {
      request.cancel(); // gösterecek arayüz yok: açıkça reddet, askıda bırakma
      return;
    }
    permissions.request(request);
  }
}
