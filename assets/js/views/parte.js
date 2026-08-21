/* Parte diario: se genera con el cruce automático y Adscripción lo edita y exporta. */

import {
  el, clear, hoyISO, fmtFechaLarga, fmtFechaCorta, DIAS, diaSemana, ordinalHora, sumarDias,
} from '../utils.js';
import { vacio, tarjeta, modalFormulario, confirmar, avisoOk, avisoError } from '../ui.js';
import { sincronizarParte, ordenFilas, listaDocentes, listaGrupos, listaMaterias } from '../logica.js';
import { anioActivo, horarioDeModulo } from '../modelo.js';
import { guardarParte } from '../db.js';
import { apiPost } from '../api.js';
import { exportarHojas } from '../exportar.js';
import { puede } from '../sesion.js';
import { getSettings } from '../settings.js';
import { campoFecha } from './componentes.js';
import { dialogoCobertura } from './coberturas.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const fecha = ctx.params().fecha || hoyISO();
  const editable = puede('editarParte');

  const guardado = estado.partes[fecha];
  const { parte, cambios } = sincronizarParte(estado, fecha, guardado);
  const borrador = { ...parte, filas: parte.filas.map(f => ({ ...f })) };
  // 'ok' | 'pendiente' | 'guardando' | 'error'
  let estadoGuardado = 'ok';
  let reloj = null;

  ctx.setTitulo('Parte diario', `${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)} · ${estado.config.liceo || ''}`);

  const contenedor = el('div', { class: 'stack' });
  host.append(contenedor);

  // El parte se guarda solo: cada cambio programa un guardado y la barra
  // muestra el estado. Nadie tiene que acordarse de apretar nada.
  const marcarSucio = () => {
    estadoGuardado = 'pendiente';
    clearTimeout(reloj);
    reloj = setTimeout(guardar, 1200);
    pintar();
  };

  async function guardar() {
    clearTimeout(reloj);
    estadoGuardado = 'guardando';
    acciones();
    try {
      await guardarParte(fecha, borrador);
      estadoGuardado = 'ok';
      pintar();
    } catch (e) {
      estadoGuardado = 'error';
      avisoError(e.message || 'No se pudo guardar el parte. Se reintenta con el próximo cambio.');
      pintar();
    }
  }

  function acciones() {
    const etiquetas = {
      ok: '✓ Guardado', pendiente: '💾 Guardando…', guardando: '💾 Guardando…', error: '↻ Reintentar guardado',
    };
    ctx.setAcciones([
      editable ? el('button', {
        class: `btn ${estadoGuardado === 'error' ? 'btn-primary' : ''}`, type: 'button',
        disabled: estadoGuardado !== 'error',
        title: 'El parte se guarda automáticamente',
        onclick: () => guardar(),
      }, etiquetas[estadoGuardado]) : null,
      editable ? el('button', {
        class: 'btn', type: 'button',
        onclick: async () => {
          const nueva = await dialogoFila(ctx, fecha, null);
          if (!nueva) return;
          borrador.filas.push(nueva);
          borrador.filas.sort(ordenFilas);
          marcarSucio();
        },
      }, '＋ Agregar registro') : null,
      el('button', { class: 'btn', type: 'button', onclick: () => menuExportar() }, '⬇️ Exportar'),
      el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, '🖨️ Imprimir / PDF'),
    ]);
  }

  function menuExportar() {
    const { modo } = getSettings();
    const cuerpo = el('div', { class: 'stack' }, [
      el('p', { class: 'muted small' },
        'El parte se exporta con el encabezado del liceo y una fila por registro.'),
      el('div', { class: 'row' }, [
        botonExportar('ODS (LibreOffice / OpenOffice)', 'ods'),
        botonExportar('XLSX (Excel)', 'xlsx'),
        botonExportar('CSV', 'csv'),
      ]),
      modo === 'google' ? el('div', { class: 'stack' }, [
        el('div', { class: 'sep' }),
        el('p', { class: 'muted small' }, 'También podés dejar una copia dentro de la carpeta de Drive del liceo, en «Partes diarios».'),
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: async (ev) => {
            ev.target.disabled = true;
            try {
              const resp = await apiPost('exportarParteADrive', { fecha, parte: borrador });
              avisoOk('Parte guardado en Drive.');
              if (resp.url) window.open(resp.url, '_blank', 'noopener');
            } catch (e) {
              avisoError(e.message || 'No se pudo guardar en Drive.');
            } finally {
              ev.target.disabled = false;
            }
          },
        }, '📁 Guardar copia en Google Drive'),
      ]) : null,
    ]);
    import('../ui.js').then(({ abrirModal }) => abrirModal({ titulo: `Exportar parte del ${fmtFechaCorta(fecha)}`, cuerpo }));
  }

  function botonExportar(texto, formato) {
    return el('button', {
      class: 'btn', type: 'button',
      onclick: () => {
        try {
          exportarHojas([{ nombre: `Parte ${fecha}`, filas: filasExportacion(estado, borrador, fecha) }],
            `Parte diario ${fecha}`, formato);
          avisoOk(`Archivo .${formato} generado.`);
        } catch (e) {
          avisoError(e.message || 'No se pudo generar el archivo.');
        }
      },
    }, texto);
  }

  function pintar() {
    clear(contenedor);
    acciones();

    const barra = el('div', { class: 'toolbar no-print' }, [
      campoFecha(fecha, v => { ctx.setParam('fecha', v); ctx.refrescar(); }, 'Fecha del parte'),
      el('button', { class: 'btn', type: 'button', onclick: () => { ctx.setParam('fecha', sumarDias(fecha, -1)); ctx.refrescar(); } }, '‹ Día anterior'),
      el('button', { class: 'btn', type: 'button', onclick: () => { ctx.setParam('fecha', sumarDias(fecha, 1)); ctx.refrescar(); } }, 'Día siguiente ›'),
      el('button', { class: 'btn', type: 'button', onclick: () => { ctx.setParam('fecha', hoyISO()); ctx.refrescar(); } }, 'Hoy'),
      el('div', { class: 'grow' }),
      editable ? el('label', { class: 'row small muted', style: 'gap:6px' }, [
        (() => {
          const chk = el('input', { type: 'checkbox', style: 'width:auto' });
          chk.checked = !!borrador.cerrado;
          chk.onchange = () => { borrador.cerrado = chk.checked; marcarSucio(); };
          return chk;
        })(),
        'Parte cerrado',
      ]) : null,
    ]);

    const avisos = el('div', { class: 'row no-print' }, [
      cambios ? el('span', { class: 'chip info' }, `${cambios} registro(s) incorporados desde los avisos de inasistencia`) : null,
      borrador.cerrado ? el('span', { class: 'chip ok' }, 'Parte cerrado') : null,
      borrador.actualizado ? el('span', { class: 'chip' }, `Actualizado ${new Date(borrador.actualizado).toLocaleString('es-UY')}`) : null,
    ]);

    const encabezadoImpresion = el('div', { class: 'print-only', style: 'margin-bottom:12px' }, [
      el('h2', {}, `${estado.config.liceo || 'Liceo'} — Parte diario`),
      el('p', {}, `${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)}`),
    ]);

    const filas = borrador.filas.slice().sort(ordenFilas);

    const cuerpo = filas.length
      ? el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
          el('thead', {}, el('tr', {}, [
            'Hora', 'Docente', 'Grupo', 'Materia', 'Salón', 'Motivo', 'Cobertura', 'Observaciones',
            editable ? el('th', { class: 'actions' }, '') : null,
          ].filter(Boolean).map(t => (typeof t === 'string' ? el('th', {}, t) : t)))),
          el('tbody', {}, filas.map(f => filaTabla(f))),
        ]))
      : vacio('No hay registros para esta fecha.', '🗒️',
          editable ? el('p', { class: 'small muted', style: 'margin-top:8px' },
            'Se agregan automáticamente al recibir avisos de inasistencia, o podés cargarlos a mano.') : null);

    function filaTabla(f) {
      const sinCobertura = f.grupo && !f.cobertura;
      return el('tr', {}, [
        el('td', { class: 'mono' }, [
          f.hora ? ordinalHora(f.hora) : '—',
          el('div', { class: 'muted small' }, horarioDeModulo(estado.config, f.turno, f.hora)),
        ]),
        el('td', {}, [
          el('strong', {}, f.docente),
          f.origen === 'manual' ? el('div', {}, el('span', { class: 'chip', style: 'font-size:10px' }, 'manual')) : null,
        ]),
        el('td', {}, f.grupo || '—'),
        el('td', {}, f.materia || '—'),
        el('td', {}, f.salon || '—'),
        el('td', {}, f.motivo || 'Inasistencia'),
        el('td', {}, f.cobertura
          ? el('span', { class: 'chip ok' }, f.cobertura)
          : (sinCobertura ? el('span', { class: 'chip warn' }, 'sin cobertura') : '—')),
        el('td', { class: 'small muted' }, f.observaciones || ''),
        editable ? el('td', { class: 'actions' }, [
          f.grupo ? el('button', {
            class: 'icon-btn plain', type: 'button', title: 'Asignar cobertura',
            onclick: async () => {
              const docente = await dialogoCobertura(ctx, {
                fecha, hora: f.hora, turno: f.turno, grupo: f.grupo, docenteAusente: f.docente,
                actual: f.cobertura,
              });
              if (docente === null) return;
              f.cobertura = docente;
              f.editado = true;
              marcarSucio();
            },
          }, '🤝') : null,
          el('button', {
            class: 'icon-btn plain', type: 'button', title: 'Editar registro',
            onclick: async () => {
              const datos = await dialogoFila(ctx, fecha, f);
              if (!datos) return;
              if (datos.__accion === 'eliminar') {
                borrador.filas = borrador.filas.filter(x => x.id !== f.id);
                marcarSucio();
                return;
              }
              Object.assign(f, datos, { editado: true });
              marcarSucio();
            },
          }, '✏️'),
          el('button', {
            class: 'icon-btn plain', type: 'button', title: 'Eliminar registro',
            onclick: async () => {
              const ok = await confirmar(`¿Eliminar el registro de ${f.docente}${f.grupo ? ' (' + f.grupo + ')' : ''}?`,
                { titulo: 'Eliminar registro', textoOk: 'Eliminar', peligro: true });
              if (!ok) return;
              borrador.filas = borrador.filas.filter(x => x.id !== f.id);
              marcarSucio();
            },
          }, '🗑️'),
        ]) : null,
      ].filter(Boolean));
    }

    const resumen = el('div', { class: 'grid grid-4 no-print' }, [
      stat('Registros', filas.length),
      stat('Docentes', new Set(filas.map(f => f.docente)).size),
      stat('Grupos', new Set(filas.filter(f => f.grupo).map(f => f.grupo)).size),
      stat('Sin cobertura', filas.filter(f => f.grupo && !f.cobertura).length),
    ]);

    contenedor.append(
      barra,
      avisos,
      resumen,
      tarjeta(null, el('div', {}, [encabezadoImpresion, cuerpo])),
      el('p', { class: 'hint no-print' },
        'El parte se arma solo con los avisos recibidos, pero Adscripción manda: se puede editar, agregar registros que no vinieron del formulario y eliminar lo que no corresponda.'),
    );
  }

  pintar();
  // Lo que llega de los avisos de inasistencia se guarda solo, sin sermones.
  if (cambios && editable) guardar();
}

function stat(titulo, valor) {
  return el('div', { class: 'card stat' }, [
    el('div', { class: 'k', text: titulo }),
    el('div', { class: 'v', text: String(valor) }),
  ]);
}

/* ---------------- alta / edición de un registro ---------------- */

async function dialogoFila(ctx, fecha, fila) {
  const estado = ctx.estado;
  const anio = anioActivo(estado.config);
  const datos = await modalFormulario({
    titulo: fila ? 'Editar registro del parte' : 'Agregar registro al parte',
    textoOk: fila ? 'Guardar' : 'Agregar',
    campos: [
      { name: 'docente', label: 'Docente', requerido: true, lista: listaDocentes(estado, anio), ancho: 'full' },
      { name: 'hora', label: 'Hora / módulo', tipo: 'number', min: 0, max: 12 },
      { name: 'turno', label: 'Turno', tipo: 'select', opciones: [{ valor: '', texto: '(sin turno)' }].concat(estado.config.turnos.map(t => ({ valor: t.id, texto: t.nombre }))) },
      { name: 'grupo', label: 'Grupo', lista: listaGrupos(estado, anio) },
      { name: 'materia', label: 'Materia', lista: listaMaterias(estado, anio) },
      { name: 'salon', label: 'Salón' },
      { name: 'motivo', label: 'Motivo', lista: estado.config.motivos || [] },
      { name: 'cobertura', label: 'Cobertura', lista: listaDocentes(estado, anio) },
      { name: 'observaciones', label: 'Observaciones', tipo: 'textarea', ancho: 'full' },
    ],
    valores: fila || { motivo: 'Inasistencia' },
    accionExtra: fila ? { texto: '🗑️ Eliminar', valor: { __accion: 'eliminar' } } : null,
  });
  if (!datos) return null;
  if (datos.__accion) return datos;
  return {
    ...(fila || {}),
    ...datos,
    hora: Number(datos.hora) || 0,
    fecha,
    origen: fila ? fila.origen : 'manual',
    editado: true,
    id: fila ? fila.id : undefined,
  };
}

/* ---------------- exportación ---------------- */

export function filasExportacion(estado, parte, fecha) {
  const filas = [
    [`${estado.config.liceo || 'Liceo'} — Parte diario`],
    [`${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)}`],
    [],
    ['Hora', 'Horario', 'Turno', 'Docente', 'Grupo', 'Materia', 'Salón', 'Motivo', 'Cobertura', 'Observaciones'],
  ];
  for (const f of parte.filas.slice().sort(ordenFilas)) {
    filas.push([
      f.hora ? ordinalHora(f.hora) : '',
      horarioDeModulo(estado.config, f.turno, f.hora),
      f.turno || '',
      f.docente || '',
      f.grupo || '',
      f.materia || '',
      f.salon || '',
      f.motivo || '',
      f.cobertura || '',
      f.observaciones || '',
    ]);
  }
  filas.push([]);
  filas.push(['Total de registros', parte.filas.length]);
  filas.push(['Firma de Adscripción', '']);
  return filas;
}

