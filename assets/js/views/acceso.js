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
import { prepararIngresoGoogle, datosDelToken } from '../google.js';
import { apiGet, apiPost } from '../api.js';
import { cargar } from '../db.js';

const CODIGO_BACKEND_URL = 'https://raw.githubusercontent.com/martinferreiraHCA/partediario/main/apps-script/Codigo.gs';

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
    el('div', { class: 'row', style: 'justify-content:center' }, [
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => pantallaElegir(contenedor, alEntrar),
      }, 'Cambiar de institución'),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: async () => {
          setSettings({ modo: 'demo' });
          await cargar();
          alEntrar();
        },
      }, 'Ver la demostración'),
    ]),
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

    el('p', { class: 'hint', style: 'text-align:center' }, [
      '¿Querés mirar el sistema sin conectar nada? ',
      el('a', {
        href: '#', onclick: async (ev) => {
          ev.preventDefault();
          setSettings({ modo: 'demo' });
          await cargar();
          alEntrar();
        },
      }, 'Abrir la demostración'),
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
 * Guía a quien dirige un liceo para crear su institución en su propio Drive.
 * Los pasos técnicos (Apps Script) se presentan como instrucciones simples;
 * el resto lo hace el sistema.
 */
function asistenteCrear(contenedor, alEntrar) {
  const datos = {
    url: '', nombre: '',
    // El equipo del sitio queda como administrador para poder asistir a la
    // institución; quien la dirige puede quitarlo cuando quiera desde Usuarios.
    admins: SUPER_ADMINS.map(sa => `${sa.nombre}, ${sa.emails.join(', ')}`).join('\n'),
  };

  const paso1 = () => {
    clear(contenedor).append(tarjetaPaso(1, 'Preparar tu Google Drive', [
      el('p', { class: 'small' },
        'La institución vive en tu cuenta de Google: vos sos dueño de la carpeta, de las planillas y del formulario. Este sitio nunca guarda tus datos.'),
      el('ol', { class: 'small', style: 'margin:0;padding-left:18px;display:grid;gap:6px' }, [
        el('li', {}, [
          'Abrí ', el('a', { href: 'https://script.google.com', target: '_blank', rel: 'noopener' }, 'script.google.com'),
          ' con la cuenta de Google de la institución y creá un ', el('b', {}, 'Nuevo proyecto'), '.',
        ]),
        el('li', {}, [
          el('a', { href: CODIGO_BACKEND_URL, target: '_blank', rel: 'noopener' }, 'Abrí el código del sistema'),
          ', copialo entero y pegalo en el editor reemplazando lo que haya. Guardá.',
        ]),
        el('li', {}, [
          el('b', {}, 'Implementar → Nueva implementación → Aplicación web'), ': ejecutar como ',
          el('b', {}, 'Yo'), ', acceso ', el('b', {}, 'Cualquier usuario'), '. Aceptá los permisos.',
        ]),
        el('li', {}, ['Copiá la ', el('b', {}, 'URL de la aplicación web'), ' (termina en /exec).']),
      ]),
      el('div', { class: 'row', style: 'justify-content:space-between' }, [
        botonVolver(() => pantallaElegir(contenedor, alEntrar)),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: paso2 }, 'Ya tengo la URL →'),
      ]),
    ]));
  };

  const paso2 = () => {
    const campoUrl = el('input', { type: 'url', value: datos.url, placeholder: 'https://script.google.com/macros/s/…/exec' });
    const estado = el('div', {});
    clear(contenedor).append(tarjetaPaso(2, 'Conectar con tu proyecto', [
      el('label', { class: 'field' }, [el('span', {}, 'URL de la aplicación web'), campoUrl]),
      estado,
      el('div', { class: 'row', style: 'justify-content:space-between' }, [
        botonVolver(paso1),
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: async (ev) => {
            const url = urlDesdeInvitacion(campoUrl.value) || campoUrl.value.trim();
            if (!/^https:\/\/script\.google\.com\/macros\//.test(url)) {
              avisoError('Esa no parece la URL de una aplicación web de Apps Script.');
              return;
            }
            ev.target.disabled = true;
            clear(estado).append(el('span', { class: 'muted small' }, 'Verificando…'));
            setSettings({ apiUrl: url, modo: 'google' });
            try {
              const resp = await apiGet('ping');
              datos.url = url;
              if (resp.instalado) {
                clear(estado).append(el('span', { class: 'chip ok' }, 'Esa institución ya está creada: podés ingresar directamente.'));
                recordarInstitucion('Institución', url);
                setTimeout(() => pantallaIngreso(contenedor, institucionActiva(), alEntrar), 900);
              } else {
                paso3();
              }
            } catch (e) {
              clear(estado).append(el('span', { class: 'chip warn' },
                e.message || 'No responde. Revisá que la implementación tenga acceso «Cualquier usuario».'));
            } finally {
              ev.target.disabled = false;
            }
          },
        }, 'Verificar y continuar →'),
      ]),
    ]));
  };

  const paso3 = () => {
    const campoNombre = el('input', { type: 'text', value: datos.nombre, placeholder: 'Liceo N.º 5' });
    const campoAdmins = el('textarea', {
      placeholder: 'Un administrador por línea: Nombre Apellido, correo@gmail.com',
    }, datos.admins);
    const salida = el('div', {});
    clear(contenedor).append(tarjetaPaso(3, 'Crear la institución', [
      el('label', { class: 'field' }, [el('span', {}, 'Nombre de la institución'), campoNombre]),
      el('label', { class: 'field' }, [
        el('span', {}, 'Otros administradores (opcional)'), campoAdmins,
        el('span', { class: 'hint' }, 'La cuenta de Google que implementó el proyecto queda como administradora automáticamente: es la dueña de la carpeta y de los datos. El equipo del sitio viene precargado para poder asistirla, y puede quitarse en cualquier momento desde Usuarios.'),
      ]),
      salida,
      el('div', { class: 'row', style: 'justify-content:space-between' }, [
        botonVolver(paso2),
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: async (ev) => {
            const nombre = campoNombre.value.trim();
            if (!nombre) { avisoError('Poné el nombre de la institución.'); return; }
            datos.nombre = nombre;
            datos.admins = campoAdmins.value;
            ev.target.disabled = true;
            clear(salida).append(el('p', { class: 'muted small' }, 'Creando la estructura en tu Drive…'));
            try {
              const resp = await apiPost('instalar', {
                liceo: nombre,
                clientId: getSettings().clientId || CLIENT_ID_SITIO,
                administradores: interpretarAdmins(campoAdmins.value),
              });
              recordarInstitucion(nombre, datos.url);
              if (resp.formUrl) setSettings({ formUrl: resp.formUrl });
              paso4(resp);
            } catch (e) {
              clear(salida).append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
                e.message || 'No se pudo crear la institución.'));
              ev.target.disabled = false;
            }
          },
        }, '⚙️ Crear en mi Drive'),
      ]),
    ]));
  };

  const paso4 = (resp) => {
    clear(contenedor).append(tarjetaPaso(4, '¡Institución creada!', [
      el('p', { class: 'small' },
        'Quedó todo en tu Google Drive: la carpeta, las planillas y el formulario para docentes. Vos administrás los accesos.'),
      el('div', { class: 'row' }, [
        resp.carpetaUrl ? el('a', { class: 'btn btn-sm', href: resp.carpetaUrl, target: '_blank', rel: 'noopener' }, '📁 Mi carpeta en Drive') : null,
        resp.formUrl ? el('a', { class: 'btn btn-sm', href: resp.formUrl, target: '_blank', rel: 'noopener' }, '📋 Formulario docente') : null,
      ]),
      (resp.administradores || []).length ? el('p', { class: 'small muted' },
        `Administradores: ${resp.administradores.map(a => a.email).join(' · ')}`) : null,
      el('p', { class: 'small muted' },
        'Desde Configuración vas a poder copiar el enlace de invitación para el resto del equipo.'),
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => pantallaIngreso(contenedor, institucionActiva(), alEntrar),
      }, 'Ingresar con mi cuenta →'),
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
