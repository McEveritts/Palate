/* eslint-disable @typescript-eslint/no-explicit-any */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { SAGE_MODEL, SAGE_THINKING_CONFIG, createGenAIClient } from '../src/lib/ai/model-config';

async function diagnose() {
  const ai = createGenAIClient();
  const chat = ai.chats.create({
    model: SAGE_MODEL,
    config: {
      temperature: 0.7,
      ...SAGE_THINKING_CONFIG,
    },
  });

  console.log('Sending message with thinking config:', JSON.stringify(SAGE_THINKING_CONFIG));
  const res = await chat.sendMessageStream({
    message: [{ text: 'How do you emulsify a classic hollandaise sauce? Think step by step.' }],
  });

  let chunkIdx = 0;
  for await (const chunk of res) {
    chunkIdx++;
    console.log(`\n--- CHUNK ${chunkIdx} ---`);
    const candidate = chunk.candidates?.[0];
    if (!candidate) {
      console.log('No candidate, text:', chunk.text);
      continue;
    }
    const parts = candidate.content?.parts;
    console.log(`Candidate finishReason: ${candidate.finishReason}, parts length: ${parts?.length}`);
    if (parts) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i] as any;
        console.log(` Part ${i}: thought=${p.thought}, keys=${Object.keys(p).join(',')}, textSnippet=${JSON.stringify(p.text?.slice(0, 50))}`);
      }
    }
    if (chunkIdx >= 10) {
      console.log('Truncating diagnostic after 10 chunks...');
      break;
    }
  }
}

diagnose().catch(console.error);
