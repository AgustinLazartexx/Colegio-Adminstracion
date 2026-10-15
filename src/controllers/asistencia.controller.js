import {
  databaseId,
  executeSql,
  isDatabaseId,
  normalizeDate,
  queryRows,
  sequelize,
} from "../services/relationalData.service.js";

const estadosValidos = new Set(["presente", "ausente", "tarde", "justificado"]);

const validarAccesoClase = async (claseId, user) => {
  const replacements = { claseId: databaseId(claseId), userId: databaseId(user.id) };
  const acceso = await queryRows(
    `SELECT HEX(c.id) AS id
     FROM clases c
     LEFT JOIN clase_profesores cp ON cp.clase_id = c.id AND cp.profesor_id = UNHEX(:userId)
     WHERE c.id = UNHEX(:claseId) AND (:isAdmin = 1 OR cp.profesor_id IS NOT NULL)
     LIMIT 1`,
    { ...replacements, isAdmin: user.rol === "admin" ? 1 : 0 },
  );
  return acceso.length > 0;
};

const errorInterno = (res, message, error) => {
  console.error(message, error);
  return res.status(500).json({ msg: message });
};

export const registrarAsistencias = async (req, res) => {
  const { claseId, fecha, asistencias } = req.body;
  const dia = normalizeDate(fecha);
  if (!isDatabaseId(claseId) || !dia || !Array.isArray(asistencias) || asistencias.length === 0) {
    return res.status(400).json({ msg: "Se requieren claseId, fecha válida y una lista de asistencias." });
  }
  if (!asistencias.every(({ alumno, estado }) => isDatabaseId(alumno) && estadosValidos.has(estado))) {
    return res.status(400).json({ msg: "Cada asistencia debe incluir un alumno válido y un estado permitido." });
  }
  if (new Set(asistencias.map(({ alumno }) => databaseId(alumno))).size !== asistencias.length) {
    return res.status(400).json({ msg: "La lista contiene alumnos repetidos." });
  }

  const claseKey = databaseId(claseId);
  try {
    if (!(await validarAccesoClase(claseKey, req.user))) {
      return res.status(403).json({ msg: "No tienes acceso para cargar asistencia en esta clase." });
    }

    const alumnosIds = asistencias.map(({ alumno }) => databaseId(alumno));
    const replacements = { claseId: claseKey };
    const alumnoPlaceholders = alumnosIds.map((alumnoId, index) => {
      const key = `alumnoId${index}`;
      replacements[key] = alumnoId;
      return `UNHEX(:${key})`;
    });
    const inscriptos = await queryRows(
      `SELECT HEX(alumno_id) AS id FROM clase_alumnos
       WHERE clase_id = UNHEX(:claseId) AND alumno_id IN (${alumnoPlaceholders.join(", ")})`,
      replacements,
    );
    if (inscriptos.length !== alumnosIds.length) {
      return res.status(400).json({ msg: "Todos los alumnos deben estar inscriptos en la clase." });
    }

    await sequelize.transaction(async (transaction) => {
      for (const { alumno, estado } of asistencias) {
        await executeSql(
          `INSERT INTO school_asistencias (id, clase_id, alumno_id, fecha, estado, cargado_por)
           VALUES (UNHEX(REPLACE(UUID(), '-', '')), UNHEX(:claseId), UNHEX(:alumnoId), :fecha, :estado, UNHEX(:profesorId))
           ON DUPLICATE KEY UPDATE estado = VALUES(estado), cargado_por = VALUES(cargado_por), updatedAt = CURRENT_TIMESTAMP`,
          {
            claseId: claseKey,
            alumnoId: databaseId(alumno),
            fecha: dia,
            estado,
            profesorId: databaseId(req.user.id),
          },
          transaction,
        );
      }
    });
    return res.status(201).json({ msg: "Asistencias guardadas correctamente." });
  } catch (error) {
    return errorInterno(res, "Error al guardar asistencias.", error);
  }
};

export const obtenerAsistenciasPorClaseYFecha = async (req, res) => {
  const { claseId, fecha } = req.query;
  const dia = normalizeDate(fecha);
  if (!isDatabaseId(claseId) || !dia) {
    return res.status(400).json({ msg: "Se requieren claseId y fecha válida." });
  }
  try {
    if (!(await validarAccesoClase(claseId, req.user))) {
      return res.status(403).json({ msg: "No tienes acceso a esta clase." });
    }
    const rows = await queryRows(
      `SELECT HEX(alumno_id) AS alumnoId, estado
       FROM school_asistencias WHERE clase_id = UNHEX(:claseId) AND fecha = :fecha`,
      { claseId: databaseId(claseId), fecha: dia },
    );
    return res.json(Object.fromEntries(rows.map(({ alumnoId, estado }) => [alumnoId, estado])));
  } catch (error) {
    return errorInterno(res, "Error al consultar asistencias.", error);
  }
};

export const obtenerAsistenciasPorAlumno = async (req, res) => {
  const alumnoId = req.user.rol === "admin" && req.params.alumnoId ? req.params.alumnoId : req.user.id;
  if (!isDatabaseId(alumnoId)) return res.status(400).json({ msg: "ID de alumno inválido." });
  const replacements = { alumnoId: databaseId(alumnoId) };
  let materiaFilter = "";
  if (req.query.materiaId) {
    if (!isDatabaseId(req.query.materiaId)) return res.status(400).json({ msg: "ID de materia inválido." });
    materiaFilter = "AND m.id = UNHEX(:materiaId)";
    replacements.materiaId = databaseId(req.query.materiaId);
  }
  try {
    const rows = await queryRows(
      `SELECT HEX(a.id) AS _id, HEX(a.alumno_id) AS alumnoId, HEX(a.clase_id) AS claseId,
              a.fecha, a.estado, HEX(a.cargado_por) AS cargadoPor,
              c.diaSemana, c.horaInicio, m.nombre AS materia
       FROM school_asistencias a
       JOIN clases c ON c.id = a.clase_id
       JOIN materias m ON m.id = c.materia_id
       WHERE a.alumno_id = UNHEX(:alumnoId) ${materiaFilter}
       ORDER BY a.fecha DESC`,
      replacements,
    );
    return res.json(rows);
  } catch (error) {
    return errorInterno(res, "Error al obtener el historial de asistencias.", error);
  }
};

export const getReporteAsistencias = async (req, res) => {
  const { claseId, fecha } = req.query;
  const dia = normalizeDate(fecha);
  if (!isDatabaseId(claseId) || !dia) return res.status(400).json({ msg: "Se requieren claseId y fecha válida." });
  try {
    if (!(await validarAccesoClase(claseId, req.user))) {
      return res.status(403).json({ msg: "No tienes acceso a esta clase." });
    }
    const rows = await queryRows(
      `SELECT HEX(a.id) AS _id, HEX(a.clase_id) AS claseId, HEX(a.alumno_id) AS alumnoId,
              HEX(a.cargado_por) AS cargadoPorId, a.fecha, a.estado,
              u.nombre AS alumnoNombre, u.email AS alumnoEmail, u.dni AS alumnoDni,
              p.nombre AS cargadoPorNombre, p.rol AS cargadoPorRol
       FROM school_asistencias a JOIN users u ON u.id = a.alumno_id
       LEFT JOIN users p ON p.id = a.cargado_por
       WHERE a.clase_id = UNHEX(:claseId) AND a.fecha = :fecha
       ORDER BY u.nombre`,
      { claseId: databaseId(claseId), fecha: dia },
    );
    return res.json(rows.map((row) => ({
      ...row,
      alumno: {
        _id: row.alumnoId,
        nombre: row.alumnoNombre,
        email: row.alumnoEmail,
        dni: row.alumnoDni,
      },
      cargadoPor: row.cargadoPorId
        ? { _id: row.cargadoPorId, nombre: row.cargadoPorNombre, rol: row.cargadoPorRol }
        : null,
    })));
  } catch (error) {
    return errorInterno(res, "Error al generar el reporte de asistencias.", error);
  }
};

export const getMisAsistencias = async (req, res) => {
  try {
    const rows = await queryRows(
      `SELECT HEX(a.id) AS id, a.fecha, a.estado, m.nombre AS materia,
              c.diaSemana, c.horaInicio
       FROM school_asistencias a
       JOIN clases c ON c.id = a.clase_id
       JOIN materias m ON m.id = c.materia_id
       WHERE a.alumno_id = UNHEX(:alumnoId)
       ORDER BY a.fecha DESC`,
      { alumnoId: databaseId(req.user.id) },
    );
    const historial = rows.map((row) => ({
      ...row,
      estado: row.estado.charAt(0).toUpperCase() + row.estado.slice(1),
      observacion: "-",
    }));
    const presentes = rows.filter(({ estado }) => estado === "presente").length;
    return res.json({
      resumen: {
        total: rows.length,
        presentes,
        porcentaje: rows.length ? Math.round((presentes / rows.length) * 100) : 100,
      },
      historial,
    });
  } catch (error) {
    return errorInterno(res, "Error al obtener tus asistencias.", error);
  }
};
