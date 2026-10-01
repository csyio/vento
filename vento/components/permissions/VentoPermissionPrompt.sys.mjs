// nsIContentPermissionPrompt: permission prompts for location, notifications, persistent storage, etc. In Firefox,
// browser/'s ContentPermissionPrompt does this; here nothing owned it, so pages never got an answer.
// The main window's Vento.permissions module draws the card.

export class VentoPermissionPrompt {
  QueryInterface = ChromeUtils.generateQI(["nsIContentPermissionPrompt"]);

  prompt(request) {
    const permissions = request.element?.ownerDocument?.defaultView?.Vento?.permissions;
    if (!permissions) {
      request.cancel(); // no UI to show: reject explicitly, don't leave it hanging
      return;
    }
    permissions.request(request);
  }
}
