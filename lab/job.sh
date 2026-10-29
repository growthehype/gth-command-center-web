# Mirror the creative direction site and both leads' current sites
set +e
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
rm -rf lab/out/sites; mkdir -p lab/out/sites
cd lab/out/sites
wget -q -e robots=off -U "$UA" -p -k -E -H -D cozy-concha-180e3d.netlify.app -P cozy https://cozy-concha-180e3d.netlify.app/
wget -q -e robots=off -U "$UA" -r -l 2 -p -E -np --reject-regex '(wp-json|xmlrpc|feed|\?replytocom|/tag/|/author/)' --exclude-directories=/wp-json -Q 60m -P stl http://www.smiththompsonlaw.ca/
wget -q -e robots=off -U "$UA" -r -l 2 -p -E -np --reject-regex '(wp-json|xmlrpc|feed|\?replytocom|/tag/|/author/)' -Q 80m -P yeg http://yeghomerenovations.com/
cd ../../..
find lab/out/sites -type f | sed 's/^/F /' | head -600
du -sh lab/out/sites/*
