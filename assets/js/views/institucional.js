/* Horarios institucionales: un horario por año lectivo, con importación de planillas. */

import { el, clear, fmtFechaHora, DIAS, compararNatural, ordinalHora } from '../utils.js';
import { vacio, tarjeta, abrirModal, confirmar, avisoOk, avisoError, avisoAtencion } from '../ui.js';
import { anioActivo } from '../modelo.js';
import { listaDocentes, listaGrupos } from '../logica.js';
import { reemplazarHorarioAnio, definirAnioActivo, agregarAnio, eliminarAnio } from '../db.js';
import { leerArchivo, detectarMapeo, clasesDesdeLista, clasesDesdeMatriz, detectarSuperposiciones } from '../importar.js';
import { exportarHojas } from '../exportar.js';
import { puede } from '../sesion.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const admin = puede('editarHorarios');
  const anios = (estado.config.anios || []).slice().sort((a, b) => a.anio - b.anio);
  const activo = anioActivo(estado.config);

  ctx.setTitulo('Horarios institucionales', `Año activo: ${activo}`);
  ctx.setAcciones([
    admin ? el('button', {
      class: 'btn', type: 'button',
      onclick: async () => {
        const siguiente = Math.max(...anios.map(a => Number(a.anio)), new Date().getFullYear()) + 1;
        await agregarAnio(siguiente);
        avisoOk(`Año ${siguiente} agregado.`);
        ctx.refrescar();
      },
    }, '＋ Agregar año') : null,
  ]);

  const tarjetas = anios.map(a => {
    const clases = estado.horarios.filter(c => Number(c.anio) === Number(a.anio));
    const esActivo = a.estado === 'activo';
    return el('div', { class: `card anio-card ${esActivo ? 'activo' : ''}` }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'y' }, String(a.anio)),
        el('span', {
          class: `chip ${esActivo ? 'ok' : (a.estado === 'pendiente' ? 'warn' : '')}`,
          style: 'margin-left:auto',
        }, esActivo ? 'Activo' : (a.estado === 'pendiente' ? 'Pendiente' : 'Archivado')),
      ]),
      el('p', { class: 'muted small' }, clases.length
        ? `${clases.length} clases · ${new Set(clases.map(c => c.grupo)).size} grupos · ${new Set(clases.map(c => c.docente)).size} docentes`
        : 'Sin horario cargado'),
      a.actualizado ? el('p', { class: 'muted small' }, `Actualizado: ${fmtFechaHora(a.actualizado)}`) : null,
      a.origen ? el('p', { class: 'muted small' }, `Origen: ${a.origen}`) : null,
      el('div', { class: 'row' }, [
        clases.length ? el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: () => ctx.ir('horarios', { anio: a.anio }),
        }, 'Ver') : null,
        admin ? el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          onclick: () => dialogoImportar(ctx, Number(a.anio)),
        }, clases.length ? 'Reemplazar' : 'Subir horario') : null,
        admin && !esActivo ? el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: async () => {
            await definirAnioActivo(a.anio);
            avisoOk(`El año ${a.anio} pasó a ser el activo.`);
            ctx.refrescar();
          },
        }, 'Marcar activo') : null,
        clases.length ? el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: () => exportarAnio(estado, Number(a.anio)),
        }, '⬇️ Exportar') : null,
        admin && !esActivo ? el('button', {
          class: 'btn btn-sm btn-danger', type: 'button',
          onclick: async () => {
            const ok = await confirmar(`¿Eliminar el año ${a.anio} y sus ${clases.length} clases?`,
              { titulo: 'Eliminar año', textoOk: 'Eliminar', peligro: true });
            if (!ok) return;
            await eliminarAnio(a.anio);
            avisoOk('Año eliminado.');
            ctx.refrescar();
          },
        }, '🗑️') : null,
      ]),
    ]);
  });

  const clasesActivo = estado.horarios.filter(c => Number(c.anio) === activo);
  const detalle = clasesActivo.length
    ? el('div', { class: 'card-pad grid grid-3' }, [
        dato('Clases', clasesActivo.length),
        dato('Grupos', listaGrupos(estado, activo).length),
        dato('Docentes', listaDocentes(estado, activo).length),
        dato('Turnos', new Set(clasesActivo.map(c => c.turno).filter(Boolean)).size || 1),
        dato('Materias', new Set(clasesActivo.map(c => c.materia).filter(Boolean)).size),
        dato('Días con clases', new Set(clasesActivo.map(c => c.dia)).size),
      ])
    : vacio('El año activo no tiene horario cargado.', '🗓️');

  host.append(el('div', { class: 'stack' }, [
    el('div', { class: 'grid grid-3' }, tarjetas.length ? tarjetas : [vacio('No hay años configurados.', '📁')]),
    tarjeta(`Resumen del año activo (${activo})`, detalle),
    tarjeta('Cómo se carga un horario', el('div', { class: 'card-pad stack' }, [
      el('p', { class: 'small' }, 'Se admiten planillas XLSX, ODS y CSV en dos disposiciones:'),
      el('ul', { class: 'small muted', style: 'margin:0; padding-left:18px' }, [
        el('li', {}, el('span', { html: '<b>Lista</b>: una fila por clase, con columnas Día, Hora, Grupo, Materia, Docente, Salón y Turno.' })),
        el('li', {}, el('span', { html: '<b>Matriz</b>: la grilla de pared, con los grupos en la primera columna y las horas en la primera fila. Cada celda puede decir “Materia / Docente”.' })),
      ]),
      el('p', { class: 'small muted' },
        'Los PDF no se interpretan automáticamente: representan la apariencia de la tabla, no su estructura. Conviene exportar el horario a planilla antes de subirlo.'),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => descargarPlantilla('lista') }, '⬇️ Plantilla lista (CSV)'),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => descargarPlantilla('matriz') }, '⬇️ Plantilla matriz (CSV)'),
      ]),
    ])),
  ]));
}

function dato(k, v) {
  return el('div', {}, [
    el('div', { class: 'k muted small', text: k }),
    el('div', { style: 'font-size:22px;font-weight:700' }, String(v)),
  ]);
}

/* ---------------- exportación / plantillas ---------------- */

function exportarAnio(estado, anio) {
  const clases = estado.horarios.filter(c => Number(c.anio) === anio)
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora || compararNatural(a.grupo, b.grupo));
  const filas = [['Año', 'Día', 'DíaNombre', 'Hora', 'Turno', 'Grupo', 'Materia', 'Docente', 'Salón']];
  for (const c of clases) {
    filas.push([c.anio, c.dia, DIAS[c.dia] || '', c.hora, c.turno, c.grupo, c.materia, c.docente, c.salon]);
  }
  exportarHojas([{ nombre: `Horario ${anio}`, filas }], `Horario institucional ${anio}`, 'ods');
  avisoOk('Horario exportado en formato ODS.');
}

function descargarPlantilla(tipo) {
  const filas = tipo === 'lista'
    ? [
        ['Dia', 'Hora', 'Turno', 'Grupo', 'Materia', 'Docente', 'Salon'],
        ['Miércoles', '3', 'vespertino', '8.º5', 'Geografía', 'Da Fonte, Alejandra', '12'],
        ['Miércoles', '4', 'vespertino', '8.º5', 'Cs. de la Computación', 'Reynoso, Katya', '12'],
      ]
    : [
        ['Grupo', '1', '2', '3', '4', '5', '6'],
        ['7.º4', 'Biología / Ibarra, Yanely', 'Matemática / Mora, María Pía', '', 'Inglés / Baz, Mariana', '', ''],
        ['8.º5', '', 'Ed. Musical / Ychuste, Gonzalo', 'Inglés / Baz, Mariana', 'Geografía / Da Fonte, Alejandra', '', ''],
      ];
  exportarHojas([{ nombre: 'Plantilla', filas }], `Plantilla horario ${tipo}`, 'csv');
}

/* ---------------- asistente de importación ---------------- */

export function dialogoImportar(ctx, anio) {
  const estado = ctx.estado;
  const cuerpo = el('div', { class: 'stack' });
  const cerrar = abrirModal({ titulo: `Cargar horario institucional ${anio}`, ancho: 'wide', cuerpo });

  const paso1 = () => {
    clear(cuerpo);
    const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.xls,.ods', style: 'display:none' });
    const zona = el('div', { class: 'drop' }, [
      el('p', {}, el('strong', {}, 'Arrastrá la planilla acá o hacé clic para elegirla')),
      el('p', { class: 'small' }, 'Formatos: XLSX · ODS · CSV'),
    ]);
    zona.onclick = () => input.click();
    zona.ondragover = (ev) => { ev.preventDefault(); zona.classList.add('over'); };
    zona.ondragleave = () => zona.classList.remove('over');
    zona.ondrop = (ev) => {
      ev.preventDefault();
      zona.classList.remove('over');
      if (ev.dataTransfer.files[0]) procesar(ev.dataTransfer.files[0]);
    };
    input.onchange = () => { if (input.files[0]) procesar(input.files[0]); };

    cuerpo.append(
      el('p', { class: 'muted small' }, `Se reemplazará por completo el horario del año ${anio}.`),
      zona, input,
    );
  };

  async function procesar(archivo) {
    clear(cuerpo).append(el('p', { class: 'muted' }, 'Leyendo la planilla…'));
    try {
      const lectura = await leerArchivo(archivo);
      paso2(lectura);
    } catch (e) {
      clear(cuerpo).append(
        el('p', { class: 'chip warn', style: 'display:block;padding:10px' }, e.message || 'No se pudo leer el archivo.'),
        el('button', { class: 'btn', type: 'button', onclick: paso1 }, '← Probar con otro archivo'),
      );
    }
  }

  function paso2(lectura) {
    const opciones = {
      hoja: 0,
      disposicion: 'lista',
      dia: 1,
      turno: estado.config.turnos[0] ? estado.config.turnos[0].id : '',
      tieneEncabezado: true,
      mapeo: {},
    };

    const render = () => {
      clear(cuerpo);
      const matriz = lectura.hojas[opciones.hoja].matriz;
      const encabezados = matriz[0] || [];
      if (!Object.keys(opciones.mapeo).length) opciones.mapeo = detectarMapeo(encabezados);

      const resultado = opciones.disposicion === 'lista'
        ? clasesDesdeLista(matriz, opciones.mapeo, { anio, turnoPorDefecto: opciones.turno, tieneEncabezado: opciones.tieneEncabezado })
        : clasesDesdeMatriz(matriz, { anio, dia: Number(opciones.dia), turno: opciones.turno });

      const choques = detectarSuperposiciones(resultado.clases);

      const selectorHoja = lectura.hojas.length > 1
        ? campo('Hoja', el('select', {
            onchange: (ev) => { opciones.hoja = Number(ev.target.value); opciones.mapeo = {}; render(); },
          }, lectura.hojas.map((h, i) => el('option', { value: i, selected: i === opciones.hoja }, h.nombre))))
        : null;

      const selectorDisposicion = campo('Disposición', el('select', {
        onchange: (ev) => { opciones.disposicion = ev.target.value; render(); },
      }, [
        el('option', { value: 'lista', selected: opciones.disposicion === 'lista' }, 'Lista (una fila por clase)'),
        el('option', { value: 'matriz', selected: opciones.disposicion === 'matriz' }, 'Matriz (grupos × horas de un día)'),
      ]));

      const camposMapeo = opciones.disposicion === 'lista'
        ? el('div', { class: 'grid grid-3' }, ['dia', 'hora', 'grupo', 'materia', 'docente', 'salon', 'turno'].map(campoNombre =>
            campo(etiquetaCampo(campoNombre), el('select', {
              onchange: (ev) => {
                const v = ev.target.value;
                if (v === '') delete opciones.mapeo[campoNombre];
                else opciones.mapeo[campoNombre] = Number(v);
                render();
              },
            }, [el('option', { value: '' }, '(ninguna)')].concat(
              encabezados.map((h, i) => el('option', {
                value: i, selected: opciones.mapeo[campoNombre] === i,
              }, `${i + 1}. ${h || '(sin título)'}`)))))))
        : el('div', { class: 'grid grid-2' }, [
            campo('Día de la grilla', el('select', {
              onchange: (ev) => { opciones.dia = Number(ev.target.value); render(); },
            }, [1, 2, 3, 4, 5, 6].map(d => el('option', { value: d, selected: Number(opciones.dia) === d }, DIAS[d])))),
            campo('Turno', el('select', {
              onchange: (ev) => { opciones.turno = ev.target.value; render(); },
            }, [el('option', { value: '' }, '(sin turno)')].concat(
              estado.config.turnos.map(t => el('option', { value: t.id, selected: opciones.turno === t.id }, t.nombre))))),
          ]);

      const previa = el('div', { class: 'preview-tbl' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Día', 'Hora', 'Turno', 'Grupo', 'Materia', 'Docente', 'Salón'].map(t => el('th', {}, t)))),
        el('tbody', {}, resultado.clases.slice(0, 12).map(c => el('tr', {}, [
          el('td', {}, DIAS[c.dia] || c.dia),
          el('td', {}, ordinalHora(c.hora)),
          el('td', {}, c.turno || '—'),
          el('td', {}, c.grupo),
          el('td', {}, c.materia || '—'),
          el('td', {}, c.docente || '—'),
          el('td', {}, c.salon || '—'),
        ]))),
      ]));

      cuerpo.append(
        el('div', { class: 'row' }, [
          el('span', { class: 'chip pri' }, lectura.fuente),
          el('span', { class: 'chip' }, `${resultado.clases.length} clases detectadas`),
          resultado.problemas.length ? el('span', { class: 'chip warn' }, `${resultado.problemas.length} fila(s) con problemas`) : null,
          choques.length ? el('span', { class: 'chip warn' }, `${choques.length} superposición(es) de docente`) : null,
        ]),
        el('div', { class: 'grid grid-2' }, [selectorHoja, selectorDisposicion].filter(Boolean)),
        camposMapeo,
        opciones.disposicion === 'lista'
          ? el('label', { class: 'row small muted', style: 'gap:6px' }, [
              (() => {
                const chk = el('input', { type: 'checkbox', style: 'width:auto' });
                chk.checked = opciones.tieneEncabezado;
                chk.onchange = () => { opciones.tieneEncabezado = chk.checked; render(); };
                return chk;
              })(),
              'La primera fila contiene los títulos de las columnas',
            ])
          : null,
        el('div', { class: 'sep' }),
        el('p', { class: 'small muted' }, 'Vista previa (primeras 12 clases):'),
        previa,
        resultado.problemas.length
          ? el('details', {}, [
              el('summary', { class: 'small muted' }, `Ver ${resultado.problemas.length} advertencia(s)`),
              el('ul', { class: 'small muted' }, resultado.problemas.slice(0, 40).map(p => el('li', {}, p))),
            ])
          : null,
        choques.length
          ? el('details', {}, [
              el('summary', { class: 'small muted' }, `Ver ${choques.length} superposición(es)`),
              el('ul', { class: 'small muted' }, choques.slice(0, 20).map(ch =>
                el('li', {}, `${ch.a.docente}: ${DIAS[ch.a.dia]} ${ordinalHora(ch.a.hora)} en ${ch.a.grupo} y ${ch.b.grupo}`))),
            ])
          : null,
        el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px' }, [
          el('button', { class: 'btn', type: 'button', onclick: paso1 }, '← Otro archivo'),
          el('button', {
            class: 'btn btn-primary', type: 'button',
            disabled: !resultado.clases.length,
            onclick: async () => {
              const ok = await confirmar(
                `Se reemplazará el horario ${anio} por ${resultado.clases.length} clases. ¿Confirmás?`,
                { titulo: 'Confirmar importación', textoOk: 'Importar' });
              if (!ok) return;
              try {
                await reemplazarHorarioAnio(anio, resultado.clases, { origen: lectura.fuente });
                avisoOk(`Horario ${anio} actualizado con ${resultado.clases.length} clases.`);
                if (choques.length) avisoAtencion(`Atención: quedaron ${choques.length} superposición(es) de docente.`);
                cerrar();
                ctx.refrescar();
              } catch (e) {
                avisoError(e.message || 'No se pudo guardar el horario.');
              }
            },
          }, `Importar ${resultado.clases.length} clases`),
        ]),
      );
    };

    render();
  }

  function campo(etiqueta, control) {
    return el('label', { class: 'field' }, [el('span', {}, etiqueta), control]);
  }

  function etiquetaCampo(nombre) {
    return {
      dia: 'Columna de Día', hora: 'Columna de Hora', grupo: 'Columna de Grupo',
      materia: 'Columna de Materia', docente: 'Columna de Docente',
      salon: 'Columna de Salón', turno: 'Columna de Turno',
    }[nombre] || nombre;
  }

  paso1();
  return cerrar;
}

