rm -f lab/out/probe.txt
for f in chromium-v131.0.1-pack.tar chromium-v131.0.1-pack.x64.tar; do
  u="https://github.com/Sparticuz/chromium/releases/download/v131.0.1/$f"
  mkdir -p lab/out; echo "$f -> $(curl -sSLI -o /dev/null -w '%{http_code} %{size_download} %{url_effective}' "$u") len=$(curl -sSLI "$u" | grep -i "^content-length" | tail -1)" >> lab/out/probe.txt
done
