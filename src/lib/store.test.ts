import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store';

describe('useAppStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset store state before each test
    useAppStore.setState({ isGuest: false, geminiApiKey: '' });
  });

  it('should have initial state', () => {
    const state = useAppStore.getState();
    expect(state.isGuest).toBe(false);
    expect(state.geminiApiKey).toBe('');
  });

  it('should update isGuest state', () => {
    const { setGuest } = useAppStore.getState();
    
    setGuest(true);
    expect(useAppStore.getState().isGuest).toBe(true);
    
    setGuest(false);
    expect(useAppStore.getState().isGuest).toBe(false);
  });

  it('should update geminiApiKey state', () => {
    const { setGeminiApiKey } = useAppStore.getState();
    
    setGeminiApiKey('test-key-123');
    expect(useAppStore.getState().geminiApiKey).toBe('test-key-123');
  });
});

