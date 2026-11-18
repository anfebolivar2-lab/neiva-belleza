#!/bin/sh
# Construcción en Vercel: descarga la carpeta salon-belleza del repositorio público
# en GitHub (en el commit indicado) y la deja en public/, que es lo que Vercel publica.
# Para publicar una versión nueva, cambia COMMIT por el commit nuevo.
set -e
COMMIT=${1:-8f44cf9e7d33c8f882dc4a0ce5b62c631a69b3c8}
rm -rf public && mkdir -p public
curl -sSfL "https://codeload.github.com/afbolivar-2026b-lang/principios-inteligencia-artificial-2026-b-/tar.gz/$COMMIT" | tar xz --strip-components=2 -C public --wildcards '*/salon-belleza/*'
rm -rf public/supabase public/README.md public/netlify.toml public/.vercelignore public/vercel.json public/construir.sh
ls public
