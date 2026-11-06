export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The share sheet on phones; a download where the platform refuses this kind of file. */
export async function shareFile(file: File): Promise<ShareResult> {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    // A permission or type refusal still leaves the download path below.
  }
  try {
    download(file);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
