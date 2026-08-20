/* Preferencias locales del dispositivo (no se sincronizan con Google). */

const CLAVE = 'ge.settings.v1';

const POR_DEFECTO = {
  modo: 'demo',            // 'demo' (localStorage) | 'google' (Apps Script)
  apiUrl: '',              // URL /exec de la aplicación web de Apps Script
  idToken: '',             // ID token de Google del ingreso actual
  clientId: '',            // ID de cliente OAuth (lo publica el backend; se cachea acá)
  emailSesion: '',         // último correo con el que se ingresó
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
  return cache;
}

export function setSettings(parcial) {
  cache = { ...getSettings(), ...parcial };
  localStorage.setItem(CLAVE, JSON.stringify(cache));
  document.dispatchEvent(new CustomEvent('settings:cambio', { detail: cache }));
  return cache;
}
