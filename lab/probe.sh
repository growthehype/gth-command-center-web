mkdir -p lab/out/omnalogo && rm -f lab/out/omnalogo/*
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
curl -sSL -m 30 -A "$UA" https://omnataxaccounting.ca/ -o lab/out/omnalogo/home.html
grep -oiE '(src|href|content|srcset)="[^"]+\.(png|jpg|jpeg|svg|webp|ico)[^"]*"' lab/out/omnalogo/home.html | sort -u > lab/out/omnalogo/refs.txt
grep -oiE 'https?://[^" ,)]+(logo|Logo|LOGO|icon|favicon)[^" ,)]*\.(png|jpg|jpeg|svg|webp|ico)' lab/out/omnalogo/home.html | sort -u > lab/out/omnalogo/logos.txt
n=0; while read -r u; do n=$((n+1)); curl -sSL -m 20 -A "$UA" "$u" -o "lab/out/omnalogo/l$n-$(basename "$u" | cut -c1-60)"; done < lab/out/omnalogo/logos.txt
ls -la lab/out/omnalogo
