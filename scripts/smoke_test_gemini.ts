/* eslint-disable @typescript-eslint/no-explicit-any */
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not configured in .env.local');
  process.exit(1);
}

// Log confirmation that key is configured without exposing any characters
console.log('GEMINI_API_KEY is configured. (Length:', process.env.GEMINI_API_KEY.length, 'chars)');

import { streamSage } from '../src/lib/sage';

async function runSmokeTest() {
  console.log('--- Starting Live Gemini 3.8 Flash Smoke Test ---');
  const prompt = 'I just drank 500ml of water. Please log my hydration and give me a brief 1-sentence acknowledgement.';
  console.log('Prompt:', prompt);

  let fullOutput = '';
  let hasThoughtStart = false;
  let hasThoughtEnd = false;
  let hasToolCallMarker = false;
  let chunkCount = 0;

  const startTime = Date.now();
  const stream = streamSage(prompt, undefined, undefined, undefined, 'metric');

  for await (const chunk of stream) {
    chunkCount++;
    fullOutput += chunk;
    if (chunk.includes('<thought>')) hasThoughtStart = true;
    if (chunk.includes('</thought>')) hasThoughtEnd = true;
    if (chunk.includes('___TOOL_CALL_LOG_HYDRATION___')) {
      hasToolCallMarker = true;
      console.log('-> Captured tool emission marker in stream!');
    }
  }

  const durationMs = Date.now() - startTime;
  console.log('\n--- Live Smoke Test Results ---');
  console.log('Duration:', durationMs, 'ms');
  console.log('Total chunks received:', chunkCount);
  console.log('Total output length:', fullOutput.length, 'chars');
  console.log('Thought start marker found:', hasThoughtStart);
  console.log('Thought end marker found:', hasThoughtEnd);
  console.log('Tool call marker found:', hasToolCallMarker);

  if (!hasToolCallMarker) {
    console.error('FAIL: Expected ___TOOL_CALL_LOG_HYDRATION___ in output, but was not received.');
    console.log('Raw output preview:\n', fullOutput.slice(0, 500));
    process.exit(1);
  }

  console.log('Smoke test SUCCESS: Gemini 3.8 Flash called log_hydration, tool was executed, and response streamed cleanly.');
}

runSmokeTest().catch((err) => {
  console.error('Smoke test exception:', err);
  process.exit(1);
});
