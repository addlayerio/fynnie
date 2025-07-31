#!/bin/sh

# Ejecutar el script de configuración de memoria y capturar el resultado
MAX_OLD_SPACE_SIZE=$(node set_memory.js)

export NODE_ENV=production

# Iniciar la aplicación con el tamaño de espacio de memoria calculado
exec node --expose-gc --max-old-space-size=${MAX_OLD_SPACE_SIZE} main.js