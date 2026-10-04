/**
 * Global Dialog Store & Alert Replacement
 * Replaces default ugly Android Alert.alert dialogs with custom themed modal dialogs.
 */

import { create } from 'zustand';
import { haptics } from '../../utils/haptics';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export type DialogType = 'info' | 'warning' | 'danger' | 'error' | 'success';

export interface DialogOptions {
  title: string;
  message?: string;
  type?: DialogType;
  buttons?: DialogButton[];
}

interface DialogState {
  isOpen: boolean;
  options: DialogOptions | null;
  show: (options: DialogOptions) => void;
  close: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  options: null,
  show: (options: DialogOptions) => {
    if (options.type === 'error') {
      haptics.error();
    } else if (options.type === 'danger' || options.type === 'warning') {
      haptics.warning();
    } else if (options.type === 'success') {
      haptics.success();
    } else {
      haptics.light();
    }

    set({
      isOpen: true,
      options: {
        ...options,
        buttons: options.buttons && options.buttons.length > 0
          ? options.buttons
          : [{ text: 'OK', style: 'default' }],
      },
    });
  },
  close: () => {
    set({ isOpen: false });
  },
}));

/**
 * Drop-in replacement for Alert.alert with rich, beautiful styling and haptics.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  type: DialogType = 'info'
) {
  // Infer type if not specified
  let inferredType = type;
  if (buttons?.some((b) => b.style === 'destructive') || title.toLowerCase().includes('delete') || title.toLowerCase().includes('remove')) {
    inferredType = 'danger';
  } else if (title.toLowerCase().includes('error') || title.toLowerCase().includes('failed') || title.toLowerCase().includes('stop')) {
    inferredType = 'warning';
  } else if (title.toLowerCase().includes('success') || title.toLowerCase().includes('ready') || title.toLowerCase().includes('joined')) {
    inferredType = 'success';
  }

  useDialogStore.getState().show({
    title,
    message,
    type: inferredType,
    buttons,
  });
}
