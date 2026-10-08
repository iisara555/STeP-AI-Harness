import type { ExtractionMethod } from './extraction-provenance';

export type ReceiptFormState = {
  sourceId: string;
  values: Record<string, string>;
  guessed: Record<string, 'ocr' | 'ai'>;
  origins: Record<string, ExtractionMethod>;
  checked: boolean;
  description: { value: string; edited: boolean; origin: ExtractionMethod };
};

type Action =
  | { type: 'load'; sourceId: string; values: Record<string, string>; guessed: Record<string, 'ocr' | 'ai'>; description: string }
  | { type: 'edit'; field: string; value: string }
  | { type: 'describe'; value: string }
  | { type: 'check'; checked: boolean }
  | {
      type: 'suggest';
      sourceId: string;
      values: Record<string, string>;
      origin: 'vision' | 'ai-candidate-filter';
      description?: string;
    };

export const emptyReceiptForm: ReceiptFormState = {
  sourceId: '',
  values: {},
  guessed: {},
  origins: {},
  checked: false,
  description: { value: '', edited: false, origin: 'ocr' },
};

/** Form values, provenance and human review change together. Async readings cannot undo human edits. */
export function receiptFormReducer(state: ReceiptFormState, action: Action): ReceiptFormState {
  switch (action.type) {
    case 'load':
      return {
        sourceId: action.sourceId,
        values: { ...action.values },
        guessed: { ...action.guessed },
        origins: Object.fromEntries(Object.keys(action.values).map(key => [key, 'ocr'])),
        checked: false,
        description: { value: action.description, edited: false, origin: 'ocr' },
      };
    case 'edit': {
      const guessed = { ...state.guessed };
      delete guessed[action.field];
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        guessed,
        origins: { ...state.origins, [action.field]: 'manual' },
        checked: false,
      };
    }
    case 'describe':
      return { ...state, description: { value: action.value, edited: true, origin: 'manual' }, checked: false };
    case 'check':
      return { ...state, checked: action.checked };
    case 'suggest': {
      if (action.sourceId !== state.sourceId) return state;
      const values = { ...state.values },
        guessed = { ...state.guessed },
        origins = { ...state.origins };
      for (const [key, value] of Object.entries(action.values)) {
        if (!value || origins[key] === 'manual') continue;
        values[key] = value;
        guessed[key] = 'ai';
        origins[key] = action.origin;
      }
      const description =
        action.description && !state.description.edited
          ? { value: action.description, edited: false, origin: action.origin }
          : state.description;
      return { ...state, values, guessed, origins, description, checked: false };
    }
  }
}
