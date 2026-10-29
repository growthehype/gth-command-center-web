mkdir -p lab/out/trehan
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
curl -sSL -m 30 -A "$UA" https://www.trehantax.com/ -o lab/out/trehan/home.html
grep -oiE '<img[^>]+>' lab/out/trehan/home.html | head -40 > lab/out/trehan/imgs.txt
grep -oiE 'src="[^"]+\.(png|jpg|jpeg|gif|svg|webp)"' lab/out/trehan/home.html | sed 's/src="//;s/"$//' | sort -u | while read -r u; do
  case "$u" in http*) full="$u";; /*) full="https://www.trehantax.com$u";; *) full="https://www.trehantax.com/$u";; esac
  f=$(echo "$u" | tr '/?' '__' | tail -c 80)
  curl -sSL -m 20 -A "$UA" "$full" -o "lab/out/trehan/$f"
done
grep -oiE 'url\([^)]+\)' lab/out/trehan/home.html | head -20 >> lab/out/trehan/imgs.txt
ls -la lab/out/trehan
