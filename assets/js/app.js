/* Punto de entrada: enrutador, chrome de la aplicación y arranque. */

import { $, $$, el, clear, hoyISO } from './utils.js';
import { estado, cargar, suscribir, iniciarAutoRefresh } from './db.js';
import { getSettings, setSettings, recordarInstitucion, urlDesdeInvitacion, institucionActiva } from './settings.js';
import { aviso, avisoError, cerrarModal } from './ui.js';
import { sesion, resolverSesion, puede, ETIQUETA_ROL } from './sesion.js';
import { resumenDelDia } from './logica.js';

import * as vistaInicio from './views/inicio.js';
import * as vistaInasistencias from './views/inasistencias.js';
import * as vistaHorarios from './views/horarios.js';
import * as vistaCoberturas from './views/coberturas.js';
import * as vistaParte from './views/parte.js';
import * as vistaInstitucional from './views/institucional.js';
import * as vistaConfiguracion from './views/configuracion.js';
import * as vistaAcceso from './views/acceso.js';

const PERMISO_VISTA = {
  inicio: null,
  inasistencias: 'verInasistencias',
  horarios: 'verHorarios',
  coberturas: 'verParte',
  parte: 'verParte',
  institucional: 'verHorarios',
  configuracion: null,
};

const VISTAS = {
  inicio: vistaInicio,
  inasistencias: vistaInasistencias,
  horarios: vistaHorarios,
  coberturas: vistaCoberturas,
  parte: vistaParte,
  institucional: vistaInstitucional,
  configuracion: vistaConfiguracion,
};

let rutaActual = { vista: 'inicio', params: {} };
let redibujando = false;

/* ---------------- contexto que reciben las vistas ---------------- */

const ctx = {
  get estado() { return estado; },
  ir(vista, params = {}) {
    const qs = new URLSearchParams(params).toString();
    location.hash = `#/${vista}${qs ? '?' + qs : ''}`;
  },
  params() { return rutaActual.params; },
  setParam(clave, valor) {
    const params = { ...rutaActual.params, [clave]: valor };
    if (valor === '' || valor === null || valor === undefined) delete params[clave];
    rutaActual.params = params;
    const qs = new URLSearchParams(params).toString();
    history.replaceState(null, '', `#/${rutaActual.vista}${qs ? '?' + qs : ''}`);
  },
  setTitulo(titulo, subtitulo = '') {
    $('#view-title').textContent = titulo;
    $('#view-sub').textContent = subtitulo;
    document.title = `${titulo} · Gestión Educativa`;
  },
  setAcciones(nodos = []) {
    clear($('#topbar-actions')).append(...nodos.filter(Boolean));
  },
  refrescar() { dibujar(); },
  async recargar() {
    await cargar();
    dibujar();
  },
};

/* ---------------- enrutador ---------------- */

/** #/demo activa el modo de prueba; #/salir-demo lo termina. */
async function atenderRutasEspeciales() {
  const bruto = location.hash.replace(/^#\/?/, '');
  if (bruto.startsWith('demo')) {
    setSettings({ modo: 'demo' });
    await cargar();
    history.replaceState(null, '', location.pathname + '#/inicio');
    return true;
  }
  if (bruto.startsWith('salir-demo')) {
    setSettings({ modo: 'google' });
    await cargar();
    history.replaceState(null, '', location.pathname + '#/inicio');
    return true;
  }
  return false;
}

function leerRuta() {
  const bruto = location.hash.replace(/^#\/?/, '') || 'inicio';
  const [nombre, consulta] = bruto.split('?');
  const vista = VISTAS[nombre] ? nombre : 'inicio';
  const params = Object.fromEntries(new URLSearchParams(consulta || ''));
  return { vista, params };
}

async function dibujar() {
  if (redibujando) return;
  redibujando = true;
  try {
    const host = $('#view');
    clear(host);
    ctx.setAcciones([]);
    marcarNav(rutaActual.vista);

    if (necesitaAcceso()) {
      ctx.setTitulo('Acceso', 'Ingresá con tu cuenta de Google');
      vistaAcceso.render(host, { alEntrar: () => { actualizarChrome(); dibujar(); } });
      return;
    }

    const permiso = PERMISO_VISTA[rutaActual.vista];
    if (permiso && !puede(permiso)) {
      host.append(el('div', { class: 'card card-pad stack' }, [
        el('h2', {}, 'Sin permisos'),
        el('p', { class: 'muted' },
          `Tu rol (${ETIQUETA_ROL[sesion.rol] || sesion.rol}) no tiene acceso a esta sección. Consultá con el administrador del sistema.`),
      ]));
      return;
    }

    const modulo = VISTAS[rutaActual.vista];
    await modulo.render(host, ctx);
  } catch (e) {
    console.error('[vista]', e);
    clear($('#view')).append(
      el('div', { class: 'card card-pad' }, [
        el('h2', { text: 'Ocurrió un error al dibujar la pantalla' }),
        el('p', { class: 'muted small', text: String(e && e.message || e) }),
      ]));
  } finally {
    redibujando = false;
  }
}

function necesitaAcceso() {
  return getSettings().modo === 'google' && !sesion.autenticado && rutaActual.vista !== 'configuracion';
}

function marcarNav(vista) {
  const sinAcceso = necesitaAcceso() || (getSettings().modo === 'google' && !sesion.autenticado);
  for (const a of $$('#nav .nav-item')) {
    a.classList.toggle('active', a.dataset.view === vista);
    const permiso = PERMISO_VISTA[a.dataset.view];
    if (sinAcceso) {
      // Sin identificarse sólo se ofrece Configuración (conexión e instalación).
      a.hidden = a.dataset.view !== 'configuracion';
      continue;
    }
    a.hidden = !!(permiso && sesion.autenticado && !puede(permiso));
  }
}

async function alCambiarHash() {
  await atenderRutasEspeciales();
  rutaActual = leerRuta();
  cerrarModal();
  cerrarMenu();
  await dibujar();
  $('#view').focus({ preventScroll: true });
}

/* ---------------- chrome ---------------- */

function actualizarChrome() {
  const { modo, apiUrl } = getSettings();
  const conn = $('#conn-state');
  const etiqueta = conn.querySelector('.conn-label');
  conn.classList.remove('ok', 'demo', 'error');
  if (modo === 'google' && !apiUrl) {
    conn.classList.add('demo');
    etiqueta.textContent = 'Sin institución conectada';
    conn.title = 'Conectate con el enlace de invitación de tu institución.';
  } else if (estado.meta.error) {
    conn.classList.add('error');
    etiqueta.textContent = 'Sin conexión con Google';
    conn.title = estado.meta.error;
  } else if (modo === 'google' && apiUrl) {
    conn.classList.add('ok');
    etiqueta.textContent = 'Google Sheets';
    conn.title = `Conectado a ${apiUrl}`;
  } else {
    conn.classList.add('demo');
    etiqueta.textContent = 'Modo demostración';
    conn.title = 'Los datos se guardan sólo en este navegador.';
  }

  $('#demo-banner').hidden = getSettings().modo !== 'demo';

  const inst = institucionActiva();
  $('#brand-liceo').textContent = modo === 'demo'
    ? `${estado.config.liceo || 'Liceo'} · modo de prueba`
    : (sesion.autenticado
        ? `${estado.config.liceo || (inst && inst.nombre) || 'Institución'} · ${ETIQUETA_ROL[sesion.rol] || sesion.rol}`
        : ((inst && inst.nombre) || 'Sin institución conectada'));

  const resumen = resumenDelDia(estado, hoyISO());
  const pendientes = estado.inasistencias.filter(i => i.estado === 'nueva').length;
  const badge = $('#badge-nuevas');
  badge.textContent = String(pendientes);
  badge.hidden = pendientes === 0;
  badge.title = `${pendientes} aviso(s) sin revisar · hoy: ${resumen.docentes} docente(s)`;
}

function abrirMenu() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; }
function cerrarMenu() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

/* ---------------- arranque ---------------- */

async function iniciar() {
  $('#btn-menu').addEventListener('click', abrirMenu);
  $('#scrim').addEventListener('click', cerrarMenu);
  $('#btn-sync').addEventListener('click', async () => {
    const btn = $('#btn-sync');
    btn.disabled = true;
    btn.textContent = '↻ Actualizando…';
    try {
      await cargar();
      aviso('Datos actualizados.', 'ok', 2200);
      await dibujar();
    } catch (e) {
      avisoError(e.message || 'No se pudieron actualizar los datos.');
    } finally {
      btn.disabled = false;
      btn.textContent = '↻ Actualizar';
    }
  });

  window.addEventListener('hashchange', alCambiarHash);
  $('#btn-salir-demo').addEventListener('click', async () => {
    setSettings({ modo: 'google' });
    await cargar();
    actualizarChrome();
    location.hash = '#/inicio';
    dibujar();
  });
  suscribir(() => actualizarChrome());
  document.addEventListener('settings:cambio', actualizarChrome);
  document.addEventListener('sesion:cambio', () => { actualizarChrome(); marcarNav(rutaActual.vista); });
  document.addEventListener('sesion:expirada', async (ev) => {
    if (ev.detail && ev.detail.codigo === 'sesion_vencida') {
      avisoError('Tu sesión de Google venció. Volvé a ingresar.');
    }
    try { await resolverSesion(); } catch { /* la pantalla de acceso se encarga */ }
    dibujar();
  });

  // Enlace de invitación: #/acceso?inst=<url> conecta este navegador con la
  // institución sin mostrar ninguna configuración.
  const invitacion = urlDesdeInvitacion(location.hash);
  if (invitacion) {
    recordarInstitucion('', invitacion);
    history.replaceState(null, '', location.pathname + '#/inicio');
  }

  await atenderRutasEspeciales();
  rutaActual = leerRuta();
  if (!location.hash) location.hash = '#/inicio';

  try {
    await resolverSesion();
  } catch (e) {
    console.warn('[sesion]', e);
  }
  await cargar();
  if (estado.meta.error && getSettings().apiUrl) {
    avisoError(`No se pudo leer la información de la institución: ${estado.meta.error}`);
  }
  actualizarChrome();
  iniciarAutoRefresh();
  await dibujar();
}

iniciar();
