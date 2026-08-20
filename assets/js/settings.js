/* Preferencias locales del dispositivo (no se sincronizan con Google). */

const CLAVE = 'ge.settings.v1';

/*
 * Datos del liceo. Vienen configurados de fábrica para que nadie tenga que
 * pegar direcciones a mano: alcanza con abrir la aplicación e ingresar con la
 * cuenta de Google. Si algún día se vuelve a implementar el backend o se cambia
 * el proyecto de Google Cloud, se actualizan acá.
 */
const BACKEND = 'https://script.google.com/macros/s/AKfycbzjW6PyzjQxixVbLnZ6fhwHdlpNxjmq5ag-oa8d-3LR_-QFxm4dfx6dvsQNRLNMBxVt/exec';
const CLIENT_ID = '887904782640-u0qiu82chf26tg1n5q5skrour59qnfu7.apps.googleusercontent.com';

const POR_DEFECTO = {
  modo: 'google',          // 'google' (Apps Script + Drive) | 'demo' (datos de ejemplo locales)
  apiUrl: BACKEND,         // URL /exec de la aplicación web de Apps Script
  idToken: '',             // ID token de Google del ingreso actual
  clientId: CLIENT_ID,     // ID de cliente OAuth; el backend puede publicar otro
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
