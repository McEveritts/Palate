export type SageToolMarkerType =
  | 'LOG_FOOD'
  | 'LOG_EXERCISE'
  | 'LOG_HYDRATION'
  | 'LOG_WEIGHT';

export interface SageToolMarkerEvent {
  type: SageToolMarkerType;
  data: Record<string, unknown>;
}

export interface SageToolMarkerExtraction {
  text: string;
  events: SageToolMarkerEvent[];
  malformedCount: number;
}

const COMPLETE_MARKER_PATTERN =
  /___TOOL_CALL_(LOG_FOOD|LOG_EXERCISE|LOG_HYDRATION|LOG_WEIGHT)___([^\r\n]*)\r?\n\r?\n/g;

/**
 * Removes every complete Sage tool marker from a stream buffer and returns all
 * decoded events. Incomplete markers remain in the buffer until a later chunk
 * supplies their terminating blank line.
 */
export function extractSageToolMarkers(input: string): SageToolMarkerExtraction {
  const events: SageToolMarkerEvent[] = [];
  let malformedCount = 0;
  const text = input.replace(COMPLETE_MARKER_PATTERN, (_match, type: SageToolMarkerType, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Tool marker payload must be an object');
      }
      events.push({ type, data: parsed as Record<string, unknown> });
    } catch {
      malformedCount += 1;
    }
    return '';
  });

  return { text, events, malformedCount };
}
