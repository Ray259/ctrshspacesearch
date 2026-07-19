import type { FileRecord } from '../../../shared/types';

/**
 * Dot product of two vectors. The embedding pipeline normalizes its output,
 * so for stored/query embeddings this equals cosine similarity.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

/** Rounds vector components so the JSON index cache stays compact. */
export function roundVector(vector: number[]): number[] {
  return vector.map((v) => Math.round(v * 10_000) / 10_000);
}

/**
 * The text a record is embedded from: the humanized file name, its tags and
 * the closest folder names. File contents are intentionally not read — the
 * semantic signal stays cheap and privacy questions stay local anyway.
 */
export function embeddingText(record: FileRecord): string {
  const dirParts = record.dir.split(/[\\/]/).filter(Boolean).slice(-2);
  const baseName = record.ext ? record.name.slice(0, -record.ext.length) : record.name;
  const words = baseName.replace(/[._\-]+/g, ' ').trim();
  return [words, ...(record.tags ?? []), ...dirParts].join(' ');
}
