/*
 * Cliente de la API de Google Apps Script.
 *
 * El backend es una aplicación web publicada desde Apps Script (doGet/doPost).
 * Las lecturas van por GET con parámetros; las escrituras por POST con
 * Content-Type text/plain para evitar el preflight CORS, que Apps Script no
 * responde. Ver apps-script/Codigo.gs.
 */

import { getSettings } from './settings.js';

export class ApiError extends Error {
  constructor(mensaje, causa) { super(mensaje); this.name = 'ApiError'; this.causa = causa; }
}

function urlBase() {
  const { apiUrl } = getSettings();
  if (!apiUrl) throw new ApiError('No hay una URL de Apps Script configurada.');
  return apiUrl.trim();
}

async function leerRespuesta(resp) {
  const texto = await resp.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    // Apps Script devuelve HTML cuando la implementación no es pública o pide login.
    throw new ApiError(
      'La respuesta no es JSON. Revisá que la aplicación web esté implementada con acceso "Cualquier usuario".'
    );
  }
  if (datos && datos.ok === false) throw new ApiError(datos.error || 'Error del backend.');
  return datos;
}

export async function apiGet(action, params = {}) {
  const { apiToken } = getSettings();
  const url = new URL(urlBase());
  url.searchParams.set('action', action);
  if (apiToken) url.searchParams.set('token', apiToken);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  let resp;
  try {
    resp = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  } catch (e) {
    throw new ApiError('No se pudo contactar el backend de Google.', e);
  }
  return leerRespuesta(resp);
}

export async function apiPost(action, payload = {}) {
  const { apiToken } = getSettings();
  let resp;
  try {
    resp = await fetch(urlBase(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: apiToken, ...payload }),
    });
  } catch (e) {
    throw new ApiError('No se pudo contactar el backend de Google.', e);
  }
  return leerRespuesta(resp);
}

export function pingApi() {
  return apiGet('ping');
}
