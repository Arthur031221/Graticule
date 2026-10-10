/**
 * Font subsetting with the HarfBuzz subsetter compiled to WebAssembly
 * (harfbuzz-subset.wasm from the harfbuzzjs package). Embedding only the
 * glyphs a map uses keeps CJK labels intact on machines without the font.
 */

const HB_MEMORY_MODE_WRITABLE = 2;

/** @type {WebAssembly.Exports | null} */
let hb = null;

/** @param {Uint8Array} wasmBytes contents of harfbuzz-subset.wasm */
export async function initSubsetter(wasmBytes) {
  if (hb) return;
  const { instance } = await WebAssembly.instantiate(/** @type {BufferSource} */ (wasmBytes), {});
  hb = instance.exports;
}

/**
 * Keeps only the glyphs for the given code points.
 * @param {Uint8Array} font a single TrueType or OpenType font
 * @param {Iterable<number>} codepoints
 * @returns {Uint8Array} the subset font
 */
export function subsetFont(font, codepoints) {
  if (!hb) throw new Error("call initSubsetter first");
  const x = /** @type {any} */ (hb);
  const heap = () => new Uint8Array(x.memory.buffer);
  const dataPtr = x.malloc(font.length);
  heap().set(font, dataPtr);
  const blob = x.hb_blob_create(dataPtr, font.length, HB_MEMORY_MODE_WRITABLE, 0, 0);
  const face = x.hb_face_create(blob, 0);
  const input = x.hb_subset_input_create_or_fail();
  const unicodes = x.hb_subset_input_unicode_set(input);
  for (const cp of codepoints) x.hb_set_add(unicodes, cp);
  const subset = x.hb_subset_or_fail(face, input);
  try {
    if (!subset) throw new Error("the font subsetter failed");
    const out = x.hb_face_reference_blob(subset);
    const length = x.hb_blob_get_length(out);
    const bytes = heap().slice(x.hb_blob_get_data(out, 0), x.hb_blob_get_data(out, 0) + length);
    x.hb_blob_destroy(out);
    return bytes;
  } finally {
    if (subset) x.hb_face_destroy(subset);
    x.hb_subset_input_destroy(input);
    x.hb_face_destroy(face);
    x.hb_blob_destroy(blob);
  }
}
