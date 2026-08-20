/* Configuración: conexión con la carpeta de Drive, usuarios, turnos y datos. */

import { el, clear, descargar, fmtFechaHora, uid } from '../utils.js';
import { tarjeta, modalFormulario, confirmar, avisoOk, avisoError, vacio } from '../ui.js';
import { getSettings, setSettings } from '../settings.js';
import { sesion, resolverSesion, iniciarSesionGoogle, cerrarSesion, obtenerClientId, puede, ETIQUETA_ROL, PERMISOS_POR_ROL } from '../sesion.js';
import { prepararIngresoGoogle } from '../google.js';
import { apiPost, pingApi } from '../api.js';
import { estado, cargar, guardarConfig, reiniciarDemo } from '../db.js';

export async function render(host, ctx) {
  const ajustes = getSettings();
  ctx.setTitulo('Configuración', sesion.modo === 'google'
    ? `${sesion.nombre || 'Sin identificar'} · ${ETIQUETA_ROL[sesion.rol] || sesion.rol}`
    : 'Modo demostración (los datos quedan en este navegador)');
  ctx.setAcciones([]);

  const contenedor = el('div', { class: 'stack' });
  host.append(contenedor);

  const secciones = [
    seccionConexion(ctx, ajustes),
    seccionInstalacion(ctx, ajustes),
    sesion.modo === 'google' ? seccionIngresoGoogle(ctx) : null,
    puede('administrar') && sesion.modo === 'google' ? await seccionUsuarios(ctx) : null,
    seccionInstitucion(ctx),
    seccionTurnos(ctx),
    seccionDatos(ctx),
  ].filter(Boolean);
  contenedor.append(...secciones);
}

/* ---------------- conexión ---------------- */

function seccionConexion(ctx, ajustes) {
  const modo = el('select', {}, [
    el('option', { value: 'demo', selected: ajustes.modo === 'demo' }, 'Demostración (sólo este navegador)'),
    el('option', { value: 'google', selected: ajustes.modo === 'google' }, 'Google Drive (Apps Script)'),
  ]);
  const url = el('input', { type: 'url', value: ajustes.apiUrl, placeholder: 'https://script.google.com/macros/s/AKfy…/exec' });
  const refresco = el('input', { type: 'number', min: 0, max: 3600, value: ajustes.autoRefresh });

  const identidad = el('div', { class: 'stack' });
  const zonaGoogle = el('div', { style: 'min-height:44px' });

  const pintarIdentidad = () => {
    clear(identidad);
    if (getSettings().modo !== 'google') {
      identidad.append(el('span', { class: 'chip warn' }, 'Modo demostración: los datos quedan en este navegador'));
      return;
    }
    if (sesion.autenticado) {
      identidad.append(el('div', { class: 'row' }, [
        sesion.foto ? el('img', { src: sesion.foto, alt: '', width: 32, height: 32, style: 'border-radius:50%' }) : null,
        el('strong', {}, sesion.nombre || sesion.email || 'Identificado'),
        el('span', { class: 'chip pri' }, ETIQUETA_ROL[sesion.rol] || sesion.rol),
        el('span', { class: 'chip ok' }, 'Cuenta de Google'),
        sesion.carpetaUrl ? el('a', { class: 'btn btn-sm', href: sesion.carpetaUrl, target: '_blank', rel: 'noopener' }, '📁 Abrir carpeta en Drive') : null,
        el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: async () => {
            await cerrarSesion();
            pintarIdentidad();
            ctx.refrescar();
          },
        }, 'Cerrar sesión'),
      ]));
      if (sesion.emails && sesion.emails.length) {
        identidad.append(el('p', { class: 'hint' }, `Correos asociados: ${sesion.emails.join(' · ')}`));
      }
    } else if (sesion.motivo === 'sin_autorizacion') {
      identidad.append(el('span', { class: 'chip warn' },
        `La cuenta ${sesion.email || ''} no está autorizada: pedí que agreguen ese correo a tu usuario.`));
    } else {
      identidad.append(el('span', { class: 'chip warn' }, 'Sin identificar'));
    }
  };

  const prepararGoogle = async () => {
    clear(zonaGoogle);
    if (getSettings().modo !== 'google' || sesion.autenticado) return;
    const clientId = await obtenerClientId();
    if (!clientId) {
      zonaGoogle.append(el('span', { class: 'hint' },
        'Para habilitar el ingreso con Google falta cargar el ID de cliente OAuth (más abajo).'));
      return;
    }
    try {
      await prepararIngresoGoogle({
        clientId,
        contenedor: zonaGoogle,
        alRecibirCredencial: async (credencial) => {
          try {
            await iniciarSesionGoogle(credencial);
            if (!sesion.autenticado) { pintarIdentidad(); avisoError('La cuenta de Google no está autorizada.'); return; }
            await cargar();
            avisoOk(`Bienvenido/a ${sesion.nombre || ''}`.trim());
            ctx.refrescar();
          } catch (e) {
            avisoError(e.message || 'No se pudo ingresar con Google.');
          }
        },
      });
    } catch (e) {
      zonaGoogle.append(el('span', { class: 'chip warn' }, e.message || 'No se pudo preparar el ingreso con Google.'));
    }
  };

  pintarIdentidad();
  prepararGoogle();

  const guardar = async () => {
    setSettings({
      modo: modo.value,
      apiUrl: url.value.trim(),
      autoRefresh: Number(refresco.value) || 0,
    });
    try {
      await resolverSesion();
      await cargar();
      avisoOk('Configuración guardada.');
    } catch (e) {
      avisoError(e.message || 'No se pudo conectar.');
    }
    pintarIdentidad();
    ctx.refrescar();
  };

  return tarjeta('Conexión con Google Drive', el('div', { class: 'card-pad stack' }, [
    el('p', { class: 'small muted' },
      'Toda la información vive en una única carpeta de Google Drive: allí están la configuración, los usuarios, los horarios, las inasistencias y los partes diarios. Esta aplicación sólo es la ventana para trabajar con esa carpeta.'),
    el('div', { class: 'grid grid-2' }, [
      el('label', { class: 'field' }, [el('span', {}, 'Modo de trabajo'), modo]),
      el('label', { class: 'field' }, [el('span', {}, 'Actualización automática (segundos, 0 = desactivada)'), refresco]),
      el('label', { class: 'field' }, [
        el('span', {}, 'URL de la aplicación web de Apps Script'), url,
        el('span', { class: 'hint' }, 'Se obtiene al implementar el proyecto de Apps Script como aplicación web.'),
      ]),
    ]),
    identidad,
    zonaGoogle,
    el('div', { class: 'row' }, [
      el('button', { class: 'btn btn-primary', type: 'button', onclick: guardar }, '💾 Guardar y conectar'),
      el('button', {
        class: 'btn', type: 'button',
        onclick: async (ev) => {
          ev.target.disabled = true;
          setSettings({ apiUrl: url.value.trim() });
          try {
            const resp = await pingApi();
            avisoOk(`Conexión correcta · ${resp.version || 'backend activo'}${resp.instalado === false ? ' · falta la configuración inicial' : ''}`);
          } catch (e) {
            avisoError(e.message || 'No se pudo contactar el backend.');
          } finally {
            ev.target.disabled = false;
          }
        },
      }, '🔌 Probar conexión'),
    ]),
  ]));
}

/* ---------------- ingreso con Google ---------------- */

function seccionIngresoGoogle(ctx) {
  const clientId = el('input', {
    type: 'text', value: estado.config.clientId || getSettings().clientId || '',
    placeholder: '1234567890-abcdefg.apps.googleusercontent.com',
  });
  const origen = location.origin;

  return tarjeta('Ingreso con cuenta de Google', el('div', { class: 'card-pad stack' }, [
    el('p', { class: 'small muted' },
      'Con el ID de cliente OAuth cargado, cada persona entra con su cuenta de Google en lugar de un código. El sistema busca el correo entre los usuarios autorizados; una misma persona puede tener varios correos asociados.'),
    el('ol', { class: 'small muted', style: 'margin:0;padding-left:18px' }, [
      el('li', {}, 'En console.cloud.google.com → APIs y servicios → Credenciales, creá un ID de cliente OAuth de tipo «Aplicación web».'),
      el('li', {}, el('span', { html: `En <b>Orígenes autorizados de JavaScript</b> agregá exactamente: <code>${origen}</code>` })),
      el('li', {}, 'Copiá el ID de cliente acá abajo y guardá. No hace falta cargar el secreto.'),
    ]),
    el('label', { class: 'field' }, [
      el('span', {}, 'ID de cliente OAuth (Client ID)'), clientId,
      el('span', { class: 'hint' }, 'Queda guardado en la hoja «General» del archivo de configuración, dentro de la carpeta de Drive.'),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', disabled: !puede('administrar'),
        onclick: async () => {
          try {
            await guardarConfig({ clientId: clientId.value.trim() });
            setSettings({ clientId: clientId.value.trim() });
            avisoOk('Ingreso con Google configurado.');
            ctx.refrescar();
          } catch (e) { avisoError(e.message); }
        },
      }, '💾 Guardar'),
      estado.config.clientId
        ? el('span', { class: 'chip ok' }, 'Ingreso con Google habilitado')
        : el('span', { class: 'chip warn' }, 'Todavía sólo se puede entrar con código'),
    ]),
  ]));
}

/* ---------------- instalación ---------------- */

function seccionInstalacion(ctx, ajustes) {
  const nombre = el('input', { type: 'text', value: estado.config.liceo || 'Liceo', placeholder: 'Nombre del liceo' });
  const carpeta = el('input', { type: 'text', placeholder: 'ID de una carpeta existente (opcional)' });
  const clientIdInstalacion = el('input', {
    type: 'text', value: estado.config.clientId || '',
    placeholder: '1234567890-abcdefg.apps.googleusercontent.com',
  });
  const salida = el('div', { class: 'stack' });

  const instalar = async (ev) => {
    const ok = await confirmar(
      'Se creará (o completará) la estructura de carpetas y archivos dentro de Google Drive: Configuración, Horarios, Inasistencias, Partes diarios y Exportaciones. ¿Continuamos?',
      { titulo: 'Configuración inicial', textoOk: 'Ejecutar' });
    if (!ok) return;
    ev.target.disabled = true;
    clear(salida).append(el('p', { class: 'muted' }, 'Creando la estructura en Drive…'));
    try {
      const resp = await apiPost('instalar', {
        liceo: nombre.value.trim(),
        carpetaId: carpeta.value.trim(),
        clientId: clientIdInstalacion.value.trim(),
      });
      clear(salida).append(
        el('p', { class: 'chip ok', style: 'display:inline-block' }, 'Configuración inicial completada'),
        el('div', { class: 'stack' }, [
          enlace('📁 Carpeta del liceo en Drive', resp.carpetaUrl),
          enlace('⚙️ Archivo de configuración (usuarios, turnos, años)', resp.configUrl),
          enlace('📋 Formulario de aviso de inasistencia', resp.formUrl),
          enlace('📊 Planilla de respuestas', resp.respuestasUrl),
          (resp.administradores || []).length
            ? el('div', { class: 'stack' }, [
                el('p', { class: 'small muted' }, 'Administradores dados de alta:'),
                el('div', { class: 'row' }, resp.administradores.map(a =>
                  el('span', { class: 'chip ok' }, `${a.nombre} · ${a.email}`))),
              ])
            : el('p', { class: 'small muted' }, 'Los usuarios ya estaban cargados: no se modificó ninguno.'),
        ]),
      );
      if (resp.clientId) setSettings({ clientId: resp.clientId });
      if (resp.formUrl) setSettings({ formUrl: resp.formUrl });
      if (resp.respuestasUrl) setSettings({ hojaUrl: resp.respuestasUrl });
      await resolverSesion();
      await cargar();
      avisoOk('Estructura creada en Google Drive.');
      ctx.refrescar();
    } catch (e) {
      clear(salida).append(el('p', { class: 'chip warn', style: 'display:inline-block;padding:10px' },
        e.message || 'No se pudo ejecutar la configuración inicial.'));
    } finally {
      ev.target.disabled = false;
    }
  };

  return tarjeta('Configuración inicial en Drive', el('div', { class: 'card-pad stack' }, [
    el('p', { class: 'small muted' },
      'Ejecutá esto una sola vez, con la cuenta de Google que será dueña del sistema. Crea la carpeta del liceo con esta estructura:'),
    el('pre', { class: 'small muted', style: 'white-space:pre-wrap;margin:0' },
`📁 Gestión Educativa – <Liceo>
   ├── 01 · Configuración        → Configuración (usuarios, roles, turnos, años, motivos)
   ├── 02 · Horarios             → horario institucional por año + planillas originales
   ├── 03 · Inasistencias        → formulario y planilla de respuestas
   ├── 04 · Partes diarios       → un archivo por día, ordenado por año y mes
   └── 05 · Exportaciones        → copias y respaldos`),
    el('div', { class: 'grid grid-2' }, [
      el('label', { class: 'field' }, [el('span', {}, 'Nombre del liceo'), nombre]),
      el('label', { class: 'field' }, [
        el('span', {}, 'Carpeta existente (opcional)'), carpeta,
        el('span', { class: 'hint' }, 'Si ya tenés una carpeta, pegá su ID y se usará esa.'),
      ]),
      el('label', { class: 'field', style: 'grid-column:1 / -1' }, [
        el('span', {}, 'ID de cliente OAuth de Google'), clientIdInstalacion,
        el('span', { class: 'hint' },
          'Cargalo acá: después de instalar, el acceso queda restringido a las cuentas autorizadas y sin este dato nadie podría ingresar. Si te lo salteás, se puede cargar desde el editor de Apps Script con definirClientId().'),
      ]),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button',
        disabled: getSettings().modo !== 'google' || !getSettings().apiUrl,
        onclick: instalar,
      }, '⚙️ Ejecutar configuración inicial'),
      getSettings().modo !== 'google'
        ? el('span', { class: 'chip warn' }, 'Primero configurá la conexión con Apps Script')
        : null,
    ]),
    salida,
  ]));
}

function enlace(texto, url) {
  if (!url) return null;
  return el('a', { class: 'btn btn-sm', href: url, target: '_blank', rel: 'noopener' }, texto);
}

/* ---------------- usuarios ---------------- */

async function seccionUsuarios(ctx) {
  let usuarios = [];
  let error = '';
  try {
    const resp = await apiPost('usuarios');
    usuarios = resp.usuarios || [];
  } catch (e) {
    error = e.message || 'No se pudieron leer los usuarios.';
  }

  const cuerpo = el('div', { class: 'stack' });

  const pintar = (lista) => {
    clear(cuerpo);
    if (error) { cuerpo.append(el('p', { class: 'chip warn', style: 'display:inline-block;padding:10px' }, error)); return; }
    if (!lista.length) { cuerpo.append(vacio('Todavía no hay usuarios cargados.', '👤')); return; }
    cuerpo.append(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
      el('thead', {}, el('tr', {}, ['Nombre', 'Correos de Google', 'Rol', 'Activo', ''].map(t => el('th', {}, t)))),
      el('tbody', {}, lista.map(u => el('tr', {}, [
        el('td', {}, u.nombre || '—'),
        el('td', { class: 'small muted' },
          (u.emails && u.emails.length ? u.emails : [u.email].filter(Boolean)).join(' · ') || '—'),
        el('td', {}, el('span', { class: 'chip pri' }, ETIQUETA_ROL[u.rol] || u.rol)),
        el('td', {}, u.activo === false ? el('span', { class: 'chip warn' }, 'no') : el('span', { class: 'chip ok' }, 'sí')),
        el('td', { class: 'actions' }, [
          el('button', {
            class: 'icon-btn plain', type: 'button', title: 'Editar',
            onclick: () => dialogoUsuario(ctx, u),
          }, '✏️'),
          el('button', {
            class: 'icon-btn plain', type: 'button', title: 'Eliminar',
            onclick: async () => {
              const ok = await confirmar(`¿Quitar el acceso de ${u.nombre || u.email}?`,
                { titulo: 'Eliminar usuario', textoOk: 'Eliminar', peligro: true });
              if (!ok) return;
              try {
                await apiPost('eliminarUsuario', { id: u.id, email: u.email });
                avisoOk('Usuario eliminado.');
                ctx.refrescar();
              } catch (e) { avisoError(e.message); }
            },
          }, '🗑️'),
        ]),
      ]))),
    ])));
  };
  pintar(usuarios);

  return tarjeta('Usuarios y accesos',
    el('div', { class: 'card-pad stack' }, [
      el('p', { class: 'small muted' },
        'Las cuentas se administran en la hoja «Usuarios» del archivo de configuración de Drive; desde acá se edita lo mismo. Se entra únicamente con cuenta de Google: sin correo registrado no hay acceso. Una misma persona puede tener varios correos asociados.'),
      cuerpo,
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => dialogoUsuario(ctx, null) }, '＋ Agregar usuario'),
        sesion.carpetaUrl ? el('a', { class: 'btn', href: sesion.carpetaUrl, target: '_blank', rel: 'noopener' }, '📁 Abrir carpeta') : null,
      ]),
      el('details', {}, [
        el('summary', { class: 'small muted' }, 'Qué puede hacer cada rol'),
        el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
          el('thead', {}, el('tr', {}, ['Rol', 'Permisos'].map(t => el('th', {}, t)))),
          el('tbody', {}, Object.entries(PERMISOS_POR_ROL).map(([rol, permisos]) => el('tr', {}, [
            el('td', {}, ETIQUETA_ROL[rol] || rol),
            el('td', { class: 'small muted' }, permisos.join(' · ')),
          ]))),
        ])),
      ]),
    ]));
}

async function dialogoUsuario(ctx, usuario) {
  const datos = await modalFormulario({
    titulo: usuario ? 'Editar usuario' : 'Agregar usuario',
    textoOk: usuario ? 'Guardar' : 'Agregar',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido', requerido: true, ancho: 'full' },
      {
        name: 'email', label: 'Correo principal de Google', tipo: 'text', requerido: true,
        hint: 'Sin correo registrado no se puede entrar al sistema.',
      },
      {
        name: 'emailsAdicionales', label: 'Otros correos de la misma persona', tipo: 'text', ancho: 'full',
        hint: 'Separados por coma. Sirve cuando alguien usa la cuenta institucional y la personal.',
      },
      {
        name: 'rol', label: 'Rol', tipo: 'select',
        opciones: Object.keys(PERMISOS_POR_ROL).map(r => ({ valor: r, texto: ETIQUETA_ROL[r] || r })),
      },
      { name: 'activo', label: 'Acceso habilitado', tipo: 'checkbox', valor: true },
    ],
    valores: usuario
      ? { ...usuario, emailsAdicionales: (usuario.emailsAdicionales || (usuario.emails || []).slice(1).join(', ')) }
      : { rol: 'adscripcion', activo: true },
  });
  if (!datos) return;
  try {
    await apiPost('guardarUsuario', {
      usuario: {
        ...(usuario || {}),
        ...datos,
        id: usuario ? usuario.id : uid('usr'),
      },
    });
    avisoOk('Usuario guardado.');
    ctx.refrescar();
  } catch (e) {
    avisoError(e.message || 'No se pudo guardar el usuario.');
  }
}

/* ---------------- institución ---------------- */

function seccionInstitucion(ctx) {
  const config = estado.config;
  const liceo = el('input', { type: 'text', value: config.liceo || '' });
  const liceos = el('input', { type: 'text', value: (config.liceos || []).join(', ') });
  const motivos = el('input', { type: 'text', value: (config.motivos || []).join(', ') });
  const form = el('input', { type: 'url', value: getSettings().formUrl, placeholder: 'https://docs.google.com/forms/…' });

  return tarjeta('Datos de la institución', el('div', { class: 'card-pad stack' }, [
    el('div', { class: 'grid grid-2' }, [
      el('label', { class: 'field' }, [el('span', {}, 'Liceo'), liceo]),
      el('label', { class: 'field' }, [el('span', {}, 'Liceos / centros (separados por coma)'), liceos]),
      el('label', { class: 'field' }, [el('span', {}, 'Motivos de inasistencia'), motivos]),
      el('label', { class: 'field' }, [
        el('span', {}, 'URL del formulario para docentes'), form,
        el('span', { class: 'hint' }, 'Se muestra como acceso directo en Inicio e Inasistencias.'),
      ]),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button',
        disabled: !puede('administrar'),
        onclick: async () => {
          setSettings({ formUrl: form.value.trim() });
          try {
            await guardarConfig({
              liceo: liceo.value.trim(),
              liceos: liceos.value.split(',').map(s => s.trim()).filter(Boolean),
              motivos: motivos.value.split(',').map(s => s.trim()).filter(Boolean),
            });
            avisoOk('Datos institucionales guardados.');
            ctx.refrescar();
          } catch (e) { avisoError(e.message); }
        },
      }, '💾 Guardar'),
    ]),
  ]));
}

/* ---------------- turnos y módulos ---------------- */

function seccionTurnos(ctx) {
  const config = estado.config;
  const cuerpo = el('div', { class: 'stack' });

  const pintar = () => {
    clear(cuerpo);
    for (const turno of config.turnos) {
      const filas = turno.modulos.map(m => el('tr', {}, [
        el('td', { class: 'mono' }, String(m.n)),
        el('td', {}, campoHora(m, 'inicio')),
        el('td', {}, campoHora(m, 'fin')),
        el('td', { class: 'actions' }, puede('administrar') ? el('button', {
          class: 'icon-btn plain', type: 'button', title: 'Quitar módulo',
          onclick: () => { turno.modulos = turno.modulos.filter(x => x !== m); pintar(); },
        }, '🗑️') : null),
      ]));
      cuerpo.append(el('div', { class: 'stack' }, [
        el('div', { class: 'row' }, [
          el('h3', { style: 'font-size:14px' }, turno.nombre),
          el('span', { class: 'chip' }, `${turno.modulos.length} módulos`),
          puede('administrar') ? el('button', {
            class: 'btn btn-sm', type: 'button', style: 'margin-left:auto',
            onclick: () => {
              const n = Math.max(0, ...turno.modulos.map(m => m.n)) + 1;
              turno.modulos.push({ n, inicio: '', fin: '' });
              pintar();
            },
          }, '＋ Módulo') : null,
        ]),
        el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
          el('thead', {}, el('tr', {}, ['Módulo', 'Inicio', 'Fin', ''].map(t => el('th', {}, t)))),
          el('tbody', {}, filas),
        ])),
      ]));
    }
  };

  function campoHora(modulo, campo) {
    const input = el('input', { type: 'time', value: modulo[campo] || '' });
    input.disabled = !puede('administrar');
    input.onchange = () => { modulo[campo] = input.value; };
    return input;
  }

  pintar();

  return tarjeta('Turnos y módulos horarios', el('div', { class: 'card-pad stack' }, [
    el('p', { class: 'small muted' }, 'Definen los horarios de cada módulo y se usan en la grilla, el parte y las exportaciones.'),
    cuerpo,
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', disabled: !puede('administrar'),
        onclick: async () => {
          try {
            await guardarConfig({ turnos: config.turnos });
            avisoOk('Turnos guardados.');
            ctx.refrescar();
          } catch (e) { avisoError(e.message); }
        },
      }, '💾 Guardar turnos'),
    ]),
  ]));
}

/* ---------------- datos ---------------- */

function seccionDatos(ctx) {
  return tarjeta('Datos y respaldos', el('div', { class: 'card-pad stack' }, [
    el('p', { class: 'small muted' },
      'El respaldo incluye configuración, horarios, inasistencias y partes. Sirve para mover la información entre navegadores o guardar una copia fuera de Drive.'),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          const paquete = {
            config: estado.config, horarios: estado.horarios,
            inasistencias: estado.inasistencias, partes: estado.partes,
            exportado: new Date().toISOString(),
          };
          descargar(new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' }),
            `respaldo-gestion-educativa-${new Date().toISOString().slice(0, 10)}.json`);
          avisoOk('Respaldo descargado.');
        },
      }, '⬇️ Descargar respaldo (JSON)'),
      el('button', {
        class: 'btn', type: 'button', disabled: !puede('administrar'),
        onclick: () => importarRespaldo(ctx),
      }, '⬆️ Restaurar respaldo'),
      getSettings().modo === 'demo' ? el('button', {
        class: 'btn btn-danger', type: 'button',
        onclick: async () => {
          const ok = await confirmar('Se volverán a generar los datos de demostración y se perderán los cambios locales.',
            { titulo: 'Reiniciar demostración', textoOk: 'Reiniciar', peligro: true });
          if (!ok) return;
          reiniciarDemo();
          avisoOk('Datos de demostración restablecidos.');
          ctx.refrescar();
        },
      }, '♻️ Reiniciar datos de demostración') : null,
    ]),
    estado.meta.ultimaCarga
      ? el('p', { class: 'hint' }, `Última lectura de datos: ${fmtFechaHora(estado.meta.ultimaCarga)}`)
      : null,
  ]));
}

function importarRespaldo(ctx) {
  const input = el('input', { type: 'file', accept: '.json', style: 'display:none' });
  document.body.append(input);
  input.onchange = async () => {
    const archivo = input.files[0];
    input.remove();
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      const ok = await confirmar('Se reemplazará la configuración, el horario, las inasistencias y los partes actuales. ¿Continuar?',
        { titulo: 'Restaurar respaldo', textoOk: 'Restaurar', peligro: true });
      if (!ok) return;
      if (getSettings().modo === 'google') {
        await apiPost('restaurar', { datos });
      } else {
        localStorage.setItem('ge.datos.v1', JSON.stringify(datos));
      }
      await cargar();
      avisoOk('Respaldo restaurado.');
      ctx.refrescar();
    } catch (e) {
      avisoError(e.message || 'El archivo no tiene el formato esperado.');
    }
  };
  input.click();
}
