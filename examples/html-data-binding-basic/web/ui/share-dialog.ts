import { $ } from "./dom.js";

/** The dialog that offers an immersive link to the saved HTML view. */
export function setupShareDialog() {
  const dialog = $<HTMLDialogElement>("#share-dialog");
  const link = $<HTMLInputElement>("#share-link");
  $("#close-share").onclick = () => dialog.close();
  $("#copy-share").onclick = async () => {
    try {
      await navigator.clipboard.writeText(link.value);
      $("#share-status").textContent = "Link copied";
    } catch {
      link.focus();
      link.select();
      $("#share-status").textContent = "Select and copy the link above.";
    }
  };
  return {
    show(file: { id: string; name: string }) {
      const url = new URL(location.pathname, location.origin);
      const language = new URLSearchParams(location.search).get("lang");
      if (language === "zh-CN" || language === "en-US") url.searchParams.set("lang", language);
      url.searchParams.set("file", file.id);
      url.searchParams.set("view", "immersive");
      link.value = url.href;
      $("#share-name").textContent = file.name;
      $("#share-status").textContent = "";
      $("#share-hint").textContent = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ? "This is a local link. To share with another device, open this app using an address that device can reach."
        : "Anyone who can access this server can open the view and use its controls.";
      dialog.showModal();
      link.select();
    },
  };
}
