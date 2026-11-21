// Clear, device-specific camera error messages (instead of one generic message).

function inAppBrowserName(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/Line\//i.test(ua)) return "LINE";
  if (/GSA\//i.test(ua)) return "the Google app";
  return null;
}

export function cameraErrorMessage(err: unknown): string {
  const name = String((err as any)?.name || "");
  const app = inAppBrowserName();
  const appHint = app
    ? ` You are inside ${app}'s built-in browser, which often blocks the camera — open this link in Chrome (Android) or Safari (iPhone).`
    : "";

  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return (
      "This browser cannot access the camera on this page." +
      (appHint || " Open the link in Chrome or Safari over https.")
    );
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "The camera needs a secure (https) page. Open the https link.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return (
      "Camera permission is blocked for this site. Chrome: tap the icon left of the address bar → Permissions → Camera → Allow, then reload. iPhone: Settings → Safari → Camera → Allow." +
      appHint
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The camera is busy — another app (video call, camera) is using it. Close it and tap Retry.";
  }
  if (name === "OverconstrainedError") {
    return "This camera does not support the requested mode. Tap Retry.";
  }
  if (name === "SecurityError") {
    return "The browser blocked camera access for security reasons. Open the https link in Chrome or Safari." + appHint;
  }
  return "Could not start the camera. Allow camera permission for this site and tap Retry." + appHint;
}
