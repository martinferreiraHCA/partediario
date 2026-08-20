/*
 * Sesión y permisos.
 *
 * Las cuentas NO viven en la aplicación: están definidas en la hoja «Usuarios»
 * del archivo de configuración, dentro de la carpeta de Google Drive del liceo.
 * Cada persona puede tener varios correos asociados (institucional, personal…).
 *
 * Formas de entrar:
 * Se entra únicamente con la cuenta de Google: el navegador obtiene un ID token
 * firmado por Google, el backend lo verifica y busca el correo entre los
 * usuarios autorizados. Sin correo registrado no se entra.
 *
 * En modo demostración (sin backend, datos de ejemplo en este navegador) se
 * trabaja con un rol elegido localmente.
 */

import { apiPost, configPublica } from './api.js';
import { getSettings, setSettings } from './settings.js';
import { tokenVigente, datosDelToken, olvidarCuenta, pedirCredencial } from './google.js';

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
  metodo: '',          // 'google' | 'codigo' | ''
  email: '',
  emails: [],
  nombre: 'Modo demostración',
  foto: '',
  rol: 'admin',
  permisos: PERMISOS_POR_ROL.admin.slice(),
  instalado: true,
  carpetaUrl: '',
  clientId: '',
  motivo: '',          // 'sin_autorizacion' | 'sesion_vencida' | 'sin_credenciales'
};

function aplicar(datos) {
  sesion.autenticado = !!datos.autenticado;
  sesion.modo = datos.modo || sesion.modo;
  sesion.metodo = datos.metodo || '';
  sesion.email = datos.email || '';
  sesion.emails = datos.emails || (datos.email ? [datos.email] : []);
  sesion.nombre = datos.nombre || datos.email || '';
  sesion.foto = datos.foto || '';
  sesion.rol = datos.rol || 'lectura';
  sesion.permisos = datos.permisos || PERMISOS_POR_ROL[sesion.rol] || [];
  sesion.instalado = datos.instalado !== false;
  sesion.carpetaUrl = datos.carpetaUrl || '';
  sesion.motivo = datos.motivo || '';
  if (datos.clientId !== undefined) sesion.clientId = datos.clientId || '';
  document.dispatchEvent(new CustomEvent('sesion:cambio', { detail: sesion }));
  return sesion;
}

export function modoDemo() {
  const rol = getSettings().rol || 'admin';
  return aplicar({
    autenticado: true, modo: 'demo', metodo: '', email: '', nombre: 'Modo demostración',
    rol, permisos: PERMISOS_POR_ROL[rol] || PERMISOS_POR_ROL.admin, instalado: true, motivo: '',
  });
}

/** Client ID de Google publicado por el backend (necesario para dibujar el botón). */
export async function obtenerClientId() {
  const guardado = getSettings().clientId;
  try {
    const resp = await configPublica();
    // Antes de la configuración inicial el backend todavía no publica el ID de
    // cliente: en ese caso vale el que trae la aplicación de fábrica.
    const clientId = resp.clientId || guardado;
    if (clientId !== guardado) setSettings({ clientId });
    sesion.clientId = clientId;
    sesion.instalado = resp.instalado !== false;
    return clientId;
  } catch {
    sesion.clientId = guardado;
    return guardado;
  }
}

/** Consulta al backend quién es la persona identificada con las credenciales guardadas. */
export async function resolverSesion() {
  const { modo, idToken } = getSettings();
  sesion.modo = modo;
  if (modo !== 'google') return modoDemo();

  if (idToken && !tokenVigente(idToken)) {
    setSettings({ idToken: '' });
    return aplicar({ autenticado: false, modo: 'google', rol: 'lectura', permisos: [], motivo: 'sesion_vencida' });
  }
  if (!idToken) {
    return aplicar({ autenticado: false, modo: 'google', rol: 'lectura', permisos: [], motivo: 'sin_credenciales' });
  }

  const resp = await apiPost('sesion');
  return aplicar({ ...resp, modo: 'google' });
}

/** Entra con el ID token que devolvió Google. */
export async function iniciarSesionGoogle(credencial) {
  if (!credencial) throw new Error('Google no devolvió una credencial.');
  const datos = datosDelToken(credencial);
  setSettings({ idToken: credencial, emailSesion: datos.email });
  const estado = await resolverSesion();
  if (!estado.autenticado) {
    // El token es válido pero el correo no figura entre los usuarios autorizados.
    sesion.email = sesion.email || datos.email;
    sesion.nombre = sesion.nombre || datos.nombre;
  }
  sesion.foto = sesion.foto || datos.foto;
  return estado;
}

export async function renovarSesionGoogle() {
  await pedirCredencial();
}

export async function cerrarSesion() {
  await olvidarCuenta();
  setSettings({ idToken: '', emailSesion: '' });
  return aplicar({
    autenticado: false, modo: getSettings().modo, rol: 'lectura', permisos: [],
    nombre: '', email: '', foto: '', motivo: 'sin_credenciales',
  });
}

export function puede(permiso) {
  return sesion.permisos.includes(permiso);
}

export function esAdministrador() { return puede('administrar'); }
