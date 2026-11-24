import React, { useEffect, useState } from "react";
import { getMisMateriasPrevias, getMisNotasAlumno } from "../../api/api";
import { Book, Award, AlertCircle, BookOpenCheck } from "lucide-react";
import CycleSelector, { CycleStatusNotice } from "../../components/admin/CycleSelector";
import { useAcademicCycles } from "../../hooks/useAcademicCycles";

const Boletin = () => {
  const [boletin, setBoletin] = useState([]);
  const [previas, setPrevias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPrevias, setLoadingPrevias] = useState(true);
  const { cycles, cycleId, setCycleId, selectedCycle, loadingCycles } = useAcademicCycles();

  useEffect(() => {
    const cargarNotas = async () => {
      if (!cycleId) {
        if (!loadingCycles) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await getMisNotasAlumno(cycleId);
        // res.data.notas es el array plano que viene del backend
        const notasPlanas = res.data.notas || [];
        
        // Procesamos los datos para agruparlos por Materia
        const materiasMap = {};

        notasPlanas.forEach((nota) => {
          const idMateria = nota.materia?._id;
          const nombreMateria = nota.materia?.nombre || "Materia Desconocida";

          if (!materiasMap[idMateria]) {
            materiasMap[idMateria] = {
              nombre: nombreMateria,
              t1: null,
              t2: null,
              t3: null,
              notaRecuperacion: null,
              estadoMateria: null,
            };
          }
          materiasMap[idMateria].notaRecuperacion = nota.notaRecuperacion;
          materiasMap[idMateria].estadoMateria = nota.estadoMateria;

          // Asignamos la nota final de ese trimestre a la columna correspondiente
          // 'notaFinalTrimestre' es el campo que calcula tu backend (incluye recuperatorios)
          if (nota.trimestre === 1) materiasMap[idMateria].t1 = nota.notaFinalTrimestre;
          if (nota.trimestre === 2) materiasMap[idMateria].t2 = nota.notaFinalTrimestre;
          if (nota.trimestre === 3) materiasMap[idMateria].t3 = nota.notaFinalTrimestre;
        });

        setBoletin(Object.values(materiasMap));
      } catch (error) {
        console.error("Error al cargar boletín:", error);
      } finally {
        setLoading(false);
      }
    };
    cargarNotas();
  }, [cycleId, loadingCycles]);

  useEffect(() => {
    const cargarPrevias = async () => {
      try {
        const { data } = await getMisMateriasPrevias();
        setPrevias(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error al cargar materias previas:", error);
      } finally {
        setLoadingPrevias(false);
      }
    };
    cargarPrevias();
  }, []);

  // Función para pintar la nota de color (Rojo si desaprueba, Verde/Negro si aprueba)
  const renderNota = (valor) => {
    if (valor === null || valor === undefined) return <span className="text-gray-300">-</span>;
    const esDesaprobado = valor < 6; // Ajusta según tu criterio (ej. 6 o 7)
    return (
      <span className={`font-bold ${esDesaprobado ? "text-red-500" : "text-gray-800"}`}>
        {valor}
      </span>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100">
     
      
      <div className="flex-1 overflow-y-auto p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Award className="text-yellow-500" size={32} /> Mi Boletín Académico
          </h1>
          <p className="text-gray-600 mt-2">Resumen de calificaciones trimestrales.</p>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-[minmax(240px,1fr)_2fr] md:items-end">
          <CycleSelector cycles={cycles} value={cycleId} onChange={setCycleId} disabled={loadingCycles} />
          <CycleStatusNotice cycle={selectedCycle} />
        </div>

        <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-amber-950">
            <BookOpenCheck size={20} /> Materias previas
          </h2>
          {loadingPrevias ? (
            <p className="text-sm text-amber-900">Cargando materias previas...</p>
          ) : previas.filter((previa) => previa.estado === "PENDIENTE").length === 0 ? (
            <p className="text-sm text-amber-900">No tenés materias previas pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {previas.filter((previa) => previa.estado === "PENDIENTE").map((previa) => (
                <li key={previa._id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{previa.materia}</span>
                  <span className="text-amber-800">{previa.anioOrigen} · Pendiente</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {loading ? (
          <div className="text-center p-10">Cargando notas...</div>
        ) : boletin.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow text-center text-gray-500 flex flex-col items-center">
            <AlertCircle size={48} className="mb-4 text-blue-300"/>
            <p>Aún no tienes notas cargadas en el sistema.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th className="p-4 font-semibold"><div className="flex items-center gap-2"><Book size={18}/> Materia</div></th>
                    <th className="p-4 font-semibold text-center w-24">1º Trim</th>
                    <th className="p-4 font-semibold text-center w-24">2º Trim</th>
                    <th className="p-4 font-semibold text-center w-24">3º Trim</th>
                    <th className="p-4 font-semibold text-center w-32 bg-blue-700">Puntaje final</th>
                    <th className="p-4 font-semibold text-center w-32">Recuperación</th>
                    <th className="p-4 font-semibold text-center w-40 bg-blue-700">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {boletin.map((mat, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium text-gray-700">{mat.nombre}</td>
                      <td className="p-4 text-center bg-gray-50/50">{renderNota(mat.t1)}</td>
                      <td className="p-4 text-center">{renderNota(mat.t2)}</td>
                      <td className="p-4 text-center bg-gray-50/50">{renderNota(mat.t3)}</td>
                      {(() => {
                        const grades = [mat.t1, mat.t2, mat.t3];
                        const complete = grades.every((grade) => grade !== null && grade !== undefined);
                        const total = complete ? grades.reduce((sum, grade) => sum + Number(grade), 0) : null;
                        const state = total === null
                          ? "INCOMPLETA"
                          : total >= 18
                            ? "APROBADA"
                            : mat.estadoMateria || (selectedCycle?.estado === "CERRADO" ? "DESAPROBADA" : "A_RECUPERACION");
                        const stateStyles = {
                          APROBADA: "bg-green-100 text-green-800",
                          APROBADA_RECUPERACION: "bg-green-100 text-green-800",
                          A_RECUPERACION: "bg-orange-100 text-orange-800",
                          DESAPROBADA: "bg-red-100 text-red-800",
                          INCOMPLETA: "bg-gray-100 text-gray-600",
                        };
                        return (
                          <>
                            <td className="p-4 text-center font-bold bg-blue-50 text-blue-800">
                              {total === null ? "—" : total.toFixed(2)}
                            </td>
                            <td className="p-4 text-center">{renderNota(mat.notaRecuperacion)}</td>
                            <td className="p-4 text-center">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${stateStyles[state] || stateStyles.INCOMPLETA}`}>
                                {state.replaceAll("_", " ")}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Boletin;