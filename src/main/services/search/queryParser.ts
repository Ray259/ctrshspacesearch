export interface ParsedQuery {
  baseQuery: string;
  excludePatterns: string[];
  excludeRegexes: RegExp[];
  includePatterns: string[];
  includeRegexes: RegExp[];
}

/**
 * Parses search query to extract query modifiers/filters.
 * A slash "/" is used as the delimiter for filters.
 *
 * Examples:
 * - "foo / -Application" -> base: "foo", exclude: ["application"]
 * - "bar/-node_modules" -> base: "bar", exclude: ["node_modules"]
 * - "test / /\.ts$/" -> base: "test", includeRegex: /\.ts$/
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = {
    baseQuery: query,
    excludePatterns: [],
    excludeRegexes: [],
    includePatterns: [],
    includeRegexes: [],
  };

  const trimmed = query.trim();
  if (!trimmed) {
    return parsed;
  }

  // Look for a delimiter slash. A delimiter slash is a '/' that is:
  // - surrounded by spaces (e.g. " / ")
  // - or followed by a minus/plus/slash (e.g. "/-", "/+", "//")
  let slashIdx = -1;
  const match = /\s+\/\s+|\/\s*[-+]/g.exec(trimmed);
  if (match) {
    slashIdx = match.index + trimmed.substring(match.index).indexOf('/');
  }

  if (slashIdx === -1) {
    return parsed;
  }

  parsed.baseQuery = trimmed.substring(0, slashIdx).trim();
  const modifierPart = trimmed.substring(slashIdx + 1).trim();

  // Match:
  // 1. Negative regex: -\/((?:\\\/|[^\/])+)\/([gimy]*)
  // 2. Positive regex: \+?\/((?:\\\/|[^\/])+)\/([gimy]*)
  // 3. Negative simple: -([^\s]+)
  // 4. Positive simple: \+?([^\s]+)
  const tokenRegex = /(\+|-)?(?:\/((?:\\\/|[^\/])+)\/([gimy]*)|([^\s]+))/g;
  let tokenMatch;
  while ((tokenMatch = tokenRegex.exec(modifierPart)) !== null) {
    const sign = tokenMatch[1]; // '+' or '-' or undefined
    const regexBody = tokenMatch[2];
    const regexFlags = tokenMatch[3];
    const simpleText = tokenMatch[4];

    if (regexBody !== undefined) {
      try {
        const regex = new RegExp(regexBody, regexFlags || 'i');
        if (sign === '-') {
          parsed.excludeRegexes.push(regex);
        } else {
          parsed.includeRegexes.push(regex);
        }
      } catch (e) {
        const fallbackText = `/${regexBody}/${regexFlags}`;
        if (sign === '-') {
          parsed.excludePatterns.push(fallbackText.toLowerCase());
        } else {
          parsed.includePatterns.push(fallbackText.toLowerCase());
        }
      }
    } else if (simpleText !== undefined) {
      const lower = simpleText.toLowerCase();
      if (sign === '-') {
        parsed.excludePatterns.push(lower);
      } else if (sign === '+') {
        parsed.includePatterns.push(lower);
      } else {
        parsed.includePatterns.push(lower);
      }
    }
  }

  return parsed;
}

/**
 * Checks whether a path matches the exclude/include rules defined in the parsed query.
 */
export function matchesFilters(parsed: ParsedQuery, path: string): boolean {
  const lowerPath = path.toLowerCase();
  for (const pattern of parsed.excludePatterns) {
    if (lowerPath.includes(pattern)) return false;
  }
  for (const regex of parsed.excludeRegexes) {
    if (regex.test(path)) return false;
  }
  if (parsed.includePatterns.length > 0 || parsed.includeRegexes.length > 0) {
    let included = false;
    for (const pattern of parsed.includePatterns) {
      if (lowerPath.includes(pattern)) {
        included = true;
        break;
      }
    }
    if (!included) {
      for (const regex of parsed.includeRegexes) {
        if (regex.test(path)) {
          included = true;
          break;
        }
      }
    }
    if (!included) return false;
  }
  return true;
}
