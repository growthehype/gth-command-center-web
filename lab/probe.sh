mkdir -p lab/out/wc && rm -f lab/out/wc/*
UA="GTH-concept-lab/1.0 (https://growthehype.ca; omar@growthehype.ca)"
for q in "Edmonton skyline" "Downtown Edmonton" "Edmonton river valley" "Edmonton night skyline" "High Level Bridge Edmonton" "Edmonton winter downtown" "Whyte Avenue Edmonton" "Sherwood Park Alberta"; do
  qq=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]+' filetype:bitmap'))" "$q")
  curl -sS -m 30 -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=$qq&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=900&format=json" -o "lab/out/wc/q-$(echo $q | tr ' ' '-').json"
done
python3 - <<'PY'
import json,glob,re
out={}
for f in glob.glob('lab/out/wc/q-*.json'):
    try: d=json.load(open(f))
    except Exception as e: print('bad',f); continue
    for p in (d.get('query',{}).get('pages',{}) or {}).values():
        ii=(p.get('imageinfo') or [{}])[0]
        if ii.get('width',0)<2000 or ii.get('width',0)<ii.get('height',1): continue
        m=ii.get('extmetadata',{})
        lic=m.get('LicenseShortName',{}).get('value','')
        if not re.search(r'CC BY|CC0|Public domain',lic,re.I) or re.search(r'NC|ND',lic): continue
        art=re.sub('<[^>]+>','',m.get('Artist',{}).get('value',''))[:80]
        out[p['title']]={'title':p['title'],'thumb':ii.get('thumburl'),'url':ii.get('url'),'w':ii['width'],'h':ii['height'],'lic':lic,'artist':art,'page':ii.get('descriptionurl'),'cat':f}
l=list(out.values()); json.dump(l,open('lab/out/wc/list.json','w'),indent=1); print(len(l))
for i,x in enumerate(l[:80]): open('/tmp/dl.txt','a').write(f"{i:03d} {x['thumb']}\n")
PY
while read -r n url; do curl -sS -m 20 -A "$UA" "$url" -o "lab/out/wc/$n.jpg"; done < /tmp/dl.txt
rm -f lab/out/wc/q-*.json
ls lab/out/wc | wc -l
