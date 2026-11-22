// A small seeded random number generator (xorshift32): the same seed gives
// the same game, which is what makes the screenshot scenes repeatable.
// Nothing here touches the DOM, so node can use it for tests too.
export function createRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

/** Pick one element of an array with the seeded generator. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
