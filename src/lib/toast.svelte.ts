/** A single transient message shown above the mini player. */
export const toast = $state({ message: '', error: false });

let timer: ReturnType<typeof setTimeout>;

export function showToast(message: string, error = false) {
  toast.message = message;
  toast.error = error;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.message = ''), error ? 5000 : 2500);
}
