mkdir -p lab/out/probe
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
{
for u in "https://unsplash.com/napi/search/photos?query=edmonton&per_page=30" "https://api.openverse.org/v1/images/?q=edmonton%20skyline&license_type=commercial&page_size=40" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=Edmonton%20skyline%20filetype:bitmap&srnamespace=6&format=json&srlimit=50"; do
  code=$(curl -sSL -A "$UA" -H "Accept: application/json" -w "%{http_code}" "$u" -o /tmp/r.json); echo "$code $u"; head -c 300 /tmp/r.json; echo
done
} > lab/out/probe/codes.txt 2>&1
curl -sSL -A "$UA" "https://api.openverse.org/v1/images/?q=edmonton%20skyline&license_type=commercial&page_size=40" -o lab/out/probe/ov1.json
curl -sSL -A "$UA" "https://api.openverse.org/v1/images/?q=edmonton%20alberta%20downtown&license_type=commercial&page_size=40" -o lab/out/probe/ov2.json
curl -sSL -A "$UA" "https://api.openverse.org/v1/images/?q=edmonton%20river%20valley&license_type=commercial&page_size=40" -o lab/out/probe/ov3.json
