/*
 * Pantalla de acceso.
 *
 * Tres caminos, sin mostrar configuración técnica:
 *   · Ingresar con Google en la institución ya conectada en este navegador.
 *   · Unirse a una institución con su enlace de invitación.
 *   · Crear una institución nueva: un asistente guía a quien la va a dirigir
 *     para que el backend y la carpeta queden en SU Google Drive. La soberanía
 *     de los datos es de esa persona, no de quien mantiene este sitio.
 */

import { el, clear, esc } from '../utils.js';
import { avisoError, avisoOk } from '../ui.js';
import {
  getSettings, setSettings, institucionesConocidas, institucionActiva,
  recordarInstitucion, olvidarInstitucion, urlDesdeInvitacion,
  CLIENT_ID_SITIO, SUPER_ADMINS, esSuperAdmin,
} from '../settings.js';
import { iniciarSesionGoogle, obtenerClientId, sesion } from '../sesion.js';
import { prepararIngresoGoogle, datosDelToken, pedirTokenAcceso } from '../google.js';
import { crearBackend, esperarAutorizacion, SCOPES_FABRICA, URL_ACTIVAR_API, ErrorFabrica } from '../fabrica.js';
import { apiGet, apiPost } from '../api.js';
import { cargar } from '../db.js';

export function render(host, { alEntrar }) {
  const contenedor = el('div', { style: 'max-width:560px;margin:5vh auto' });
  host.append(contenedor);

  const activa = institucionActiva();
  if (activa) pantallaIngreso(contenedor, activa, alEntrar);
  else pantallaElegir(contenedor, alEntrar);
}

/* ---------------- ingreso a la institución activa ---------------- */

function pantallaIngreso(contenedor, institucion, alEntrar) {
  clear(contenedor);
  const zonaGoogle = el('div', { style: 'min-height:44px;display:flex;justify-content:center' });
  const mensaje = el('div', {});
  const nombreInstitucion = el('strong', {}, institucion.nombre || 'conectada en este navegador');

  clear(contenedor).append(el('div', { class: 'card card-pad stack' }, [
    el('h2', {}, 'Ingresar al sistema'),
    el('p', { class: 'small muted' }, ['Institución: ', nombreInstitucion, '.']),
    mensaje,
    zonaGoogle,
    el('p', { class: 'hint', style: 'text-align:center' },
      'Sólo pueden entrar las cuentas de Google registradas por la institución. Si la tuya no funciona, pedile a quien la administra que la agregue.'),
    el('div', { class: 'sep' }),
    el('div', { class: 'row', style: 'justify-content:center' },
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => pantallaElegir(contenedor, alEntrar),
      }, 'Cambiar de institución')),
  ]));

  const pintarMensaje = () => {
    clear(mensaje);
    if (sesion.motivo === 'sesion_vencida') {
      mensaje.append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
        'Tu sesión venció. Volvé a ingresar.'));
    } else if (sesion.motivo === 'sin_autorizacion') {
      mensaje.append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
        `La cuenta ${sesion.email || ''} no está registrada en esta institución.`));
    }
  };
  pintarMensaje();

  (async () => {
    clear(zonaGoogle).append(el('span', { class: 'muted small' }, 'Preparando el ingreso…'));
    const clientId = (await obtenerClientId()) || CLIENT_ID_SITIO;
    // El backend de la institución ya contó su nombre real: se refresca el rótulo.
    const actual = institucionActiva();
    if (actual && actual.nombre) nombreInstitucion.textContent = actual.nombre;
    try {
      await prepararIngresoGoogle({
        clientId,
        contenedor: zonaGoogle,
        alRecibirCredencial: async (credencial) => {
          try {
            await iniciarSesionGoogle(credencial);
            if (!sesion.autenticado) { pintarMensaje(); avisoError('Esa cuenta no está registrada en la institución.'); return; }
            if (sesion.nombre) recordarInstitucion(institucionNombre(), getSettings().apiUrl);
            await cargar();
            avisoOk(`Bienvenido/a ${sesion.nombre || ''}`.trim());
            alEntrar();
          } catch (e) {
            avisoError(e.message || 'No se pudo ingresar.');
          }
        },
      });
    } catch (e) {
      clear(zonaGoogle).append(el('span', { class: 'chip warn' }, e.message || 'No se pudo preparar el ingreso con Google.'));
    }
  })();

  function institucionNombre() {
    return sesion.carpetaUrl && sesion.nombre ? (institucion.nombre || 'Institución') : institucion.nombre;
  }
}

/* ---------------- elegir o sumar institución ---------------- */

function pantallaElegir(contenedor, alEntrar) {
  clear(contenedor);
  const conocidas = institucionesConocidas();

  clear(contenedor).append(el('div', { class: 'stack' }, [
    el('div', { class: 'card card-pad stack' }, [
      el('h2', {}, 'Gestión Educativa'),
      el('p', { class: 'small muted' },
        'Cada institución guarda su información en el Google Drive de quien la dirige. Este sitio es sólo la ventana para trabajar con ella.'),
      conocidas.length ? el('div', { class: 'stack' }, [
        el('p', { class: 'small', style: 'font-weight:650' }, 'Instituciones en este navegador'),
        el('div', { class: 'list' }, conocidas.map(inst => el('div', { class: 'item' }, [
          el('div', { class: 'item-head' }, [
            el('strong', {}, inst.nombre || 'Institución'),
            el('button', {
              class: 'btn btn-sm btn-primary', type: 'button', style: 'margin-left:auto',
              onclick: () => {
                recordarInstitucion(inst.nombre, inst.url);
                pantallaIngreso(contenedor, inst, alEntrar);
              },
            }, 'Ingresar'),
            el('button', {
              class: 'icon-btn plain', type: 'button', title: 'Quitar de este navegador',
              onclick: (ev) => {
                olvidarInstitucion(inst.url);
                ev.target.closest('.item').remove();
              },
            }, '✕'),
          ]),
        ]))),
      ]) : null,
    ]),

    el('div', { class: 'card card-pad stack' }, [
      el('h3', { style: 'font-size:15px' }, 'Unirme a mi institución'),
      el('p', { class: 'small muted' },
        'Pegá el enlace de invitación que te compartió quien administra tu institución.'),
      (() => {
        const campo = el('input', { type: 'text', placeholder: 'Enlace de invitación' });
        const form = el('form', { class: 'row' }, [
          el('div', { class: 'grow' }, campo),
          el('button', { class: 'btn btn-primary', type: 'submit' }, 'Conectar'),
        ]);
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const url = urlDesdeInvitacion(campo.value);
          if (!url) { avisoError('Ese enlace no parece una invitación válida.'); return; }
          await conectarInstitucion(url, contenedor, alEntrar);
        });
        return form;
      })(),
    ]),

    el('div', { class: 'card card-pad stack' }, [
      el('h3', { style: 'font-size:15px' }, 'Crear una institución nueva'),
      el('p', { class: 'small muted' },
        'Las instituciones las crea el equipo del sitio junto con quien dirige el liceo. La carpeta y las planillas quedan en el Google Drive de la institución: los datos son de ella.'),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => verificarSuperAdmin(contenedor, alEntrar),
      }, '🏫 Crear institución'),
    ]),

    el('div', { class: 'sep' }),
    el('p', { class: 'hint', style: 'text-align:center' }, [
      'Aparte del uso normal existe un ', el('a', { href: '#/demo' }, 'modo de prueba'),
      ' con datos de ejemplo, para conocer el sistema sin tocar ninguna institución.',
    ]),
  ]));
}

/** Valida una URL de institución, la registra y pasa al ingreso. */
async function conectarInstitucion(url, contenedor, alEntrar) {
  setSettings({ apiUrl: url, modo: 'google', idToken: '' });
  try {
    const resp = await apiGet('configPublica');
    if (resp.instalado === false) {
      avisoError('Esa institución todavía no completó su puesta en marcha.');
      return null;
    }
    recordarInstitucion(resp.liceo || 'Institución', url);
    avisoOk(`Conectado con ${resp.liceo || 'la institución'}.`);
    pantallaIngreso(contenedor, institucionActiva(), alEntrar);
    return resp;
  } catch (e) {
    avisoError(e.message || 'No se pudo contactar a esa institución.');
    return null;
  }
}

/* ---------------- verificación del equipo del sitio ---------------- */

/**
 * El asistente de creación es sólo para los superadministradores del sitio.
 * Es un control de flujo, no de datos: la seguridad de cada institución la da
 * su propia hoja «Usuarios», que administra quien la dirige.
 */
function verificarSuperAdmin(contenedor, alEntrar) {
  const zonaGoogle = el('div', { style: 'min-height:44px;display:flex;justify-content:center' });
  const mensaje = el('div', {});
  clear(contenedor).append(el('div', { class: 'card card-pad stack' }, [
    el('h2', { style: 'font-size:17px' }, 'Crear una institución'),
    el('p', { class: 'small muted' },
      'Este paso es del equipo del sitio. Identificate con tu cuenta de Google para continuar.'),
    mensaje,
    zonaGoogle,
    el('div', { class: 'row', style: 'justify-content:center' },
      botonVolver(() => pantallaElegir(contenedor, alEntrar))),
  ]));

  (async () => {
    try {
      await prepararIngresoGoogle({
        clientId: CLIENT_ID_SITIO,
        contenedor: zonaGoogle,
        autoSeleccionar: false,
        alRecibirCredencial: (credencial) => {
          const quien = datosDelToken(credencial);
          if (esSuperAdmin(quien.email)) {
            avisoOk(`Hola ${quien.nombre || quien.email}.`);
            asistenteCrear(contenedor, alEntrar);
          } else {
            clear(mensaje).append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
              `La cuenta ${quien.email} no forma parte del equipo del sitio. Si tu institución quiere sumarse, escribile a quien lo administra.`));
          }
        },
      });
    } catch (e) {
      clear(zonaGoogle).append(el('span', { class: 'chip warn' }, e.message || 'No se pudo preparar la verificación.'));
    }
  })();
}

/* ---------------- asistente de creación ---------------- */

/**
 * Crea una institución de manera totalmente automática. La persona que dirige
 * el liceo sólo elige su cuenta de Google y acepta los permisos: el sitio crea
 * el proyecto, sube el código, lo publica y arma la carpeta en su Drive.
 */
function asistenteCrear(contenedor, alEntrar) {
  const datos = {
    nombre: '',
    admins: SUPER_ADMINS.map(sa => `${sa.nombre}, ${sa.emails.join(', ')}`).join('\n'),
    token: '',
    backend: null,
  };

  /* --- paso 1: datos de la institución --- */
  const paso1 = () => {
    const campoNombre = el('input', { type: 'text', value: datos.nombre, placeholder: 'Liceo N.º 5' });
    const campoAdmins = el('textarea', {
      placeholder: 'Un administrador por línea: Nombre Apellido, correo@gmail.com',
    }, datos.admins);
    clear(contenedor).append(tarjetaPaso(1, 'Datos de la institución', [
      el('p', { class: 'small muted' },
        'Todo va a quedar en el Google Drive de la cuenta que elijas en el paso siguiente: esa cuenta es la dueña de los datos y administra los accesos.'),
      el('label', { class: 'field' }, [el('span', {}, 'Nombre de la institución'), campoNombre]),
      el('label', { class: 'field' }, [
        el('span', {}, 'Otros administradores (opcional)'), campoAdmins,
        el('span', { class: 'hint' },
          'La cuenta dueña queda como administradora automáticamente. El equipo del sitio viene precargado para poder asistirla y puede quitarse cuando quiera desde Usuarios.'),
      ]),
      el('div', { class: 'row', style: 'justify-content:space-between' }, [
        botonVolver(() => pantallaElegir(contenedor, alEntrar)),
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: () => {
            const nombre = campoNombre.value.trim();
            if (!nombre) { avisoError('Poné el nombre de la institución.'); return; }
            datos.nombre = nombre;
            datos.admins = campoAdmins.value;
            paso2();
          },
        }, 'Continuar →'),
      ]),
    ]));
  };

  /* --- paso 2: cuenta dueña + creación automática --- */
  const paso2 = () => {
    const progreso = el('div', { class: 'stack' });
    const acciones = el('div', { class: 'row', style: 'justify-content:space-between' });

    clear(contenedor).append(tarjetaPaso(2, 'Crear en el Drive de la institución', [
      el('p', { class: 'small muted' }, [
        'Al tocar el botón, Google va a pedir elegir la ', el('b', {}, 'cuenta de la institución'),
        ' y aceptar los permisos. Después el sitio hace todo solo: crea el proyecto, lo publica y arma la carpeta.',
      ]),
      progreso,
      acciones,
    ]));

    const pintarAcciones = (botones) => { clear(acciones).append(...botones); };
    pintarAcciones([
      botonVolver(paso1),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: crear }, '🚀 Elegir cuenta y crear'),
    ]);

    const ETAPAS = {
      codigo: 'Preparando el código del sistema',
      proyecto: 'Creando el proyecto en la cuenta elegida',
      subida: 'Instalando el sistema en el proyecto',
      version: 'Congelando la primera versión',
      publicacion: 'Publicando la aplicación web',
    };
    const hechas = [];
    const pintarProgreso = (actual = '', error = '') => {
      clear(progreso);
      for (const clave of Object.keys(ETAPAS)) {
        if (!hechas.includes(clave) && clave !== actual) continue;
        const esActual = clave === actual && !hechas.includes(clave);
        progreso.append(el('p', { class: 'small' }, [
          esActual ? '⏳ ' : '✅ ', ETAPAS[clave], esActual ? '…' : '',
        ]));
      }
      if (error) {
        progreso.append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' }, error));
      }
    };

    async function crear(ev) {
      ev.target.disabled = true;
      try {
        if (!datos.token) {
          datos.token = await pedirTokenAcceso({ clientId: CLIENT_ID_SITIO, scopes: SCOPES_FABRICA });
        }
        datos.backend = await crearBackend({
          token: datos.token,
          nombre: datos.nombre,
          alAvanzar: (etapa) => {
            pintarProgreso(etapa);
            hechas.push(etapa);
          },
        });
        pintarProgreso();
        paso3();
      } catch (e) {
        if (e instanceof ErrorFabrica && e.codigo === 'api_desactivada') {
          pintarProgreso('', 'A esa cuenta le falta un permiso de Google que se activa una sola vez.');
          progreso.append(
            el('p', { class: 'small muted' },
              'Abrí la página de configuración de Google con la cuenta de la institución, prendé el interruptor «API de Google Apps Script» y volvé a intentar.'),
            el('div', { class: 'row' }, [
              el('a', { class: 'btn btn-sm', href: URL_ACTIVAR_API, target: '_blank', rel: 'noopener' }, '⚙️ Abrir configuración de Google'),
            ]),
          );
        } else {
          if (e instanceof ErrorFabrica && e.codigo === 'token_vencido') datos.token = '';
          pintarProgreso('', e.message || 'No se pudo crear el proyecto.');
        }
        pintarAcciones([
          botonVolver(paso1),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: crear }, '↻ Reintentar'),
        ]);
      }
    }
  };

  /* --- paso 3: autorización del dueño --- */
  const paso3 = () => {
    const estadoNodo = el('p', { class: 'small muted' }, 'Cuando aceptes los permisos, esta pantalla sigue sola.');
    let vigilando = false;

    clear(contenedor).append(tarjetaPaso(3, 'Autorizar el sistema', [
      el('p', { class: 'small' }, [
        'Último permiso: la primera vez que se abre, Google le pide a la cuenta dueña autorizar al sistema a usar ',
        el('b', {}, 'su'), ' Drive, sus planillas y su formulario.',
      ]),
      el('ol', { class: 'small muted', style: 'margin:0;padding-left:18px' }, [
        el('li', {}, 'Tocá «Autorizar»: se abre una pestaña de Google.'),
        el('li', {}, 'Elegí la cuenta de la institución y presioná Revisar permisos → Permitir.'),
      ]),
      el('div', { class: 'row' }, [
        el('a', {
          class: 'btn btn-primary', href: datos.backend.execUrl, target: '_blank', rel: 'noopener',
          onclick: () => vigilar(),
        }, '🔐 Autorizar'),
      ]),
      estadoNodo,
    ]));

    async function vigilar() {
      if (vigilando) return;
      vigilando = true;
      estadoNodo.textContent = 'Esperando la autorización…';
      try {
        await esperarAutorizacion(datos.backend.execUrl, {
          alIntentar: (n) => { estadoNodo.textContent = `Esperando la autorización… (${n})`; },
        });
        estadoNodo.textContent = 'Autorizado. Creando la carpeta de la institución…';
        await instalar();
      } catch (e) {
        vigilando = false;
        estadoNodo.textContent = e.message || 'Todavía no se autorizó. Tocá «Autorizar» para intentar de nuevo.';
      }
    }

    async function instalar() {
      setSettings({ apiUrl: datos.backend.execUrl, modo: 'google' });
      try {
        const resp = await apiPost('instalar', {
          liceo: datos.nombre,
          clientId: getSettings().clientId || CLIENT_ID_SITIO,
          administradores: interpretarAdmins(datos.admins),
        });
        recordarInstitucion(datos.nombre, datos.backend.execUrl);
        if (resp.formUrl) setSettings({ formUrl: resp.formUrl });
        paso4(resp);
      } catch (e) {
        vigilando = false;
        estadoNodo.textContent = e.message || 'La autorización está, pero falló la creación de la carpeta. Tocá «Autorizar» para reintentar.';
      }
    }
  };

  /* --- paso 4: listo --- */
  const paso4 = (resp) => {
    clear(contenedor).append(tarjetaPaso(4, '¡Institución creada!', [
      el('p', { class: 'small' },
        'Quedó todo en el Google Drive de la institución: la carpeta, las planillas y el formulario para docentes. Esa cuenta administra los accesos.'),
      el('div', { class: 'row' }, [
        resp.carpetaUrl ? el('a', { class: 'btn btn-sm', href: resp.carpetaUrl, target: '_blank', rel: 'noopener' }, '📁 Carpeta en Drive') : null,
        resp.formUrl ? el('a', { class: 'btn btn-sm', href: resp.formUrl, target: '_blank', rel: 'noopener' }, '📋 Formulario docente') : null,
      ]),
      (resp.administradores || []).length ? el('p', { class: 'small muted' },
        `Administradores: ${resp.administradores.map(a => a.email).join(' · ')}`) : null,
      el('p', { class: 'small muted' },
        'Desde Configuración se copia el enlace de invitación para el resto del equipo.'),
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => pantallaIngreso(contenedor, institucionActiva(), alEntrar),
      }, 'Ingresar →'),
    ]));
  };

  paso1();
}

function interpretarAdmins(texto) {
  return String(texto || '').split('\n').map(linea => {
    const partes = linea.split(',').map(s => s.trim()).filter(Boolean);
    if (!partes.length) return null;
    const email = partes.find(p => p.includes('@')) || '';
    const nombre = partes.filter(p => !p.includes('@')).join(' ') || email;
    const extras = partes.filter(p => p.includes('@') && p !== email).join(', ');
    return email ? { nombre, email, emailsAdicionales: extras } : null;
  }).filter(Boolean);
}

function tarjetaPaso(n, titulo, hijos) {
  return el('div', { class: 'card card-pad stack' }, [
    el('div', { class: 'row' }, [
      el('span', { class: 'chip pri' }, `Paso ${n} de 4`),
      el('h2', { style: 'font-size:17px' }, titulo),
    ]),
    ...hijos,
  ]);
}

function botonVolver(fn) {
  return el('button', { class: 'btn btn-ghost', type: 'button', onclick: fn }, '← Volver');
}

export { esc };
