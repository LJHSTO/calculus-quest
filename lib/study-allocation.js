"use strict";

const crypto = require("node:crypto");

// Allocation is server-side. The seed and the rest of each block must never
// appear in participant responses.
function participantAllocation({ seed, stratum, ordinal }) {
  if (typeof seed !== "string" || seed.length < 16 || typeof stratum !== "string"
    || !Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error("研究分组参数无效");
  }
  let counter = 0;
  function draw(limit, block) {
    const ceiling = Math.floor(2 ** 32 / limit) * limit;
    let value;
    do {
      value = crypto.createHmac("sha256", seed)
        .update(JSON.stringify(["participant-blocks-v1", stratum, block, counter++]))
        .digest().readUInt32BE();
    } while (value >= ceiling);
    return value % limit;
  }
  let block = 0, offset = 0;
  while (true) {
    counter = 0;
    const blockSize = draw(2, block) ? 6 : 4;
    if (ordinal < offset + blockSize) {
      const sequence = Array.from({ length: blockSize }, (_, i) => i < blockSize / 2 ? 0 : 1);
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = draw(i + 1, block);
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
      }
      const position = ordinal - offset, conditionIndex = sequence[position];
      return {
        algorithm: "participant-blocks-v1", unit: "participant",
        block, blockSize, position, conditionIndex,
        values: Array(6).fill(conditionIndex), marginalConditionProbability: 0.5
      };
    }
    offset += blockSize;
    block++;
  }
}

module.exports = { participantAllocation };
