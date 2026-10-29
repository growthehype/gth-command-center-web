# YEG subpages + all project photos at full size
set +e
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
mkdir -p lab/out/yeg/img
for p in projects new-page-1 take-action contact; do curl -sSL -A "$UA" "https://yeghomerenovations.com/$p" -o lab/out/yeg/$p.html; done
curl -sSL -A "$UA" "https://yeghomerenovations.com/" -o lab/out/yeg/home.html
grep -hoE 'https://images\.squarespace-cdn\.com/content/[^"'"'"' ?&]+' lab/out/yeg/*.html | sort -u > lab/out/yeg/imgs.txt
wc -l lab/out/yeg/imgs.txt
i=0; while read -r u; do i=$((i+1)); ext="${u##*.}"; curl -sSL -A "$UA" "$u?format=2500w" -o "lab/out/yeg/img/$(printf %03d $i).${ext,,}"; done < lab/out/yeg/imgs.txt
ls -la lab/out/yeg/img | head -80
