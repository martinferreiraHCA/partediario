/* Coberturas: quién puede cubrir cada hora que quedó sin docente. */

import { el, hoyISO, fmtFechaLarga, DIAS, diaSemana, ordinalHora } from '../utils.js';
import { vacio, tarjeta, abrirModal, avisoOk, avisoError } from '../ui.js';
import { sincronizarParte, sugerenciasCobertura, ordenFilas } from '../logica.js';
import { horarioDeModulo } from '../modelo.js';
import { guardarParte } from '../db.js';
import { puede } from '../sesion.js';
import { campoFecha } from './componentes.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const fecha = ctx.params().fecha || hoyISO();
  const editable = puede('editarParte');

  const { parte } = sincronizarParte(estado, fecha, estado.partes[fecha]);
  const filas = parte.filas.filter(f => f.grupo).sort(ordenFilas);
  const pendientes = filas.filter(f => !f.cobertura);

  ctx.setTitulo('Coberturas',
    `${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)} · ${pendientes.length} hora(s) sin cubrir`);
  ctx.setAcciones([
    el('button', { class: 'btn', type: 'button', onclick: () => ctx.ir('parte', { fecha }) }, '📝 Ir al parte diario'),
  ]);

  const barra = el('div', { class: 'toolbar' }, [
    campoFecha(fecha, v => { ctx.setParam('fecha', v); ctx.refrescar(); }, 'Día'),
    el('span', { class: 'chip' }, `${filas.length} hora(s) afectadas`),
    el('span', { class: pendientes.length ? 'chip warn' : 'chip ok' },
      pendientes.length ? `${pendientes.length} sin cobertura` : 'Todo cubierto'),
  ]);

  if (!filas.length) {
    host.append(el('div', { class: 'stack' }, [
      barra,
      tarjeta(null, vacio('No hay horas afectadas para esa fecha.', '🎉')),
    ]));
    return;
  }

  const tarjetas = filas.map(fila => {
    const sugerencias = sugerenciasCobertura(estado, {
      fecha, hora: fila.hora, turno: fila.turno, grupo: fila.grupo, excluir: fila.docente,
    }).slice(0, 4);

    return el('article', { class: `item ${fila.cobertura ? 'revisada' : 'nueva'}` }, [
      el('div', { class: 'item-head' }, [
        el('strong', {}, `${ordinalHora(fila.hora)} hora · ${fila.grupo}`),
        el('span', { class: 'chip' }, fila.materia || 'sin materia'),
        horarioDeModulo(estado.config, fila.turno, fila.hora)
          ? el('span', { class: 'chip info' }, horarioDeModulo(estado.config, fila.turno, fila.hora)) : null,
        fila.cobertura
          ? el('span', { class: 'chip ok', style: 'margin-left:auto' }, `Cubre: ${fila.cobertura}`)
          : el('span', { class: 'chip warn', style: 'margin-left:auto' }, 'Sin cobertura'),
      ]),
      el('div', { class: 'item-body' }, [
        el('span', {}, `Ausente: ${fila.docente}`),
        fila.salon ? el('span', {}, `Salón ${fila.salon}`) : null,
        el('span', {}, fila.motivo || 'Inasistencia'),
      ]),
      el('div', { class: 'clases' }, sugerencias.length
        ? sugerencias.map(s => el('span', { class: 'clase-pill', title: s.razon }, [
            el('b', {}, s.docente),
            el('span', { class: 'muted' }, s.razon),
          ]))
        : [el('span', { class: 'chip' }, 'No hay docentes disponibles en esa hora')]),
      editable ? el('div', { class: 'item-actions' }, [
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          onclick: async () => {
            const docente = await dialogoCobertura(ctx, {
              fecha, hora: fila.hora, turno: fila.turno, grupo: fila.grupo,
              docenteAusente: fila.docente, actual: fila.cobertura,
            });
            if (docente === null) return;
            await asignar(ctx, fecha, fila.id, docente);
          },
        }, fila.cobertura ? 'Cambiar cobertura' : 'Asignar cobertura'),
        fila.cobertura ? el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: () => asignar(ctx, fecha, fila.id, ''),
        }, 'Quitar') : null,
      ]) : null,
    ]);
  });

  host.append(el('div', { class: 'stack' }, [
    barra,
    el('div', { class: 'list' }, tarjetas),
    el('p', { class: 'hint' },
      'Las sugerencias salen del propio horario institucional: se descartan quienes ya tienen clase en esa hora y quienes avisaron inasistencia ese día.'),
  ]));
}

async function asignar(ctx, fecha, filaId, docente) {
  const estado = ctx.estado;
  const { parte } = sincronizarParte(estado, fecha, estado.partes[fecha]);
  const fila = parte.filas.find(f => f.id === filaId);
  if (!fila) return;
  fila.cobertura = docente;
  fila.editado = true;
  try {
    await guardarParte(fecha, parte);
    avisoOk(docente ? `Cobertura asignada a ${docente}.` : 'Cobertura quitada.');
    ctx.refrescar();
  } catch (e) {
    avisoError(e.message || 'No se pudo guardar la cobertura.');
  }
}

/* ---------------- diálogo de selección ---------------- */

/** Devuelve el nombre elegido, '' para quitar la cobertura, o null si se cancela. */
export function dialogoCobertura(ctx, { fecha, hora, turno, grupo, docenteAusente, actual = '' }) {
  const estado = ctx.estado;
  const sugerencias = sugerenciasCobertura(estado, { fecha, hora, turno, grupo, excluir: docenteAusente });

  return new Promise(resolve => {
    let resuelto = false;
    const manual = el('input', { type: 'text', value: actual, placeholder: 'Escribir otro nombre…' });

    const lista = sugerencias.length
      ? el('div', { class: 'list' }, sugerencias.map(s => el('article', { class: 'item' }, [
          el('div', { class: 'item-head' }, [
            el('strong', {}, s.docente),
            el('span', { class: 'chip info' }, `prioridad ${s.puntaje}`),
            el('button', {
              class: 'btn btn-sm btn-primary', type: 'button', style: 'margin-left:auto',
              onclick: () => { resuelto = true; resolve(s.docente); cerrar(); },
            }, 'Asignar'),
          ]),
          el('div', { class: 'item-body' }, [
            el('span', {}, s.razon),
            s.materias.length ? el('span', {}, `Materias: ${s.materias.join(', ')}`) : null,
            el('span', {}, `Horas ese día: ${s.horasEseDia.map(ordinalHora).join(', ') || '—'}`),
          ]),
        ])))
      : vacio('Ningún docente del horario está libre en esa hora.', '🤷');

    const cuerpo = el('div', { class: 'stack' }, [
      el('p', { class: 'muted small' },
        `${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)} · ${ordinalHora(hora)} hora · grupo ${grupo || '—'} · ausente: ${docenteAusente}`),
      lista,
      el('div', { class: 'sep' }),
      el('label', { class: 'field' }, [el('span', {}, 'Asignar manualmente'), manual]),
    ]);

    const cerrar = abrirModal({
      titulo: 'Asignar cobertura',
      ancho: 'wide',
      cuerpo,
      alCerrar: () => { if (!resuelto) resolve(null); },
      acciones: [
        actual ? { texto: 'Quitar cobertura', onClick: (c) => { resuelto = true; resolve(''); c(); } } : null,
        { texto: 'Cancelar', onClick: (c) => c() },
        {
          texto: 'Guardar', clase: 'btn-primary',
          onClick: (c) => { resuelto = true; resolve(manual.value.trim()); c(); },
        },
      ].filter(Boolean),
    });
  });
}
