import { getCurrentWindow } from '@tauri-apps/api/window'

import i18n from './index'

export async function updateWindowTitle(): Promise<void> {
  try {
    const window = getCurrentWindow()
    await window.setTitle(i18n.t('common:app.title'))
  } catch {
    // running in browser dev mode without Tauri
  }
}
