mkdir -p lab/out/unsplash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
for q in edmonton "edmonton skyline" "edmonton winter" "edmonton river valley" "edmonton night" "edmonton downtown"; do
  qq=$(echo "$q" | sed 's/ /%20/g')
  code=$(curl -sSL -A "$UA" -H "Accept: application/json" -w "%{http_code}" "https://unsplash.com/napi/search/photos?query=$qq&per_page=30" -o "lab/out/unsplash/q-$(echo $q | tr ' ' '-').json")
  echo "$q -> $code"
done
node -e '
const fs=require("fs");const d="lab/out/unsplash";const seen=new Set();const out=[];
for(const f of fs.readdirSync(d).filter(f=>f.startsWith("q-"))){try{const j=JSON.parse(fs.readFileSync(d+"/"+f));for(const p of j.results||[]){if(p.premium||p.plus||seen.has(p.id))continue;seen.add(p.id);out.push({id:p.id,url:p.urls.regular,raw:p.urls.raw,w:p.width,h:p.height,alt:p.alt_description||p.description||"",by:p.user&&p.user.name,link:p.links&&p.links.html})}}catch(e){console.log("bad",f,e.message)}}
fs.writeFileSync(d+"/list.json",JSON.stringify(out,null,1));console.log("free photos",out.length)'
node -e '
const fs=require("fs");const l=JSON.parse(fs.readFileSync("lab/out/unsplash/list.json"));
let s="";l.slice(0,70).forEach((p,i)=>{s+=`${p.id} ${p.raw}&w=700&q=60&fm=jpg\n`});fs.writeFileSync("/tmp/dl.txt",s)'
while read -r id url; do curl -sSL "$url" -o "lab/out/unsplash/$id.jpg"; done < /tmp/dl.txt
rm -f lab/out/unsplash/q-*.json
ls lab/out/unsplash | wc -l
