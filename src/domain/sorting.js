import { DomainError } from './errors.js';

export function mergeSort(items, compare) {
  if (!Array.isArray(items)) {
    throw new DomainError('VALIDATION', 'items must be an array');
  }
  if (typeof compare !== 'function') {
    throw new DomainError('VALIDATION', 'compare must be a function');
  }

  let source = items.slice();
  let destination = new Array(source.length);

  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length);
      const end = Math.min(start + width * 2, source.length);
      let left = start;
      let right = middle;
      let output = start;

      while (left < middle && right < end) {
        if (compare(source[left], source[right]) <= 0) {
          destination[output] = source[left];
          left += 1;
        } else {
          destination[output] = source[right];
          right += 1;
        }
        output += 1;
      }
      while (left < middle) {
        destination[output] = source[left];
        left += 1;
        output += 1;
      }
      while (right < end) {
        destination[output] = source[right];
        right += 1;
        output += 1;
      }
    }

    [source, destination] = [destination, source];
  }

  return source;
}
