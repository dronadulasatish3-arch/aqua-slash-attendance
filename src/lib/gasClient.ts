// =======================================================
// Transport layer for Google Apps Script /exec endpoints.
// - Explicit credentials: "omit" + mode: "cors" + redirect: "follow"
//   prevents multi-Google-account cookie redirects in browsers.
// - Generous 60s timeout on POST so Google Drive photo upload +
//   Google Sheets row append never aborts prematurely on mobile data.
// - GET uses fetch with automatic JSONP fallback.
// =======================================================

export class GasError extends Error {}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new GasError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function extractReadableError(rawText: string): string {
  const clean = rawText
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/authorization is required/i.test(clean)) {
    return "Google Apps Script needs Drive/Sheet permission authorized by the script owner.";
  }
  if (/access denied/i.test(clean) || /permission/i.test(clean)) {
    return `Google Apps Script permission error: ${clean.slice(0, 140)}`;
  }
  if (clean.length > 0 && clean.length < 180) {
    return `Unexpected server response: ${clean}`;
  }
  return "Google Apps Script did not return valid JSON. Check deployment access is set to 'Anyone'.";
}

function jsonp(baseUrl: string, params: Record<string, string>, timeoutMs = 25_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const cb = `aqua_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new GasError("Google Apps Script request timed out"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try {
        delete (window as any)[cb];
      } catch {
        (window as any)[cb] = undefined;
      }
      script.remove();
    }

    (window as any)[cb] = (data: any) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new GasError("Could not reach Google Apps Script. Check your internet connection."));
    };
    const sep = baseUrl.includes("?") ? "&" : "?";
    script.src = `${baseUrl}${sep}${qs({ ...params, callback: cb, _t: String(Date.now()) })}`;
    document.head.appendChild(script);
  });
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 25_000): Promise<any> {
  const res = await withTimeout(
    fetch(url, {
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      ...init,
    }),
    timeoutMs,
    "Google Apps Script request"
  );
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new GasError(extractReadableError(text));
  }
}

/** GET with cache-busting and automatic JSONP fallback. */
export async function gasGet(baseUrl: string, params: Record<string, string>): Promise<any> {
  const sep = baseUrl.includes("?") ? "&" : "?";
  const fullParams = { ...params, _t: String(Date.now()) };
  try {
    return await fetchJson(`${baseUrl}${sep}${qs(fullParams)}`, undefined, 25_000);
  } catch {
    return await jsonp(baseUrl, params, 25_000);
  }
}

/** POST JSON (as text/plain simple CORS request — no OPTIONS preflight) with 60s timeout for Drive upload. */
export async function gasPost(baseUrl: string, payload: Record<string, any>): Promise<any> {
  return fetchJson(
    baseUrl,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    },
    60_000
  );
}
