/* Preferencias locales del dispositivo (no se sincronizan con Google). */

const CLAVE = 'ge.settings.v1';

/*
 * ID de cliente OAuth del sitio. Es único para toda la plataforma porque
 * pertenece al origen (github.io), no a una institución: cada backend lo usa
 * sólo para verificar los ingresos con Google. Los datos de cada institución
 * viven en el Drive de quien la administra, nunca acá.
 */
export const CLIENT_ID_SITIO = '887904782640-u0qiu82chf26tg1n5q5skrour59qnfu7.apps.googleusercontent.com';

/*
 * Superadministradores del sitio: las únicas cuentas que pueden usar el
 * asistente de creación de instituciones. No les da acceso a los datos de
 * ninguna institución: eso lo decide cada institución en su hoja «Usuarios».
 */
export const SUPER_ADMINS = [
  { nombre: 'Martín Ferreira', emails: ['martinfp642@gmail.com', 'martinferreira@hca.edu.uy'] },
  { nombre: 'Florencia Austria', emails: ['florenciaaustria03@gmail.com'] },
];

export function esSuperAdmin(email) {
  const buscado = String(email || '').trim().toLowerCase();
  return !!buscado && SUPER_ADMINS.some(sa => sa.emails.includes(buscado));
}

const POR_DEFECTO = {
  modo: 'google',          // 'google' (institución conectada) | 'demo' (datos de ejemplo locales)
  apiUrl: '',              // URL /exec de la institución activa
  idToken: '',             // ID token de Google del ingreso actual
  clientId: CLIENT_ID_SITIO,
  emailSesion: '',         // último correo con el que se ingresó
  instituciones: [],       // [{ nombre, url }] conocidas por este navegador
  formUrl: '',             // URL del Google Form de aviso de inasistencia
  hojaUrl: '',             // URL de la Google Sheet (para "abrir en Sheets")
  autoRefresh: 120,        // segundos; 0 = desactivado
  rol: 'admin',            // sólo se usa en modo demostración (ver sesion.js)
  ultimoTurno: '',
};

let cache = null;

export function getSettings() {
  if (cache) return cache;
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { guardado = {}; }
  cache = { ...POR_DEFECTO, ...guardado };
  if (!cache.clientId) cache.clientId = CLIENT_ID_SITIO;
  return cache;
}

export function setSettings(parcial) {
  cache = { ...getSettings(), ...parcial };
  localStorage.setItem(CLAVE, JSON.stringify(cache));
  document.dispatchEvent(new CustomEvent('settings:cambio', { detail: cache }));
  return cache;
}

/* ---------------- instituciones conocidas por este navegador ---------------- */

export function institucionesConocidas() {
  return getSettings().instituciones || [];
}

export function institucionActiva() {
  const { apiUrl } = getSettings();
  if (!apiUrl) return null;
  return institucionesConocidas().find(i => i.url === apiUrl) || { nombre: '', url: apiUrl };
}

/** Registra (o actualiza el nombre de) una institución y la deja activa. */
export function recordarInstitucion(nombre, url) {
  const limpia = String(url || '').trim();
  if (!limpia) return;
  const lista = institucionesConocidas().filter(i => i.url !== limpia);
  lista.unshift({ nombre: String(nombre || '').trim() || 'Institución', url: limpia });
  setSettings({ instituciones: lista.slice(0, 12), apiUrl: limpia, modo: 'google' });
}

export function olvidarInstitucion(url) {
  const lista = institucionesConocidas().filter(i => i.url !== url);
  const ajustes = { instituciones: lista };
  if (getSettings().apiUrl === url) {
    ajustes.apiUrl = lista.length ? lista[0].url : '';
    ajustes.idToken = '';
  }
  setSettings(ajustes);
}

/**
 * Enlace de invitación de la institución activa: quien lo abre queda
 * conectado a esa institución sin ver ninguna configuración.
 */
export function enlaceInvitacion() {
  const { apiUrl } = getSettings();
  if (!apiUrl) return '';
  const url = new URL(location.href.split('#')[0]);
  url.hash = `#/acceso?inst=${encodeURIComponent(apiUrl)}`;
  return url.toString();
}

/** Interpreta un enlace de invitación pegado a mano y devuelve la URL /exec. */
export function urlDesdeInvitacion(texto) {
  const s = String(texto || '').trim();
  if (!s) return '';
  if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(s)) return s.split('?')[0];
  const m = s.match(/[?&]inst=([^&]+)/);
  if (m) {
    try {
      const decodificada = decodeURIComponent(m[1]);
      if (/^https:\/\/script\.google\.com\/macros\//.test(decodificada)) return decodificada.split('?')[0];
    } catch { /* enlace ilegible */ }
  }
  return '';
}
