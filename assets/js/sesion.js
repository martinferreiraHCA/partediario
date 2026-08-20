/*
 * Sesión y permisos.
 *
 * Las cuentas NO viven en la aplicación: están definidas en la hoja "Usuarios"
 * del archivo de configuración que vive dentro de la carpeta de Google Drive
 * del liceo. Cada persona tiene un código de acceso; la aplicación lo envía en
 * cada pedido y el backend responde quién es y qué puede hacer.
 *
 * En modo demostración (sin backend) se trabaja con un rol elegido localmente.
 */

import { apiGet } from './api.js';
import { getSettings, setSettings } from './settings.js';

export const PERMISOS_POR_ROL = {
  admin: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'editarHorarios',
    'verParte', 'editarParte', 'exportar', 'administrar'],
  direccion: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'verParte',
    'editarParte', 'exportar', 'administrar'],
  adscripcion: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'verParte',
    'editarParte', 'exportar'],
  administrativo: ['verInasistencias', 'verHorarios', 'verParte', 'exportar'],
  psicologia: ['verInasistencias', 'verHorarios', 'verParte'],
  docente: ['verHorarios'],
  lectura: ['verInasistencias', 'verHorarios', 'verParte'],
};

export const ETIQUETA_ROL = {
  admin: 'Administrador',
  direccion: 'Dirección',
  adscripcion: 'Adscripción',
  administrativo: 'Administrativo',
  psicologia: 'Psicología / Equipo multidisciplinario',
  docente: 'Docente',
  lectura: 'Sólo lectura',
};

export const sesion = {
  autenticado: false,
  modo: 'demo',
  email: '',
  nombre: 'Modo demostración',
  rol: 'admin',
  permisos: PERMISOS_POR_ROL.admin.slice(),
  instalado: true,
  carpetaUrl: '',
};

function aplicar(datos) {
  sesion.autenticado = !!datos.autenticado;
  sesion.email = datos.email || '';
  sesion.nombre = datos.nombre || datos.email || '';
  sesion.rol = datos.rol || 'lectura';
  sesion.permisos = datos.permisos || PERMISOS_POR_ROL[sesion.rol] || [];
  sesion.instalado = datos.instalado !== false;
  sesion.carpetaUrl = datos.carpetaUrl || '';
  document.dispatchEvent(new CustomEvent('sesion:cambio', { detail: sesion }));
  return sesion;
}

export function modoDemo() {
  const rol = getSettings().rol || 'admin';
  return aplicar({
    autenticado: true, modo: 'demo', email: '', nombre: 'Modo demostración',
    rol, permisos: PERMISOS_POR_ROL[rol] || PERMISOS_POR_ROL.admin, instalado: true,
  });
}

/** Consulta al backend quién es el portador del código de acceso guardado. */
export async function resolverSesion() {
  const { modo } = getSettings();
  sesion.modo = modo;
  if (modo !== 'google') return modoDemo();
  const resp = await apiGet('sesion');
  return aplicar({ ...resp, modo: 'google' });
}

export async function iniciarSesion(codigo) {
  setSettings({ apiToken: String(codigo || '').trim() });
  return resolverSesion();
}

export function cerrarSesion() {
  setSettings({ apiToken: '' });
  return aplicar({ autenticado: false, rol: 'lectura', permisos: [], nombre: '', email: '' });
}

export function puede(permiso) {
  return sesion.permisos.includes(permiso);
}

export function puedeEditarInasistencias() { return puede('editarInasistencias'); }
export function esAdministrador() { return puede('administrar'); }
