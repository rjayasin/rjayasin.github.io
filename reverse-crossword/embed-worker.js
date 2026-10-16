// Runs the clue matcher's embedding model off the main thread, so embedding
// an entry's past clues doesn't freeze clicks on the grid.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';

env.allowLocalModels = false;
const ready = pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', { dtype: 'q8' });
ready.then(
  () => postMessage({ ready: true }),
  (err) => postMessage({ error: String(err) })
);

onmessage = async ({ data: { id, texts } }) => {
  try {
    const extractor = await ready;
    const vecs = (await extractor(texts, { pooling: 'mean', normalize: true })).tolist();
    postMessage({ id, vecs });
  } catch (err) {
    postMessage({ id, error: String(err) });
  }
};
