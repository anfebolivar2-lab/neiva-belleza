#!/bin/sh
# Construcción en Vercel: descarga la carpeta salon-belleza del repositorio público
# en GitHub (en el commit indicado) y la deja en public/, que es lo que Vercel publica.
# Para publicar una versión nueva, pasa el commit como argumento (por defecto, la rama main).
set -e
COMMIT=${1:-main}
rm -rf public && mkdir -p public
curl -sSfL "https://codeload.github.com/anfebolivar2-lab/neiva-belleza/tar.gz/$COMMIT" | tar xz --strip-components=2 -C public --wildcards '*/salon-belleza/*'
rm -rf public/supabase public/firebase public/README.md public/netlify.toml public/.vercelignore public/vercel.json public/construir.sh
ls public
