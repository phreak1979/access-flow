import { browser } from "$app/environment";

export type AlertType = "success" | "error" | "warning" | "info" | "question";

async function getSwal() {
  // dynamic import so SSR doesn’t load the browser-only code
  const mod = await import("sweetalert2");
  return mod.default;
}

export async function alert(message: string, type: AlertType = "info", title?: string) {
  if (!browser) return; // no-op on server
  const Swal = await getSwal();
  return Swal.fire({
    title: title ?? type.toUpperCase(),
    text: message,
    icon: type,
    confirmButtonText: "OK",
    heightAuto: false,
  });
}

export async function toast(message: string, type: AlertType = "info", title?: string) {
  if (!browser) return;
  const Swal = await getSwal();
  return Swal.fire({
    title: title ?? undefined,
    text: message,
    icon: type,
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    heightAuto: false,
  });
}

export async function confirm(
  message: string,
  opts: { title?: string; confirmText?: string; cancelText?: string } = {},
): Promise<boolean | undefined> {
  if (!browser) return;
  const Swal = await getSwal();
  const res = await Swal.fire({
    title: opts.title ?? "Are you sure?",
    text: message,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "Yes",
    cancelButtonText: opts.cancelText ?? "Cancel",
    heightAuto: false,
  });
  return res.isConfirmed;
}
