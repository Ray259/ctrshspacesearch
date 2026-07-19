/**
 * Inline SVG icon set (Lucide-style outline paths, MIT). Inlined because the
 * CSP forbids external resources; rendered with `currentColor` so selection
 * states recolor them via CSS.
 */
export type IconName =
  | 'folder'
  | 'file'
  | 'file-text'
  | 'image'
  | 'film'
  | 'music'
  | 'archive'
  | 'code'
  | 'table'
  | 'presentation'
  | 'app'
  | 'sparkles'
  | 'history';

const ICON_MARKUP: Record<IconName, string> = {
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  film:
    '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 12h18"/><path d="M3 7.5h4"/><path d="M3 16.5h4"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  music:
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  table:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
  presentation:
    '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  app:
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  history:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
};

/** A `.result-icon` span containing the named inline SVG. */
export function iconElement(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'result-icon';
  span.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_MARKUP[name]}</svg>`;
  return span;
}

const ICON_BY_EXT: Record<string, IconName> = {
  '.pdf': 'file-text', '.doc': 'file-text', '.docx': 'file-text', '.txt': 'file-text',
  '.md': 'file-text', '.rtf': 'file-text', '.pages': 'file-text',
  '.xls': 'table', '.xlsx': 'table', '.csv': 'table', '.tsv': 'table', '.numbers': 'table',
  '.ppt': 'presentation', '.pptx': 'presentation', '.key': 'presentation',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.heic': 'image',
  '.svg': 'image', '.webp': 'image', '.bmp': 'image', '.tiff': 'image',
  '.mp4': 'film', '.mov': 'film', '.mkv': 'film', '.avi': 'film', '.webm': 'film',
  '.mp3': 'music', '.wav': 'music', '.flac': 'music', '.m4a': 'music', '.aac': 'music', '.ogg': 'music',
  '.zip': 'archive', '.tar': 'archive', '.gz': 'archive', '.7z': 'archive', '.rar': 'archive',
  '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code', '.py': 'code', '.rb': 'code',
  '.go': 'code', '.rs': 'code', '.java': 'code', '.c': 'code', '.cpp': 'code', '.cs': 'code',
  '.sh': 'code', '.html': 'code', '.css': 'code',
  '.json': 'code', '.yml': 'code', '.yaml': 'code', '.xml': 'code', '.toml': 'code',
};

export function iconNameForFile(fileName: string, isDir: boolean): IconName {
  if (isDir) return 'folder';
  const dot = fileName.lastIndexOf('.');
  const ext = dot === -1 ? '' : fileName.slice(dot).toLowerCase();
  return ICON_BY_EXT[ext] ?? 'file';
}
