/*
 * Fábrica de instituciones.
 *
 * Crea el backend de una institución de manera totalmente automática, usando
 * la API de Apps Script de Google desde el navegador: crea el proyecto en la
 * cuenta elegida, sube el código del sistema, lo publica como aplicación web
 * y devuelve su URL. Nadie copia ni pega código.
 *
 * Requisito de Google: la cuenta debe tener activada la "API de Google Apps
 * Script" en script.google.com/home/usersettings (un interruptor, una vez).
 * Si está apagada, la API responde 403 y la fábrica lo informa con claridad.
 */

const API = 'https://script.googleapis.com/v1';

export const SCOPES_FABRICA = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
];

export const URL_ACTIVAR_API = 'https://script.google.com/home/usersettings';

export class ErrorFabrica extends Error {
  constructor(mensaje, { codigo = '', causa = null } = {}) {
    super(mensaje);
    this.name = 'ErrorFabrica';
    this.codigo = codigo;
    this.causa = causa;
  }
}

async function llamar(token, metodo, ruta, cuerpo = null) {
  let resp;
  try {
    resp = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    throw new ErrorFabrica('No se pudo contactar a Google.', { codigo: 'sin_red', causa: e });
  }
  let datos = null;
  try { datos = await resp.json(); } catch { datos = null; }
  if (!resp.ok) {
    const mensaje = (datos && datos.error && datos.error.message) || `Google respondió ${resp.status}.`;
    if (resp.status === 403 && /Apps Script API/i.test(mensaje)) {
      throw new ErrorFabrica(
        'La cuenta todavía no tiene activada la API de Google Apps Script.',
        { codigo: 'api_desactivada' });
    }
    if (resp.status === 401) {
      throw new ErrorFabrica('El permiso de Google venció. Volvé a autorizar.', { codigo: 'token_vencido' });
    }
    throw new ErrorFabrica(mensaje, { codigo: `http_${resp.status}` });
  }
  return datos;
}

/** Descarga el código del sistema desde este mismo sitio. */
async function obtenerCodigo() {
  const [codigo, manifiesto] = await Promise.all([
    fetch('apps-script/Codigo.gs').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
    fetch('apps-script/appsscript.json').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }),
  ]).catch(e => {
    throw new ErrorFabrica('No se pudo leer el código del sistema desde el sitio.', { causa: e });
  });
  return { codigo, manifiesto };
}

/**
 * Crea y publica el backend completo. `alAvanzar(etapa)` informa el progreso:
 * 'codigo' → 'proyecto' → 'subida' → 'version' → 'publicacion'.
 * Devuelve { scriptId, execUrl, editorUrl }.
 */
export async function crearBackend({ token, nombre, alAvanzar = () => {} }) {
  alAvanzar('codigo');
  const { codigo, manifiesto } = await obtenerCodigo();

  alAvanzar('proyecto');
  const proyecto = await llamar(token, 'POST', '/projects', {
    title: `Gestión Educativa – ${nombre}`,
  });
  const scriptId = proyecto.scriptId;
  if (!scriptId) throw new ErrorFabrica('Google no devolvió el identificador del proyecto.');

  alAvanzar('subida');
  await llamar(token, 'PUT', `/projects/${scriptId}/content`, {
    files: [
      { name: 'Codigo', type: 'SERVER_JS', source: codigo },
      { name: 'appsscript', type: 'JSON', source: manifiesto },
    ],
  });

  alAvanzar('version');
  const version = await llamar(token, 'POST', `/projects/${scriptId}/versions`, {
    description: 'Creación automática desde el sitio',
  });

  alAvanzar('publicacion');
  const implementacion = await llamar(token, 'POST', `/projects/${scriptId}/deployments`, {
    versionNumber: version.versionNumber,
    description: 'Aplicación web',
  });

  let execUrl = urlDeImplementacion(implementacion);
  if (!execUrl && implementacion.deploymentId) {
    const detalle = await llamar(token, 'GET', `/projects/${scriptId}/deployments/${implementacion.deploymentId}`);
    execUrl = urlDeImplementacion(detalle);
  }
  if (!execUrl && implementacion.deploymentId) {
    // Última red de seguridad: la forma estándar de las URL de aplicación web.
    execUrl = `https://script.google.com/macros/s/${implementacion.deploymentId}/exec`;
  }
  if (!execUrl) throw new ErrorFabrica('El proyecto se creó pero Google no informó la URL de la aplicación web.');

  return {
    scriptId,
    execUrl,
    editorUrl: `https://script.google.com/d/${scriptId}/edit`,
  };
}

function urlDeImplementacion(dep) {
  const puntos = (dep && dep.entryPoints) || [];
  for (const p of puntos) {
    if (p.webApp && p.webApp.url) return p.webApp.url;
  }
  return '';
}

/**
 * Espera a que el dueño autorice la aplicación web (la primera visita a la
 * URL /exec muestra la pantalla de permisos de Google). Consulta action=ping
 * hasta recibir JSON válido o agotar el tiempo.
 */
export async function esperarAutorizacion(execUrl, { intentos = 60, intervalo = 3000, alIntentar = () => {} } = {}) {
  for (let i = 0; i < intentos; i++) {
    alIntentar(i + 1);
    try {
      const resp = await fetch(`${execUrl}?action=ping`, { redirect: 'follow' });
      const texto = await resp.text();
      const datos = JSON.parse(texto);
      if (datos && datos.ok) return datos;
    } catch { /* todavía sin autorizar */ }
    await new Promise(r => setTimeout(r, intervalo));
  }
  throw new ErrorFabrica('La autorización no se completó a tiempo. Podés reintentar cuando quieras.', { codigo: 'sin_autorizar' });
}
