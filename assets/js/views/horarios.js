/* Horarios: consulta por día, por grupo, por docente y búsqueda libre. */

import {
  el, hoyISO, DIAS, DIAS_CORTOS, diaSemana, ordinalHora, contiene, compararNatural,
  colorDeTexto, colorTextoDeTexto, claveDocente,
} from '../utils.js';
import { vacio, tarjeta, modalFormulario, confirmar, avisoOk, avisoError } from '../ui.js';
import { anioActivo, modulosDe, horarioDeModulo } from '../modelo.js';
import { listaDocentes, listaGrupos, listaMaterias, docentesAusentes } from '../logica.js';
import { guardarClase, eliminarClase } from '../db.js';
import { puede } from '../sesion.js';
import { campoSelect, campoFecha, campoTexto } from './componentes.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const params = ctx.params();
  const anio = Number(params.anio) || anioActivo(estado.config);
  const modo = params.modo || 'dia';
  const fecha = params.fecha || hoyISO();
  const turnos = estado.config.turnos;
  const turno = params.turno ?? (turnos[0] ? turnos[0].id : '');
  const grupos = listaGrupos(estado, anio, turno);
  const docentes = listaDocentes(estado, anio);
  const grupo = params.grupo || grupos[0] || '';
  const docente = params.docente || docentes[0] || '';
  const q = params.q || '';

  const clasesAnio = estado.horarios.filter(c => Number(c.anio) === anio);

  ctx.setTitulo('Horarios',
    `Año ${anio} · ${clasesAnio.length} clases · ${grupos.length} grupos · ${docentes.length} docentes`);
  ctx.setAcciones([
    puede('editarHorarios') ? el('button', {
      class: 'btn', type: 'button',
      onclick: () => dialogoClase(ctx, { anio, turno, dia: diaSemana(fecha) }),
    }, '＋ Agregar clase') : null,
    el('button', { class: 'btn', type: 'button', onclick: () => ctx.ir('institucional') }, '🗂️ Administrar años'),
  ]);

  const tabs = el('div', { class: 'tabs' }, [
    ['dia', 'Por día'], ['grupo', 'Por grupo'], ['docente', 'Por docente'], ['buscar', 'Buscar'],
  ].map(([id, texto]) => el('button', {
    class: `tab ${modo === id ? 'active' : ''}`, type: 'button',
    onclick: () => { ctx.setParam('modo', id); ctx.refrescar(); },
  }, texto)));

  const aniosDisponibles = (estado.config.anios || []).map(a => ({
    valor: a.anio, texto: `${a.anio}${a.estado === 'activo' ? ' (activo)' : ''}`,
  }));

  const barra = el('div', { class: 'toolbar' }, [
    tabs,
    campoSelect('Año', aniosDisponibles.length ? aniosDisponibles : [anio], anio,
      v => { ctx.setParam('anio', v); ctx.refrescar(); }),
    modo === 'dia' ? campoFecha(fecha, v => { ctx.setParam('fecha', v); ctx.refrescar(); }, 'Día') : null,
    (modo === 'dia' || modo === 'grupo')
      ? campoSelect('Turno', [{ valor: '', texto: 'Todos' }].concat(turnos.map(t => ({ valor: t.id, texto: t.nombre }))), turno,
        v => { ctx.setParam('turno', v); ctx.refrescar(); })
      : null,
    modo === 'grupo' && grupos.length
      ? campoSelect('Grupo', grupos, grupo, v => { ctx.setParam('grupo', v); ctx.refrescar(); })
      : null,
    modo === 'docente' && docentes.length
      ? campoSelect('Docente', docentes, docente, v => { ctx.setParam('docente', v); ctx.refrescar(); })
      : null,
    modo === 'buscar'
      ? campoTexto('Buscar', q, v => { clearTimeout(barra._t); barra._t = setTimeout(() => { ctx.setParam('q', v); ctx.refrescar(); }, 300); },
        'Docente, materia, grupo o salón…')
      : null,
  ]);

  let contenido;
  if (!clasesAnio.length) {
    contenido = vacio(`Todavía no hay horario cargado para ${anio}.`, '🗓️',
      el('button', {
        class: 'btn btn-primary', type: 'button', style: 'margin-top:12px',
        onclick: () => ctx.ir('institucional'),
      }, 'Subir planilla de horarios'));
  } else if (modo === 'dia') contenido = vistaPorDia(ctx, { anio, fecha, turno });
  else if (modo === 'grupo') contenido = vistaPorGrupo(ctx, { anio, grupo, turno });
  else if (modo === 'docente') contenido = vistaPorDocente(ctx, { anio, docente });
  else contenido = vistaBusqueda(ctx, { anio, q });

  host.append(el('div', { class: 'stack' }, [barra, contenido]));
}

/* ---------------- por día ---------------- */

function vistaPorDia(ctx, { anio, fecha, turno }) {
  const estado = ctx.estado;
  const dia = diaSemana(fecha);
  const ausentes = docentesAusentes(estado, fecha);
  const clases = estado.horarios.filter(c =>
    Number(c.anio) === anio && Number(c.dia) === dia && (!turno || c.turno === turno));
  const grupos = Array.from(new Set(clases.map(c => c.grupo))).sort(compararNatural);
  const modulos = modulosDe(estado.config, turno);

  if (!clases.length) {
    return tarjeta(`${DIAS[dia]}`, vacio('No hay clases registradas para ese día y turno.', '🌤️'));
  }

  const mapa = new Map();
  for (const c of clases) mapa.set(`${c.grupo}|${c.hora}`, c);

  const cabecera = el('tr', {}, [el('th', {}, 'Grupo')].concat(modulos.map(m =>
    el('th', { class: 'hcol' }, [
      el('div', {}, ordinalHora(m.n)),
      m.inicio ? el('div', { class: 'muted', style: 'font-weight:500' }, `${m.inicio}–${m.fin}`) : null,
    ]))));

  const filas = grupos.map(g => el('tr', {}, [el('td', { class: 'grp' }, g)].concat(modulos.map(m => {
    const clase = mapa.get(`${g}|${m.n}`);
    return el('td', {}, celda(ctx, clase, { anio, dia, hora: m.n, grupo: g, turno, ausentes }));
  }))));

  return tarjeta(
    `${DIAS[dia]} · ${grupos.length} grupos`,
    el('div', { class: 'card-pad table-wrap' },
      el('table', { class: 'grid-horario' }, [el('thead', {}, cabecera), el('tbody', {}, filas)])),
    ausentes.size ? el('span', { class: 'chip warn' }, `${ausentes.size} docente(s) con aviso de inasistencia ese día`) : null,
  );
}

function celda(ctx, clase, info) {
  if (!clase) {
    const nueva = el('div', { class: 'celda vacia' }, '+');
    if (puede('editarHorarios')) {
      nueva.title = 'Agregar clase';
      nueva.onclick = () => dialogoClase(ctx, info);
    } else nueva.textContent = '';
    return nueva;
  }
  const ausente = info.ausentes && info.ausentes.has(claveDocente(clase.docente));
  const nodo = el('div', {
    class: `celda ${ausente ? 'ausente' : ''}`,
    style: `background:${colorDeTexto(clase.materia)}; color:${colorTextoDeTexto(clase.materia)}`,
    title: `${clase.materia} · ${clase.docente}${clase.salon ? ' · salón ' + clase.salon : ''}${ausente ? ' · DOCENTE AUSENTE' : ''}`,
    onclick: () => dialogoClase(ctx, info, clase),
  }, [
    el('span', { class: 'm' }, clase.materia || '—'),
    el('span', { class: 'd' }, clase.docente || ''),
  ]);
  return nodo;
}

/* ---------------- por grupo ---------------- */

function vistaPorGrupo(ctx, { anio, grupo, turno }) {
  const estado = ctx.estado;
  const clases = estado.horarios.filter(c => Number(c.anio) === anio && c.grupo === grupo);
  if (!clases.length) return tarjeta(grupo || 'Grupo', vacio('Ese grupo no tiene clases cargadas.', '🪑'));

  const turnoGrupo = clases[0].turno || turno;
  const modulos = modulosDe(estado.config, turnoGrupo);
  const mapa = new Map(clases.map(c => [`${c.dia}|${c.hora}`, c]));

  const cabecera = el('tr', {}, [el('th', {}, 'Hora')].concat(
    [1, 2, 3, 4, 5].map(d => el('th', {}, DIAS[d]))));

  const filas = modulos.map(m => el('tr', {}, [
    el('td', { class: 'grp' }, [
      el('div', {}, ordinalHora(m.n)),
      m.inicio ? el('div', { class: 'muted', style: 'font-weight:500;font-size:10px' }, m.inicio) : null,
    ]),
  ].concat([1, 2, 3, 4, 5].map(d => {
    const clase = mapa.get(`${d}|${m.n}`);
    return el('td', {}, celda(ctx, clase, { anio, dia: d, hora: m.n, grupo, turno: turnoGrupo }));
  }))));

  const resumen = resumenMaterias(clases);

  return el('div', { class: 'grid grid-2' }, [
    tarjeta(`Grupo ${grupo} · semana completa`,
      el('div', { class: 'card-pad table-wrap' },
        el('table', { class: 'grid-horario' }, [el('thead', {}, cabecera), el('tbody', {}, filas)]))),
    tarjeta('Materias y docentes', el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
      el('thead', {}, el('tr', {}, ['Materia', 'Docente', 'Horas'].map(t => el('th', {}, t)))),
      el('tbody', {}, resumen.map(r => el('tr', {}, [
        el('td', {}, r.materia),
        el('td', {}, r.docente),
        el('td', { class: 'mono' }, String(r.horas)),
      ]))),
    ]))),
  ]);
}

function resumenMaterias(clases) {
  const mapa = new Map();
  for (const c of clases) {
    const k = `${c.materia}|${c.docente}`;
    if (!mapa.has(k)) mapa.set(k, { materia: c.materia, docente: c.docente, horas: 0 });
    mapa.get(k).horas++;
  }
  return Array.from(mapa.values()).sort((a, b) => compararNatural(a.materia, b.materia));
}

/* ---------------- por docente ---------------- */

function vistaPorDocente(ctx, { anio, docente }) {
  const estado = ctx.estado;
  const clave = claveDocente(docente);
  const clases = estado.horarios
    .filter(c => Number(c.anio) === anio && claveDocente(c.docente) === clave)
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora);
  if (!clases.length) return tarjeta(docente || 'Docente', vacio('Ese docente no tiene clases cargadas.', '🧑‍🏫'));

  const turnoDocente = clases[0].turno;
  const modulos = modulosDe(estado.config, turnoDocente);
  const mapa = new Map(clases.map(c => [`${c.dia}|${c.hora}`, c]));

  const cabecera = el('tr', {}, [el('th', {}, 'Hora')].concat([1, 2, 3, 4, 5].map(d => el('th', {}, DIAS_CORTOS[d]))));
  const filas = modulos.map(m => el('tr', {}, [
    el('td', { class: 'grp' }, ordinalHora(m.n)),
  ].concat([1, 2, 3, 4, 5].map(d => {
    const clase = mapa.get(`${d}|${m.n}`);
    if (!clase) return el('td', {}, el('div', { class: 'celda vacia' }, ''));
    return el('td', {}, el('div', {
      class: 'celda',
      style: `background:${colorDeTexto(clase.materia)}; color:${colorTextoDeTexto(clase.materia)}`,
      title: `${clase.grupo} · ${clase.materia}`,
      onclick: () => dialogoClase(ctx, { anio, dia: d, hora: m.n, grupo: clase.grupo, turno: clase.turno }, clase),
    }, [
      el('span', { class: 'm' }, clase.grupo),
      el('span', { class: 'd' }, clase.materia),
    ]));
  }))));

  const porDia = [1, 2, 3, 4, 5].map(d => ({
    dia: d,
    horas: clases.filter(c => c.dia === d).length,
  }));

  return el('div', { class: 'grid grid-2' }, [
    tarjeta(`${docente} · semana`,
      el('div', { class: 'card-pad table-wrap' },
        el('table', { class: 'grid-horario' }, [el('thead', {}, cabecera), el('tbody', {}, filas)]))),
    tarjeta('Carga horaria', el('div', { class: 'card-pad stack' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'chip pri' }, `${clases.length} horas semanales`),
        el('span', { class: 'chip' }, `${new Set(clases.map(c => c.grupo)).size} grupos`),
        el('span', { class: 'chip' }, `${new Set(clases.map(c => c.materia)).size} materias`),
      ]),
      el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, ['Día', 'Horas', 'Grupos'].map(t => el('th', {}, t)))),
        el('tbody', {}, porDia.map(p => el('tr', {}, [
          el('td', {}, DIAS[p.dia]),
          el('td', { class: 'mono' }, String(p.horas)),
          el('td', {}, Array.from(new Set(clases.filter(c => c.dia === p.dia).map(c => c.grupo))).join(', ') || '—'),
        ]))),
      ])),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => ctx.ir('inasistencias', { q: docente, tab: 'historial' }),
      }, '🔎 Ver inasistencias de este docente'),
    ])),
  ]);
}

/* ---------------- búsqueda ---------------- */

function vistaBusqueda(ctx, { anio, q }) {
  const estado = ctx.estado;
  const clases = estado.horarios.filter(c => Number(c.anio) === anio && (
    contiene(c.docente, q) || contiene(c.materia, q) || contiene(c.grupo, q) || contiene(c.salon, q)));

  if (!q) return tarjeta('Buscar en el horario', vacio('Escribí un docente, una materia, un grupo o un salón.', '🔎'));
  if (!clases.length) return tarjeta('Buscar en el horario', vacio(`Sin resultados para “${q}”.`, '🔎'));

  return tarjeta(`${clases.length} resultado(s) para “${q}”`,
    el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
      el('thead', {}, el('tr', {}, ['Día', 'Hora', 'Turno', 'Grupo', 'Materia', 'Docente', 'Salón', ''].map(t => el('th', {}, t)))),
      el('tbody', {}, clases
        .sort((a, b) => a.dia - b.dia || a.hora - b.hora)
        .slice(0, 300)
        .map(c => el('tr', {}, [
          el('td', {}, DIAS[c.dia]),
          el('td', { class: 'mono' }, [
            ordinalHora(c.hora),
            el('div', { class: 'muted small' }, horarioDeModulo(estado.config, c.turno, c.hora)),
          ]),
          el('td', {}, c.turno || '—'),
          el('td', {}, c.grupo),
          el('td', {}, c.materia),
          el('td', {}, c.docente),
          el('td', {}, c.salon || '—'),
          el('td', { class: 'actions' }, puede('editarHorarios')
            ? el('button', {
                class: 'icon-btn plain', type: 'button', title: 'Editar',
                onclick: () => dialogoClase(ctx, { anio: c.anio, dia: c.dia, hora: c.hora, grupo: c.grupo, turno: c.turno }, c),
              }, '✏️')
            : null),
        ]))),
    ])));
}

/* ---------------- alta / edición de clase ---------------- */

export async function dialogoClase(ctx, contexto, clase = null) {
  const estado = ctx.estado;
  const anio = Number(contexto.anio) || anioActivo(estado.config);
  const soloLectura = !puede('editarHorarios');

  if (soloLectura) {
    if (!clase) return;
    await modalFormulario({
      titulo: 'Clase', textoOk: 'Cerrar',
      campos: [
        { name: 'materia', label: 'Materia', valor: clase.materia },
        { name: 'docente', label: 'Docente', valor: clase.docente },
        { name: 'grupo', label: 'Grupo', valor: clase.grupo },
        { name: 'salon', label: 'Salón', valor: clase.salon },
      ],
    });
    return;
  }

  const datos = await modalFormulario({
    titulo: clase ? 'Editar clase' : 'Agregar clase',
    textoOk: clase ? 'Guardar' : 'Agregar',
    campos: [
      { name: 'dia', label: 'Día', tipo: 'select', requerido: true, opciones: [1, 2, 3, 4, 5, 6].map(d => ({ valor: d, texto: DIAS[d] })) },
      { name: 'hora', label: 'Hora / módulo', tipo: 'number', min: 1, max: 12, requerido: true },
      { name: 'turno', label: 'Turno', tipo: 'select', opciones: [{ valor: '', texto: '(sin turno)' }].concat(estado.config.turnos.map(t => ({ valor: t.id, texto: t.nombre }))) },
      { name: 'grupo', label: 'Grupo', requerido: true, lista: listaGrupos(estado, anio) },
      { name: 'materia', label: 'Materia', lista: listaMaterias(estado, anio) },
      { name: 'docente', label: 'Docente', lista: listaDocentes(estado, anio) },
      { name: 'salon', label: 'Salón' },
    ],
    valores: clase || { dia: contexto.dia, hora: contexto.hora, grupo: contexto.grupo, turno: contexto.turno },
    accionExtra: clase ? { texto: '🗑️ Eliminar', valor: { __accion: 'eliminar' } } : null,
  });
  if (!datos) return;

  if (datos.__accion === 'eliminar') {
    await borrarClase(ctx, clase);
    return;
  }

  try {
    await guardarClase({ ...(clase || {}), ...datos, anio, dia: Number(datos.dia), hora: Number(datos.hora) });
    avisoOk(clase ? 'Clase actualizada.' : 'Clase agregada.');
    ctx.refrescar();
  } catch (e) {
    avisoError(e.message || 'No se pudo guardar la clase.');
  }
}

export async function borrarClase(ctx, clase) {
  const ok = await confirmar(`¿Eliminar ${clase.materia} de ${clase.grupo} (${DIAS[clase.dia]}, ${ordinalHora(clase.hora)})?`,
    { titulo: 'Eliminar clase', textoOk: 'Eliminar', peligro: true });
  if (!ok) return;
  await eliminarClase(clase.id);
  avisoOk('Clase eliminada.');
  ctx.refrescar();
}
