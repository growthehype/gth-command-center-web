mkdir -p lab/out/unsplash
rm -f lab/out/unsplash/*
npm i --no-save playwright@1.48.2 >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1
node lab/unsplash.mjs edmonton edmonton-skyline edmonton-winter edmonton-river-valley edmonton-night edmonton-alberta > lab/out/unsplash/log.txt 2>&1
node -e 'const l=require("./lab/out/unsplash/list.json");console.log(l.slice(0,80).map((x,i)=>x.src.split("/").pop()+" "+x.src+"?w=700&q=60&fm=jpg").join("\n"))' > /tmp/dl.txt
while read -r id url; do curl -sSL "$url" -o "lab/out/unsplash/$id.jpg"; done < /tmp/dl.txt
ls lab/out/unsplash | wc -l >> lab/out/unsplash/log.txt
