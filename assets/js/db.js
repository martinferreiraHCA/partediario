/*
 * Capa de datos: mantiene el estado en memoria y lo persiste según el modo.
 *   modo "demo"   → localStorage del navegador (sirve para probar sin Google)
 *   modo "google" → Apps Script + Google Sheets
 */

import { apiPost } from './api.js';
import { getSettings } from './settings.js';
import { CONFIG_POR_DEFECTO, normalizarClase, normalizarInasistencia, normalizarFilaParte, parteVacio, anioActivo } from './modelo.js';
import { datosDemo } from './demo.js';

const CLAVE_LOCAL = 'ge.datos.v1';

export const estado = {
  config: structuredClone(CONFIG_POR_DEFECTO),
  horarios: [],
  inasistencias: [],
  partes: {},
  meta: { cargado: false, modo: 'demo', error: '', ultimaCarga: null, guardando: false },
};

const suscriptores = new Set();

export function suscribir(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

export function notificar(motivo = 'datos') {
  for (const fn of suscriptores) {
    try { fn(estado, motivo); } catch (e) { console.error('[suscriptor]', e); }
  }
}

/* ---------------- normalización de un paquete completo ---------------- */

function aplicarPaquete(datos) {
  const config = { ...structuredClone(CONFIG_POR_DEFECTO), ...(datos.config || {}) };
  if (!Array.isArray(config.anios) || !config.anios.length) {
    config.anios = structuredClone(CONFIG_POR_DEFECTO.anios);
  }
  if (!Array.isArray(config.turnos) || !config.turnos.length) {
    config.turnos = structuredClone(CONFIG_POR_DEFECTO.turnos);
  }
  estado.config = config;
  const anio = anioActivo(config);
  estado.horarios = (datos.horarios || []).map(c => normalizarClase(c, anio));
  estado.inasistencias = (datos.inasistencias || []).map(normalizarInasistencia);
  estado.partes = {};
  for (const [fecha, parte] of Object.entries(datos.partes || {})) {
    estado.partes[fecha] = {
      ...parteVacio(fecha),
      ...parte,
      filas: (parte.filas || []).map(f => normalizarFilaParte(f, fecha)),
    };
  }
  estado.meta.cargado = true;
  estado.meta.ultimaCarga = new Date();
}

function paqueteActual() {
  return {
    config: estado.config,
    horarios: estado.horarios,
    inasistencias: estado.inasistencias,
    partes: estado.partes,
  };
}

/* ---------------- backend local ---------------- */

function leerLocal() {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL);
    if (crudo) return JSON.parse(crudo);
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return null;
}

function escribirLocal() {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(paqueteActual()));
  } catch (e) {
    estado.meta.error = 'No se pudo guardar en el navegador (¿almacenamiento lleno?).';
    console.error(e);
  }
}

export function reiniciarDemo() {
  aplicarPaquete(datosDemo());
  escribirLocal();
  notificar('reinicio');
}

export function borrarDatosLocales() {
  localStorage.removeItem(CLAVE_LOCAL);
}

/* ---------------- carga ---------------- */

export async function cargar({ silencioso = false } = {}) {
  const { modo } = getSettings();
  estado.meta.modo = modo;
  estado.meta.error = '';
  if (modo === 'google') {
    try {
      const resp = await apiPost('estado');
      aplicarPaquete(resp.datos || resp);
      notificar('carga');
      return estado;
    } catch (e) {
      estado.meta.error = e.message || String(e);
      if (!silencioso) console.error('[cargar]', e);
      // Se conserva lo que hubiera en memoria/local para no dejar la app vacía.
      if (!estado.meta.cargado) {
        const local = leerLocal();
        aplicarPaquete(local || datosDemo());
      }
      notificar('carga-error');
      return estado;
    }
  }
  const local = leerLocal();
  aplicarPaquete(local || datosDemo());
  if (!local) escribirLocal();
  notificar('carga');
  return estado;
}

/* ---------------- escrituras ---------------- */

async function persistir(action, payload, aplicarLocal) {
  aplicarLocal();
  const { modo } = getSettings();
  if (modo !== 'google') {
    escribirLocal();
    notificar(action);
    return { ok: true, local: true };
  }
  estado.meta.guardando = true;
  notificar('guardando');
  try {
    const resp = await apiPost(action, payload);
    estado.meta.error = '';
    return resp;
  } catch (e) {
    estado.meta.error = e.message || String(e);
    throw e;
  } finally {
    estado.meta.guardando = false;
    escribirLocal();          // copia de respaldo local siempre
    notificar(action);
  }
}

export function guardarConfig(parcial) {
  return persistir('guardarConfig', { config: { ...estado.config, ...parcial } }, () => {
    estado.config = { ...estado.config, ...parcial };
  });
}

export function guardarInasistencia(datos) {
  const item = normalizarInasistencia(datos);
  return persistir('guardarInasistencia', { item }, () => {
    const i = estado.inasistencias.findIndex(x => x.id === item.id);
    if (i >= 0) estado.inasistencias[i] = item;
    else estado.inasistencias.unshift(item);
  });
}

export function eliminarInasistencia(id) {
  return persistir('eliminarInasistencia', { id }, () => {
    estado.inasistencias = estado.inasistencias.filter(x => x.id !== id);
  });
}

export function marcarEstadoInasistencia(id, nuevoEstado) {
  const item = estado.inasistencias.find(x => x.id === id);
  if (!item) return Promise.resolve();
  return guardarInasistencia({ ...item, estado: nuevoEstado });
}

export function guardarParte(fecha, parte) {
  const limpio = {
    ...parteVacio(fecha),
    ...parte,
    fecha,
    actualizado: new Date().toISOString(),
    filas: parte.filas.map(f => normalizarFilaParte(f, fecha)),
  };
  return persistir('guardarParte', { fecha, parte: limpio }, () => {
    estado.partes[fecha] = limpio;
  });
}

/** Reemplaza por completo el horario de un año (importación de planilla). */
export function reemplazarHorarioAnio(anio, clases, meta = {}) {
  const normalizadas = clases.map(c => normalizarClase({ ...c, anio }, anio));
  return persistir('reemplazarHorario', { anio, clases: normalizadas, meta }, () => {
    estado.horarios = estado.horarios.filter(c => Number(c.anio) !== Number(anio)).concat(normalizadas);
    const anios = estado.config.anios || [];
    const existente = anios.find(a => Number(a.anio) === Number(anio));
    const registro = {
      anio: Number(anio),
      estado: existente ? existente.estado : 'pendiente',
      origen: meta.origen || '',
      actualizado: new Date().toISOString(),
      clases: normalizadas.length,
    };
    estado.config.anios = existente
      ? anios.map(a => (Number(a.anio) === Number(anio) ? { ...a, ...registro } : a))
      : anios.concat(registro).sort((a, b) => a.anio - b.anio);
  });
}

export function guardarClase(clase) {
  const item = normalizarClase(clase, anioActivo(estado.config));
  return persistir('guardarClase', { item }, () => {
    const i = estado.horarios.findIndex(c => c.id === item.id);
    if (i >= 0) estado.horarios[i] = item;
    else estado.horarios.push(item);
  });
}

export function eliminarClase(id) {
  return persistir('eliminarClase', { id }, () => {
    estado.horarios = estado.horarios.filter(c => c.id !== id);
  });
}

export function definirAnioActivo(anio) {
  const anios = (estado.config.anios || []).map(a => ({
    ...a,
    estado: Number(a.anio) === Number(anio)
      ? 'activo'
      : (Number(a.anio) < Number(anio) ? 'archivado' : (a.estado === 'activo' ? 'pendiente' : a.estado)),
  }));
  return guardarConfig({ anios, anioActivo: Number(anio) });
}

export function agregarAnio(anio) {
  const anios = estado.config.anios || [];
  if (anios.some(a => Number(a.anio) === Number(anio))) return Promise.resolve();
  return guardarConfig({
    anios: anios.concat({ anio: Number(anio), estado: 'pendiente', origen: '', actualizado: '', clases: 0 })
      .sort((a, b) => a.anio - b.anio),
  });
}

export function eliminarAnio(anio) {
  return persistir('eliminarAnio', { anio }, () => {
    estado.config.anios = (estado.config.anios || []).filter(a => Number(a.anio) !== Number(anio));
    estado.horarios = estado.horarios.filter(c => Number(c.anio) !== Number(anio));
  });
}

/* ---------------- sincronización periódica ---------------- */

let temporizador = null;

export function iniciarAutoRefresh() {
  detenerAutoRefresh();
  const { modo, autoRefresh } = getSettings();
  if (modo !== 'google' || !autoRefresh) return;
  temporizador = setInterval(() => {
    if (document.hidden) return;
    cargar({ silencioso: true });
  }, Math.max(20, Number(autoRefresh)) * 1000);
}

export function detenerAutoRefresh() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

document.addEventListener('settings:cambio', () => {
  estado.meta.modo = getSettings().modo;
  iniciarAutoRefresh();
});

