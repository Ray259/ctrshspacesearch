export function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

const ICON_BY_EXT: Record<string, string> = {
  '.pdf': '📕', '.doc': '📄', '.docx': '📄', '.txt': '📄', '.md': '📝', '.rtf': '📄',
  '.xls': '📊', '.xlsx': '📊', '.csv': '📊', '.ppt': '📽️', '.pptx': '📽️',
  '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.heic': '🖼️', '.svg': '🖼️',
  '.mp4': '🎬', '.mov': '🎬', '.mkv': '🎬', '.avi': '🎬',
  '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.m4a': '🎵',
  '.zip': '🗜️', '.tar': '🗜️', '.gz': '🗜️', '.7z': '🗜️', '.rar': '🗜️',
  '.js': '🧩', '.ts': '🧩', '.jsx': '🧩', '.tsx': '🧩', '.py': '🧩', '.rb': '🧩',
  '.go': '🧩', '.rs': '🧩', '.java': '🧩', '.c': '🧩', '.cpp': '🧩', '.cs': '🧩',
  '.json': '🧾', '.yml': '🧾', '.yaml': '🧾', '.xml': '🧾', '.toml': '🧾',
  '.app': '🚀', '.exe': '🚀', '.dmg': '💿', '.iso': '💿',
};

export function iconFor(name: string, isDir: boolean): string {
  if (isDir) return '📁';
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase();
  return ICON_BY_EXT[ext] ?? '📄';
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
