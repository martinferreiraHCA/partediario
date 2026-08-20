/*
 * Cliente de la API de Google Apps Script.
 *
 * Las acciones públicas (ping, configPublica) van por GET.
 * Todo lo demás va por POST con Content-Type text/plain: así se evita el
 * preflight CORS —que Apps Script no responde— y las credenciales no viajan
 * en la URL. Ver apps-script/Codigo.gs.
 */

import { getSettings } from './settings.js';

export class ApiError extends Error {
  constructor(mensaje, opciones = {}) {
    super(mensaje);
    this.name = 'ApiError';
    this.codigo = opciones.codigo || '';
    this.causa = opciones.causa;
  }
}

function urlBase() {
  const { apiUrl } = getSettings();
  if (!apiUrl) throw new ApiError('No hay una URL de Apps Script configurada.', { codigo: 'sin_url' });
  return apiUrl.trim();
}

function credenciales() {
  const { idToken } = getSettings();
  return idToken ? { idToken } : {};
}

async function leerRespuesta(resp) {
  const texto = await resp.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    // Apps Script devuelve HTML cuando la implementación no es pública o pide login.
    throw new ApiError(
      'La respuesta no es JSON. Revisá que la aplicación web esté implementada con acceso "Cualquier usuario".',
      { codigo: 'respuesta_invalida' });
  }
  if (datos && datos.ok === false) {
    const codigo = datos.codigo || '';
    if (codigo === 'sesion_vencida' || codigo === 'sin_credenciales' || codigo === 'sin_autorizacion') {
      document.dispatchEvent(new CustomEvent('sesion:expirada', { detail: { codigo, error: datos.error } }));
    }
    throw new ApiError(datos.error || 'Error del backend.', { codigo });
  }
  return datos;
}

/** Acciones públicas (sin credenciales). */
export async function apiGet(action, params = {}) {
  const url = new URL(urlBase());
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  let resp;
  try {
    resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  } catch (e) {
    throw new ApiError('No se pudo contactar el backend de Google.', { codigo: 'sin_red', causa: e });
  }
  return leerRespuesta(resp);
}

/** Acciones autenticadas. */
export async function apiPost(action, payload = {}) {
  let resp;
  try {
    resp = await fetch(urlBase(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...credenciales(), ...payload }),
    });
  } catch (e) {
    throw new ApiError('No se pudo contactar el backend de Google.', { codigo: 'sin_red', causa: e });
  }
  return leerRespuesta(resp);
}

export function pingApi() {
  return apiGet('ping');
}

/** Datos que la pantalla de acceso necesita antes de identificarse. */
export function configPublica() {
  return apiGet('configPublica');
}
