import { parentPort, workerData } from 'node:worker_threads';

/**
 * Worker thread that runs the local embedding model via @xenova/transformers,
 * keeping tokenization/inference off the main process. The model is loaded
 * lazily on the first request (downloaded to `cacheDir` on first ever use).
 *
 * Protocol: receives { id, texts } and answers { id, vectors } or
 * { id, error }. Requests are processed strictly in order.
 */

interface WorkerInit {
  /** Hugging Face model id, e.g. "Xenova/all-MiniLM-L6-v2". */
  modelId: string;
  /** Directory where model weights are cached between runs. */
  cacheDir: string;
}

interface EmbedRequest {
  id: number;
  texts: string[];
}

const { modelId, cacheDir } = workerData as WorkerInit;

type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const transformers = await import('@xenova/transformers');
      transformers.env.cacheDir = cacheDir;
      transformers.env.allowLocalModels = false;
      const pipe = await transformers.pipeline('feature-extraction', modelId, { quantized: true });
      return pipe as unknown as FeatureExtractor;
    })();
  }
  return extractorPromise;
}

async function handle(request: EmbedRequest): Promise<void> {
  try {
    const extractor = await getExtractor();
    const output = await extractor(request.texts, { pooling: 'mean', normalize: true });
    const [count, dim] = output.dims;
    const vectors: number[][] = [];
    for (let i = 0; i < count; i++) {
      vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
    }
    parentPort!.postMessage({ id: request.id, vectors });
  } catch (err) {
    parentPort!.postMessage({ id: request.id, error: err instanceof Error ? err.message : String(err) });
  }
}

parentPort!.on('message', (request: EmbedRequest) => void handle(request));
