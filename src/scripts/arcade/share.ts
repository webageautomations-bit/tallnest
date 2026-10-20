// Jingo Arcade — result sharing, behind every <ShareResult />.
// navigator.share when the device has it (the native sheet covers WhatsApp,
// Instagram, SMS…); otherwise a WhatsApp link plus a Copy button. Games call
// setShare() when a result is ready; the markup already carries a sensible
// default so the WhatsApp link works even before (or without) that.

const waHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const fullText = (message: string, url: string) => (url ? `${message} ${url}` : message);

function sync(root: HTMLElement): void {
  const message = root.dataset.message ?? "";
  const url = root.dataset.url ?? "";
  const wa = root.querySelector<HTMLAnchorElement>("[data-share-wa]");
  if (wa) wa.href = waHref(fullText(message, url));
  const preview = root.querySelector<HTMLElement>("[data-share-preview]");
  if (preview) preview.textContent = message;
}

/** Point a ShareResult block (or every one on the page) at a new result. */
export function setShare(message: string, url?: string, root?: HTMLElement | null): void {
  const roots = root ? [root] : [...document.querySelectorAll<HTMLElement>("[data-share]")];
  for (const r of roots) {
    r.dataset.message = message;
    if (url !== undefined) r.dataset.url = url;
    sync(r);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: hidden textarea fallback.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function initShare(): void {
  const canNativeShare = typeof navigator.share === "function";
  for (const root of document.querySelectorAll<HTMLElement>("[data-share]")) {
    if (root.dataset.shareReady) continue;
    root.dataset.shareReady = "1";
    sync(root);

    const native = root.querySelector<HTMLButtonElement>("[data-share-native]");
    const fallback = root.querySelector<HTMLElement>("[data-share-fallback]");
    const copy = root.querySelector<HTMLButtonElement>("[data-share-copy]");
    const status = root.querySelector<HTMLElement>("[data-share-status]");
    const say = (msg: string) => {
      if (!status) return;
      status.textContent = msg;
      window.setTimeout(() => {
        if (status.textContent === msg) status.textContent = "";
      }, 2400);
    };

    if (canNativeShare && native) {
      native.hidden = false;
      if (fallback) fallback.hidden = true;
      native.addEventListener("click", async () => {
        const message = root.dataset.message ?? "";
        const url = root.dataset.url ?? "";
        try {
          await navigator.share(url ? { text: message, url } : { text: message });
        } catch (err) {
          // AbortError = the visitor closed the sheet; anything else → fallback.
          if ((err as DOMException)?.name !== "AbortError") {
            native.hidden = true;
            if (fallback) fallback.hidden = false;
          }
        }
      });
    }

    copy?.addEventListener("click", async () => {
      const ok = await copyText(fullText(root.dataset.message ?? "", root.dataset.url ?? ""));
      say(ok ? "Copied — paste it anywhere." : "Couldn't copy — try the WhatsApp button.");
    });
  }
}
