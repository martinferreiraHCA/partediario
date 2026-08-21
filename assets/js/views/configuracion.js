/* Configuración: la institución, su gente, sus turnos y sus datos.
   Sin detalles técnicos a la vista: la conexión ya viene resuelta. */

import { el, clear, descargar, fmtFechaHora, uid } from '../utils.js';
import { tarjeta, modalFormulario, confirmar, avisoOk, avisoError, vacio } from '../ui.js';
import { getSettings, setSettings, institucionActiva, enlaceInvitacion, olvidarInstitucion } from '../settings.js';
import { sesion, cerrarSesion, puede, ETIQUETA_ROL, PERMISOS_POR_ROL } from '../sesion.js';
import { apiPost } from '../api.js';
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
    seccionMiInstitucion(ctx, ajustes),
    puede('administrar') && sesion.modo === 'google' ? await seccionUsuarios(ctx) : null,
    puede('administrar') ? seccionInstitucion(ctx) : null,
    puede('administrar') ? seccionTurnos(ctx) : null,
    seccionDatos(ctx),
  ].filter(Boolean);
  contenedor.append(...secciones);
}

/* ---------------- mi institución ---------------- */

function seccionMiInstitucion(ctx, ajustes) {
  if (ajustes.modo !== 'google') {
    return tarjeta('Modo de prueba', el('div', { class: 'card-pad stack' }, [
      el('p', { class: 'small muted' },
        'Estás en el modo de prueba: datos de ejemplo guardados sólo en este navegador. Nada de lo que hagas acá toca una institución real. Para el uso normal, salí y entrá con tu cuenta de Google.'),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => { location.hash = '#/salir-demo'; },
      }, 'Salir del modo de prueba'),
    ]));
  }

  const institucion = institucionActiva();
  const invitacion = enlaceInvitacion();

  return tarjeta('Mi institución', el('div', { class: 'card-pad stack' }, [
    el('div', { class: 'row' }, [
      sesion.foto ? el('img', { src: sesion.foto, alt: '', width: 36, height: 36, style: 'border-radius:50%' }) : null,
      el('div', {}, [
        el('strong', {}, estado.config.liceo || (institucion && institucion.nombre) || 'Institución'),
        el('p', { class: 'small muted' }, sesion.autenticado
          ? `${sesion.nombre || sesion.email} · ${ETIQUETA_ROL[sesion.rol] || sesion.rol}`
          : 'Sin identificar'),
      ]),
    ]),
    sesion.emails && sesion.emails.length > 1
      ? el('p', { class: 'hint' }, `Tus correos asociados: ${sesion.emails.join(' · ')}`)
      : null,
    el('div', { class: 'row' }, [
      sesion.carpetaUrl
        ? el('a', { class: 'btn btn-sm', href: sesion.carpetaUrl, target: '_blank', rel: 'noopener' }, '📁 Abrir la carpeta en Drive')
        : null,
      invitacion ? el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async (ev) => {
          try {
            await navigator.clipboard.writeText(invitacion);
            avisoOk('Enlace de invitación copiado. Compartilo con tu equipo.');
          } catch {
            ev.target.replaceWith(el('input', { type: 'text', value: invitacion, readonly: true, style: 'width:100%' }));
          }
        },
      }, '🔗 Copiar enlace de invitación') : null,
      sesion.autenticado ? el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async () => { await cerrarSesion(); ctx.refrescar(); },
      }, 'Cerrar sesión') : null,
      institucion ? el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button',
        onclick: async () => {
          const ok = await confirmar('Este navegador dejará de mostrar esta institución. Los datos siguen intactos en su Drive y podés volver a conectarte con el enlace de invitación.',
            { titulo: 'Cambiar de institución', textoOk: 'Desconectar' });
          if (!ok) return;
          await cerrarSesion();
          olvidarInstitucion(institucion.url);
          ctx.refrescar();
        },
      }, 'Cambiar de institución') : null,
    ]),
    el('p', { class: 'hint' },
      'Quien abre el enlace de invitación queda conectado a esta institución y entra con su cuenta de Google, siempre que figure entre los usuarios.'),
  ]));
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
