/*
 * Datos de demostración.
 *
 * Se usan cuando la aplicación funciona en modo "demo" (sin backend de Google),
 * para poder ver todas las pantallas funcionando: horario institucional completo
 * de un año, avisos de inasistencia y un parte diario ya trabajado.
 * Los nombres son ficticios.
 */

import { CONFIG_POR_DEFECTO } from './modelo.js';
import { claveDocente, hoyISO, sumarDias, diaSemana, uid } from './utils.js';

const DOCENTES = {
  'Idioma Español': ['Guardia, Silvia', 'Fraigola, Silvia', 'Laviano, Mónica'],
  'Literatura': ['Falcón, Claudia', 'Guardia, Silvia'],
  'Matemática': ['Mora, María Pía', 'Pereyra, Horacio', 'Sosa, Andrés'],
  'Historia': ['Silveira, Juan Pedro', 'Olano, M. Eugenia'],
  'Geografía': ['Da Fonte, Alejandra', 'Lusardo, Josefina'],
  'Biología': ['Ibarra, Yanely', 'Javiel, Laura'],
  'Física': ['Furtado, Cecilia', 'Pereyra, Horacio'],
  'Química': ['Ferreira, Martín', 'Furtado, Cecilia'],
  'Inglés': ['Baz, Mariana', 'Bittencourt, Valentina'],
  'Ed. Musical': ['Ychuste, Gonzalo', 'Olivera, Mauricio'],
  'Com. Visual': ['González, Natalia', 'Rodríguez, Paula'],
  'Ed. Física': ['Méndez, Rodrigo', 'Cabrera, Lucía'],
  'Cs. de la Computación': ['Reynoso, Katya', 'Sosa, Andrés'],
};

const PLANES = {
  7: [['Idioma Español', 4], ['Matemática', 4], ['Historia', 3], ['Geografía', 3], ['Biología', 3],
      ['Inglés', 3], ['Ed. Física', 2], ['Ed. Musical', 2], ['Com. Visual', 2], ['Cs. de la Computación', 2]],
  8: [['Idioma Español', 4], ['Matemática', 4], ['Historia', 3], ['Geografía', 3], ['Biología', 3],
      ['Inglés', 3], ['Física', 2], ['Ed. Física', 2], ['Ed. Musical', 2], ['Cs. de la Computación', 2]],
  9: [['Idioma Español', 3], ['Literatura', 3], ['Matemática', 4], ['Historia', 3], ['Geografía', 2],
      ['Biología', 2], ['Física', 2], ['Química', 2], ['Inglés', 3], ['Com. Visual', 2], ['Ed. Física', 2]],
};

const GRUPOS = [
  { grupo: '7.º1', turno: 'matutino', salon: '1' },
  { grupo: '7.º2', turno: 'matutino', salon: '2' },
  { grupo: '8.º2', turno: 'matutino', salon: '3' },
  { grupo: '9.º2', turno: 'matutino', salon: '4' },
  { grupo: '7.º4', turno: 'vespertino', salon: '5' },
  { grupo: '7.º5', turno: 'vespertino', salon: '6' },
  { grupo: '8.º1', turno: 'vespertino', salon: '7' },
  { grupo: '8.º5', turno: 'vespertino', salon: '8' },
  { grupo: '8.º6', turno: 'vespertino', salon: '9' },
  { grupo: '8.º7', turno: 'vespertino', salon: '10' },
  { grupo: '9.º1', turno: 'vespertino', salon: '11' },
  { grupo: '9.º5', turno: 'vespertino', salon: '12' },
];

/* Miércoles de 8.º5 fijado a mano (es el ejemplo que recorre toda la aplicación). */
const ANCLAS = [
  { grupo: '8.º5', dia: 3, hora: 2, materia: 'Ed. Musical', docente: 'Ychuste, Gonzalo' },
  { grupo: '8.º5', dia: 3, hora: 3, materia: 'Inglés', docente: 'Baz, Mariana' },
  { grupo: '8.º5', dia: 3, hora: 4, materia: 'Geografía', docente: 'Da Fonte, Alejandra' },
  { grupo: '8.º5', dia: 3, hora: 5, materia: 'Cs. de la Computación', docente: 'Reynoso, Katya' },
  { grupo: '8.º5', dia: 3, hora: 7, materia: 'Idioma Español', docente: 'Laviano, Mónica' },
];

/* Generador pseudoaleatorio determinista: el demo es siempre igual. */
function prng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mezclar(lista, rnd) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function generarHorario(anio) {
  const rnd = prng(anio * 7919);
  const clases = [];
  const ocupado = new Set();                 // dia|hora|turno|docente
  const marcar = (c) => ocupado.add(`${c.dia}|${c.hora}|${c.turno}|${claveDocente(c.docente)}`);
  const libre = (dia, hora, turno, docente) => !ocupado.has(`${dia}|${hora}|${turno}|${claveDocente(docente)}`);

  const anclasPorGrupo = new Map();
  for (const a of ANCLAS) {
    if (!anclasPorGrupo.has(a.grupo)) anclasPorGrupo.set(a.grupo, []);
    anclasPorGrupo.get(a.grupo).push(a);
  }

  for (const info of GRUPOS) {
    const nivel = Number(info.grupo[0]);
    const plan = PLANES[nivel] || PLANES[7];
    const idxGrupo = GRUPOS.indexOf(info);

    // Bolsa de horas semanales del grupo.
    let bolsa = [];
    for (const [materia, horas] of plan) {
      const posibles = DOCENTES[materia] || ['Sin asignar'];
      const docente = posibles[idxGrupo % posibles.length];
      for (let i = 0; i < horas; i++) bolsa.push({ materia, docente });
    }
    bolsa = mezclar(bolsa, rnd);

    const ocupadasDelGrupo = new Set();
    for (const ancla of (anclasPorGrupo.get(info.grupo) || [])) {
      const clase = { ...ancla, id: uid('cl'), anio, turno: info.turno, salon: info.salon };
      clases.push(clase);
      marcar(clase);
      ocupadasDelGrupo.add(`${clase.dia}|${clase.hora}`);
      const i = bolsa.findIndex(b => b.materia === ancla.materia);
      if (i >= 0) bolsa.splice(i, 1);
    }

    for (let dia = 1; dia <= 5; dia++) {
      const porDia = new Map();
      for (let hora = 1; hora <= 6; hora++) {
        if (ocupadasDelGrupo.has(`${dia}|${hora}`)) continue;
        const i = bolsa.findIndex(b =>
          libre(dia, hora, info.turno, b.docente) && (porDia.get(b.materia) || 0) < 2);
        if (i < 0) continue;
        const [item] = bolsa.splice(i, 1);
        porDia.set(item.materia, (porDia.get(item.materia) || 0) + 1);
        const clase = {
          id: uid('cl'), anio, turno: info.turno, dia, hora,
          grupo: info.grupo, materia: item.materia, docente: item.docente, salon: info.salon,
        };
        clases.push(clase);
        marcar(clase);
      }
    }
  }
  return clases.sort((a, b) => a.dia - b.dia || a.hora - b.hora || a.grupo.localeCompare(b.grupo));
}

/** Devuelve una fecha hábil (lunes a viernes) desplazada n días hábiles desde hoy. */
function fechaHabil(desplazamiento) {
  let iso = hoyISO();
  const paso = desplazamiento >= 0 ? 1 : -1;
  let restantes = Math.abs(desplazamiento);
  while (diaSemana(iso) > 5) iso = sumarDias(iso, 1);
  while (restantes > 0) {
    iso = sumarDias(iso, paso);
    if (diaSemana(iso) <= 5) restantes--;
  }
  return iso;
}

function docenteConClases(clases, fechaISO, turno, evitar = []) {
  const dia = diaSemana(fechaISO);
  const conteo = new Map();
  for (const c of clases) {
    if (c.dia !== dia || (turno && c.turno !== turno)) continue;
    conteo.set(c.docente, (conteo.get(c.docente) || 0) + 1);
  }
  const evitarClaves = new Set(evitar.map(claveDocente));
  const orden = Array.from(conteo.entries())
    .filter(([d]) => !evitarClaves.has(claveDocente(d)))
    .sort((a, b) => b[1] - a[1]);
  return orden.length ? orden[0][0] : '';
}

export function datosDemo() {
  const anioActual = new Date().getFullYear();
  const clases = generarHorario(anioActual);

  const hoy = fechaHabil(0);
  const manana = fechaHabil(1);
  const pasado = fechaHabil(2);
  const ayer = fechaHabil(-1);

  const d1 = docenteConClases(clases, hoy, 'vespertino') || 'Da Fonte, Alejandra';
  const d2 = docenteConClases(clases, hoy, 'matutino', [d1]) || 'Lusardo, Josefina';
  const d3 = docenteConClases(clases, manana, 'vespertino', [d1, d2]) || 'Baz, Mariana';
  const d4 = docenteConClases(clases, pasado, 'vespertino', [d1, d2, d3]) || 'Ychuste, Gonzalo';
  const d5 = docenteConClases(clases, ayer, 'vespertino', [d1]) || 'Reynoso, Katya';

  const ahora = new Date();
  const haceHoras = h => new Date(ahora.getTime() - h * 3600 * 1000).toISOString();

  const inasistencias = [
    {
      id: 'ina_demo_1', timestamp: haceHoras(2), docente: d1, fecha: hoy,
      liceo: 'Liceo N.º 5', turno: 'vespertino', motivo: 'Licencia médica',
      observaciones: 'Certificado presentado en Secretaría.', estado: 'nueva', origen: 'formulario', horas: [],
    },
    {
      id: 'ina_demo_2', timestamp: haceHoras(5), docente: d2, fecha: hoy,
      liceo: 'Liceo N.º 5', turno: 'matutino', motivo: 'Inasistencia',
      observaciones: '', estado: 'revisada', origen: 'formulario', horas: [],
    },
    {
      id: 'ina_demo_3', timestamp: haceHoras(20), docente: d3, fecha: manana,
      liceo: 'Liceo N.º 5', turno: 'vespertino', motivo: 'Actividad institucional',
      observaciones: 'Asiste a una jornada de formación.', estado: 'nueva', origen: 'formulario', horas: [],
    },
    {
      id: 'ina_demo_4', timestamp: haceHoras(26), docente: d4, fecha: pasado,
      liceo: 'Liceo N.º 5', turno: 'vespertino', motivo: 'Licencia por estudio',
      observaciones: 'Examen.', estado: 'nueva', origen: 'formulario', horas: [],
    },
    {
      id: 'ina_demo_5', timestamp: haceHoras(30), docente: d5, fecha: ayer,
      liceo: 'Liceo N.º 5', turno: 'vespertino', motivo: 'Inasistencia',
      observaciones: '', estado: 'revisada', origen: 'formulario', horas: [],
    },
  ];

  // Parte del día anterior, ya trabajado por Adscripción.
  const diaAyer = diaSemana(ayer);
  const filasAyer = clases
    .filter(c => c.dia === diaAyer && claveDocente(c.docente) === claveDocente(d5))
    .map((c, i) => ({
      id: `pd_demo_${i}`, fecha: ayer, hora: c.hora, turno: c.turno, docente: d5,
      grupo: c.grupo, materia: c.materia, salon: c.salon, motivo: 'Inasistencia',
      cobertura: i === 0 ? 'Ferreira, Martín' : '',
      observaciones: i === 0 ? 'Cubre la hora con trabajo de aula.' : '',
      origen: 'automatico', editado: false, inasistenciaId: 'ina_demo_5',
    }));

  const config = {
    ...structuredClone(CONFIG_POR_DEFECTO),
    liceo: 'Liceo N.º 5',
    liceos: ['Liceo N.º 5'],
    anioActivo: anioActual,
    anios: [
      { anio: anioActual - 1, estado: 'archivado', origen: 'horario_' + (anioActual - 1) + '.xlsx', actualizado: '', clases: 0 },
      { anio: anioActual, estado: 'activo', origen: 'datos de demostración', actualizado: new Date().toISOString(), clases: clases.length },
      { anio: anioActual + 1, estado: 'pendiente', origen: '', actualizado: '', clases: 0 },
    ],
  };

  return {
    config,
    horarios: clases,
    inasistencias,
    partes: filasAyer.length
      ? { [ayer]: { fecha: ayer, filas: filasAyer, cerrado: true, actualizado: new Date().toISOString() } }
      : {},
  };
}

