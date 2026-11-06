/**
 * Fachada sobre SweetAlert2 (patrón Facade + carga diferida):
 * la librería solo se descarga la primera vez que se muestra un diálogo.
 */
let swalPromise;
const load = () =>
  (swalPromise ??= Promise.all([import('sweetalert2'), import('sweetalert2/dist/sweetalert2.min.css')]).then(([m]) =>
    m.default.mixin({
      buttonsStyling: false,
      customClass: {
        popup: '!rounded-[1.5rem] !font-sans',
        title: '!font-headline !text-on-surface',
        htmlContainer: '!text-on-surface-variant',
        confirmButton: 'rounded-full bg-primary-container px-6 py-3 font-semibold text-white mx-1 hover:bg-primary',
        cancelButton: 'rounded-full border-2 border-on-surface px-6 py-[10px] font-semibold text-on-surface mx-1',
        denyButton: 'rounded-full bg-error px-6 py-3 font-semibold text-white mx-1',
        input: '!rounded-2xl !border-outline-variant',
        validationMessage: '!bg-error-container !text-on-error-container',
      },
    }),
  ));

export const notify = {
  async success(title, text) {
    const s = await load();
    return s.fire({ icon: 'success', title, text, confirmButtonText: 'Listo' });
  },
  async error(err, title = 'No se pudo completar') {
    const s = await load();
    const details = err?.details?.map((d) => `<li>${escapeHtml(d.message)}</li>`).join('') ?? '';
    return s.fire({ icon: 'error', title, html: `${escapeHtml(err?.message ?? String(err))}${details ? `<ul class="mt-2 text-left text-sm">${details}</ul>` : ''}`, confirmButtonText: 'Entendido' });
  },
  async toast(title, icon = 'success') {
    const s = await load();
    return s.fire({ toast: true, position: 'top', icon, title, timer: 2200, showConfirmButton: false, timerProgressBar: true });
  },
  async confirm({ title, text, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
    const s = await load();
    const r = await s.fire({
      icon: danger ? 'warning' : 'question',
      title,
      text,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      reverseButtons: true,
      customClass: danger ? { confirmButton: 'rounded-full bg-error px-6 py-3 font-semibold text-white mx-1' } : undefined,
    });
    return r.isConfirmed;
  },
  async select({ title, options, placeholder = 'Elegí una opción', confirmText = 'Aceptar' }) {
    const s = await load();
    const r = await s.fire({
      title,
      input: 'select',
      inputOptions: options,
      inputPlaceholder: placeholder,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      inputValidator: (v) => (!v ? 'Elegí una opción' : undefined),
    });
    return r.isConfirmed ? r.value : null;
  },
  async prompt({ title, label, placeholder, input = 'text', inputValue = '', validator }) {
    const s = await load();
    const r = await s.fire({
      title,
      input,
      inputLabel: label,
      inputPlaceholder: placeholder,
      inputValue,
      showCancelButton: true,
      confirmButtonText: 'Aceptar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      inputValidator: validator,
    });
    return r.isConfirmed ? r.value : null;
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
