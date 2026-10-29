mkdir -p lab/out/ov
rm -f lab/out/ov/*
UA="GTH-concept-lab/1.0 (omar@growthehype.ca)"
for q in "edmonton skyline" "edmonton downtown" "edmonton river valley" "edmonton night" "edmonton winter" "high level bridge edmonton" "edmonton alberta city"; do
  for pg in 1 2; do
    qq=$(echo "$q" | sed 's/ /%20/g')
    curl -sSL -m 25 -A "$UA" "https://api.openverse.org/v1/images/?q=$qq&license_type=commercial&page_size=20&page=$pg&size=large" -o "lab/out/ov/r-$(echo $q|tr ' ' '-')-$pg.json"
  done
done
node -e '
const fs=require("fs");const d="lab/out/ov";const m=new Map();
for(const f of fs.readdirSync(d).filter(f=>f.startsWith("r-"))){try{for(const r of JSON.parse(fs.readFileSync(d+"/"+f)).results||[]){if(!m.has(r.id))m.set(r.id,{id:r.id,url:r.url,thumb:r.thumbnail,w:r.width,h:r.height,title:r.title,creator:r.creator,license:r.license,lv:r.license_version,src:r.source,land:r.foreign_landing_url})}}catch(e){}}
const l=[...m.values()].filter(x=>(x.w||0)>=1600);fs.writeFileSync(d+"/list.json",JSON.stringify(l,null,1));console.log(l.length)'
node -e 'const l=require("./lab/out/ov/list.json");console.log(l.slice(0,90).map((x,i)=>String(i).padStart(3,"0")+" "+x.thumb).join("\n"))' > /tmp/dl.txt
while read -r n url; do curl -sSL -m 20 -A "GTH-concept-lab/1.0" "$url" -o "lab/out/ov/$n.jpg"; done < /tmp/dl.txt
rm -f lab/out/ov/r-*.json
# rerun 2
