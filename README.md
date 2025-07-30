# 🌸 Fynnie — *Flow your Nodes*

**Fynnie** es una herramienta de automatización de tareas inspirada en Apache Airflow, diseñada para ejecutarse con toda la flexibilidad y dinamismo de JavaScript.

> Define flujos como código. Corre tareas. Sin complicaciones.  

---

## 🚀 ¿Qué hace Fynnie?

- 📁 Carga automáticamente flujos definidos como FYNs desde archivos JS
- 🔁 Ejecuta tareas en secuencia o en paralelo
- 🧠 Administra dependencias, retries, y lógica de errores
- 🧠 Soporta sincronización automática desde un repositorio Git (modo GitOps)
- 🕓 Permite programación con `cron`
- 🧩 Ejecuta trabajos usando BullMQ + Redis
- 🔄 Detecta cambios en tiempo real con File Watchers
- 📊 Expone una API REST para gestión
- 🔐 Seguridad, logs, aislamiento y extensibilidad

---

## 🧱 Conceptos clave

| Componente         | Descripción                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `fyn.js`              | Definición del flujo de tareas (en `.fyn.js`)                                   |
| `task`             | Unidad ejecutable del flujo, escrita en JS/TS                              |
| `FYNLoader`        | Carga y valida dinámicamente los FYNs desde disco                           |
| `Scheduler`        | Ejecuta tareas según programación (cron o trigger manual)                   |
| `JobQueue`         | Manejador de colas de ejecución (basado en BullMQ)                         |
| `GitSync`          | Clona o sincroniza FYNs desde un repo remoto                               |
| `FileWatcher`      | Observa cambios en los FYNs y recarga automáticamente                      |
| `Redis`            | Backend de estado para colas y control de concurrencia                     |

---

## 📦 Instalación

```bash
git clone https://github.com/worldsysgroup/fynnie.git
cd fynnie
npm install
