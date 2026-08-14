/** Inline SVG icons, so the page needs no icon library. */
export class Icons {
  static paths = {
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" />',
    upload: '<path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />',
    message:
      '<path d="M20.5 11.7a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20.8l1.7-4.7a8.6 8.6 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.4-8.4h.5a8.4 8.4 0 0 1 7.8 7.9z" />',
    loader:
      '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />',
  };

  /** Returns an inline SVG string for one of the icons above. */
  get(name, size = 17) {
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `${Icons.paths[name] ?? ""}</svg>`
    );
  }

  /** Fills every `data-icon` placeholder in the static markup. */
  renderStatic(root = document) {
    for (const element of root.querySelectorAll("[data-icon]")) {
      element.innerHTML = this.get(element.dataset.icon, Number(element.dataset.iconSize) || 17);
    }
  }
}
