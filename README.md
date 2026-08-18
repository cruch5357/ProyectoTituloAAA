# ProyectoTituloAAA
Capstone de Alan Basso, Alonso Cruz y Angel Rubio

# Plataforma de Gestión y Seguimiento de Entrenamiento

> Plataforma web progresiva (PWA) orientada a entrenadores y alumnos para la planificación, ejecución, registro y análisis de programas de entrenamiento personalizados.

---

## 📌 Descripción

Este proyecto consiste en el desarrollo de una **Plataforma Web Progresiva (PWA)** que conecta a entrenadores con sus alumnos, centralizando el proceso de planificación y seguimiento del entrenamiento.

El entrenador podrá utilizar la plataforma principalmente desde un computador para gestionar alumnos, crear ejercicios, diseñar rutinas y bloques de entrenamiento, programar sesiones e importar planificaciones mediante archivos Excel.

El alumno podrá acceder a la misma plataforma desde un dispositivo móvil mediante una interfaz adaptada a pantallas pequeñas, consultar sus entrenamientos y registrar directamente los resultados obtenidos durante cada sesión.

La plataforma centralizará estos registros para generar información útil sobre el progreso y desempeño del alumno, incorporando posteriormente una funcionalidad de análisis y predicción basada en los datos recopilados.

---

## 🎯 Objetivo

Desarrollar una plataforma que permita **centralizar la planificación, ejecución, registro y análisis del entrenamiento personalizado**, reduciendo la fragmentación existente entre herramientas como Excel, mensajería y registros manuales.

El sistema busca establecer un flujo continuo:

```text
Planificación
     ↓
Asignación
     ↓
Entrenamiento
     ↓
Registro
     ↓
Análisis
     ↓
Toma de decisiones
     ↓
Nueva planificación
```

---

## ❗ Problemática

Los entrenadores que trabajan con múltiples alumnos suelen utilizar distintas herramientas para administrar sus programas de entrenamiento, como hojas de cálculo, aplicaciones de mensajería y registros manuales.

Esta fragmentación dificulta:

- Gestionar múltiples alumnos.
- Mantener organizadas las planificaciones.
- Actualizar entrenamientos.
- Registrar sistemáticamente el desempeño.
- Consultar el historial de cada alumno.
- Analizar la evolución del rendimiento.
- Utilizar los datos recopilados para apoyar futuras decisiones.

Por otro lado, los alumnos pueden recibir sus entrenamientos mediante distintos canales, dificultando la consulta de la sesión correspondiente y el registro estructurado de sus resultados.

---

## 💡 Propuesta de solución

La plataforma busca centralizar este proceso mediante una única PWA con **vistas diferenciadas según el rol del usuario**.

### Entrenador

Utilizará principalmente la plataforma desde un computador para:

- Gestionar alumnos.
- Crear y administrar ejercicios.
- Crear rutinas.
- Crear bloques de entrenamiento.
- Programar semanas y sesiones.
- Asignar entrenamientos.
- Importar planificaciones mediante Excel.
- Revisar el cumplimiento de los alumnos.
- Analizar métricas de rendimiento.
- Consultar historiales.
- Comunicarse con sus alumnos.

### Alumno

Utilizará principalmente la plataforma desde un dispositivo móvil para:

- Consultar el entrenamiento del día.
- Revisar su bloque de entrenamiento.
- Visualizar ejercicios e indicaciones.
- Registrar series y repeticiones.
- Registrar cargas utilizadas.
- Registrar RPE/RIR.
- Registrar percepción de esfuerzo y comentarios.
- Marcar sesiones como completadas.
- Consultar su historial y progreso.
- Comunicarse con su entrenador.

---

## 📅 Estructura de entrenamiento

La planificación se organizará mediante una estructura jerárquica:

```text
Programa
   │
   ├── Bloque
   │     │
   │     ├── Semana
   │     │     │
   │     │     ├── Sesión
   │     │     │     │
   │     │     │     └── Ejercicios
   │     │     │             └── Series
   │     │
   │     └── ...
   │
   └── ...
```

Esto permitirá al entrenador trabajar con programas de distinta duración y mantener una visión completa de la planificación.

---

## 📊 Registro de desempeño

Los entrenamientos realizados por los alumnos generarán información estructurada.

Entre los datos contemplados se encuentran:

### Por ejercicio

- Carga.
- Repeticiones.
- Series realizadas.
- RPE.
- RIR.
- Comentarios.

### Por sesión

- Cumplimiento.
- RPE general.
- Percepción de esfuerzo.
- Fatiga.
- Comentarios.
- Duración, cuando corresponda.

Estos registros permitirán construir un historial de entrenamiento para cada alumno.

---

## 📈 Ciencia de Datos y predicción

El proyecto incorporará un componente de **Ciencia de Datos** utilizando los registros generados por la plataforma.

El objetivo será transformar los datos de entrenamiento en información útil para el entrenador mediante:

- Análisis de evolución.
- Indicadores de rendimiento.
- Análisis de cumplimiento.
- Evolución de cargas y volumen.
- Análisis de RPE/RIR.
- Identificación de tendencias.
- Predicción de una variable relacionada con el desempeño del alumno.

La predicción será definida durante las primeras etapas del proyecto de acuerdo con:

- Disponibilidad de datos.
- Viabilidad técnica.
- Utilidad para el entrenador.
- Capacidad de evaluación dentro del período del proyecto.

> El componente predictivo funcionará como apoyo para la toma de decisiones y no como reemplazo del criterio del entrenador.

---

## 📥 Importación mediante Excel

Una de las funcionalidades principales será permitir al entrenador importar planificaciones existentes mediante archivos Excel.

Flujo esperado:

```text
Excel
  ↓
Validación
  ↓
Normalización
  ↓
Procesamiento
  ↓
Base de datos
  ↓
Programación del alumno
```

La importación deberá contemplar la validación de información relacionada con:

- Ejercicios.
- Semanas.
- Sesiones.
- Series.
- Repeticiones.
- Cargas.
- RPE/RIR.
- Descansos.
- Indicaciones.

La estructura de datos deberá ser diseñada antes de implementar esta funcionalidad para garantizar consistencia y evitar problemas posteriores en el análisis.

---

## 🧪 Aseguramiento de Calidad

El proyecto incorporará un enfoque de **Quality Assurance (QA)** durante todo el desarrollo.

Se contemplan:

- Pruebas funcionales.
- Pruebas de integración.
- Validación de datos.
- Pruebas de importación de Excel.
- Pruebas de los flujos de entrenador y alumno.
- Pruebas de la PWA.
- Pruebas de diferentes tamaños de pantalla.
- Registro y seguimiento de errores.
- Validación de los resultados generados por el sistema.

El objetivo es garantizar la confiabilidad tanto de la plataforma como de los datos utilizados posteriormente para análisis y predicción.

---

## 📱 Progressive Web App

La plataforma será desarrollada como una **PWA responsiva**.

No se desarrollarán inicialmente aplicaciones móviles independientes para Android o iOS.

La misma plataforma deberá adaptarse a diferentes dispositivos:

```text
                ┌──────────────────────┐
                │       PWA            │
                └──────────┬───────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
       💻 Computador                📱 Móvil
             │                           │
         Entrenador                    Alumno
```

El alumno podrá agregar la PWA a la pantalla de inicio de su dispositivo, permitiendo acceder mediante un icono y obtener una experiencia similar a una aplicación móvil.

---

## 👥 Roles del sistema

### `COACH`

Responsable de:

- Administrar alumnos.
- Crear ejercicios.
- Crear programas.
- Programar entrenamientos.
- Importar planificaciones.
- Analizar resultados.
- Comunicarse con alumnos.

### `STUDENT`

Responsable de:

- Consultar entrenamientos.
- Ejecutar sesiones.
- Registrar resultados.
- Consultar progreso.
- Comunicarse con el coach.

---

## 🏗️ Estado actual del proyecto

**Estado:** 🟡 Planificación inicial

El proyecto se encuentra en etapa de definición y planificación.

### Actualmente definido

- [x] Problema identificado.
- [x] Público objetivo.
- [x] Concepto general de la plataforma.
- [x] Enfoque PWA.
- [x] Diferenciación de vistas Coach/Alumno.
- [x] Gestión de bloques y sesiones.
- [x] Importación mediante Excel.
- [x] Registro de desempeño.
- [x] Incorporación de Ciencia de Datos.
- [x] Incorporación de QA.

### Pendiente de definición

- [ ] Stack tecnológico definitivo.
- [ ] Arquitectura técnica.
- [ ] Modelo de datos definitivo.
- [ ] Diseño UI/UX.
- [ ] Definición de la variable a predecir.
- [ ] Metodología de generación/preparación de datos.
- [ ] Diseño de pruebas.
- [ ] Roadmap de desarrollo.
- [ ] División definitiva de responsabilidades.

## 🔮 Proyección futura

La arquitectura deberá permitir ampliar posteriormente la plataforma con funcionalidades como:

- IA generativa como asistente del entrenador.
- Recomendaciones avanzadas.
- Integración con wearables.
- Notificaciones.
- Gestión de centros deportivos.
- Múltiples entrenadores por organización.
- Planes y suscripciones.
- Biblioteca avanzada de ejercicios.
- Aplicaciones móviles nativas.
- Análisis predictivo avanzado.

Estas funcionalidades quedan fuera del alcance inicial y podrán evaluarse posteriormente según el avance del proyecto.

---

## 🎯 Visión del proyecto

El objetivo a largo plazo es construir una plataforma donde:

> **El entrenador planifica, el alumno registra, la plataforma analiza y los datos apoyan la toma de decisiones.**

La solución busca evolucionar desde una herramienta de gestión de entrenamientos hacia una plataforma capaz de centralizar y aprovechar la información generada durante todo el proceso deportivo.

---

## 👨‍💻 Equipo

Proyecto desarrollado por un equipo de 3 integrantes con especialización en:

- **Desarrollo de software**
- **Machine Learning / Ciencia de Datos**
- **Quality Assurance (QA)**

Las responsabilidades específicas serán definidas durante la etapa de planificación del proyecto.

---

## 📌 Nota

Este README corresponde a una **propuesta inicial de trabajo** y se encuentra sujeto a modificaciones durante la etapa de análisis, diseño y validación técnica.

Las tecnologías, arquitectura, metodología de datos y funcionalidad predictiva definitiva aún no han sido seleccionadas.
