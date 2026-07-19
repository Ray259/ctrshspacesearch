/**
 * Rule-based tag assignment, run once per record during indexing. Rules are
 * simple string checks on the extension and path so the cost per file is
 * negligible (a few Set lookups / substring tests).
 */

const EXTENSION_TAGS = new Map<string, string[]>();

function registerExtensions(tags: string[], exts: string[]): void {
  for (const ext of exts) {
    EXTENSION_TAGS.set(ext, [...(EXTENSION_TAGS.get(ext) ?? []), ...tags]);
  }
}

registerExtensions(
  ['development'],
  ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.swift', '.m', '.sh', '.zsh', '.bash', '.sql', '.yml', '.yaml', '.toml', '.gradle', '.vue', '.svelte'],
);
registerExtensions(['docs'], ['.md', '.txt', '.pdf', '.doc', '.docx', '.rtf', '.odt', '.tex', '.epub', '.pages']);
registerExtensions(['image', 'media'], ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.bmp', '.tiff', '.ico']);
registerExtensions(['video', 'media'], ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv']);
registerExtensions(['audio', 'media'], ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.aiff']);
registerExtensions(['archive'], ['.zip', '.tar', '.gz', '.bz2', '.xz', '.rar', '.7z', '.dmg', '.iso']);
registerExtensions(['spreadsheet'], ['.xls', '.xlsx', '.numbers', '.ods']);
registerExtensions(['data'], ['.csv', '.tsv', '.json', '.ndjson', '.parquet', '.db', '.sqlite']);
registerExtensions(['presentation'], ['.ppt', '.pptx', '.key', '.odp']);
registerExtensions(['design'], ['.fig', '.sketch', '.psd', '.ai', '.xd', '.afdesign', '.blend']);
registerExtensions(['font'], ['.ttf', '.otf', '.woff', '.woff2']);
registerExtensions(['ebook'], ['.epub', '.mobi', '.azw3']);

/** Lowercased path fragments (with separators normalized to '/') mapped to a tag. */
const PATH_TAGS: Array<[fragment: string, tag: string]> = [
  ['/screenshots', 'screenshot'],
  ['/screen shots', 'screenshot'],
  ['/downloads', 'download'],
  ['/desktop', 'desktop'],
  ['/documents', 'docs'],
  ['/pictures', 'image'],
  ['/photos', 'image'],
  ['/movies', 'video'],
  ['/music', 'audio'],
  ['/projects', 'development'],
  ['/repos', 'development'],
  ['/src/', 'development'],
  ['/dev/', 'development'],
  ['/invoices', 'finance'],
  ['/receipts', 'finance'],
  ['/tax', 'finance'],
];

const SCREENSHOT_NAME = /^(screen\s?shot|screenshot|capture)/;

/**
 * Computes tags for one entry. Returns undefined instead of an empty array so
 * untagged records carry no extra memory in the index / JSON cache.
 */
export function computeTags(fullPath: string, name: string, ext: string, isDir: boolean): string[] | undefined {
  const tags = new Set<string>();

  if (!isDir) {
    for (const tag of EXTENSION_TAGS.get(ext) ?? []) tags.add(tag);
    if (SCREENSHOT_NAME.test(name.toLowerCase())) tags.add('screenshot');
  }

  const pathLower = fullPath.toLowerCase().split('\\').join('/');
  for (const [fragment, tag] of PATH_TAGS) {
    if (pathLower.includes(fragment)) tags.add(tag);
  }

  return tags.size > 0 ? [...tags] : undefined;
}
