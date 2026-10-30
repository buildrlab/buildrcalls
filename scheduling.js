'use strict';
/** Two calls overlap if their recording intervals intersect. Adjacent calls are allowed. */
function overlaps(first, second) {
  const startA = Date.parse(first.start), startB = Date.parse(second.start);
  const durationA = Number(first.duration), durationB = Number(second.duration);
  if (![startA, startB, durationA, durationB].every(Number.isFinite) || durationA <= 0 || durationB <= 0) return false;
  return startA < startB + durationB * 60000 && startB < startA + durationA * 60000;
}
if (typeof module !== 'undefined') module.exports = { overlaps };
