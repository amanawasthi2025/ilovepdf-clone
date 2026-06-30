export const MAX_FILE_SIZE_BYTES = 52_428_800 // 50 MB
export const MAX_FILES = 10
export const MIN_FILES = 2

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}
