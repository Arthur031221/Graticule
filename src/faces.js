/** Which of the bundled CJK faces can draw which characters. */

const ORDER = ["tc", "sc", "jp", "kr"];

/**
 * @param {Record<string, number[]>} ranges flat [start, end, start, end, ...] per face
 */
export function createCoverage(ranges) {
  const covers = (face, cp) => {
    const list = ranges[face];
    if (!list) return false;
    let lo = 0;
    let hi = list.length / 2 - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < list[mid * 2]) hi = mid - 1;
      else if (cp > list[mid * 2 + 1]) lo = mid + 1;
      else return true;
    }
    return false;
  };

  /** The face to draw a character with: the primary one when it can, else the first that can, else null. */
  const pick = (cp, primary) =>
    primary && covers(primary, cp) ? primary : (ORDER.find((face) => covers(face, cp)) ?? null);

  /** The face that can draw the most of these characters, for text with no language to go by. */
  const best = (codepoints) => {
    const score = (face) => codepoints.filter((cp) => covers(face, cp)).length;
    return ORDER.reduce((winner, face) => (score(face) > score(winner) ? face : winner), ORDER[0]);
  };

  return { covers, pick, best };
}
