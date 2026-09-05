import { describe, expect, it } from 'vitest';
import { extractSageToolMarkers } from '@/lib/sageToolMarkers';

describe('extractSageToolMarkers', () => {
  it('extracts every same-type marker from a coalesced stream buffer', () => {
    const input = [
      'Before',
      '___TOOL_CALL_LOG_FOOD___{"food_name":"Apple","calories":95}\n\n',
      'between',
      '___TOOL_CALL_LOG_FOOD___{"food_name":"Yogurt","calories":120}\n\n',
      'After',
    ].join('');

    const result = extractSageToolMarkers(input);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.data.food_name)).toEqual(['Apple', 'Yogurt']);
    expect(result.text).toBe('BeforebetweenAfter');
    expect(result.malformedCount).toBe(0);
  });

  it('retains an incomplete marker for the next network chunk', () => {
    const input = 'Text___TOOL_CALL_LOG_HYDRATION___{"amount_ml":500}';
    const result = extractSageToolMarkers(input);
    expect(result.events).toEqual([]);
    expect(result.text).toBe(input);
  });

  it('removes malformed complete markers without executing an event', () => {
    const result = extractSageToolMarkers('A___TOOL_CALL_LOG_WEIGHT___not-json\n\nB');
    expect(result.events).toEqual([]);
    expect(result.malformedCount).toBe(1);
    expect(result.text).toBe('AB');
  });
});
