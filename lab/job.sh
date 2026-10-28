set -x
mkdir -p lab/out/unsplash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
for q in edmonton edmonton-skyline edmonton-winter edmonton-river-valley edmonton-night edmonton-alberta; do
  curl -sSL -A "$UA" "https://unsplash.com/s/photos/$q" -o "lab/out/unsplash/$q.html"
done
# free photo ids (exclude Unsplash+ premium)
cat lab/out/unsplash/*.html | grep -oE 'https://images\.unsplash\.com/photo-[a-zA-Z0-9_-]+' | sort -u > lab/out/unsplash/ids.txt
wc -l lab/out/unsplash/ids.txt
n=0
while read -r u; do
  n=$((n+1)); [ $n -gt 60 ] && break
  id=$(basename "$u")
  curl -sSL "$u?w=900&q=70&fm=jpg" -o "lab/out/unsplash/$id.jpg"
done < lab/out/unsplash/ids.txt
rm -f lab/out/unsplash/*.html
ls lab/out/unsplash | head -80
